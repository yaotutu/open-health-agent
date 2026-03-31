import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  // 开发模式代理 API 请求到后端
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  // 构建输出到项目根目录的 dist/web/
  build: {
    outDir: '../dist/web',
    emptyOutDir: true,
  },
})
