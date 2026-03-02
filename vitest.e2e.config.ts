import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/e2e/**/*.test.ts'],
    testTimeout: 60_000,
    pool: 'forks',
    globalSetup: ['tests/e2e/setup.ts'],
  },
});
