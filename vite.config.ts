import { defineConfig } from 'vite';
import { resolve } from 'path';

/**
 * Vite is used here only to serve the local dev app (`dev-app/`) during
 * development and e2e tests. The published library is built with tsup
 * (see `tsup.config.ts`) — Vite has no role in distribution.
 */
export default defineConfig({
  root: resolve(__dirname, 'dev-app'),
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/show-imgs': {
        target: 'https://nokona-configurator-assets.nyc3.digitaloceanspaces.com',
        changeOrigin: true,
        secure: false,
        ws: false,
      },
    },
  },
  build: {
    outDir: resolve(__dirname, 'dev-app/dist'),
    emptyOutDir: true,
  },
});
