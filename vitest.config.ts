import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    exclude: ['tests/**'],
    typecheck: {
      include: ['tests/type-tests/**/*.test-d.ts'],
    },
  },
});
