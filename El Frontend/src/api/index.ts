import axios, { type AxiosInstance, type AxiosError, type InternalAxiosRequestConfig } from 'axios'
import { useAuthStore } from '@/shared/stores/auth.store'
import { createLogger } from '@/utils/logger'

const logger = createLogger('API')

// Create axios instance
const api: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Request interceptor - add auth token
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const authStore = useAuthStore()
    const token = authStore.accessToken

    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }

    // Correlation: Generate unique request ID for cross-layer tracing
    const requestId = crypto.randomUUID()
    config.headers['X-Request-ID'] = requestId

    logger.debug(`${config.method?.toUpperCase()} ${config.url}`, { requestId })
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// Token refresh queue — ensures exactly 1 refresh call for N parallel 401 responses
let isRefreshing = false
let failedQueue: Array<{
  resolve: (token: string) => void
  reject: (error: unknown) => void
}> = []

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error)
    } else {
      prom.resolve(token!)
    }
  })
  failedQueue = []
}

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => {
    const serverRequestId = response.headers['x-request-id']
    logger.debug(`${response.config.method?.toUpperCase()} ${response.config.url} → ${response.status}`, {
      requestId: serverRequestId,
    })
    return response
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean }
    const authStore = useAuthStore()

    // CRITICAL: Skip interceptor for refresh endpoint to prevent infinite loop!
    // Also skip for login/setup/status - these don't need token refresh
    const isAuthEndpoint = originalRequest?.url?.includes('/auth/refresh') ||
                           originalRequest?.url?.includes('/auth/login') ||
                           originalRequest?.url?.includes('/auth/setup') ||
                           originalRequest?.url?.includes('/auth/status')

    // If 401 and not already retrying and not an auth endpoint, try to refresh token
    if (
      error.response?.status === 401 &&
      !originalRequest._retry &&
      !isAuthEndpoint &&
      authStore.refreshToken
    ) {
      originalRequest._retry = true

      // If a refresh is already in progress, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`
          }
          return api(originalRequest)
        })
      }

      isRefreshing = true

      try {
        await authStore.refreshTokens()
        const newToken = authStore.accessToken!

        processQueue(null, newToken)

        // Retry original request with new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return api(originalRequest)
      } catch (refreshError) {
        processQueue(refreshError, null)
        // Refresh failed, logout user
        authStore.clearAuth()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      } finally {
        isRefreshing = false
      }
    }

    const errorRequestId = error.response?.headers?.['x-request-id'] || error.config?.headers?.['X-Request-ID']
    const status = error.response?.status
    const method = error.config?.method?.toUpperCase()
    // DELETE + 404 is idempotent — the resource is already gone, which is the desired outcome.
    // Log as debug instead of error to avoid noise from orphan cleanup etc.
    const logLevel = (method === 'DELETE' && status === 404) ? 'debug' : 'error'
    logger[logLevel](`${method} ${error.config?.url} → ${status || 'NETWORK_ERROR'}`, {
      message: error.message,
      requestId: errorRequestId,
    })
    return Promise.reject(error)
  }
)

export default api

// Export typed request helpers
export const get = <T>(url: string, config?: object) =>
  api.get<T>(url, config).then(res => res.data)

export const post = <T>(url: string, data?: object, config?: object) =>
  api.post<T>(url, data, config).then(res => res.data)

export const put = <T>(url: string, data?: object, config?: object) =>
  api.put<T>(url, data, config).then(res => res.data)

export const del = <T>(url: string, config?: object) =>
  api.delete<T>(url, config).then(res => res.data)

export const patch = <T>(url: string, data?: object, config?: object) =>
  api.patch<T>(url, data, config).then(res => res.data)
