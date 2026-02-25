import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { projectRoutes } from './routes/projects.js';
import { environmentRoutes } from './routes/environments.js';
import { schemaRoutes } from './routes/schema.js';
import { prisma } from './db.js';

const startTime = Date.now();

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  await fastify.register(rateLimit, {
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    timeWindow: parseInt(process.env.RATE_LIMIT_WINDOW || '60000', 10),
    allowList: ['/health', '/metrics'],
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
