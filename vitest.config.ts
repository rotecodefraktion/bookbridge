import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    alias: {
      // Mock the obsidian module which is only available at runtime in Obsidian
      obsidian: new URL('./src/__mocks__/obsidian.ts', import.meta.url).pathname,
    },
  },
});
