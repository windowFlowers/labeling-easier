import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@renderer': '/src/renderer',
      '@shared': '/src/shared'
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
});
