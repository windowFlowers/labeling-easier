import { builtinModules } from 'node:module';
import { defineConfig } from 'vite';

const external = ['electron', ...builtinModules, ...builtinModules.map((moduleName) => `node:${moduleName}`)];

export default defineConfig({
  build: {
    target: 'node22',
    outDir: 'dist-electron/main',
    emptyOutDir: true,
    lib: {
      entry: 'src/main/main.ts',
      formats: ['es'],
      fileName: () => 'main.js'
    },
    rollupOptions: {
      external
    }
  }
});
