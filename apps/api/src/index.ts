import { buildApp } from './app.js';

const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3093', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function start(): Promise<void> {
  const fastify = await buildApp();

  try {
    await fastify.listen({ port: PORT, host: HOST });
    fastify.log.info(`EnVault API running on http://${HOST}:${PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
}

await start();
