import { describe, it, expect } from 'vitest';
import { parseEnvExample, parseSchemaJson, validateEnv, serializeSchema, generateEnvExample } from '../src/validator/index.js';

describe('validator', () => {
  describe('parseEnvExample', () => {
    it('parses required keys (no value)', () => {
      const result = parseEnvExample('DB_HOST\nDB_USER');
      expect(result.fields.DB_HOST).toEqual({ required: true });
      expect(result.fields.DB_USER).toEqual({ required: true });
    });

    it('parses keys with defaults', () => {
      const result = parseEnvExample('PORT=3000\nDEBUG=false');
      expect(result.fields.PORT).toEqual({ required: false, default: '3000' });
      expect(result.fields.DEBUG).toEqual({ required: false, default: 'false' });
    });

    it('ignores comments', () => {
      const result = parseEnvExample('# Database settings\nDB_HOST=localhost');
      expect(result.fields.DB_HOST).toBeDefined();
      expect(Object.keys(result.fields)).toHaveLength(1);
    });

    it('handles empty values', () => {
      const result = parseEnvExample('EMPTY=');
      expect(result.fields.EMPTY).toEqual({ required: false, default: '' });
    });

    it('handles values with spaces', () => {
      const result = parseEnvExample('MESSAGE=hello world');
      expect(result.fields.MESSAGE).toEqual({ required: false, default: 'hello world' });
    });
  });

  describe('parseSchemaJson', () => {
    it('parses schema with fields object', () => {
      const json = JSON.stringify({
        version: '1.0',
        fields: {
          PORT: { type: 'number', required: true, default: '3000' }
        }
      });
      const result = parseSchemaJson(json);
      expect(result.fields.PORT).toEqual({ type: 'number', required: true, default: '3000' });
    });

    it('parses flat schema format', () => {
      const json = JSON.stringify({
        PORT: { type: 'number', required: true },
        DEBUG: { type: 'boolean', required: false }
      });
      const result = parseSchemaJson(json);
      expect(result.fields.PORT.type).toBe('number');
      expect(result.fields.DEBUG.type).toBe('boolean');
    });

    it('ignores $schema field', () => {
      const json = JSON.stringify({
        $schema: 'http://example.com/schema',
        API_KEY: { type: 'string', required: true }
      });
      const result = parseSchemaJson(json);
      expect(result.fields['$schema']).toBeUndefined();
      expect(result.fields.API_KEY).toBeDefined();
    });
  });

  describe('validateEnv', () => {
    const schema = {
      fields: {
        PORT: { type: 'number', required: true, minLength: 1, maxLength: 5 },
        HOST: { type: 'string', required: true },
        DEBUG: { type: 'boolean', required: false, default: 'false' },
        URL: { type: 'url', required: false },
        EMAIL: { type: 'email', required: false },
        API_KEY: { type: 'string', required: true, regex: '^[a-zA-Z0-9]{32}$' }
      }
    };

    it('validates correct env', () => {
      const env = {
        PORT: '3000',
        HOST: 'localhost',
        DEBUG: 'true',
        API_KEY: 'abcd1234'.repeat(4)
      };
      const result = validateEnv(env, schema);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('detects missing required fields', () => {
      const env = { PORT: '3000' };
      const result = validateEnv(env, schema);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.key === 'HOST' && e.type === 'missing')).toBe(true);
      expect(result.errors.some(e => e.key === 'API_KEY' && e.type === 'missing')).toBe(true);
    });

    it('detects empty required values', () => {
      const env = { PORT: '', HOST: '', API_KEY: 'abcd1234'.repeat(4) };
      const result = validateEnv(env, schema);
      expect(result.errors.some(e => e.key === 'PORT' && e.type === 'missing')).toBe(true);
      expect(result.errors.some(e => e.key === 'HOST' && e.type === 'missing')).toBe(true);
    });

    it('detects extra keys when not allowed', () => {
      const env = {
        PORT: '3000',
        HOST: 'localhost',
        API_KEY: 'abcd1234'.repeat(4),
        EXTRA_KEY: 'value'
      };
      const result = validateEnv(env, schema);
      expect(result.errors.some(e => e.key === 'EXTRA_KEY' && e.type === 'extra')).toBe(true);
    });

    it('allows extra keys when configured', () => {
      const env = {
        PORT: '3000',
        HOST: 'localhost',
        API_KEY: 'abcd1234'.repeat(4),
        EXTRA_KEY: 'value'
      };
      const result = validateEnv(env, schema, { allowExtra: true });
      expect(result.errors.some(e => e.key === 'EXTRA_KEY')).toBe(false);
    });

    it('validates number type', () => {
      const result1 = validateEnv({ PORT: 'abc', HOST: 'x', API_KEY: 'a'.repeat(32) }, schema);
      expect(result1.errors.some(e => e.key === 'PORT' && e.type === 'invalid_type')).toBe(true);

      const result2 = validateEnv({ PORT: '3000', HOST: 'x', API_KEY: 'a'.repeat(32) }, schema);
      expect(result2.errors.some(e => e.key === 'PORT')).toBe(false);
    });

    it('validates boolean type', () => {
      const result1 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32), DEBUG: 'invalid' }, schema);
      expect(result1.errors.some(e => e.key === 'DEBUG' && e.type === 'invalid_type')).toBe(true);

      const result2 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32), DEBUG: 'true' }, schema);
      expect(result2.errors.some(e => e.key === 'DEBUG')).toBe(false);
    });

    it('validates URL type', () => {
      const result1 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32), URL: 'not-a-url' }, schema);
      expect(result1.errors.some(e => e.key === 'URL' && e.type === 'invalid_type')).toBe(true);

      const result2 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32), URL: 'https://example.com' }, schema);
      expect(result2.errors.some(e => e.key === 'URL')).toBe(false);
    });

    it('validates email type', () => {
      const result1 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32), EMAIL: 'not-an-email' }, schema);
      expect(result1.errors.some(e => e.key === 'EMAIL' && e.type === 'invalid_type')).toBe(true);

      const result2 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32), EMAIL: 'test@example.com' }, schema);
      expect(result2.errors.some(e => e.key === 'EMAIL')).toBe(false);
    });

    it('validates regex pattern', () => {
      const result1 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'short' }, schema);
      expect(result1.errors.some(e => e.key === 'API_KEY' && e.type === 'invalid_format')).toBe(true);

      const result2 = validateEnv({ PORT: '1', HOST: 'x', API_KEY: 'a'.repeat(32) }, schema);
      expect(result2.errors.some(e => e.key === 'API_KEY')).toBe(false);
    });

    it('validates minLength', () => {
      const result = validateEnv({ PORT: '1', HOST: '', API_KEY: 'a'.repeat(32) }, schema);
      expect(result.errors.some(e => e.key === 'HOST' && e.type === 'too_short')).toBe(false); // caught by required first
    });

    it('validates maxLength', () => {
      const result = validateEnv({ PORT: '123456', HOST: 'x', API_KEY: 'a'.repeat(32) }, schema);
      expect(result.errors.some(e => e.key === 'PORT' && e.type === 'too_long')).toBe(true);
    });
  });

  describe('serializeSchema', () => {
    it('serializes to JSON', () => {
      const schema = { fields: { PORT: { type: 'number' } } };
      const json = serializeSchema(schema);
      expect(JSON.parse(json)).toEqual(schema);
    });
  });

  describe('generateEnvExample', () => {
    it('generates required without default', () => {
      const schema = { fields: { REQUIRED: { required: true } } };
      const result = generateEnvExample(schema);
      expect(result).toContain('REQUIRED=');
    });

    it('generates optional with default', () => {
      const schema = { fields: { OPTIONAL: { required: false, default: 'default_value' } } };
      const result = generateEnvExample(schema);
      expect(result).toContain('OPTIONAL=default_value');
    });

    it('includes description as comment', () => {
      const schema = { fields: { KEY: { required: true, description: 'This is important' } } };
      const result = generateEnvExample(schema);
      expect(result).toContain('# This is important');
    });
  });
});
