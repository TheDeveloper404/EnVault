import { buildApp } from './app.js';
import { prisma } from './db.js';

const PORT = parseInt(process.env.API_PORT || process.env.PORT || '3093', 10);
const HOST = process.env.HOST || '0.0.0.0';

const app = await buildApp();
let isShuttingDown = false;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  app.log.info({ signal }, 'Graceful shutdown started');

  try {
    await app.close();
    await prisma.$disconnect();
    app.log.info('Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    app.log.error({ err: error, signal }, 'Graceful shutdown failed');
    process.exit(1);
  }
}

process.once('SIGINT', () => {
  void shutdown('SIGINT');
});

process.once('SIGTERM', () => {
  void shutdown('SIGTERM');
});

async function start(): Promise<void> {
  try {
    await app.listen({ port: PORT, host: HOST });
    app.log.info(`EnVault API running on http://${HOST}:${PORT}`);
  } catch (err) {
    app.log.error(err);
    await prisma.$disconnect();
    process.exit(1);
  }
}

await start();
