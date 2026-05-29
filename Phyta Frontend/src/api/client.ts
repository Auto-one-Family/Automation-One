import axios, { type AxiosInstance } from 'axios'

const TOKEN_KEY = 'el_frontend_access_token'

function getAccessToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export const apiClient: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
})

apiClient.interceptors.request.use((config) => {
  const token = getAccessToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export function hasAuthToken(): boolean {
  return !!getAccessToken()
}
