import { describe, it, expect } from 'vitest';
import { diffEnvs, formatDiff, diffSummary } from '../src/diff/index.js';

describe('diff', () => {
  describe('diffEnvs', () => {
    it('detects added keys', () => {
      const source = { A: '1' };
      const target = { A: '1', B: '2' };
      const result = diffEnvs(source, target);
      
      expect(result.hasChanges).toBe(true);
      expect(result.added).toHaveLength(1);
      expect(result.added[0].key).toBe('B');
      expect(result.added[0].type).toBe('added');
    });

    it('detects removed keys', () => {
      const source = { A: '1', B: '2' };
      const target = { A: '1' };
      const result = diffEnvs(source, target);
      
      expect(result.removed).toHaveLength(1);
      expect(result.removed[0].key).toBe('B');
      expect(result.removed[0].type).toBe('removed');
    });

    it('detects changed values', () => {
      const source = { A: '1' };
      const target = { A: '2' };
      const result = diffEnvs(source, target);
      
      expect(result.changed).toHaveLength(1);
      expect(result.changed[0].key).toBe('A');
      expect(result.changed[0].sourceValue).toBe('1');
      expect(result.changed[0].targetValue).toBe('2');
    });

    it('detects unchanged values', () => {
      const source = { A: '1', B: '2' };
      const target = { A: '1', B: '3' };
      const result = diffEnvs(source, target);
      
      expect(result.unchanged).toHaveLength(1);
      expect(result.unchanged[0].key).toBe('A');
    });

    it('masks secrets by default', () => {
      const source = { API_KEY: 'secret123' };
      const target = { API_KEY: 'secret456' };
      const result = diffEnvs(source, target);
      
      expect(result.changed[0].isSecret).toBe(true);
      expect(result.changed[0].sourceValue).not.toBe('secret123');
      expect(result.changed[0].targetValue).not.toBe('secret456');
      expect(result.changed[0].sourceValue).toContain('•');
    });

    it('can show plaintext when configured', () => {
      const source = { API_KEY: 'secret123' };
      const target = { API_KEY: 'secret456' };
      const result = diffEnvs(source, target, { maskSecrets: false });
      
      expect(result.changed[0].sourceValue).toBe('secret123');
      expect(result.changed[0].targetValue).toBe('secret456');
    });

    it('accepts explicit secret keys', () => {
      const source = { CUSTOM_SECRET: 'hidden' };
      const target = {};
      const result = diffEnvs(source, target, { secretKeys: ['CUSTOM_SECRET'] });
      
      expect(result.removed[0].isSecret).toBe(true);
      expect(result.removed[0].sourceValue).toContain('•');
    });

    it('excludes unchanged when configured', () => {
      const source = { A: '1', B: '2' };
      const target = { A: '1', B: '3' };
      const result = diffEnvs(source, target, { includeUnchanged: false });
      
      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].key).toBe('B');
    });

    it('returns no changes for identical envs', () => {
      const source = { A: '1', B: '2' };
      const target = { A: '1', B: '2' };
      const result = diffEnvs(source, target);
      
      expect(result.hasChanges).toBe(false);
      expect(result.entries).toHaveLength(0);
    });
  });

  describe('formatDiff', () => {
    it('formats text output', () => {
      const source = { A: '1' };
      const target = { A: '2', B: '3' };
      const result = diffEnvs(source, target);
      const formatted = formatDiff(result, 'text');
      
      expect(formatted).toContain('Added (1):');
      expect(formatted).toContain('+ B=3');
      expect(formatted).toContain('Changed (1):');
      expect(formatted).toContain('~ A:');
    });

    it('formats JSON output', () => {
      const source = { A: '1' };
      const target = { A: '2' };
      const result = diffEnvs(source, target);
      const formatted = formatDiff(result, 'json');
      
      const parsed = JSON.parse(formatted);
      expect(parsed.hasChanges).toBe(true);
      expect(parsed.changed).toHaveLength(1);
    });

    it('handles no changes', () => {
      const source = { A: '1' };
      const target = { A: '1' };
      const result = diffEnvs(source, target);
      const formatted = formatDiff(result, 'text');
      
      expect(formatted).toBe('No differences found.');
    });
  });

  describe('diffSummary', () => {
    it('summarizes changes', () => {
      const source = { A: '1', B: '2', C: '3' };
      const target = { A: '2', B: '2', D: '4' };
      const result = diffEnvs(source, target);
      
      expect(diffSummary(result)).toBe('1 added, 1 removed, 1 changed');
    });

    it('returns no changes when empty', () => {
      const source = { A: '1' };
      const target = { A: '1' };
      const result = diffEnvs(source, target);
      
      expect(diffSummary(result)).toBe('No changes');
    });
  });
});
