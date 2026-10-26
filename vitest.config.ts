import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/helpers/setup-env.ts'],
    globalSetup: ['tests/helpers/global-setup.ts'],
    // All test files share one real database, so run them one file at a time.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
