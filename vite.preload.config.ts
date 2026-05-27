import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = ['electron', ...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)];

export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'dist-electron/preload',
    emptyOutDir: true,
    lib: {
      entry: 'src/preload/preload.ts',
      formats: ['cjs'],
      fileName: () => 'preload.cjs'
    },
    rollupOptions: {
      external
    }
  }
});
