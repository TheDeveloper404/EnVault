import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? '' : 'envault-dev-secret-change-in-production');
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];
const AUTH_COOKIE_NAME = 'envault_session';
const OAUTH_STATE_COOKIE_NAME = 'envault_oauth_state';

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

  const setAuthCookie = (reply: FastifyReply, token: string) => {
    reply.setCookie(AUTH_COOKIE_NAME, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction,
      maxAge: 60 * 60 * 24 * 7
    });
  };

  const clearAuthCookie = (reply: FastifyReply) => {
    reply.clearCookie(AUTH_COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProduction
    });
  };

  
  // POST /auth/register - Register new user
  fastify.post('/register', async (request, reply) => {
    const { email, password, name } = request.body as { email: string; password: string; name?: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return reply.status(400).send({ error: 'Password must be at least 6 characters' });
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

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    setAuthCookie(reply, token);

    return reply.status(201).send({
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    });
  });

  // POST /auth/login - Login user
  fastify.post('/login', async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    if (!email || !password) {
      return reply.status(400).send({ error: 'Email and password are required' });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return reply.status(401).send({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    setAuthCookie(reply, token);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name
      },
      token
    };
  });

  // GET /auth/me - Get current user
  fastify.get('/me', { preHandler: [authenticate] }, async (request) => {
    return { user: request.user };
  });

  // POST /auth/logout - Clear active session cookie
  fastify.post('/logout', async (_request, reply) => {
    clearAuthCookie(reply);
    return reply.status(204).send();
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
      const token = jwt.sign(
        { id: user.id, email: user.email },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );

      setAuthCookie(reply, token);

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
