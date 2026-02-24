import { defineConfig, devices } from '@playwright/test';

const MASTER_KEY = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4001',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: 'pnpm --dir ../.. --filter @envault/api dev:e2e',
      url: 'http://127.0.0.1:4000/health',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        ENVAULT_MASTER_KEY: MASTER_KEY,
        DATABASE_URL: 'file:./prisma/e2e.db',
        PORT: '4000',
        HOST: '127.0.0.1'
      }
    },
    {
      command: 'pnpm --dir ../.. --filter @envault/web dev',
      url: 'http://localhost:4001',
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:4000',
        VITE_PORT: '4001'
      }
    }
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    }
  ]
});
