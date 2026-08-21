import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendRoot = path.dirname(fileURLToPath(import.meta.url))
const backendRoot = process.env.ELAINA_QQBOT_BACKEND_DIR
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
    // 默认生成独立前端仓库的 dist；设置 ELAINA_QQBOT_BACKEND_DIR 后可直接发布到后端。
    outDir: outputDir,
    emptyOutDir: true,
    rollupOptions: {
      output: {
        chunkFileNames: 'assets/[name].js',
        entryFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/[\\/]node_modules[\\/](@vue|vue|vue-router|pinia)[\\/]/.test(id)) return 'vue'
          if (/[\\/]node_modules[\\/](chart\.js|vue-chartjs|chartjs-plugin-datalabels|@kurkle)[\\/]/.test(id)) return 'charts'
          if (/[\\/]node_modules[\\/](naive-ui|vueuc|@css-render|css-render|seemly|treemate|vooks|evtd|@juggle|date-fns|lodash|lodash-es)[\\/]/.test(id)) return 'naive'
          return 'vendor'
        },
      },
    },
  },
})
