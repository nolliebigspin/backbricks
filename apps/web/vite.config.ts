import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// The dev server proxies API calls to the server, so the dashboard stays same-origin with the
// API like in production (session cookies, no CORS on management routes; ARCHITECTURE §D.5).
const apiUrl = process.env['BACKBRICKS_API_URL'] ?? 'http://localhost:3000';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    host: true,
    port: 5173,
    strictPort: true,
    // Bind mounts on macOS don't always deliver file events into the container (PLAN R8).
    watch: process.env['VITE_USE_POLLING'] === 'true' ? { usePolling: true, interval: 300 } : {},
    proxy: {
      '/v1': apiUrl,
      '/api': apiUrl,
      '/healthz': apiUrl,
      '/readyz': apiUrl,
    },
  },
  build: { outDir: 'dist', emptyOutDir: true },
});
