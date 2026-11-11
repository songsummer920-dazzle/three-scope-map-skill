import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: { exclude: ['maplibre-gl'] },
  server: {
    proxy: {
      '/openfreemap': {
        target: 'https://tiles.openfreemap.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/openfreemap/, ''),
      },
    },
  },
  build: {
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/node_modules/three/')) return 'vendor-three';
      if (id.includes('/node_modules/vue/')) return 'vendor-vue';
    } } },
  },
});
