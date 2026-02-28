import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e'],
    environment: 'node',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      include: ['packages/cli/src/**/*.ts', 'packages/core/src/**/*.ts', 'apps/api/src/**/*.ts'],
      exclude: ['**/*.d.ts', '**/dist/**', '**/node_modules/**'],
      thresholds: {
        lines: 30,
        functions: 30,
        statements: 30,
        branches: 20
      }
    }
  },
  resolve: {
    alias: {
      '@envault/core': path.resolve(__dirname, 'packages/core/src'),
      '@envault/cli': path.resolve(__dirname, 'packages/cli/src'),
      '@envault/api': path.resolve(__dirname, 'apps/api/src'),
    },
  },
});
