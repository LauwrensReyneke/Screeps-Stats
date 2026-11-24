import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // In development, /api/* is proxied to the local API server (server.js,
  // port 8080 by default). API_PORT overrides it, e.g. to run a second copy.
  server: {
    port: 8000,
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.API_PORT || 8080}`,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          apexcharts: ['apexcharts', 'vue3-apexcharts'],
        },
      },
    },
  },
});

