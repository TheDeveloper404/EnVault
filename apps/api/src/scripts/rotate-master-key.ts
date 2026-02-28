import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../db.js';

const BATCH_SIZE = parseInt(process.env.KEY_ROTATION_BATCH_SIZE || '200', 10);
const DRY_RUN = process.env.KEY_ROTATION_DRY_RUN === '1';

function loadEnvFromProjectRoot(): void {
  const currentFilePath = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFilePath);
  const envPath = path.resolve(currentDir, '../../../../.env');

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex <= 0) continue;

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    const unquotedValue = rawValue.replace(/^['"]|['"]$/g, '');

    if (process.env[key] === undefined) {
      process.env[key] = unquotedValue;
    }
  }
}

loadEnvFromProjectRoot();

if (!process.env.ENVAULT_MASTER_KEY) {
  console.error('[key-rotation] ENVAULT_MASTER_KEY is required. Set it in environment or .env before running keys:rotate.');
  process.exit(1);
}

const { decryptValue, encryptValue } = await import('../crypto.js');

async function rotateEnvVariables(): Promise<number> {
  let cursor: string | undefined;
  let rotated = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.envVariable.findMany({
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {})
    });

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of batch) {
      const plaintext = decryptValue(item.value);
      const reEncrypted = encryptValue(plaintext);

      if (!DRY_RUN) {
        await prisma.envVariable.update({
          where: { id: item.id },
          data: { value: reEncrypted }
        });
      }

      rotated += 1;
    }

    cursor = batch[batch.length - 1].id;
    hasMore = batch.length === BATCH_SIZE;
  }

  return rotated;
}

async function rotateEnvVariableVersions(): Promise<number> {
  let cursor: string | undefined;
  let rotated = 0;
  let hasMore = true;

  while (hasMore) {
    const batch = await prisma.envVariableVersion.findMany({
      orderBy: { id: 'asc' },
      take: BATCH_SIZE,
      ...(cursor
        ? {
            cursor: { id: cursor },
            skip: 1
          }
        : {})
    });

    if (batch.length === 0) {
      hasMore = false;
      break;
    }

    for (const item of batch) {
      const plaintext = decryptValue(item.value);
      const reEncrypted = encryptValue(plaintext);

      if (!DRY_RUN) {
        await prisma.envVariableVersion.update({
          where: { id: item.id },
          data: { value: reEncrypted }
        });
      }

      rotated += 1;
    }

    cursor = batch[batch.length - 1].id;
    hasMore = batch.length === BATCH_SIZE;
  }

  return rotated;
}

async function main(): Promise<void> {
  const mode = DRY_RUN ? 'DRY_RUN' : 'EXECUTE';
  console.log(`[key-rotation] Starting in mode=${mode}, batchSize=${BATCH_SIZE}`);

  const envVarCount = await rotateEnvVariables();
  console.log(`[key-rotation] EnvVariable rows processed: ${envVarCount}`);

  const versionCount = await rotateEnvVariableVersions();
  console.log(`[key-rotation] EnvVariableVersion rows processed: ${versionCount}`);

  console.log('[key-rotation] Completed successfully');
}

try {
  await main();
} catch (error) {
  console.error('[key-rotation] Failed', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
