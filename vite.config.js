import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // three.js und three-vrm in eigene, langlebig cachebare Chunks; die App-Chunks bleiben klein.
        manualChunks(id) {
          if (id.includes('node_modules/@pixiv/three-vrm')) return 'three-vrm';
          if (id.includes('node_modules/three/')) return 'three';
          return undefined;
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://127.0.0.1:8787',
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
});
