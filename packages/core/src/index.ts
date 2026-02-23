/**
 * EnVault Core - Main exports
 */

// Parser
export {
  parseEnv,
  serializeEnv,
  isSecretKey,
  maskValue,
  type EnvEntry,
  type ParseResult,
  type ParseOptions
} from './parser/index.js';

// Crypto
export {
  encrypt,
  decrypt,
  validateMasterKey,
  generateMasterKey,
  isEncrypted,
  DecryptionError,
  type EncryptedValue
} from './crypto/index.js';

// Validator
export {
  parseEnvExample,
  parseSchemaJson,
  validateEnv,
  serializeSchema,
  generateEnvExample,
  type SchemaField,
  type EnvSchema,
  type ValidationError,
  type ValidationResult
} from './validator/index.js';

// Diff
export {
  diffEnvs,
  formatDiff,
  diffSummary,
  type DiffEntry,
  type DiffResult,
  type DiffOptions
} from './diff/index.js';
