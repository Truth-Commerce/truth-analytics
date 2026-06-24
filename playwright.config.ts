import { defineConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });

const testDbUrl = process.env.DATABASE_URL_TEST;
const testDbDirect = process.env.DATABASE_URL_TEST_DIRECT ?? testDbUrl;

if (!testDbUrl) {
  throw new Error(
    'DATABASE_URL_TEST ausente — o E2E precisa do branch de teste; recuso rodar contra produção.',
  );
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  // Single worker: specs share one dev-server and one DB branch; running
  // them sequentially prevents cross-spec session / redirect interference.
  workers: 1,
  // globalSetup sets PW_E2E_RUN_ID once so all workers share the same test email.
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:3100' },
  webServer: {
    command: 'npm run dev -- -p 3100',
    url: 'http://localhost:3100',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Força o dev server do E2E a usar o branch `test`, NUNCA produção (`main`).
    env: {
      POSTGRES_URL: testDbUrl,
      POSTGRES_URL_DIRECT: testDbDirect as string,
      AUTH_SECRET: process.env.AUTH_SECRET as string,
      APP_URL: 'http://localhost:3100',
    },
  },
});
