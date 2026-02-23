import { describe, it, expect } from 'vitest';
import { parseEnv, serializeEnv, isSecretKey, maskValue } from '../src/parser/index.js';

describe('parser', () => {
  describe('parseEnv', () => {
    it('parses basic key=value pairs', () => {
      const result = parseEnv('FOO=bar\nBAZ=qux');
      expect(result.keys).toEqual(['FOO', 'BAZ']);
      expect(result.map.get('FOO')?.value).toBe('bar');
      expect(result.map.get('BAZ')?.value).toBe('qux');
    });

    it('handles empty values', () => {
      const result = parseEnv('EMPTY=');
      expect(result.map.get('EMPTY')?.value).toBe('');
    });

    it('handles values with spaces (unquoted)', () => {
      const result = parseEnv('SPACED=value with spaces');
      expect(result.map.get('SPACED')?.value).toBe('value with spaces');
    });

    it('handles double quoted values', () => {
      const result = parseEnv('QUOTED="hello world"');
      expect(result.map.get('QUOTED')?.value).toBe('hello world');
    });

    it('handles single quoted values (literal)', () => {
      const result = parseEnv("SINGLE='no $expansion'");
      expect(result.map.get('SINGLE')?.value).toBe('no $expansion');
    });

    it('handles escaped quotes in double quotes', () => {
      const result = parseEnv('ESCAPED="say \\"hello\\""');
      expect(result.map.get('ESCAPED')?.value).toBe('say "hello"');
    });

    it('handles escaped newlines', () => {
      const result = parseEnv('MULTILINE="line1\\nline2"');
      expect(result.map.get('MULTILINE')?.value).toBe('line1\nline2');
    });

    it('handles values with = sign', () => {
      const result = parseEnv('EQUATION=a=b=c');
      expect(result.map.get('EQUATION')?.value).toBe('a=b=c');
    });

    it('ignores comments', () => {
      const result = parseEnv('# This is a comment\nFOO=bar');
      expect(result.keys).toEqual(['FOO']);
    });

    it('ignores inline comments when unquoted', () => {
      const result = parseEnv('FOO=bar # this is ignored');
      expect(result.map.get('FOO')?.value).toBe('bar');
    });

    it('preserves comments with option', () => {
      const result = parseEnv('# Config section\nFOO=bar', { preserveComments: true });
      expect(result.map.get('FOO')?.comment).toBe('Config section');
    });

    it('handles empty lines', () => {
      const result = parseEnv('FOO=bar\n\nBAZ=qux');
      expect(result.keys).toEqual(['FOO', 'BAZ']);
    });

    it('preserves original line', () => {
      const result = parseEnv('  SPACED_KEY=value  ');
      expect(result.map.get('SPACED_KEY')?.originalLine).toBe('SPACED_KEY=value');
    });
  });

  describe('serializeEnv', () => {
    it('serializes basic entries', () => {
      const entries = [{ key: 'FOO', value: 'bar' }];
      const result = serializeEnv(entries);
      expect(result).toBe('FOO=bar\n');
    });

    it('quotes values with spaces', () => {
      const entries = [{ key: 'SPACED', value: 'hello world' }];
      const result = serializeEnv(entries);
      expect(result).toBe('SPACED="hello world"\n');
    });

    it('escapes quotes in values', () => {
      const entries = [{ key: 'QUOTED', value: 'say "hello"' }];
      const result = serializeEnv(entries);
      expect(result).toBe('QUOTED="say \\"hello\\""\n');
    });

    it('preserves comments', () => {
      const entries = [{ key: 'FOO', value: 'bar', comment: 'Config' }];
      const result = serializeEnv(entries);
      expect(result).toBe('# Config\nFOO=bar\n');
    });

    it('handles empty lines', () => {
      const entries = [{ key: '', value: '', originalLine: '' }, { key: 'FOO', value: 'bar' }];
      const result = serializeEnv(entries);
      expect(result).toBe('\nFOO=bar\n');
    });
  });

  describe('isSecretKey', () => {
    it('detects SECRET pattern', () => {
      expect(isSecretKey('API_SECRET')).toBe(true);
      expect(isSecretKey('SECRET_KEY')).toBe(true);
    });

    it('detects PASSWORD pattern', () => {
      expect(isSecretKey('DB_PASSWORD')).toBe(true);
      expect(isSecretKey('userPassphrase')).toBe(true);
    });

    it('detects TOKEN pattern', () => {
      expect(isSecretKey('AUTH_TOKEN')).toBe(true);
      expect(isSecretKey('accessToken')).toBe(true);
    });

    it('detects KEY pattern', () => {
      expect(isSecretKey('API_KEY')).toBe(true);
    });

    it('does not flag regular keys', () => {
      expect(isSecretKey('PORT')).toBe(false);
      expect(isSecretKey('NODE_ENV')).toBe(false);
      expect(isSecretKey('DEBUG')).toBe(false);
    });
  });

  describe('maskValue', () => {
    it('masks short values completely', () => {
      expect(maskValue('abc')).toBe('***');
    });

    it('masks long values showing first/last chars', () => {
      expect(maskValue('supersecret')).toBe('su' + '•'.repeat(7) + 'et');
    });

    it('respects visibleChars parameter', () => {
      expect(maskValue('supersecret', 3)).toBe('sup' + '•'.repeat(5) + 'ret');
    });
  });
});
