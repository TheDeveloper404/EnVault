import { describe, it, expect } from 'vitest';
import { encrypt, decrypt, validateMasterKey, generateMasterKey, isEncrypted, DecryptionError } from '../src/crypto/index.js';

describe('crypto', () => {
  const testKey = 'a'.repeat(64); // 64 hex chars = 32 bytes

  describe('validateMasterKey', () => {
    it('accepts 64-char hex key', () => {
      const result = validateMasterKey('abcdef1234567890'.repeat(4));
      expect(result.valid).toBe(true);
    });

    it('accepts base64 key', () => {
      const base64Key = Buffer.from('a'.repeat(32)).toString('base64');
      const result = validateMasterKey(base64Key);
      expect(result.valid).toBe(true);
    });

    it('accepts passphrase with 8+ chars', () => {
      const result = validateMasterKey('my_secure_pass');
      expect(result.valid).toBe(true);
    });

    it('rejects short passphrase', () => {
      const result = validateMasterKey('short');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('8 characters');
    });

    it('rejects empty key', () => {
      const result = validateMasterKey('');
      expect(result.valid).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    it('roundtrips plaintext', () => {
      const plaintext = 'hello world';
      const encrypted = encrypt(plaintext, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('produces different ciphertexts for same plaintext', () => {
      const plaintext = 'hello world';
      const encrypted1 = encrypt(plaintext, testKey);
      const encrypted2 = encrypt(plaintext, testKey);
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both decrypt to same value
      expect(decrypt(encrypted1, testKey)).toBe(plaintext);
      expect(decrypt(encrypted2, testKey)).toBe(plaintext);
    });

    it('handles empty string', () => {
      const encrypted = encrypt('', testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe('');
    });

    it('handles unicode', () => {
      const plaintext = 'hello 世界 🌍';
      const encrypted = encrypt(plaintext, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('handles long values', () => {
      const plaintext = 'a'.repeat(10000);
      const encrypted = encrypt(plaintext, testKey);
      const decrypted = decrypt(encrypted, testKey);
      expect(decrypted).toBe(plaintext);
    });

    it('fails with wrong key', () => {
      const plaintext = 'secret';
      const encrypted = encrypt(plaintext, testKey);
      
      const wrongKey = 'b'.repeat(64);
      expect(() => decrypt(encrypted, wrongKey)).toThrow(DecryptionError);
    });

    it('fails with tampered ciphertext', () => {
      const plaintext = 'secret';
      const encrypted = encrypt(plaintext, testKey);
      
      // Tamper with the ciphertext
      const tampered = encrypted.slice(0, -4) + 'abcd';
      expect(() => decrypt(tampered, testKey)).toThrow(DecryptionError);
    });

    it('fails with truncated ciphertext', () => {
      const plaintext = 'secret';
      const encrypted = encrypt(plaintext, testKey);
      
      const truncated = encrypted.slice(0, 20);
      expect(() => decrypt(truncated, testKey)).toThrow(DecryptionError);
    });

    it('works with passphrase-derived key', () => {
      const passphrase = 'my_secure_passphrase_123';
      const plaintext = 'secret data';
      const encrypted = encrypt(plaintext, passphrase);
      const decrypted = decrypt(encrypted, passphrase);
      expect(decrypted).toBe(plaintext);
    });
  });

  describe('generateMasterKey', () => {
    it('generates 64-char hex string', () => {
      const key = generateMasterKey();
      expect(key).toHaveLength(64);
      expect(/^[a-f0-9]{64}$/.test(key)).toBe(true);
    });

    it('generates unique keys', () => {
      const key1 = generateMasterKey();
      const key2 = generateMasterKey();
      expect(key1).not.toBe(key2);
    });
  });

  describe('isEncrypted', () => {
    it('returns true for encrypted values', () => {
      const encrypted = encrypt('test', testKey);
      expect(isEncrypted(encrypted)).toBe(true);
    });

    it('returns false for plaintext', () => {
      expect(isEncrypted('hello world')).toBe(false);
      expect(isEncrypted('short')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isEncrypted('')).toBe(false);
    });

    it('returns false for invalid base64', () => {
      expect(isEncrypted('not!valid@base64#')).toBe(false);
    });
  });
});
