import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/browser',
  testMatch: 'packaged-*.spec.ts',
  fullyParallel: false,
  workers: 1,
  outputDir: 'test-results/browser-run',
  timeout: 60000,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'test-results/browser-report' }]],
  use: { viewport: { width: 1440, height: 1000 }, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
