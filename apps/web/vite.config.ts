import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.VITE_PROXY_TARGET ?? 'http://localhost:4000';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
    // Same-origin calls in dev; the API owns these paths.
    proxy: {
      '/products': api,
      '/orders': api,
      '/payments': api,
      '/health': api,
    },
  },
  build: {
    outDir: fileURLToPath(new URL('../../dist/web', import.meta.url)),
    emptyOutDir: true,
  },
});
