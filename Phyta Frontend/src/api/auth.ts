import { apiClient, setTokens } from '@/api/client'

export interface LoginRequest {
  username: string
  password: string
  remember_me?: boolean
}

interface TokenBundle {
  access_token: string
  refresh_token: string
}

interface LoginResponse {
  success: boolean
  message?: string
  tokens?: TokenBundle
}

export async function login(credentials: LoginRequest): Promise<void> {
  const res = await apiClient.post<LoginResponse>('/auth/login', credentials)
  const tokens = res.data?.tokens
  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new Error(res.data?.message || 'Login fehlgeschlagen')
  }
  setTokens(tokens.access_token, tokens.refresh_token)
}
