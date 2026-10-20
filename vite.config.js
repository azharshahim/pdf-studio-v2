import { defineConfig } from 'vite';

export default defineConfig({
  // Chemins relatifs : indispensable pour GitHub Pages (sous /pdf-studio-v2/).
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    cors: true,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
    cors: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
