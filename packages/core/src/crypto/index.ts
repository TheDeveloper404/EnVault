/**
 * EnVault encryption module
 * Uses AES-256-GCM for authenticated encryption at rest
 * 
 * Format: base64(nonce(12 bytes) + auth_tag(16 bytes) + ciphertext)
 */

import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const NONCE_LENGTH = 12; // 96 bits for GCM
const TAG_LENGTH = 16;   // 128 bits
const KEY_LENGTH = 32;   // 256 bits
const SALT_LENGTH = 16;  // 128 bits for key derivation

export interface EncryptedValue {
  ciphertext: string; // base64 encoded
  salt?: string;      // base64 encoded (if derived key)
}

/**
 * Derive a 256-bit key from master key using scrypt
 * This allows using a shorter passphrase while maintaining security
 */
export function deriveKey(masterKey: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const useSalt = salt || randomBytes(SALT_LENGTH);
  // scrypt: N=2^14, r=8, p=1 (standard parameters)
  const key = scryptSync(masterKey, useSalt, KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  return { key, salt: useSalt };
}

/**
 * Validate master key format and length
 * Accepts: 32-byte hex (64 chars), base64, or any string for derivation
 */
export function validateMasterKey(masterKey: string): { valid: boolean; error?: string } {
  if (!masterKey || masterKey.length === 0) {
    return { valid: false, error: 'Master key is required' };
  }

  // If it's 64 hex chars, it's a direct 256-bit key
  if (/^[a-f0-9]{64}$/i.test(masterKey)) {
    return { valid: true };
  }

  // If it's base64 with ~32 bytes (44 chars with padding)
  if (/^[A-Za-z0-9+/]{43}=?$/.test(masterKey) || /^[A-Za-z0-9+/]{42}==?$/.test(masterKey)) {
    return { valid: true };
  }

  // For any other string, we'll derive a key - just check minimum length for security
  if (masterKey.length < 8) {
    return { valid: false, error: 'Master key must be at least 8 characters for passphrase derivation' };
  }

  return { valid: true };
}

/**
 * Check if master key is a direct key (hex or base64) vs a passphrase
 */
function isDirectKey(masterKey: string): boolean {
  if (/^[a-f0-9]{64}$/i.test(masterKey)) return true;
  try {
    const decoded = Buffer.from(masterKey, 'base64');
    if (decoded.length === KEY_LENGTH) return true;
  } catch {
    // not base64
  }
  return false;
}

/**
 * Get raw key buffer from master key
 */
export function getKeyBuffer(masterKey: string, salt?: Buffer): { key: Buffer; salt?: Buffer } {
  // Try hex first
  if (/^[a-f0-9]{64}$/i.test(masterKey)) {
    return { key: Buffer.from(masterKey, 'hex') };
  }

  // Try base64
  try {
    const decoded = Buffer.from(masterKey, 'base64');
    if (decoded.length === KEY_LENGTH) {
      return { key: decoded };
    }
  } catch {
    // Fall through to derivation
  }

  // Derive using scrypt
  const { key, salt: usedSalt } = deriveKey(masterKey, salt);
  return { key, salt: usedSalt };
}

/**
 * Encrypt a plaintext value
 * Format: base64(nonce + tag + ciphertext)
 */
export function encrypt(plaintext: string, masterKey: string): string {
  const nonce = randomBytes(NONCE_LENGTH);
  const { key, salt } = getKeyBuffer(masterKey);

  const cipher = createCipheriv(ALGORITHM, key, nonce);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // If passphrase-derived, prepend salt: salt(16) + nonce(12) + tag(16) + ciphertext
  // Otherwise: nonce(12) + tag(16) + ciphertext
  const parts = salt ? [salt, nonce, tag, ciphertext] : [nonce, tag, ciphertext];
  const combined = Buffer.concat(parts);
  return combined.toString('base64');
}

/**
 * Decrypt a ciphertext value
 * Format: base64(nonce + tag + ciphertext)
 */
export function decrypt(encrypted: string, masterKey: string): string {
  const combined = Buffer.from(encrypted, 'base64');

  if (combined.length < NONCE_LENGTH + TAG_LENGTH) {
    throw new DecryptionError('Invalid encrypted data: too short');
  }

  let offset = 0;
  let salt: Buffer | undefined;

  // If passphrase, first 16 bytes are salt
  if (!isDirectKey(masterKey)) {
    if (combined.length < SALT_LENGTH + NONCE_LENGTH + TAG_LENGTH) {
      throw new DecryptionError('Invalid encrypted data: too short for passphrase mode');
    }
    salt = combined.subarray(0, SALT_LENGTH);
    offset = SALT_LENGTH;
  }

  const nonce = combined.subarray(offset, offset + NONCE_LENGTH);
  const tag = combined.subarray(offset + NONCE_LENGTH, offset + NONCE_LENGTH + TAG_LENGTH);
  const ciphertext = combined.subarray(offset + NONCE_LENGTH + TAG_LENGTH);

  const { key } = getKeyBuffer(masterKey, salt);

  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAuthTag(tag);

  try {
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  } catch (error) {
    throw new DecryptionError('Decryption failed: invalid key or corrupted data');
  }
}

/**
 * Custom error for decryption failures
 */
export class DecryptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DecryptionError';
  }
}

/**
 * Generate a secure random master key (32 bytes = 256 bits)
 * Returns hex-encoded string
 */
export function generateMasterKey(): string {
  return randomBytes(KEY_LENGTH).toString('hex');
}

/**
 * Check if a value appears to be encrypted (base64 with reasonable length)
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 44) return false; // minimum: nonce(12)+tag(16)+empty(1) = 29 bytes = ~39 base64 chars
  
  try {
    const decoded = Buffer.from(value, 'base64');
    return decoded.length >= NONCE_LENGTH + TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
