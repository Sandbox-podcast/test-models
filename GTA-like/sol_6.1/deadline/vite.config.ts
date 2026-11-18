import { defineConfig } from 'vite';
export default defineConfig({build:{target:'es2022',rollupOptions:{output:{manualChunks(id){if(id.includes('@dimforge'))return 'physics';if(id.includes('node_modules/three/'))return 'three';}}},chunkSizeWarningLimit:2200}});
