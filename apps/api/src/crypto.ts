import { encrypt, decrypt, validateMasterKey, isSecretKey } from '@envault/core';

const MASTER_KEY = process.env.ENVAULT_MASTER_KEY;

if (!MASTER_KEY) {
  console.error('ENVAULT_MASTER_KEY is required');
  process.exit(1);
}

const validation = validateMasterKey(MASTER_KEY);
if (!validation.valid) {
  console.error(`Invalid ENVAULT_MASTER_KEY: ${validation.error}`);
  process.exit(1);
}

export function encryptValue(plaintext: string): string {
  return encrypt(plaintext, MASTER_KEY!);
}

export function decryptValue(ciphertext: string): string {
  return decrypt(ciphertext, MASTER_KEY!);
}

export function detectSecret(key: string): boolean {
  return isSecretKey(key);
}
