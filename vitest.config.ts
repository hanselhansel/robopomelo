import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    maxWorkers: 2,
    include: ['packages/**/*.test.ts', 'apps/**/*.test.ts', 'apps/**/*.test.tsx', 'tests/**/*.test.ts'],
    exclude: ['tests/browser/**'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}', 'apps/*/src/**/*.{ts,tsx}'],
      reporter: ['text', 'json-summary', 'html'],
    },
  },
});
