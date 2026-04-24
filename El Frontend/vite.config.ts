import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          autoRewrite: true,
          ws: true,
        },
        '/ws': {
          target: env.VITE_WS_TARGET || 'ws://localhost:8000',
          ws: true,
        },
        '/grafana': {
          target: env.VITE_GRAFANA_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
