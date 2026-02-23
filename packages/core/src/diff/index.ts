/**
 * EnVault diff engine
 * Compare environment variables between environments
 */

export interface DiffEntry {
  key: string;
  type: 'added' | 'removed' | 'changed' | 'unchanged';
  sourceValue?: string;
  targetValue?: string;
  isSecret?: boolean;
}

export interface DiffResult {
  entries: DiffEntry[];
  added: DiffEntry[];
  removed: DiffEntry[];
  changed: DiffEntry[];
  unchanged: DiffEntry[];
  hasChanges: boolean;
}

export interface DiffOptions {
  maskSecrets?: boolean;
  secretKeys?: string[];
  includeUnchanged?: boolean;
}

/**
 * Compare two environment variable maps
 */
export function diffEnvs(
  source: Record<string, string>,
  target: Record<string, string>,
  options: DiffOptions = {}
): DiffResult {
  const { maskSecrets = true, secretKeys = [], includeUnchanged = false } = options;
  
  const sourceKeys = Object.keys(source);
  const targetKeys = Object.keys(target);
  const allKeys = new Set([...sourceKeys, ...targetKeys]);
  
  const entries: DiffEntry[] = [];
  const added: DiffEntry[] = [];
  const removed: DiffEntry[] = [];
  const changed: DiffEntry[] = [];
  const unchanged: DiffEntry[] = [];

  for (const key of allKeys) {
    const sourceValue = source[key];
    const targetValue = target[key];
    const isSecret = secretKeys.includes(key) || isSecretKeyByName(key);

    let entry: DiffEntry;

    if (sourceValue === undefined) {
      // Added in target
      entry = {
        key,
        type: 'added',
        targetValue: maskSecrets && isSecret ? mask(targetValue) : targetValue,
        isSecret
      };
      added.push(entry);
    } else if (targetValue === undefined) {
      // Removed from source
      entry = {
        key,
        type: 'removed',
        sourceValue: maskSecrets && isSecret ? mask(sourceValue) : sourceValue,
        isSecret
      };
      removed.push(entry);
    } else if (sourceValue !== targetValue) {
      // Changed
      entry = {
        key,
        type: 'changed',
        sourceValue: maskSecrets && isSecret ? mask(sourceValue) : sourceValue,
        targetValue: maskSecrets && isSecret ? mask(targetValue) : targetValue,
        isSecret
      };
      changed.push(entry);
    } else {
      // Unchanged
      entry = {
        key,
        type: 'unchanged',
        sourceValue: maskSecrets && isSecret ? mask(sourceValue) : sourceValue,
        targetValue: maskSecrets && isSecret ? mask(targetValue) : targetValue,
        isSecret
      };
      unchanged.push(entry);
    }

    if (includeUnchanged || entry.type !== 'unchanged') {
      entries.push(entry);
    }
  }

  return {
    entries,
    added,
    removed,
    changed,
    unchanged,
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0
  };
}

/**
 * Auto-detect secret keys by name patterns
 */
function isSecretKeyByName(key: string): boolean {
  const patterns = [
    /secret/i,
    /password/i,
    /token/i,
    /key/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private/i,
    /passphrase/i
  ];
  return patterns.some(p => p.test(key));
}

/**
 * Mask a value, showing only first/last few chars
 */
function mask(value: string, visible: number = 3): string {
  if (value.length <= visible * 2) {
    return '•'.repeat(value.length);
  }
  return value.substring(0, visible) + '•'.repeat(value.length - visible * 2) + value.substring(value.length - visible);
}

/**
 * Format diff as human-readable text
 */
export function formatDiff(result: DiffResult, format: 'text' | 'json' = 'text'): string {
  if (format === 'json') {
    return JSON.stringify(result, null, 2);
  }

  const lines: string[] = [];

  if (!result.hasChanges) {
    return 'No differences found.';
  }

  if (result.added.length > 0) {
    lines.push(`Added (${result.added.length}):`);
    for (const entry of result.added) {
      const value = entry.targetValue || '';
      lines.push(`  + ${entry.key}=${value}`);
    }
    lines.push('');
  }

  if (result.removed.length > 0) {
    lines.push(`Removed (${result.removed.length}):`);
    for (const entry of result.removed) {
      const value = entry.sourceValue || '';
      lines.push(`  - ${entry.key}=${value}`);
    }
    lines.push('');
  }

  if (result.changed.length > 0) {
    lines.push(`Changed (${result.changed.length}):`);
    for (const entry of result.changed) {
      const source = entry.sourceValue || '';
      const target = entry.targetValue || '';
      lines.push(`  ~ ${entry.key}:`);
      lines.push(`    - ${source}`);
      lines.push(`    + ${target}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Create a summary of differences
 */
export function diffSummary(result: DiffResult): string {
  if (!result.hasChanges) {
    return 'No changes';
  }

  const parts: string[] = [];
  if (result.added.length > 0) parts.push(`${result.added.length} added`);
  if (result.removed.length > 0) parts.push(`${result.removed.length} removed`);
  if (result.changed.length > 0) parts.push(`${result.changed.length} changed`);

  return parts.join(', ');
}
