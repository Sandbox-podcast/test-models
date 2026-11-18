import { defineConfig } from 'vite';

// Base relative pour un hébergement statique quelconque (dist/ servi tel quel).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5174,
    host: true,
  },
  preview: {
    port: 4173,
    host: true,
  },
});
