import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = process.env.ELAINAQQ_BACKEND_DIR
const outputDir = backendRoot
  ? path.resolve(backendRoot, 'web', 'dist')
  : path.resolve(frontendRoot, 'dist')

export default defineConfig({
  plugins: [vue()],
  base: '/web/',
  server: {
    proxy: {
      '/api': 'http://localhost:5201',
      '/ws': { target: 'ws://localhost:5201', ws: true },
    },
  },
  build: {
    target: 'es2015',
    // 默认生成独立前端仓库的 dist；设置 ELAINAQQ_BACKEND_DIR 后可直接发布到后端。
    outDir: outputDir,
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        codeSplitting: {
          groups: [
            {
              name: 'vue-core',
              test: /node_modules[\/](?:vue|vue-router|pinia|@vue)[\/]/,
            },
          ],
        },
      },
    },
  },
})
