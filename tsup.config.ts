import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  // Emit both ESM (.js) and CJS (.cjs) alongside .d.ts / .d.cts declaration files.
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: false,
  minify: false,
  treeshake: true,
  target: 'es2020',
  outDir: 'dist',
});
