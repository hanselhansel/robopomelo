import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    maxWorkers: 2,
    // Hosted native integration includes durable filesystem writes and subprocesses.
    // Explicit performance assertions remain separate from this failure deadline.
    testTimeout: process.env.CI ? 30_000 : 5_000,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: ['tests/browser/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
