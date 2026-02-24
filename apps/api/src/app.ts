import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { projectRoutes } from './routes/projects.js';
import { environmentRoutes } from './routes/environments.js';
import { schemaRoutes } from './routes/schema.js';

export async function buildApp(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || true,
    credentials: true
  });

  fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

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

    fastify.log.error(error);
    return reply.status(500).send({
      error: 'Internal server error'
    });
  });

  return fastify;
}
