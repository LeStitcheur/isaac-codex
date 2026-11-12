import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? 8080}`;

export default defineConfig({
  root,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@isaac-codex/shared': path.resolve(root, '../../packages/shared/src/index.ts'),
      '@': path.resolve(root, 'src'),
    },
  },
  build: {
    outDir: path.resolve(root, '../../dist/web'),
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router'],
          vendor: ['@tanstack/react-query', 'zustand', 'zod'],
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': apiTarget, '/sprites': apiTarget },
  },
});
