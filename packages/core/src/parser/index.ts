/**
 * EnVault .env file parser
 * Handles: comments, empty lines, single/double quotes, escaping, values with =
 */

export interface EnvEntry {
  key: string;
  value: string;
  comment?: string;
  originalLine?: string;
}

export interface ParseResult {
  entries: EnvEntry[];
  map: Map<string, EnvEntry>;
  keys: string[];
}

export interface ParseOptions {
  preserveComments?: boolean;
  preserveEmptyLines?: boolean;
}

/**
 * Parse a .env file content into structured entries
 */
export function parseEnv(content: string, options: ParseOptions = {}): ParseResult {
  const lines = content.split('\n');
  const entries: EnvEntry[] = [];
  const map = new Map<string, EnvEntry>();
  const keys: string[] = [];

  let currentComment = '';

  for (const originalLine of lines) {
    const trimmed = originalLine.trim();

    // Empty line
    if (!trimmed) {
      if (options.preserveEmptyLines) {
        entries.push({
          key: '',
          value: '',
          comment: currentComment || undefined,
          originalLine: ''
        });
      }
      currentComment = '';
      continue;
    }

    // Comment line
    if (trimmed.startsWith('#')) {
      if (options.preserveComments) {
        currentComment = trimmed.substring(1).trim();
      }
      continue;
    }

    // Parse key=value
    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      // Line without =, skip or handle as needed
      continue;
    }

    const key = trimmed.substring(0, equalIndex).trim();
    let value = trimmed.substring(equalIndex + 1);

    // Parse value with quotes
    const parsedValue = parseValue(value);

    const entry: EnvEntry = {
      key,
      value: parsedValue,
      comment: currentComment || undefined,
      originalLine: originalLine.trimEnd()
    };

    entries.push(entry);
    map.set(key, entry);
    if (!keys.includes(key)) {
      keys.push(key);
    }

    currentComment = '';
  }

  return { entries, map, keys };
}

/**
 * Parse a value string, handling quotes and escaping
 */
function parseValue(value: string): string {
  const trimmed = value.trim();

  // Double quoted: "..." - support escaping with \"
  if (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) {
    const inner = trimmed.slice(1, -1);
    return inner
      .replace(/\\"/g, '"')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\\\/g, '\\');
  }

  // Single quoted: '...' - literal, no escaping
  if (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1) {
    return trimmed.slice(1, -1);
  }

  // Unquoted: trim whitespace, remove inline comments
  const hashIndex = trimmed.indexOf(' #');
  if (hashIndex !== -1) {
    return trimmed.substring(0, hashIndex).trim();
  }

  return trimmed;
}

/**
 * Serialize entries back to .env format
 */
export function serializeEnv(entries: EnvEntry[], options: { preserveOrder?: boolean } = {}): string {
  const lines: string[] = [];

  for (const entry of entries) {
    if (!entry.key) {
      // Empty line or comment-only
      if (entry.comment) {
        lines.push(`# ${entry.comment}`);
      } else if (entry.originalLine === '') {
        lines.push('');
      }
      continue;
    }

    if (entry.comment) {
      lines.push(`# ${entry.comment}`);
    }

    const value = serializeValue(entry.value);
    lines.push(`${entry.key}=${value}`);
  }

  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

/**
 * Serialize a value, adding quotes if needed
 */
function serializeValue(value: string): string {
  // Needs quotes if contains spaces, #, =, or newlines
  const needsQuotes = /[\s#=\n'"]/.test(value);

  if (!needsQuotes) {
    return value;
  }

  // Prefer double quotes, escape as needed
  if (value.includes('"') || value.includes('\\') || value.includes('\n') || value.includes('\t')) {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n')
      .replace(/\t/g, '\\t');
    return `"${escaped}"`;
  }

  return `"${value}"`;
}

/**
 * Detect if a key is likely a secret
 */
export function isSecretKey(key: string): boolean {
  const secretPatterns = [
    /secret/i,
    /password/i,
    /token/i,
    /key/i,
    /api[_-]?key/i,
    /auth/i,
    /credential/i,
    /private/i,
    /passphrase/i,
    /seed/i,
    /mnemonic/i
  ];

  return secretPatterns.some(pattern => pattern.test(key));
}

/**
 * Create a masked version of a value
 */
export function maskValue(value: string, visibleChars: number = 4): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }
  return value.substring(0, visibleChars) + '*'.repeat(value.length - visibleChars * 2) + value.substring(value.length - visibleChars);
}
