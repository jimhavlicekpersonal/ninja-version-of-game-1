import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
    // The pipeline logs its progress to the console; the tests read the run folder instead.
    silent: true,
  },
});
