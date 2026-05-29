import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5174,
      host: '0.0.0.0',
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'pi-home',
        'AutoOne44',
        'AutoOne44.local',
        '192.168.0.2',
        '.ts.net',
      ],
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          ws: true,
        },
        '/ws': {
          target: env.VITE_WS_TARGET || 'ws://localhost:8000',
          ws: true,
        },
      },
    },
  }
})
