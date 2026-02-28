import { encrypt, decrypt, validateMasterKey, isSecretKey } from '@envault/core';

const MASTER_KEY = process.env.ENVAULT_MASTER_KEY;
const PREVIOUS_MASTER_KEYS = (process.env.ENVAULT_MASTER_KEY_PREVIOUS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

if (!MASTER_KEY) {
  console.error('ENVAULT_MASTER_KEY is required');
  process.exit(1);
}

const validation = validateMasterKey(MASTER_KEY);
if (!validation.valid) {
  console.error(`Invalid ENVAULT_MASTER_KEY: ${validation.error}`);
  process.exit(1);
}

for (const previousKey of PREVIOUS_MASTER_KEYS) {
  const previousValidation = validateMasterKey(previousKey);
  if (!previousValidation.valid) {
    console.error(`Invalid ENVAULT_MASTER_KEY_PREVIOUS entry: ${previousValidation.error}`);
    process.exit(1);
  }
}

export function encryptValue(plaintext: string): string {
  return encrypt(plaintext, MASTER_KEY!);
}

export function decryptValue(ciphertext: string): string {
  const candidateKeys = [MASTER_KEY!, ...PREVIOUS_MASTER_KEYS];

  let lastError: unknown;
  for (const key of candidateKeys) {
    try {
      return decrypt(ciphertext, key);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Failed to decrypt value with configured master keys');
}

export function detectSecret(key: string): boolean {
  return isSecretKey(key);
}
