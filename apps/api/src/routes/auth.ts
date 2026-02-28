import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'envault-dev-secret-change-in-production');
const ACCESS_TOKEN_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '15m') as jwt.SignOptions['expiresIn'];
const REFRESH_TOKEN_EXPIRES_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRES_DAYS || '30', 10);
const AUTH_COOKIE_NAME = 'envault_session';
const REFRESH_COOKIE_NAME = 'envault_refresh';
const OAUTH_STATE_COOKIE_NAME = 'envault_oauth_state';
const MAX_LOGIN_ATTEMPTS = parseInt(process.env.AUTH_MAX_LOGIN_ATTEMPTS || '5', 10);
const LOGIN_ATTEMPT_WINDOW_MS = parseInt(process.env.AUTH_LOGIN_ATTEMPT_WINDOW_MS || '900000', 10);
const LOGIN_BLOCK_DURATION_MS = parseInt(process.env.AUTH_LOGIN_BLOCK_DURATION_MS || '900000', 10);

type LoginAttemptState = { count: number; windowStartMs: number; blockedUntilMs?: number };

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET is required');
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthUser;
  }
}

export async function authRoutes(fastify: FastifyInstance): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';

  const getLoginAttemptKey = (request: FastifyRequest, email: string): string => {
    const ip = request.ip || 'unknown-ip';
    return `${ip}:${email.toLowerCase()}`;
  };

  const getLoginAttemptState = async (key: string, nowMs: number): Promise<LoginAttemptState> => {
    const current = await prisma.loginThrottle.findUnique({ where: { key } });

    if (!current) {
      await prisma.loginThrottle.create({
        data: {
          key,
          count: 0,
          windowStartMs: BigInt(nowMs)
        }
      });

      return { count: 0, windowStartMs: nowMs };
    }

    const currentWindowStartMs = Number(current.windowStartMs);
    const currentBlockedUntilMs = current.blockedUntilMs === null ? undefined : Number(current.blockedUntilMs);

    if (currentWindowStartMs + LOGIN_ATTEMPT_WINDOW_MS <= nowMs) {
      await prisma.loginThrottle.update({
        where: { key },
        data: {
          count: 0,
          windowStartMs: BigInt(nowMs),
          blockedUntilMs: null
        }
      });

      return { count: 0, windowStartMs: nowMs };
    }

    return {
      count: current.count,
      windowStartMs: currentWindowStartMs,
      blockedUntilMs: currentBlockedUntilMs
    };
  };

  const registerLoginFailure = async (key: string): Promise<void> => {
    const nowMs = Date.now();
    const state = await getLoginAttemptState(key, nowMs);
    const nextCount = state.count + 1;
    const blockedUntilMs = nextCount >= MAX_LOGIN_ATTEMPTS
      ? nowMs + LOGIN_BLOCK_DURATION_MS
      : state.blockedUntilMs;

    await prisma.loginThrottle.upsert({
      where: { key },
      create: {
        key,
        count: nextCount,
        windowStartMs: BigInt(state.windowStartMs),
        blockedUntilMs: blockedUntilMs === undefined ? null : BigInt(blockedUntilMs)
      },
      update: {
        count: nextCount,
        windowStartMs: BigInt(state.windowStartMs),
        blockedUntilMs: blockedUntilMs === undefined ? null : BigInt(blockedUntilMs)
      }
    });
  };

  const clearLoginFailures = async (key: string): Promise<void> => {
    await prisma.loginThrottle.deleteMany({ where: { key } });
  };

  const validatePasswordStrength = (password: string): string | null => {
    if (password.length < 10) {
      return 'Password must be at least 10 characters long';
    }
    if (!/[a-z]/.test(password)) {
      return 'Password must include at least one lowercase letter';
    }
    if (!/[A-Z]/.test(password)) {
      return 'Password must include at least one uppercase letter';
    }
    if (!/[0-9]/.test(password)) {
      return 'Password must include at least one number';
    }
    if (!/[^A-Za-z0-9]/.test(password)) {
      return 'Password must include at least one special character';
    }

    return null;
  };

  const createAccessToken = (user: { id: string; email: string }) => jwt.sign(
    { id: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );

  const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

  const setAuthCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(AUTH_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 60 * 15
    });
  };

  const setRefreshCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(REFRESH_COOKIE_NAME, token, {
      path: '/auth',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 60 * 60 * 24 * REFRESH_TOKEN_EXPIRES_DAYS
    });
  };

  const clearAuthCookie = (reply: FastifyReply) => {
    reply.clearCookie(AUTH_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction
    });

    reply.clearCookie(REFRESH_COOKIE_NAME, {
      path: '/auth',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction
    });
  };

  const issueSession = async (reply: FastifyReply, userId: string) => {
    const refreshToken = crypto.randomBytes(48).toString('hex');
    const refreshHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRES_DAYS * 24 * 60 * 60 * 1000);

    await prisma.session.create({
      data: {
        userId,
        refreshHash,
        expiresAt
      }
    });

    setRefreshCookie(reply, refreshToken);
  };

  
  // POST /auth/register - Register new user
  fastify.post('/register', async (request, reply) => {
    const { email, password, name } = request.body as { email: string; password: string; name?: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const passwordValidationError = validatePasswordStrength(password);
    if (passwordValidationError) {
      return reply.status(400).send({ error: passwordValidationError });
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return reply.status(409).send({ error: 'User with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name: name || email.split('@')[0]
      }
    });

    const token = createAccessToken(user);

    setAuthCookie(reply, token);
    await issueSession(reply, user.id);

    return reply.status(201).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    });
  });

  // POST /auth/login - Login user
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const loginAttemptKey = getLoginAttemptKey(request, email);
    const nowMs = Date.now();
    const attemptState = await getLoginAttemptState(loginAttemptKey, nowMs);

    if (attemptState.blockedUntilMs && attemptState.blockedUntilMs > nowMs) {
      return reply.status(429).send({ error: 'Too many login attempts. Please try again later.' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      await registerLoginFailure(loginAttemptKey);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      await registerLoginFailure(loginAttemptKey);
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    await clearLoginFailures(loginAttemptKey);

    const token = createAccessToken(user);

    setAuthCookie(reply, token);
    await issueSession(reply, user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      }
    };
  });

  // GET /auth/me - Get current user
  fastify.get('/me', { preHandler: [authenticate] }, async (request) => {
    return { user: request.user };
  });

  // POST /auth/logout - Clear active session cookie
  fastify.post('/logout', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];
    if (refreshToken) {
      const refreshHash = hashToken(refreshToken);
      await prisma.session.updateMany({
        where: { refreshHash, revokedAt: null },
        data: { revokedAt: new Date() }
      });
    }

    clearAuthCookie(reply);
    return reply.status(204).send();
  });

  // POST /auth/logout-all - Revoke all active refresh sessions for current user
  fastify.post('/logout-all', { preHandler: [authenticate] }, async (request, reply) => {
    await prisma.session.updateMany({
      where: {
        userId: request.user!.id,
        revokedAt: null
      },
      data: { revokedAt: new Date() }
    });

    clearAuthCookie(reply);
    return reply.status(204).send();
  });

  // POST /auth/refresh - Rotate refresh session and issue new access token
  fastify.post('/refresh', async (request, reply) => {
    const refreshToken = request.cookies[REFRESH_COOKIE_NAME];
    if (!refreshToken) {
      return reply.status(401).send({ error: 'No refresh token provided' });
    }

    const refreshHash = hashToken(refreshToken);
    const session = await prisma.session.findUnique({
      where: { refreshHash },
      include: { user: true }
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      if (session && !session.revokedAt) {
        await prisma.session.update({
          where: { id: session.id },
          data: { revokedAt: new Date() }
        });
      }
      clearAuthCookie(reply);
      return reply.status(401).send({ error: 'Invalid refresh session' });
    }

    await prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() }
    });

    await issueSession(reply, session.user.id);

    const token = createAccessToken(session.user);
    setAuthCookie(reply, token);

    return {
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name
      }
    };
  });

  // GitHub OAuth
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
  const APP_URL = (process.env.APP_URL || '').replace(/\/$/, '');
  const GITHUB_CALLBACK_PATH = process.env.GITHUB_CALLBACK_PATH || '/auth/github/callback';

  const resolveAppUrl = (request: FastifyRequest) => {
    if (APP_URL) return APP_URL;
    const host = request.headers['x-forwarded-host'] || request.headers.host;
    const proto = (request.headers['x-forwarded-proto'] as string | undefined) || 'http';
    return `${proto}://${host}`.replace(/\/$/, '');
  };

  const resolveGithubCallbackUrl = (request: FastifyRequest) => {
    const appUrl = resolveAppUrl(request);
    const callbackPath = GITHUB_CALLBACK_PATH.startsWith('/') ? GITHUB_CALLBACK_PATH : `/${GITHUB_CALLBACK_PATH}`;
    return `${appUrl}${callbackPath}`;
  };

  // GET /auth/github - Redirect to GitHub
  fastify.get('/github', async (request, reply) => {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return reply.status(501).send({ error: 'GitHub OAuth not configured' });
    }
    
    const scope = 'read:user user:email';
    const state = crypto.randomBytes(24).toString('hex');
    const githubCallbackUrl = resolveGithubCallbackUrl(request);

    reply.setCookie(OAUTH_STATE_COOKIE_NAME, state, {
      path: '/auth/github/callback',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 60 * 10
    });
    
    reply.redirect(
      `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(githubCallbackUrl)}&scope=${encodeURIComponent(scope)}&state=${state}`
    );
  });

  // GET /auth/github/callback - Handle GitHub callback
  fastify.get('/github/callback', async (request, reply) => {
    const { code, state } = request.query as { code?: string; state?: string };
    const appUrl = resolveAppUrl(request);
    const githubCallbackUrl = resolveGithubCallbackUrl(request);
    const expectedState = request.cookies[OAUTH_STATE_COOKIE_NAME];

    reply.clearCookie(OAUTH_STATE_COOKIE_NAME, {
      path: '/auth/github/callback',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction
    });

    if (!state || !expectedState || state !== expectedState) {
      return reply.redirect(`${appUrl}/login?error=github_state_invalid`);
    }
    
    if (!code) {
      return reply.redirect(`${appUrl}/login?error=github_auth_failed`);
    }

    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return reply.redirect(`${appUrl}/login?error=github_not_configured`);
    }

    try {
      // Exchange code for access token
      const tokenPayload = new URLSearchParams({
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: githubCallbackUrl
      });

      const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json'
        },
        body: tokenPayload.toString()
      });

      const tokenData = await tokenRes.json() as { access_token?: string; error?: string; error_description?: string };
      
      if (!tokenRes.ok || !tokenData.access_token) {
        console.error('GitHub token exchange failed', {
          status: tokenRes.status,
          error: tokenData.error,
          errorDescription: tokenData.error_description
        });
        return reply.redirect(`${appUrl}/login?error=github_token_failed&reason=${encodeURIComponent(tokenData.error || 'unknown')}&description=${encodeURIComponent(tokenData.error_description || '')}`);
      }

      // Get user info
      const userRes = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
          Accept: 'application/json'
        }
      });

      const githubUser = await userRes.json() as { id: number; email?: string; login: string; name?: string };
      
      // Get user email if not public
      let email = githubUser.email;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: {
            Authorization: `Bearer ${tokenData.access_token}`,
            Accept: 'application/json'
          }
        });
        const emails = await emailsRes.json() as Array<{ email: string; primary: boolean }>;
        const primaryEmail = emails.find((e: { primary: boolean }) => e.primary);
        email = primaryEmail?.email || emails[0]?.email;
      }

      if (!email) {
        return reply.redirect(`${appUrl}/login?error=github_no_email`);
      }

      // Find or create user
      let user = await prisma.user.findUnique({ where: { email } });
      
      if (!user) {
        user = await prisma.user.create({
          data: {
            email,
            passwordHash: await bcrypt.hash(Math.random().toString(36), 10),
            name: githubUser.name || githubUser.login
          }
        });
      }

      // Generate JWT
      const token = createAccessToken(user);

      setAuthCookie(reply, token);
      await issueSession(reply, user.id);

      reply.redirect(`${appUrl}/`);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      return reply.redirect(`${appUrl}/login?error=github_auth_error`);
    }
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const cookieToken = request.cookies[AUTH_COOKIE_NAME];
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isE2EBypass = process.env.NODE_ENV !== 'production' && process.env.ENVAULT_E2E_AUTH_BYPASS === '1';

  if ((!authHeader || !authHeader.startsWith('Bearer ')) && !cookieToken && (isTestEnv || isE2EBypass)) {
    const testUser = await prisma.user.upsert({
      where: { email: 'integration-test@envault.local' },
      update: {},
      create: {
        email: 'integration-test@envault.local',
        passwordHash: await bcrypt.hash('integration-test-password', 10),
        name: 'Integration Test User'
      }
    });

    request.user = {
      id: testUser.id,
      email: testUser.email,
      name: testUser.name
    };
    return;
  }
  
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : cookieToken;

  if (!token) {
    return reply.status(401).send({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    
    if (!user) {
      return reply.status(401).send({ error: 'User not found' });
    }

    request.user = {
      id: user.id,
      email: user.email,
      name: user.name
    };
  } catch {
    return reply.status(401).send({ error: 'Invalid token' });
  }
}
