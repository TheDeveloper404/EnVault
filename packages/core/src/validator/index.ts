/**
 * EnVault schema validator
 * Supports env.schema.json format and .env.example as contract
 */

export interface SchemaField {
  type?: 'string' | 'number' | 'boolean' | 'url' | 'email';
  required?: boolean;
  default?: string;
  regex?: string;
  minLength?: number;
  maxLength?: number;
  description?: string;
  secret?: boolean;
}

export interface EnvSchema {
  version?: string;
  fields: Record<string, SchemaField>;
}

export interface ValidationError {
  key: string;
  type: 'missing' | 'extra' | 'invalid_type' | 'invalid_format' | 'too_short' | 'too_long';
  message: string;
  value?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: string[];
}

/**
 * Parse .env.example file into schema
 */
export function parseEnvExample(content: string): EnvSchema {
  const lines = content.split('\n');
  const fields: Record<string, SchemaField> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const equalIndex = trimmed.indexOf('=');
    if (equalIndex === -1) {
      // Key without value = required
      const key = trimmed;
      fields[key] = { required: true };
    } else {
      const key = trimmed.substring(0, equalIndex).trim();
      const value = trimmed.substring(equalIndex + 1).trim();
      fields[key] = {
        required: false,
        default: value || undefined
      };
    }
  }

  return { fields };
}

/**
 * Parse env.schema.json content
 */
export function parseSchemaJson(content: string): EnvSchema {
  try {
    const parsed = JSON.parse(content);
    
    // Handle direct record format { KEY: { type, required } }
    if (parsed.fields) {
      return parsed as EnvSchema;
    }
    
    // Handle flat format where each key is a field definition
    const fields: Record<string, SchemaField> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (key === '$schema' || key === 'version') continue;
      fields[key] = value as SchemaField;
    }
    
    return { fields };
  } catch (error) {
    throw new Error(`Invalid JSON schema: ${error}`);
  }
}

/**
 * Validate environment variables against schema
 */
export function validateEnv(
  envVars: Record<string, string>,
  schema: EnvSchema,
  options: { allowExtra?: boolean } = {}
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: string[] = [];
  const envKeys = Object.keys(envVars);
  const schemaKeys = Object.keys(schema.fields);

  // Check for missing required fields
  for (const key of schemaKeys) {
    const field = schema.fields[key];
    const value = envVars[key];

    if (field.required && (value === undefined || value === '')) {
      errors.push({
        key,
        type: 'missing',
        message: `Required variable '${key}' is missing or empty`
      });
      continue;
    }

    if (value !== undefined && value !== '') {
      validateValue(key, value, field, errors);
    }
  }

  // Check for extra keys
  if (!options.allowExtra) {
    for (const key of envKeys) {
      if (!schema.fields[key]) {
        errors.push({
          key,
          type: 'extra',
          message: `Extra variable '${key}' not defined in schema`
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate a single value against field definition
 */
function validateValue(
  key: string,
  value: string,
  field: SchemaField,
  errors: ValidationError[]
): void {
  // Type validation
  if (field.type) {
    const typeError = validateType(key, value, field.type);
    if (typeError) {
      errors.push(typeError);
      return; // Stop further validation if type is wrong
    }
  }

  // Regex validation
  if (field.regex) {
    try {
      const regex = new RegExp(field.regex);
      if (!regex.test(value)) {
        errors.push({
          key,
          type: 'invalid_format',
          message: `Value for '${key}' does not match required format`,
          value
        });
      }
    } catch {
      // Invalid regex in schema, skip
    }
  }

  // Length validation
  if (field.minLength !== undefined && value.length < field.minLength) {
    errors.push({
      key,
      type: 'too_short',
      message: `Value for '${key}' is too short (min ${field.minLength} characters)`,
      value
    });
  }

  if (field.maxLength !== undefined && value.length > field.maxLength) {
    errors.push({
      key,
      type: 'too_long',
      message: `Value for '${key}' is too long (max ${field.maxLength} characters)`,
      value
    });
  }
}

/**
 * Validate value type
 */
function validateType(key: string, value: string, type: string): ValidationError | null {
  switch (type) {
    case 'number':
      if (isNaN(Number(value)) || value.trim() === '') {
        return {
          key,
          type: 'invalid_type',
          message: `Value for '${key}' must be a number`,
          value
        };
      }
      break;

    case 'boolean':
      if (!/^(true|false|1|0|yes|no)$/i.test(value)) {
        return {
          key,
          type: 'invalid_type',
          message: `Value for '${key}' must be a boolean`,
          value
        };
      }
      break;

    case 'url':
      try {
        new URL(value);
      } catch {
        return {
          key,
          type: 'invalid_type',
          message: `Value for '${key}' must be a valid URL`,
          value
        };
      }
      break;

    case 'email':
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        return {
          key,
          type: 'invalid_type',
          message: `Value for '${key}' must be a valid email`,
          value
        };
      }
      break;
  }

  return null;
}

/**
 * Serialize schema to JSON format
 */
export function serializeSchema(schema: EnvSchema): string {
  return JSON.stringify(schema, null, 2);
}

/**
 * Generate .env.example from schema
 */
export function generateEnvExample(schema: EnvSchema): string {
  const lines: string[] = [];

  for (const [key, field] of Object.entries(schema.fields)) {
    if (field.description) {
      lines.push(`# ${field.description}`);
    }

    if (field.required) {
      lines.push(`${key}=`);
    } else {
      lines.push(`${key}=${field.default || ''}`);
    }

    lines.push('');
  }

  return lines.join('\n');
}
