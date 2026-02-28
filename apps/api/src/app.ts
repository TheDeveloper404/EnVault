import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { prisma } from './db.js';
import { authRoutes } from './routes/auth.js';
import { authenticate } from './routes/auth.js';
import { environmentRoutes } from './routes/environments.js';
import { projectRoutes } from './routes/projects.js';
import { schemaRoutes } from './routes/schema.js';

const startTime = Date.now();
const INSECURE_JWT_DEFAULT = 'envault-dev-secret-change-in-production';
const INSECURE_MASTER_KEY_DEFAULT = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';
const LATENCY_BUCKETS_MS = [50, 100, 250, 500, 1000, 2500, 5000] as const;

const requestMetrics = {
  total: 0,
  error5xx: 0,
  totalDurationMs: 0,
  byMethod: {} as Record<string, number>,
  byStatusClass: {} as Record<string, number>,
  latencyBuckets: Object.fromEntries([
    ...LATENCY_BUCKETS_MS.map((bucket) => [`le_${bucket}ms`, 0]),
    ['gt_5000ms', 0]
  ]) as Record<string, number>
};

function recordLatency(durationMs: number): void {
  for (const bucket of LATENCY_BUCKETS_MS) {
    if (durationMs <= bucket) {
      requestMetrics.latencyBuckets[`le_${bucket}ms`] += 1;
      return;
    }
  }

  requestMetrics.latencyBuckets.gt_5000ms += 1;
}

const ALLOWED_IPS = (process.env.ALLOWED_IPS || '').split(',').filter(Boolean);
const IP_WHITELIST_ENABLED = process.env.IP_WHITELIST_ENABLED === 'true';

function validateProductionSecurityConfig(): void {
  if (process.env.NODE_ENV !== 'production') return;

  if (!process.env.CORS_ORIGIN) {
    throw new Error('CORS_ORIGIN must be explicitly set in production');
  }

  if (!process.env.JWT_SECRET || process.env.JWT_SECRET === INSECURE_JWT_DEFAULT) {
    throw new Error('JWT_SECRET must be set to a strong value in production');
  }

  if (!process.env.ENVAULT_MASTER_KEY || process.env.ENVAULT_MASTER_KEY === INSECURE_MASTER_KEY_DEFAULT) {
    throw new Error('ENVAULT_MASTER_KEY must be set to a non-default value in production');
  }
}

async function ipWhitelistHook(request: { ip?: string }, reply: { status: (code: number) => { send: (data: { error: string }) => void } }) {
  if (!IP_WHITELIST_ENABLED || ALLOWED_IPS.length === 0) return;
  if (ALLOWED_IPS.includes(request.ip || '')) return;
  
  return reply.status(403).send({ error: 'Access denied from your IP address' });
}

export async function buildApp(): Promise<FastifyInstance> {
  validateProductionSecurityConfig();

  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info'
    }
  });

  if (IP_WHITELIST_ENABLED) {
    fastify.addHook('preHandler', ipWhitelistHook);
  }

  fastify.addHook('onRequest', async (request, reply) => {
    const timedRequest = request as typeof request & { startTimeMs?: number };
    timedRequest.startTimeMs = performance.now();
    reply.header('x-request-id', request.id);
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const timedRequest = request as typeof request & { startTimeMs?: number };
    const durationMs = Math.max(0, performance.now() - (timedRequest.startTimeMs ?? performance.now()));
    const statusCode = reply.statusCode;
    const statusClass = `${Math.floor(statusCode / 100)}xx`;

    requestMetrics.total += 1;
    requestMetrics.totalDurationMs += durationMs;
    requestMetrics.byMethod[request.method] = (requestMetrics.byMethod[request.method] || 0) + 1;
    requestMetrics.byStatusClass[statusClass] = (requestMetrics.byStatusClass[statusClass] || 0) + 1;

    if (statusCode >= 500) {
      requestMetrics.error5xx += 1;
    }

    recordLatency(durationMs);

    fastify.log.debug({
      requestId: request.id,
      method: request.method,
      url: request.url,
      statusCode,
      durationMs: Number(durationMs.toFixed(2))
    }, 'Request completed');
  });

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

  await fastify.register(cookie);

  await fastify.register(helmet, {
    contentSecurityPolicy: false
  });

  await fastify.register(cors, {
    origin: process.env.CORS_ORIGIN || false,
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

  const metricsPreHandler = process.env.METRICS_PUBLIC === 'true' ? undefined : [authenticate];

  fastify.get('/metrics', { preHandler: metricsPreHandler }, async () => {
    const uptime = Date.now() - startTime;
    const totalRequests = requestMetrics.total;
    const avgDurationMs = totalRequests > 0
      ? Number((requestMetrics.totalDurationMs / totalRequests).toFixed(2))
      : 0;
    
    return {
      uptime_seconds: Math.floor(uptime / 1000),
      memory_usage: process.memoryUsage(),
      cpu_usage: process.cpuUsage(),
      node_version: process.version,
      http_requests: {
        total: totalRequests,
        error_5xx: requestMetrics.error5xx,
        average_duration_ms: avgDurationMs,
        by_method: requestMetrics.byMethod,
        by_status_class: requestMetrics.byStatusClass,
        latency_buckets: requestMetrics.latencyBuckets
      }
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
