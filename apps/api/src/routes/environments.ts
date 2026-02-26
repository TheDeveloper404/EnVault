import { parseEnv } from '@envault/core';
import type { FastifyInstance } from 'fastify';
import { logAudit } from '../audit.js';
import { encryptValue, decryptValue, detectSecret } from '../crypto.js';
import { prisma } from '../db.js';
import { createEnvironmentSchema, upsertVariableSchema, importEnvSchema, exportQuerySchema, restoreVariableSchema } from '../schemas.js';
import { authenticate } from './auth.js';

export async function environmentRoutes(fastify: FastifyInstance): Promise<void> {
  
  // All routes require authentication
  fastify.addHook('preHandler', authenticate);

  const createVersionSnapshot = async (
    variableId: string | null,
    environmentId: string,
    key: string,
    value: string,
    isSecret: boolean,
    operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'IMPORT' | 'RESTORE'
  ) => {
    await prisma.envVariableVersion.create({
      data: {
        variableId: variableId ?? undefined,
        environmentId,
        key,
        value,
        isSecret,
        operation
      }
    });
  };

  const ensureProjectAccess = async (projectId: string, userId: string) => {
    const project = await prisma.project.findFirst({ where: { id: projectId, userId } });
    return project;
  };

  // GET /projects/:id/environments - List environments
  fastify.get('/', async (request, reply) => {
    const { id: projectId } = request.params as { id: string };
    const userId = request.user!.id;

    const project = await ensureProjectAccess(projectId, userId);
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
    const userId = request.user!.id;
    const input = createEnvironmentSchema.parse(request.body);

    const project = await ensureProjectAccess(projectId, userId);
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
    const userId = request.user!.id;

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

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
    const userId = request.user!.id;
    const input = upsertVariableSchema.parse({ ...(request.body as object), key });

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

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
      await createVersionSnapshot(existing.id, environment.id, existing.key, existing.value, existing.isSecret, 'UPDATE');

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
      await createVersionSnapshot(variable.id, environment.id, variable.key, variable.value, variable.isSecret, 'CREATE');
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
    const userId = request.user!.id;

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

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

    await createVersionSnapshot(variable.id, environment.id, variable.key, variable.value, variable.isSecret, 'DELETE');

    await prisma.envVariable.delete({ where: { id: variable.id } });

    return reply.status(204).send();
  });

  // POST /projects/:id/envs/:env/import - Import .env
  fastify.post('/:env/import', async (request, reply) => {
    const { id: projectId, env: envName } = request.params as { id: string; env: string };
    const userId = request.user!.id;
    const { content, overwrite } = importEnvSchema.parse(request.body);

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

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
        await createVersionSnapshot(existing.id, environment.id, existing.key, existing.value, existing.isSecret, 'IMPORT');

        await prisma.envVariable.update({
          where: { id: existing.id },
          data: { value: encryptedValue, isSecret }
        });
        results.updated++;
      } else {
        const created = await prisma.envVariable.create({
          data: {
            key: entry.key,
            value: encryptedValue,
            isSecret,
            environmentId: environment.id
          }
        });
        await createVersionSnapshot(created.id, environment.id, created.key, created.value, created.isSecret, 'IMPORT');
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

  // GET /projects/:id/envs/:env/vars/:key/versions - List variable history
  fastify.get('/:env/vars/:key/versions', async (request, reply) => {
    const { id: projectId, env: envName, key } = request.params as { id: string; env: string; key: string };
    const userId = request.user!.id;

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    const versions = await prisma.envVariableVersion.findMany({
      where: { environmentId: environment.id, key },
      orderBy: { createdAt: 'desc' }
    });

    if (!versions.length) {
      return reply.status(404).send({ error: 'No version history found for variable' });
    }

    return versions.map((version: { id: string; operation: string; value: string; isSecret: boolean; createdAt: Date }) => ({
      id: version.id,
      operation: version.operation,
      value: decryptValue(version.value),
      isSecret: version.isSecret,
      createdAt: version.createdAt.toISOString()
    }));
  });

  // POST /projects/:id/envs/:env/vars/:key/restore - Restore variable from history
  fastify.post('/:env/vars/:key/restore', async (request, reply) => {
    const { id: projectId, env: envName, key } = request.params as { id: string; env: string; key: string };
    const userId = request.user!.id;
    const { versionId, restoreToDate } = restoreVariableSchema.parse(request.body);

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    const environment = await prisma.environment.findUnique({
      where: { projectId_name: { projectId, name: envName } }
    });

    if (!environment) {
      return reply.status(404).send({ error: 'Environment not found' });
    }

    const variable = await prisma.envVariable.findUnique({
      where: { environmentId_key: { environmentId: environment.id, key } }
    });

    const targetVersion = versionId
      ? await prisma.envVariableVersion.findFirst({
          where: { id: versionId, environmentId: environment.id, key }
        })
      : await prisma.envVariableVersion.findFirst({
          where: {
            environmentId: environment.id,
            key,
            createdAt: { lte: new Date(restoreToDate!) }
          },
          orderBy: { createdAt: 'desc' }
        });

    if (!targetVersion) {
      return reply.status(404).send({ error: 'Version not found for restore target' });
    }

    if (variable) {
      await createVersionSnapshot(variable.id, environment.id, variable.key, variable.value, variable.isSecret, 'RESTORE');
    }

    const restored = variable
      ? await prisma.envVariable.update({
          where: { id: variable.id },
          data: {
            value: targetVersion.value,
            isSecret: targetVersion.isSecret
          }
        })
      : await prisma.envVariable.create({
          data: {
            key,
            value: targetVersion.value,
            isSecret: targetVersion.isSecret,
            environmentId: environment.id
          }
        });

    await logAudit('UPDATE', 'VARIABLE', restored.id, projectId, {
      key,
      action: 'restore',
      restoredFromVersionId: targetVersion.id,
      restoredFromOperation: targetVersion.operation
    });

    return reply.status(200).send({
      id: restored.id,
      key: restored.key,
      value: decryptValue(restored.value),
      isSecret: restored.isSecret,
      restoredFromVersionId: targetVersion.id,
      restoredAt: restored.updatedAt.toISOString()
    });
  });

  // GET /projects/:id/envs/:env/export - Export .env
  fastify.get('/:env/export', async (request, reply) => {
    const { id: projectId, env: envName } = request.params as { id: string; env: string };
    const userId = request.user!.id;
    const { includeEmpty, mask } = exportQuerySchema.parse(request.query);

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

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
    const userId = request.user!.id;

    const project = await ensureProjectAccess(projectId, userId);
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

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
