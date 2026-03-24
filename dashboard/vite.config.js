import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  // When running `vite dev` directly (without `vercel dev`),
  // proxy /api/* to the local Vercel dev server on port 3000.
  // Run `vercel dev` in the project root and `npm run dev` in dashboard/ simultaneously.
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
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

