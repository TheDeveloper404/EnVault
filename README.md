# EnVault

A self-hosted, local-first environment variable manager with UI + API + CLI. Securely manage your `.env` files with encryption at rest, schema validation, and environment comparison.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Node](https://img.shields.io/badge/node-%3E%3D18-green.svg)

## Project Status

EnVault este in stadiu **production-ready candidate**:
- lint / typecheck / test / build verificate
- teste API + CLI + Web E2E trecute
- Docker rebuild + health checks validate
- GitHub OAuth integrat (cu callback configurabil)

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
- PostgreSQL 16+

### Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/envault.git
cd envault

# Install dependencies
pnpm install

# Set master key (required for encryption)
export ENVAULT_MASTER_KEY=$(pnpm --filter @envault/cli exec envault key generate)
echo "Save this key: $ENVAULT_MASTER_KEY"

# Run migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

This starts:
- API on http://localhost:3093
- Web UI on http://localhost:3092

### Default Ports

- Web UI: `http://localhost:3092`
- API: `http://localhost:3093`
- PostgreSQL: `localhost:5432`

### Docker (Production)

```bash
# Set master key
export ENVAULT_MASTER_KEY=your-64-char-hex-key

# Run with docker-compose
cd infra/docker
docker-compose up -d
```

Access:
- Web UI: http://localhost:3092
- API: http://localhost:3093

### GitHub OAuth Configuration

Seteaza in `.env`:

```env
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
APP_URL=http://localhost:3092
GITHUB_CALLBACK_PATH=/auth/github/callback
```

In GitHub OAuth App:
- Authorization callback URL: `http://localhost:3092/auth/github/callback`

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
- Master Key: Must be set via `ENVAULT_MASTER_KEY` environment variable
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
│   ├── api/          # Fastify + Prisma + PostgreSQL
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

# Unit tests
pnpm test:unit

# Coverage (unit coverage gate)
pnpm test:coverage

# Integration tests (apps/api)
pnpm test:integration

# E2E tests (apps/web)
pnpm test:e2e
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

CI (`.github/workflows/ci.yml`) runs lint + typecheck + unit coverage gate + integration tests + build + e2e.

Deployment guidance (including free-hosting options) is documented in `docs/deployment-options.md`.

Before production release, use `docs/checklist.md` (Release readiness section) for final go-live checks.

For PostgreSQL backup and restore operations, use `docs/backup-restore.md`.

For centralized logs + external alerting baseline, use `docs/log-aggregation.md` and `docs/alerting-baseline.md`.

For managed retention/compliance baseline (Grafana Cloud templates), use `docs/retention-compliance.md`.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ENVAULT_MASTER_KEY` | Yes | 64-char hex or base64 key for encryption |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `PORT` | No | Backend/API service port (default: 3091) |
| `API_PORT` | No | Public API listener port (default: 3093) |
| `VITE_PORT` | No | Web UI dev server port (default: 3092) |
| `HOST` | No | API host (default: 0.0.0.0) |
| `LOG_LEVEL` | No | debug, info, warn, error (default: info) |
| `CORS_ORIGIN` | Yes in production | Allowed origin for CORS (defaults to disabled when unset) |
| `APP_URL` | No | Public app URL used for OAuth redirects (default: request host) |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth client id |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth client secret |
| `GITHUB_CALLBACK_PATH` | No | GitHub callback path (default: `/auth/github/callback`) |
| `AUTH_MAX_LOGIN_ATTEMPTS` | No | Failed logins before temporary block (default: 5) |
| `AUTH_LOGIN_ATTEMPT_WINDOW_MS` | No | Failed-login counting window in ms (default: 900000) |
| `AUTH_LOGIN_BLOCK_DURATION_MS` | No | Temporary block duration in ms (default: 900000) |

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
