import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { createEnvironmentSchema, upsertVariableSchema, importEnvSchema, exportQuerySchema } from '../schemas.js';
import { logAudit } from '../audit.js';
import { encryptValue, decryptValue, detectSecret } from '../crypto.js';
import { parseEnv } from '@envault/core';
import { authenticate } from './auth.js';

export async function environmentRoutes(fastify: FastifyInstance): Promise<void> {
  
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  // GET /projects/:id/environments - List environments
  fastify.get('/', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const environments = await prisma.environment.findMany({
      where: { projectId },
      orderBy: { createdAt: 'asc' },
      include: {
        variables: { orderBy: { key: 'asc' } }
      }
    });

    return environments.map((e: { id: string; name: string; variables: Array<{id: string; key: string; value: string; isSecret: boolean; createdAt: Date; updatedAt: Date}>; createdAt: Date }) => ({
      id: e.id,
      name: e.name,
      variables: e.variables.map(v => ({
        id: v.id,
        key: v.key,
        value: decryptValue(v.value),
        isSecret: v.isSecret,
        createdAt: v.createdAt.toISOString(),
        updatedAt: v.updatedAt.toISOString()
      })),
      createdAt: e.createdAt.toISOString()
    }));
  });

  // POST /projects/:id/environments - Create environment
  fastify.post('/', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const input = createEnvironmentSchema.parse(request.body);

    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const existing = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: input.name } }
    });

    if (existing) {
      return reply.status(409).send({ error: 'Environment with this name already exists' });
    }

    const env = await prisma.environment.create({
      data: { ...input, projectId }
    });

    await logAudit('CREATE', 'ENVIRONMENT', env.id, projectId, { name: input.name });

    return reply.status(201).send({
      id: env.id,
      name: env.name,
      createdAt: env.createdAt.toISOString()
    });
  });

  // GET /projects/:id/envs/:env/vars - List variables (with decrypted values)
  fastify.get('/:env/vars', async (request, reply) => {
    const { id: projectId, env: envName } = request.params as { id: string; env: string };

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } },
      include: { variables: { orderBy: { key: 'asc' } } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    // Audit log for viewing variables
    const secretKeys = environment.variables.filter((v: { isSecret: boolean }) => v.isSecret).map((v: { key: string }) => v.key);
    await logAudit('VIEW', 'VARIABLE', environment.id, projectId, { 
      varCount: environment.variables.length,
      secretKeys: secretKeys.length > 0 ? secretKeys : undefined 
    });

    return environment.variables.map((v: { id: string; key: string; value: string; isSecret: boolean; createdAt: Date; updatedAt: Date }) => ({
      id: v.id,
      key: v.key,
      value: decryptValue(v.value),
      isSecret: v.isSecret,
      createdAt: v.createdAt.toISOString(),
      updatedAt: v.updatedAt.toISOString()
    }));
  });

  // PUT /projects/:id/envs/:env/vars/:key - Upsert variable
  fastify.put('/:env/vars/:key', async (request, reply) => {
    const { id: projectId, env: envName, key } = request.params as { id: string; env: string; key: string };
    const input = upsertVariableSchema.parse({ ...(request.body as object), key });

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    const isSecret = input.isSecret ?? detectSecret(input.key);
    const encryptedValue = encryptValue(input.value);

    const existing = await prisma.envVariable.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key: input.key } }
    });

    let variable;
    if (existing) {
      variable = await prisma.envVariable.update({
        where: { id: existing.id },
        data: { value: encryptedValue, isSecret }
      });
      await logAudit('UPDATE', 'VARIABLE', variable.id, projectId, {
        key: input.key,
        isSecret,
        oldValue: existing.value !== encryptedValue ? 'changed' : undefined,
        newValue: existing.value !== encryptedValue ? 'changed' : undefined
      });
    } else {
      variable = await prisma.envVariable.create({
        data: {
          key: input.key,
          value: encryptedValue,
          isSecret,
          environmentId: environment.id
        }
      });
      await logAudit('CREATE', 'VARIABLE', variable.id, projectId, { key: input.key, isSecret });
    }

    return reply.status(existing ? 200 : 201).send({
      id: variable.id,
      key: variable.key,
      value: input.value,
      isSecret: variable.isSecret,
      createdAt: variable.createdAt.toISOString(),
      updatedAt: variable.updatedAt.toISOString()
    });
  });

  // DELETE /projects/:id/envs/:env/vars/:key - Delete variable
  fastify.delete('/:env/vars/:key', async (request, reply) => {
    const { id: projectId, env: envName, key } = request.params as { id: string; env: string; key: string };

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    const variable = await prisma.envVariable.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key } }
    });

    if (!variable) {
      return reply.status(404).send({ error: 'Variable not found' });
    }

    await logAudit('DELETE', 'VARIABLE', variable.id, projectId, {
      key,
      isSecret: variable.isSecret
    });

    await prisma.envVariable.delete({ where: { id: variable.id } });

    return reply.status(204).send();
  });

  // POST /projects/:id/envs/:env/import - Import .env
  fastify.post('/:env/import', async (request, reply) => {
    const { id: projectId, env: envName } = request.params as { id: string; env: string };
    const { content, overwrite } = importEnvSchema.parse(request.body);

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    const parsed = parseEnv(content);
    const results = { imported: 0, updated: 0, skipped: 0 };

    for (const entry of parsed.entries) {
      const isSecret = detectSecret(entry.key);
      const encryptedValue = encryptValue(entry.value);

      const existing = await prisma.envVariable.findUnique({
        where: { environmentId_key: { environmentId: environment.id, key: entry.key } }
      });

      if (existing && !overwrite) {
        results.skipped++;
        continue;
      }

      if (existing) {
        await prisma.envVariable.update({
          where: { id: existing.id },
          data: { value: encryptedValue, isSecret }
        });
        results.updated++;
      } else {
        await prisma.envVariable.create({
          data: {
            key: entry.key,
            value: encryptedValue,
            isSecret,
            environmentId: environment.id
          }
        });
        results.imported++;
      }
    }

    await logAudit('UPDATE', 'ENVIRONMENT', environment.id, projectId, {
      action: 'import',
      imported: results.imported,
      updated: results.updated,
      skipped: results.skipped
    });

    return reply.status(200).send(results);
  });

  // GET /projects/:id/envs/:env/export - Export .env
  fastify.get('/:env/export', async (request, reply) => {
    const { id: projectId, env: envName } = request.params as { id: string; env: string };
    const { includeEmpty, mask } = exportQuerySchema.parse(request.query);

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } },
      include: { variables: { orderBy: { key: 'asc' } } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    const entries = environment.variables.map((v: { key: string; value: string; isSecret: boolean }) => {
      let value = decryptValue(v.value);
      if (mask && v.isSecret) {
        value = '****';
      }
      return { key: v.key, value };
    }).filter((e: { key: string; value: string }) => includeEmpty || e.value !== '');

    const content = entries.map((e: { key: string; value: string }) => `${e.key}=${e.value}`).join('\n') + '\n';

    reply.header('Content-Type', 'text/plain');
    return content;
  });

  // DELETE /projects/:id/environments/:envName - Delete environment
  fastify.delete('/:envName', async (request, reply) => {
    const { id: projectId, envName } = request.params as { id: string; envName: string };

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    await prisma.envVariable.deleteMany({
      where: { environmentId: environment.id }
    });

    await prisma.environment.delete({
      where: { id: environment.id }
    });

    await logAudit('DELETE', 'ENVIRONMENT', environment.id, projectId, { name: envName });

    return reply.status(200).send({ deleted: true });
  });
}
