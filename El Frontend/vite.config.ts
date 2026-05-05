import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'

/** Avoid idle TCP/socket timeouts on long-lived WS through the dev proxy */
function disableProxySocketTimeout(proxy: import('http-proxy').Server) {
  proxy.on('proxyReqWs', (_proxyReq, _req: IncomingMessage, socket: Socket) => {
    socket.setTimeout(0)
  })
}

// https://vitejs.dev/config/
<<<<<<< Updated upstream
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [vue()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
=======
export default defineConfig({
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
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        autoRewrite: true,
        ws: true,
        configure: (proxy) => {
          disableProxySocketTimeout(proxy)
        },
      },
      '/ws': {
        target: process.env.VITE_WS_TARGET || 'ws://localhost:8000',
        ws: true,
        configure: (proxy) => {
          disableProxySocketTimeout(proxy)
        },
      },
      '/grafana': {
        target: process.env.VITE_GRAFANA_TARGET || 'http://localhost:3000',
        changeOrigin: true,
>>>>>>> Stashed changes
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
