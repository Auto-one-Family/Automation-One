import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { authApi } from '@/api/auth'
import type { User, LoginRequest, SetupRequest } from '@/types'

const TOKEN_KEY = 'el_frontend_access_token'
const REFRESH_TOKEN_KEY = 'el_frontend_refresh_token'

export const useAuthStore = defineStore('auth', () => {
  // State
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(localStorage.getItem(TOKEN_KEY))
  const refreshToken = ref<string | null>(localStorage.getItem(REFRESH_TOKEN_KEY))
  const isLoading = ref(false)
  const setupRequired = ref<boolean | null>(null)
  const error = ref<string | null>(null)

  // Getters
  const isAuthenticated = computed(() => !!accessToken.value && !!user.value)
  const isAdmin = computed(() => user.value?.role === 'admin')
  const isOperator = computed(() => ['admin', 'operator'].includes(user.value?.role || ''))

  // Actions
  async function checkAuthStatus(): Promise<void> {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/stores/auth.ts:24',message:'Starting auth status check',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H1'})}).catch(()=>{});
    // #endregion

    isLoading.value = true
    error.value = null

    try {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/stores/auth.ts:30',message:'Calling authApi.getStatus()',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      // First check if setup is required
      const status = await authApi.getStatus()

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/stores/auth.ts:31',message:'authApi.getStatus() returned',data:{setup_required:status.setup_required},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      setupRequired.value = status.setup_required

      // If setup is required, clear any stale tokens from previous sessions
      if (status.setup_required) {
        clearAuth()
        return
      }

      // If we have a token, try to get user info
      if (accessToken.value) {
        try {
          user.value = await authApi.me()
        } catch {
          // Token might be expired, try refresh ONCE
          if (refreshToken.value) {
            try {
              await refreshTokens()
            } catch {
              // Refresh also failed - clear auth silently, don't throw
              clearAuth()
            }
          } else {
            clearAuth()
          }
        }
      }
    } catch (err) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/stores/auth.ts:57',message:'checkAuthStatus failed',data:{error:String(err)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      console.error('Failed to check auth status:', err)
      error.value = 'Failed to check authentication status'
    } finally {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/stores/auth.ts:62',message:'checkAuthStatus completed',data:{setupRequired:setupRequired.value},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H1'})}).catch(()=>{});
      // #endregion

      isLoading.value = false
    }
  }

  async function login(credentials: LoginRequest): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await authApi.login(credentials)
      // Server returns { tokens: { access_token, ... }, user }
      setTokens(response.tokens.access_token, response.tokens.refresh_token)
      // User is included in login response
      user.value = response.user
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Login failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function setup(data: SetupRequest): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      const response = await authApi.setup(data)
      // Server returns { tokens: { access_token, ... }, user }
      setTokens(response.tokens.access_token, response.tokens.refresh_token)
      // User is included in setup response
      user.value = response.user
      setupRequired.value = false
    } catch (err: unknown) {
      const axiosError = err as { response?: { data?: { detail?: string } } }
      error.value = axiosError.response?.data?.detail || 'Setup failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function refreshTokens(): Promise<void> {
    if (!refreshToken.value) {
      throw new Error('No refresh token available')
    }

    try {
      const response = await authApi.refresh(refreshToken.value)
      // Server returns { tokens: { access_token, ... } }
      setTokens(response.tokens.access_token, response.tokens.refresh_token)
      // Refresh response doesn't include user, fetch separately
      user.value = await authApi.me()
    } catch (err) {
      clearAuth()
      throw err
    }
  }

  async function logout(logoutAll: boolean = false): Promise<void> {
    isLoading.value = true

    try {
      await authApi.logout(logoutAll)
    } catch (err) {
      console.error('Logout API call failed:', err)
    } finally {
      clearAuth()
      isLoading.value = false
    }
  }

  function setTokens(access: string, refresh: string): void {
    accessToken.value = access
    refreshToken.value = refresh
    localStorage.setItem(TOKEN_KEY, access)
    localStorage.setItem(REFRESH_TOKEN_KEY, refresh)
  }

  function clearAuth(): void {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  }

  return {
    // State
    user,
    accessToken,
    refreshToken,
    isLoading,
    setupRequired,
    error,

    // Getters
    isAuthenticated,
    isAdmin,
    isOperator,

    // Actions
    checkAuthStatus,
    login,
    setup,
    refreshTokens,
    logout,
    clearAuth,
  }
})
