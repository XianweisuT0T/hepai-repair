import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', testMatch: '**/*.spec.ts', testIgnore: '**/score-museum.spec.ts', fullyParallel: false, workers: 1,
  timeout: 60000, expect: { timeout: 8000 }, reporter: [['list']],
  use: { baseURL: 'http://127.0.0.1:5173', headless: true, channel: process.env.PW_CHANNEL || undefined, viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run dev', url: 'http://127.0.0.1:5173', reuseExistingServer: true,
    timeout: 60000, env: { DATA_DIR: './data/e2e', PORT: '3001' }
  }
});
