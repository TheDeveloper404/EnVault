import { z } from 'zod';

export const createProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional()
});

export const createEnvironmentSchema = z.object({
  name: z.string().min(1).max(50)
});

export const upsertVariableSchema = z.object({
  key: z.string().min(1).max(200),
  value: z.string(),
  isSecret: z.boolean().optional()
});

export const importEnvSchema = z.object({
  content: z.string(),
  overwrite: z.boolean().optional().default(false)
});

export const setSchemaSchema = z.object({
  content: z.string() // JSON or .env.example format
});

export const validateQuerySchema = z.object({
  env: z.string().optional()
});

export const diffQuerySchema = z.object({
  from: z.string(),
  to: z.string()
});

const booleanQuery = z.preprocess((value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return value;
}, z.boolean());

export const exportQuerySchema = z.object({
  includeEmpty: booleanQuery.optional().default(true),
  mask: booleanQuery.optional().default(true)
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpsertVariableInput = z.infer<typeof upsertVariableSchema>;
export type ImportEnvInput = z.infer<typeof importEnvSchema>;
