import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    sourcemap: false,
  },
  server: {
    port: 5156,
    host: true,
  },
  preview: {
    port: 4156,
    host: true,
  },

});
