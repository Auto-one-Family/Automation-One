import axios from 'axios'

class CircuitBreaker {
  constructor() {
    this.state = 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0
    this.failureThreshold = 3
    this.timeout = 30000 // 30 seconds
    this.lastFailureTime = null
  }

  canMakeRequest() {
    if (this.state === 'CLOSED') return true
    if (this.state === 'OPEN') {
      return Date.now() - this.lastFailureTime > this.timeout
    }
    return true // HALF_OPEN
  }

  recordSuccess() {
    this.failureCount = 0
    this.state = 'CLOSED'
  }

  recordFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN'
    }
  }
}

class ESPHttpClient {
  constructor() {
    this.circuitBreakers = new Map() // Per ESP circuit breaker
  }

  async makeRequest(espId, endpoint, options = {}) {
    const breaker = this.getCircuitBreaker(espId)

    if (!breaker.canMakeRequest()) {
      throw new Error(`Circuit breaker OPEN for ESP ${espId} - server may be unavailable`)
    }

    try {
      const response = await axios({
        ...options,
        url: endpoint,
        timeout: 5000,
      })

      breaker.recordSuccess()
      return response
    } catch (error) {
      breaker.recordFailure()
      throw this.createUserFriendlyError(espId, error)
    }
  }

  getCircuitBreaker(espId) {
    if (!this.circuitBreakers.has(espId)) {
      this.circuitBreakers.set(espId, new CircuitBreaker())
    }
    return this.circuitBreakers.get(espId)
  }

  createUserFriendlyError(espId, error) {
    if (error.code === 'ECONNREFUSED') {
      return new Error(`ESP ${espId} Pi server unavailable. Check if Pi server is running.`)
    } else if (error.code === 'ETIMEDOUT') {
      return new Error(`ESP ${espId} Pi server timeout. Server may be overloaded.`)
    } else if (error.code === 'ENOTFOUND') {
      return new Error(`ESP ${espId} Pi server not found. Check server address configuration.`)
    } else if (error.response?.status === 404) {
      return new Error(`ESP ${espId} Pi server endpoint not found. Check API configuration.`)
    } else if (error.response?.status >= 500) {
      return new Error(
        `ESP ${espId} Pi server error (${error.response.status}). Server may be experiencing issues.`,
      )
    }
    return new Error(`ESP ${espId} communication error: ${error.message}`)
  }

  // Convenience methods for common HTTP operations
  async get(espId, endpoint, options = {}) {
    return this.makeRequest(espId, endpoint, { ...options, method: 'GET' })
  }

  async post(espId, endpoint, data, options = {}) {
    return this.makeRequest(espId, endpoint, { ...options, method: 'POST', data })
  }

  async put(espId, endpoint, data, options = {}) {
    return this.makeRequest(espId, endpoint, { ...options, method: 'PUT', data })
  }

  async delete(espId, endpoint, options = {}) {
    return this.makeRequest(espId, endpoint, { ...options, method: 'DELETE' })
  }

  // Reset circuit breaker for testing or manual recovery
  resetCircuitBreaker(espId) {
    if (this.circuitBreakers.has(espId)) {
      this.circuitBreakers.delete(espId)
    }
  }

  // Get circuit breaker status for monitoring
  getCircuitBreakerStatus(espId) {
    const breaker = this.circuitBreakers.get(espId)
    if (!breaker) return { state: 'CLOSED', failureCount: 0 }

    return {
      state: breaker.state,
      failureCount: breaker.failureCount,
      lastFailureTime: breaker.lastFailureTime,
    }
  }
}

export const espHttpClient = new ESPHttpClient()
