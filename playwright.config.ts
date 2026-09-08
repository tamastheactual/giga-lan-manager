import { defineConfig } from '@playwright/test';

// End-to-end tests against the REAL built app (browser + SPA + Hono API).
// Requires Redis on localhost:6379 (`docker compose up -d redis`). The webServer
// builds the client and starts the server that serves the SPA + /api on :3000.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run build && npm run start:server',
    url: 'http://localhost:3000/api/health',
    timeout: 120_000,
    reuseExistingServer: true,
  },
});
