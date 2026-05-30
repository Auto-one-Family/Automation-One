import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

/** Avoid idle TCP/socket timeouts on long-lived WS through the dev proxy */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function disableProxySocketTimeout(proxy: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  proxy.on('proxyReqWs', (_proxyReq: any, _req: any, socket: any) => {
    socket.setTimeout(0)
  })
}

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
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        'pi-home',
        'pi-elbherb',
        'phyta',
        '.ts.net',
        'growy2',
        'growy2.local',
        'AutoOne44',
        'AutoOne44.local',
        '192.168.0.2',
        '192.168.178.67',
      ],
      proxy: {
        '/api': {
          target: env.VITE_API_TARGET || 'http://localhost:8000',
          changeOrigin: true,
          autoRewrite: true,
          ws: true,
          configure: (proxy) => {
            disableProxySocketTimeout(proxy)
          },
        },
        '/ws': {
          target: env.VITE_WS_TARGET || 'ws://localhost:8000',
          ws: true,
          configure: (proxy) => {
            disableProxySocketTimeout(proxy)
          },
        },
        '/grafana': {
          target: env.VITE_GRAFANA_TARGET || 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
  }
})
