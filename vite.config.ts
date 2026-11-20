import tailwindcss from '@tailwindcss/vite';
import solid from 'vite-plugin-solid';
import fs from 'fs';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

function loadFirebaseConfig(env: Record<string, string>): Record<string, string> | null {
  const localConfigPath = path.resolve(__dirname, 'firebase-applet-config.json');
  if (fs.existsSync(localConfigPath)) {
    try {
      return JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
    } catch {
      // fall through to env vars
    }
  }
  const rawJson = env.FIREBASE_CONFIG_JSON?.trim();
  if (rawJson) {
    try {
      return JSON.parse(rawJson);
    } catch {
      // fall through to individual VITE_FIREBASE_* vars
    }
  }
  if (env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      appId: env.VITE_FIREBASE_APP_ID ?? '',
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? '',
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? '',
    };
  }
  return null;
}

export default defineConfig(({mode}) => {
  const env = {
    ...loadEnv(mode, __dirname, ''),
    ...(process.env as Record<string, string>),
  };

  return {
    base: './',
    define: {
      __FIREBASE_CONFIG__: JSON.stringify(loadFirebaseConfig(env)),
    },
    plugins: [
      solid(),
      tailwindcss(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
