import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests', testMatch: '**/score-museum.spec.ts', fullyParallel: false, workers: 1,
  timeout: 120000, expect: { timeout: 8000 }, reporter: [['list']],
  outputDir: './test-results-museum',
  use: {
    baseURL: 'http://127.0.0.1:5183', headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    viewport: { width: 1440, height: 900 }, trace: 'retain-on-failure'
  },
  webServer: [
    {
      command: 'node --import tsx scripts/museum-test-server.ts',
      url: 'http://127.0.0.1:3011/__museum-test-boundary',
      reuseExistingServer: false, timeout: 60000,
      env: { PORT: '3011' }
    },
    {
      command: 'npm run dev:web -- --port 5183 --strictPort',
      url: 'http://127.0.0.1:5183', reuseExistingServer: false, timeout: 60000,
      env: { API_TARGET: 'http://127.0.0.1:3011' }
    }
  ]
});
