import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    globals: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/index.ts',
        'src/types.ts',
        'src/renderers/renderer.ts', // type-only interface, no runtime code
      ],
      reporter: ['text', 'html', 'json-summary'],
      thresholds: { statements: 95, lines: 95, functions: 95, branches: 88 },
    },
  },
});
