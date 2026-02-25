import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { projectRoutes } from './routes/projects.js';
import { environmentRoutes } from './routes/environments.js';
import { schemaRoutes } from './routes/schema.js';
import { authRoutes } from './routes/auth.js';
import { prisma } from './db.js';

const startTime = Date.now();

const ALLOWED_IPS = (process.env.ALLOWED_IPS || '').split(',').filter(Boolean);
const IP_WHITELIST_ENABLED = process.env.IP_WHITELIST_ENABLED === 'true';

async function ipWhitelistHook(request: { ip?: string }, reply: { status: (code: number) => { send: (data: { error: string }) => void } }) {
  if (!IP_WHITELIST_ENABLED || ALLOWED_IPS.length === 0) return;
  if (ALLOWED_IPS.includes(request.ip || '')) return;
  
  return reply.status(403).send({ error: 'Access denied from your IP address' });
}

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  if (IP_WHITELIST_ENABLED) {
    fastify.addHook('preHandler', ipWhitelistHook);
  }

  await fastify.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    allowList: ['/health', '/metrics', '/auth/login', '/auth/register'],
    errorResponseBuilder: () => ({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please try again later.',
      statusCode: 429
    })
  });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
  });

  fastify.get('/health', async (request, reply) => {
    const uptime = Date.now() - startTime;
    let dbStatus = 'ok';
    
    try {
      await prisma.$queryRaw`SELECT 1`;
    } catch {
      dbStatus = 'error';
    }

    const status = dbStatus === 'ok' ? 'ok' : 'degraded';
    const response = { 
      status, 
      time: new Date().toISOString(),
      uptime: Math.floor(uptime / 1000),
      checks: {
        db: dbStatus
      }
    };

    if (dbStatus !== 'ok') {
      reply.status(503);
    }

    return response;
  });

  fastify.get('/metrics', async () => {
    const uptime = Date.now() - startTime;
    
    return {
      uptime_seconds: Math.floor(uptime / 1000),
      memory_usage: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      node_version: process.version
    };
  });

  await fastify.register(authRoutes, { prefix: '/auth' });
  await fastify.register(projectRoutes, { prefix: '/projects' });
  await fastify.register(environmentRoutes, { prefix: '/projects/:id/environments' });
  await fastify.register(environmentRoutes, { prefix: '/projects/:id/envs' });
  await fastify.register(schemaRoutes, { prefix: '/projects/:id' });

  fastify.setErrorHandler((error, request, reply) => {
    if (error.validation) {
      return reply.status(400).send({
        error: 'Validation error',
        details: error.message
      });
    }

    fastify.log.error({
      err: error,
      method: request.method,
      url: request.url,
      timestamp: new Date().toISOString()
    });

    return reply.status(500).send({
      error: 'Internal server error'
    });
  });

  return fastify;
}
