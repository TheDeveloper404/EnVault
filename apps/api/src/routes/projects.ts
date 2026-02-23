import type { FastifyInstance } from 'fastify';
import { prisma } from '../db.js';
import { createProjectSchema } from '../schemas.js';
import { logAudit } from '../audit.js';

export async function projectRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /projects - List all projects
  fastify.get('/', async () => {
    const projects = await prisma.project.findMany({
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

  // POST /projects - Create project
  fastify.post('/', async (request, reply) => {
    const input = createProjectSchema.parse(request.body);

    const existing = await prisma.project.findUnique({
      where: { name: input.name }
    });

    if (existing) {
      return reply.status(409).send({ error: 'Project with this name already exists' });
    }

    const project = await prisma.project.create({
      data: input
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

  // GET /projects/:id - Get single project
  fastify.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({
      where: { id },
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

  // DELETE /projects/:id - Delete project
  fastify.delete('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const project = await prisma.project.findUnique({ where: { id } });
    if (!project) {
      return reply.status(404).send({ error: 'Project not found' });
    }

    await logAudit('DELETE', 'PROJECT', id, id);
    await prisma.project.delete({ where: { id } });

    return reply.status(204).send();
  });
}
