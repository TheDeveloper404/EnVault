import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e'],
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@envault/core': path.resolve(__dirname, 'packages/core/src'),
      '@envault/cli': path.resolve(__dirname, 'packages/cli/src'),
      '@envault/api': path.resolve(__dirname, 'apps/api/src'),
    },
  },
});
