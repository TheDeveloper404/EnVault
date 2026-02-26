import type { FastifyInstance } from 'fastify';
import { logAudit } from '../audit.js';
import { prisma } from '../db.js';
import { createProjectSchema } from '../schemas.js';
import { authenticate } from './auth.js';

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  
  // GET /projects - List all projects (authenticated)
  fastify.get('/', { preHandler: [authenticate] }, async (request) => {
    const userId = request.user!.id;
    
    const projects = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { environments: true }
        }
      }
    });

    return projects.map((p: { id: string; name: string; description: string | null; _count: { environments: number }; createdAt: Date; updatedAt: Date }) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      environmentCount: p._count.environments,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }));
  });

  // POST /projects - Create project (authenticated)
  fastify.post('/', { preHandler: [authenticate] }, async (request, reply) => {
    const userId = request.user!.id;
    const input = createProjectSchema.parse(request.body);

    const existing = await prisma.project.findUnique({
      where: { name: input.name }
    });

    if (existing) {
      return reply.status(409).send({ error: 'Project with this name already exists' });
    }

    const project = await prisma.project.create({
      data: {
        ...input,
        userId
      }
    });

    await logAudit('CREATE', 'PROJECT', project.id, project.id);

    return reply.status(201).send({
      id: project.id,
      name: project.name,
      description: project.description,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString()
    });
  });

  // GET /projects/:id - Get single project (authenticated)
  fastify.get('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const project = await prisma.project.findFirst({
      where: { id, userId },
      include: {
        environments: {
          orderBy: { createdAt: 'asc' },
          select: { id: true, name: true }
        },
        schema: { select: { id: true } }
      }
    });

    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    return {
      id: project.id,
      name: project.name,
      description: project.description,
      hasSchema: !!project.schema,
      environments: project.environments,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString()
    };
  });

  // PATCH /projects/:id - Update project (rename) (authenticated)
  fastify.patch('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;
    const { name } = request.body as { name?: string };

    const project = await prisma.project.findFirst({ where: { id: id, userId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    if (name && name !== project.name) {
      const existing = await prisma.project.findUnique({
        where: { name }
      });
      if (existing) {
        return reply.status(409).send({ error: 'Project with this name already exists' });
      }
    }

    const updated = await prisma.project.update({
      where: { id },
      data: { name }
    });

    await logAudit('UPDATE', 'PROJECT', id, id, { oldName: project.name, newName: name });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString()
    };
  });

  // DELETE /projects/:id - Delete project (authenticated)
  fastify.delete('/:id', { preHandler: [authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user!.id;

    const project = await prisma.project.findFirst({ where: { id, userId } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await logAudit('DELETE', 'PROJECT', id, id);
    await prisma.project.delete({ where: { id } });

    return reply.status(204).send();
  });
}
