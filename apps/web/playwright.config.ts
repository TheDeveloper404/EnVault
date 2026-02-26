import { defineConfig, devices } from '@playwright/test';

const MASTER_KEY = 'aabbccdd11223344aabbccdd11223344aabbccdd11223344aabbccdd11223344';

export default defineConfig({
  testDir: '../../tests/e2e',
  fullyParallel: false,
  timeout: 60_000,
  expect: {
    timeout: 10_000
  },
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3092',
    trace: 'on-first-retry'
  },
  webServer: [
    {
      command: 'pnpm --dir ../.. --filter @envault/api dev:e2e',
      url: 'http://127.0.0.1:3093/health',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ENVAULT_MASTER_KEY: MASTER_KEY,
        ENVAULT_E2E_AUTH_BYPASS: '1',
        DATABASE_URL: 'postgresql://envault:envault_dev_password@localhost:5432/envault_e2e',
        API_PORT: '3093',
        PORT: '3091',
        HOST: '127.0.0.1'
      }
    },
    {
      command: 'pnpm --dir ../.. --filter @envault/web dev',
      url: 'http://localhost:3092',
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3093',
        VITE_PORT: '3092',
        VITE_E2E_AUTH_BYPASS: '1'
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
