import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['compartido/**/*.test.ts', 'servidor/**/*.test.ts', 'cliente/**/*.test.ts'],
    testTimeout: 30000,
  },
});
