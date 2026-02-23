import { prisma } from './db.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE';
export type EntityType = 'PROJECT' | 'ENVIRONMENT' | 'VARIABLE' | 'SCHEMA';

export interface AuditDetails {
  key?: string;
  oldValue?: string;
  newValue?: string;
  isSecret?: boolean;
  [key: string]: unknown;
}

export async function logAudit(
  action: AuditAction,
  entityType: EntityType,
  entityId: string,
  projectId: string | null,
  details?: AuditDetails
): Promise<void> {
  const actor = process.env.USER || process.env.USERNAME || 'local-user';
  
  // Mask secret values in audit log
  const maskedDetails = details ? maskSecrets(details) : undefined;
  
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      projectId,
      actor,
      details: maskedDetails ? JSON.stringify(maskedDetails) : undefined
    }
  });
}

function maskSecrets(details: AuditDetails): AuditDetails {
  const masked = { ...details };
  
  if (masked.isSecret) {
    if (masked.oldValue) {
      masked.oldValue = '••••••';
    }
    if (masked.newValue) {
      masked.newValue = '••••••';
    }
  }
  
  return masked;
}

export async function getAuditLogs(projectId?: string, limit = 100): Promise<AuditLogEntry[]> {
  const logs = await prisma.auditLog.findMany({
    where: projectId ? { projectId } : undefined,
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { project: { select: { name: true } } }
  });
  
  return logs.map((log: { id: string; action: string; entityType: string; entityId: string; projectId: string | null; project?: { name: string } | null; actor: string | null; details: string | null; createdAt: Date }) => ({
    id: log.id,
    action: log.action,
    entityType: log.entityType,
    entityId: log.entityId,
    projectId: log.projectId,
    projectName: log.project?.name,
    actor: log.actor,
    details: log.details ? JSON.parse(log.details) : undefined,
    createdAt: log.createdAt.toISOString()
  }));
}

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  projectId: string | null;
  projectName?: string;
  actor: string | null;
  details?: AuditDetails;
  createdAt: string;
}
