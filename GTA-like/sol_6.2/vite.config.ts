import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { watch: { ignored: ['**/.vite/**', '**/outputs/**'] } },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4500,
    rollupOptions: {
      output: { manualChunks: { three: ['three'], physics: ['@dimforge/rapier3d-compat'] } },
    },
  },
});
