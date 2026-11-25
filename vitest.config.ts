import path from 'path';
import solid from 'vite-plugin-solid';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    conditions: ['development', 'browser'],
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/ui/**/*.test.{ts,tsx}'],
    setupFiles: ['./tests/ui/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/App.tsx', 'src/ui/**/*.{ts,tsx}'],
      reporter: ['text', 'html'],
    },
  },
});
