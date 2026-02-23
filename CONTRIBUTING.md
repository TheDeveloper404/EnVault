# Contributing to EnVault

Thank you for your interest in contributing to EnVault! This document provides guidelines and instructions for contributing.

## Development Setup

1. Fork and clone the repository
2. Install dependencies: `pnpm install`
3. Set up environment: `cp .env.example .env` and configure `ENVALT_MASTER_KEY`
4. Run migrations: `pnpm db:migrate`
5. Start dev servers: `pnpm dev`

## Project Structure

- `packages/core/` - Core utilities (parser, crypto, validator, diff)
- `packages/cli/` - Command-line interface
- `apps/api/` - Fastify REST API with Prisma/SQLite
- `apps/web/` - React + Vite + Tailwind UI
- `infra/docker/` - Docker configurations

## Making Changes

1. Create a feature branch: `git checkout -b feature/your-feature`
2. Make your changes with appropriate tests
3. Run linting: `pnpm lint`
4. Run type checking: `pnpm typecheck`
5. Run tests: `pnpm test`
6. Commit with descriptive messages
7. Push and create a Pull Request

## Code Style

- TypeScript strict mode enabled
- Follow existing patterns in the codebase
- Add tests for new functionality
- Update documentation as needed

## Testing

- **Unit tests**: `pnpm --filter @envault/core test`
- **Integration tests**: `pnpm --filter @envault/api test:integration`
- **E2E tests**: `pnpm --filter @envault/web test:e2e`

## Security

- Never commit the master key
- Mask secrets in logs and UI
- Use AES-256-GCM for encryption
- Validate all inputs

## Questions?

Open an issue or start a discussion on GitHub.
