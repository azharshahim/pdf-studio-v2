import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Génère dist/precache.json (liste de tous les fichiers produits) afin que le
 * service worker puisse mettre l'application complète en cache hors ligne.
 */
function precacheManifest() {
  return {
    name: 'pdf-studio-precache',
    apply: 'build',
    closeBundle() {
      const outDir = path.resolve(process.cwd(), 'dist');
      const files = [];
      const walk = (dir, rel = '') => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.name === 'precache.json' || entry.name === 'sw.js') continue;
          const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
          // Polices supplémentaires : mises en cache à la première utilisation seulement.
          if (nextRel === 'fonts/more') continue;
          // Versions TrueType (export PDF) : téléchargées à la demande.
          if (nextRel.startsWith('fonts/catalog/') && nextRel.endsWith('.ttf')) continue;
          if (entry.isDirectory()) walk(path.join(dir, entry.name), nextRel);
          else files.push(`./${nextRel}`);
        }
      };
      if (fs.existsSync(outDir)) {
        walk(outDir);
        fs.writeFileSync(path.join(outDir, 'precache.json'), JSON.stringify(files));
      }
    },
  };
}

export default defineConfig({
  plugins: [precacheManifest()],
  // Chemins relatifs : indispensable pour GitHub Pages (sous /studio-pdf/).
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
  test: {
    // Les tests de bout en bout (Playwright) ne doivent pas être lancés par
    // Vitest : ils ont besoin d'un navigateur et d'un serveur.
    include: ['tests/*.test.js'],
    exclude: ['tests/e2e/**'],
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    outDir: 'dist',
    emptyOutDir: true,
  },
});
