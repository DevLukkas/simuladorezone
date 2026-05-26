import { defineConfig } from 'vite'

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
      '/sanctum': {
        target: 'http://127.0.0.1:8005',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  },
})
