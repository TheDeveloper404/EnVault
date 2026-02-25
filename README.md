# EnVault

A self-hosted, local-first environment variable manager with UI + API + CLI. Securely manage your `.env` files with encryption at rest, schema validation, and environment comparison.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## Features

- **Projects & Environments**: Organize variables by project (e.g., "my-saas") and environment (local, staging, prod)
- **Encryption at Rest**: All values encrypted with AES-256-GCM using a master key
- **Schema Validation**: Define required keys, types, regex patterns via `.env.example` or `env.schema.json`
- **Diff Between Environments**: Compare local vs staging vs prod, with automatic secret masking
- **Audit Logging**: Track who changed what and when (secrets masked in logs)
- **Import/Export**: Seamlessly import from `.env` files and export back
- **Self-Hosted**: Runs 100% locally - no cloud dependency
- **Modern UI**: React + Tailwind interface with secret masking toggle

## Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- SQLite (included)

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/envault.git
cd envault

# Install dependencies
pnpm install

# Set master key (required for encryption)
export ENVALT_MASTER_KEY=$(pnpm --filter @envault/cli exec envault key generate)
echo "Save this key: $ENVALT_MASTER_KEY"

# Run migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

This starts:
- API on http://localhost:3093
- Web UI on http://localhost:3092

### Docker (Production)

```bash
# Set master key
export ENVALT_MASTER_KEY=your-64-char-hex-key

# Run with docker-compose
cd infra/docker
docker-compose up -d
```

Access:
- Web UI: http://localhost:3092
- API: http://localhost:3093

## CLI Usage

```bash
# Install CLI globally
npm install -g @envault/cli

# Or use via pnpm
pnpm --filter @envault/cli exec envault <command>

# Initialize a project
envault init -n my-project

# Push .env to EnVault
envault push --env local --file .env

# Pull from EnVault
envault pull --env production --file .env.production

# Validate against schema
envault validate --env staging

# Compare environments
envault diff local production

# Upload schema
envault schema --file .env.example
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/projects` | List projects |
| POST | `/projects` | Create project |
| GET | `/projects/:id/envs/:env/vars` | List variables |
| PUT | `/projects/:id/envs/:env/vars/:key` | Set variable |
| POST | `/projects/:id/envs/:env/import` | Import .env |
| GET | `/projects/:id/envs/:env/export` | Export .env |
| POST | `/projects/:id/schema` | Set schema |
| POST | `/projects/:id/validate` | Validate environment |
| GET | `/projects/:id/diff` | Compare environments |

## Security

### Encryption

- Algorithm: AES-256-GCM
- Master Key: Must be set via `ENVALT_MASTER_KEY` environment variable
- Format: `base64(nonce:12bytes + auth_tag:16bytes + ciphertext)`
- Key Validation: Accepts 64-char hex, base64, or derives from passphrase via scrypt

### Secret Detection

Keys matching these patterns are auto-marked as secrets:
- `SECRET`, `PASSWORD`, `TOKEN`, `KEY`, `API_KEY`, `AUTH`, `CREDENTIAL`, `PRIVATE`, `PASSPHRASE`

Secrets are:
- Masked by default in UI and CLI
- Encrypted with the same AES-256-GCM as other values
- Hidden in audit logs (replaced with `••••••`)

### Threat Model

| Threat | Mitigation |
|--------|------------|
| Database theft | All values encrypted, useless without master key |
| Memory dump | Values decrypted only on demand, not stored plaintext |
| Audit log leak | Secrets masked in logs |
| Network sniffing | Use HTTPS in production |
| Master key leak | Rotate key by re-encrypting (future feature) |

## Schema Format

### env.schema.json

```json
{
  "fields": {
    "PORT": {
      "type": "number",
      "required": true,
      "default": "3091"
    },
    "DATABASE_URL": {
      "type": "string",
      "required": true,
      "secret": true
    },
    "API_KEY": {
      "type": "string",
      "required": true,
      "regex": "^[a-zA-Z0-9]{32}$",
      "secret": true
    }
  }
}
```

### .env.example (also accepted)

```
# Required, no default
DATABASE_URL=

# Optional with default
PORT=3091
DEBUG=false
```

## Project Structure

```
EnVault/
├── apps/
│   ├── api/          # Fastify + Prisma + SQLite
│   └── web/          # React + Vite + Tailwind
├── packages/
│   ├── core/         # Parser, crypto, validator, diff
│   └── cli/          # Commander.js CLI
├── infra/
│   └── docker/       # Docker configs
├── .github/
│   └── workflows/    # CI/CD
└── README.md
```

## Testing

```bash
# Run all tests
pnpm test

# Unit tests (packages/core)
pnpm --filter @envault/core test

# Integration tests (apps/api)
pnpm --filter @envault/api test:integration

# E2E tests (apps/web)
pnpm --filter @envault/web test:e2e
```

## Release Workflow (main -> production)

Use this sequence when preparing a production release:

```bash
# 1) Push to main
git push origin main

# 2) Build all workspaces
pnpm build

# 3) Run tests
pnpm test
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + tests, and the lint/typecheck job builds `@envault/core` before workspace typecheck so `@envault/cli` can resolve `@envault/core` types reliably in clean runners.

Production deploy is done from the main branch using Railway configuration in `railway.toml`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVALT_MASTER_KEY` | Yes | 64-char hex or base64 key for encryption |
| `DATABASE_URL` | No | SQLite path (default: `file:./envault.db`) |
| `PORT` | No | Backend/API service port (default: 3091) |
| `API_PORT` | No | Public API listener port (default: 3093) |
| `VITE_PORT` | No | Web UI dev server port (default: 3092) |
| `HOST` | No | API host (default: 0.0.0.0) |
| `LOG_LEVEL` | No | debug, info, warn, error (default: info) |
| `CORS_ORIGIN` | No | CORS origin (default: true = any) |

## License

MIT License - see [LICENSE](LICENSE) file.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Please ensure tests pass and follow the existing code style.

## Support

- Issues: [GitHub Issues](https://github.com/yourusername/envault/issues)
- Discussions: [GitHub Discussions](https://github.com/yourusername/envault/discussions)
