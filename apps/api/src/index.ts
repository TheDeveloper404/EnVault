import Fastify from 'fastify';
import cors from '@fastify/cors';
import { projectRoutes } from './routes/projects.js';
import { environmentRoutes } from './routes/environments.js';
import { schemaRoutes } from './routes/schema.js';

const PORT = parseInt(process.env.PORT || '7777', 10);
const HOST = process.env.HOST || '0.0.0.0';

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info'
  }
});

// Register CORS
await fastify.register(cors, {
  origin: process.env.CORS_ORIGIN || true,
  credentials: true
});

// Health check
fastify.get('/health', async () => ({ status: 'ok', time: new Date().toISOString() }));

// Register routes
await fastify.register(projectRoutes, { prefix: '/projects' });
await fastify.register(environmentRoutes, { prefix: '/projects/:id/environments' });
await fastify.register(environmentRoutes, { prefix: '/projects/:id/envs' }); // alias
await fastify.register(schemaRoutes, { prefix: '/projects/:id' });

// Error handler
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

// Start server
try {
  await fastify.listen({ port: PORT, host: HOST });
  fastify.log.info(`EnVault API running on http://${HOST}:${PORT}`);
} catch (err) {
  fastify.log.error(err);
  process.exit(1);
}
