import { defineConfig, devices } from '@playwright/test';

/** Les tests E2E s'exécutent contre l'application COMPILÉE (npm run build requis), avec une base jetable. */
const PORT = Number(process.env.E2E_PORT ?? 18099);

export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${PORT}`, trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'node dist/server/index.js',
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DATABASE_PATH: `test-results/e2e-${Date.now()}.sqlite`,
      LOG_FORMAT: 'json',
      LOG_LEVEL: 'warn',
      BACKUP_ON_START: 'false',
      RATE_LIMIT_MAX: '5000',
      AUTH_RATE_LIMIT_MAX: '1000',
    },
  },
});
