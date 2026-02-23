import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { setSchemaSchema, validateQuerySchema, diffQuerySchema } from '../schemas.js';
import { logAudit } from '../audit.js';
import { decryptValue } from '../crypto.js';
import { parseEnvExample, parseSchemaJson, validateEnv, diffEnvs, maskValue, isSecretKey } from '@envault/core';

export async function schemaRoutes(fastify: FastifyInstance): Promise<void> {
  // POST /projects/:id/schema - Set schema
  fastify.post('/', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const { content } = setSchemaSchema.parse(request.body);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    // Try to parse as JSON first, then .env.example
    let schemaContent: string;
    try {
      // Validate by parsing
      if (content.trim().startsWith('{')) {
        parseSchemaJson(content);
        schemaContent = content;
      } else {
        const parsed = parseEnvExample(content);
        schemaContent = JSON.stringify(parsed);
      }
    } catch (error) {
      return reply.status(400).send({ error: 'Invalid schema format' });
    }

    const existing = await prisma.schema.findUnique({ where: { projectId } });
    let schema;
    
    if (existing) {
      schema = await prisma.schema.update({
        where: { id: existing.id },
        data: { content: schemaContent }
      });
      await logAudit('UPDATE', 'SCHEMA', schema.id, projectId);
    } else {
      schema = await prisma.schema.create({
        data: { content: schemaContent, projectId }
      });
      await logAudit('CREATE', 'SCHEMA', schema.id, projectId);
    }

    return reply.status(existing ? 200 : 201).send({
      id: schema.id,
      projectId: schema.projectId,
      createdAt: schema.createdAt.toISOString()
    });
  });

  // GET /projects/:id/schema - Get schema
  fastify.get('/', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const schema = await prisma.schema.findUnique({ where: { projectId } });
    if (!schema) {
      return reply.status(404).send({ error: 'Schema not found' });
    }

    return {
      id: schema.id,
      content: JSON.parse(schema.content),
      createdAt: schema.createdAt.toISOString(),
      updatedAt: schema.updatedAt.toISOString()
    };
  });

  // POST /projects/:id/validate - Validate environment against schema
  fastify.post('/validate', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const { env: envName } = validateQuerySchema.parse(request.query);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { schema: true }
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    if (!project.schema) {
      return reply.status(400).send({ error: 'No schema defined for this project' });
    }

    const targetEnv = envName || 'local';
    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: targetEnv } },
      include: { variables: true }
    });

    if (!environment) {
      return reply.status(404).send({ error: `Environment '${targetEnv}' not found` });
    }

    const schema = parseSchemaJson(project.schema.content);
    const envVars: Record<string, string> = {};
    for (const v of environment.variables) {
      envVars[v.key] = decryptValue(v.value);
    }

    const result = validateEnv(envVars, schema);

    return {
      valid: result.valid,
      environment: targetEnv,
      errors: result.errors,
      warnings: result.warnings
    };
  });

  // GET /projects/:id/diff - Compare environments
  fastify.get('/diff', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const { from, to } = diffQuerySchema.parse(request.query);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const [fromEnv, toEnv] = await Promise.all([
      prisma.environment.findUnique({
        where: { projectId_name: { projectId, name: from } },
        include: { variables: true }
      }),
      prisma.environment.findUnique({
        where: { projectId_name: { projectId, name: to } },
        include: { variables: true }
      })
    ]);

    if (!fromEnv) {
      return reply.status(404).send({ error: `Source environment '${from}' not found` });
    }
    if (!toEnv) {
      return reply.status(404).send({ error: `Target environment '${to}' not found` });
    }

    const fromVars: Record<string, string> = {};
    const toVars: Record<string, string> = {};
    const secretKeys: string[] = [];

    for (const v of fromEnv.variables) {
      fromVars[v.key] = decryptValue(v.value);
      if (v.isSecret) secretKeys.push(v.key);
    }
    for (const v of toEnv.variables) {
      toVars[v.key] = decryptValue(v.value);
      if (v.isSecret && !secretKeys.includes(v.key)) secretKeys.push(v.key);
    }

    const result = diffEnvs(fromVars, toVars, { secretKeys, maskSecrets: true, includeUnchanged: false });

    return {
      from,
      to,
      ...result
    };
  });

  // GET /projects/:id/audit - Get audit logs
  fastify.get('/audit', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const logs = await prisma.auditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 100
    });

    return logs.map((log: { id: string; action: string; entityType: string; entityId: string; actor: string | null; details: string | null; createdAt: Date }) => ({
      id: log.id,
      action: log.action,
      entityType: log.entityType,
      entityId: log.entityId,
      actor: log.actor,
      details: log.details ? JSON.parse(log.details) : undefined,
      createdAt: log.createdAt.toISOString()
    }));
  });
}
