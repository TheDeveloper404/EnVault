import bcrypt from 'bcryptjs';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { prisma } from '../db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'envault-dev-secret-change-in-production';
const JWT_EXPIRES_IN = (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'];

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
    const state = Math.random().toString(36).substring(7);
    const githubCallbackUrl = resolveGithubCallbackUrl(request);
    
    reply.redirect(
      `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&redirect_uri=${encodeURIComponent(githubCallbackUrl)}&scope=${encodeURIComponent(scope)}&state=${state}`
    );
  });

  // GET /auth/github/callback - Handle GitHub callback
  fastify.get('/github/callback', async (request, reply) => {
    const { code } = request.query as { code?: string; state?: string };
    const appUrl = resolveAppUrl(request);
    const githubCallbackUrl = resolveGithubCallbackUrl(request);
    
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

      reply.redirect(`${appUrl}/?token=${token}`);
    } catch (error) {
      console.error('GitHub OAuth error:', error);
      return reply.redirect(`${appUrl}/login?error=github_auth_error`);
    }
  });
}

export async function authenticate(request: FastifyRequest, reply: FastifyReply) {
  const authHeader = request.headers.authorization;
  const isTestEnv = process.env.NODE_ENV === 'test';
  const isE2EBypass = process.env.NODE_ENV !== 'production' && process.env.ENVAULT_E2E_AUTH_BYPASS === '1';

  if ((!authHeader || !authHeader.startsWith('Bearer ')) && (isTestEnv || isE2EBypass)) {
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
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);

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
