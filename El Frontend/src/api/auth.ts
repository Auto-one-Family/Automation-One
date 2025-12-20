import api from './index'
import type {
  AuthStatusResponse,
  LoginRequest,
  LoginResponse,
  SetupRequest,
  SetupResponse,
  RefreshResponse,
  User,
} from '@/types'

export const authApi = {
  /**
   * Check if initial setup is required
   */
  async getStatus(): Promise<AuthStatusResponse> {
    // #region agent log
    fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/api/auth.ts:16',message:'getStatus called',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H2'})}).catch(()=>{});
    // #endregion

    try {
      const response = await api.get<AuthStatusResponse>('/auth/status')

      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/api/auth.ts:18',message:'getStatus success',data:{setup_required:response.data.setup_required},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      return response.data
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7242/ingest/9afc79e6-8353-43ae-a99b-a341b0632397',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'El Frontend/src/api/auth.ts:18',message:'getStatus failed',data:{error:String(error)},timestamp:Date.now(),sessionId:'debug-session',runId:'initial',hypothesisId:'H2'})}).catch(()=>{});
      // #endregion

      throw error
    }
  },

  /**
   * Login with username/email and password
   * Server returns: { success, message, tokens: { access_token, ... }, user }
   */
  async login(credentials: LoginRequest): Promise<LoginResponse> {
    const response = await api.post<LoginResponse>('/auth/login', credentials)
    return response.data
  },

  /**
   * Initial admin setup (first run only)
   * Server returns: { success, message, tokens: { access_token, ... }, user }
   */
  async setup(data: SetupRequest): Promise<SetupResponse> {
    const response = await api.post<SetupResponse>('/auth/setup', data)
    return response.data
  },

  /**
   * Refresh access token using refresh token
   * Server returns: { success, message, tokens: { access_token, ... } }
   */
  async refresh(refreshToken: string): Promise<RefreshResponse> {
    const response = await api.post<RefreshResponse>('/auth/refresh', {
      refresh_token: refreshToken,
    })
    return response.data
  },

  /**
   * Get current user info
   * Server returns User directly (NOT wrapped in { data: User })
   */
  async me(): Promise<User> {
    const response = await api.get<User>('/auth/me')
    return response.data
  },

  /**
   * Logout (invalidate tokens)
   */
  async logout(logoutAll: boolean = false): Promise<void> {
    await api.post('/auth/logout', { all_devices: logoutAll })
  },
}
