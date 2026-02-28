import { prisma } from './db.js';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'VIEW';
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
  actor?: string | null,
  details?: AuditDetails
): Promise<void> {
  const resolvedActor = actor || process.env.USER || process.env.USERNAME || 'local-user';
  
  // Mask secret values in audit log
  const maskedDetails = details ? maskSecrets(details) : undefined;
  
  await prisma.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      projectId,
      actor: resolvedActor,
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
