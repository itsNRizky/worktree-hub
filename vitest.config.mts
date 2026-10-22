import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // Git tests create real repositories in temp folders, which can be slow on a busy machine.
    testTimeout: 20_000,
  },
});
