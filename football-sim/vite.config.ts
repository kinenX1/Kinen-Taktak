import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
});
