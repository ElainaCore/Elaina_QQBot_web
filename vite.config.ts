import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: '/web/',
  plugins: [tailwindcss(), react()],
  resolve: { alias: { '@': path.resolve(process.cwd(), 'src') } },
  server: {
    port: 5178,
    strictPort: false,
    proxy: { '/api': { target: process.env.ELAINAQQ_WEBUI_BACKEND ?? 'http://127.0.0.1:5201', changeOrigin: true } },
  },
  build: {
    outDir: path.resolve(process.cwd(), '../Elaina_QQBot/web/dist'),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        entryFileNames: 'assets/app.js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
