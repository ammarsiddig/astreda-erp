import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {Plugin, defineConfig, loadEnv} from 'vite';

/**
 * Patches dist/sw.js after every production build, replacing the static
 * CACHE_NAME with one that includes the build timestamp so that the service
 * worker bytes always change on each deploy. This guarantees the browser
 * detects a new SW, purges old caches, and reloads the app.
 */
function injectSwVersion(buildTime: string): Plugin {
  return {
    name: 'inject-sw-version',
    apply: 'build',
    closeBundle() {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const original = fs.readFileSync(swPath, 'utf-8');
      const patched = original.replace(
        /const CACHE_NAME = '[^']*'/,
        `const CACHE_NAME = 'astrida-${buildTime}'`,
      );
      fs.writeFileSync(swPath, patched);
    },
  };
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  // Evaluated once per `vite build` — shared by both define injection and the
  // SW patch so the app bundle and service worker always carry the same stamp.
  const buildTime = String(Date.now());
  return {
    plugins: [react(), tailwindcss(), injectSwVersion(buildTime)],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
      __BUILD_TIME__: JSON.stringify(buildTime),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-charts': ['recharts'],
            'vendor-utils': ['date-fns', 'uuid', 'framer-motion'],
          },
        },
      },
    },
  };
});
