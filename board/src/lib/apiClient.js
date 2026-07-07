import { runtimeConfig } from '@/config/runtime'

const CIRCUIT_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
}

class CircuitBreaker {
  constructor(options = {}) {
    this.state = CIRCUIT_STATES.CLOSED
    this.failureCount = 0
    this.failureThreshold = options.failureThreshold || 5
    this.resetTimeout = options.resetTimeout || 60000
    this.lastFailureTime = null
    this.successCount = 0
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold || 2
  }

  canExecute() {
    if (this.state === CIRCUIT_STATES.CLOSED) {
      return true
    }

    if (this.state === CIRCUIT_STATES.OPEN) {
      const now = Date.now()
      if (now - this.lastFailureTime >= this.resetTimeout) {
        this.state = CIRCUIT_STATES.HALF_OPEN
        this.successCount = 0
        return true
      }
      return false
    }

    return true
  }

  recordSuccess() {
    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.successCount++
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.state = CIRCUIT_STATES.CLOSED
        this.failureCount = 0
      }
    } else {
      this.failureCount = 0
    }
  }

  recordFailure() {
    this.failureCount++
    this.lastFailureTime = Date.now()

    if (this.state === CIRCUIT_STATES.HALF_OPEN) {
      this.state = CIRCUIT_STATES.OPEN
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = CIRCUIT_STATES.OPEN
    }
  }

  getState() {
    return this.state
  }

  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
    }
  }

  reset() {
    this.state = CIRCUIT_STATES.CLOSED
    this.failureCount = 0
    this.successCount = 0
    this.lastFailureTime = null
  }
}

const defaultCircuitBreaker = new CircuitBreaker()

export function getCircuitBreaker() {
  return defaultCircuitBreaker
}

function resolveUrl(path, baseUrl) {
  const base = baseUrl || runtimeConfig.apiBaseUrl
  if (/^https?:\/\//.test(path)) return path
  if (path.startsWith('/')) return `${base}${path}`
  return `${base}/${path}`
}

async function parseResponse(response) {
  if (response.status === 204) return null

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return response.json()
  }

  return response.text()
}

const IDEMPOTENT_METHODS = new Set(['GET', 'HEAD', 'PUT', 'DELETE'])
const RETRYABLE_STATUSES = new Set([408, 429, 500, 502, 503, 504, 529])

// Network failures (no HTTP status) and transient server statuses are
// retryable; deterministic client errors (400/401/403/404/422) are not.
function isRetryableError(error) {
  if (error.status == null) return true
  return RETRYABLE_STATUSES.has(error.status)
}

async function request(path, options = {}) {
  const { baseUrl, maxRetries: maxRetriesOption, baseDelay: baseDelayOption, ...fetchOptions } = options
  const circuitBreaker = getCircuitBreaker()

  if (!circuitBreaker.canExecute()) {
    const error = new Error('Circuit breaker is OPEN - requests are temporarily blocked')
    error.status = 503
    error.circuitState = circuitBreaker.getState()
    throw error
  }

  const isFormData = typeof FormData !== 'undefined' && fetchOptions.body instanceof FormData
  const method = (fetchOptions.method || 'GET').toUpperCase()
  // Non-idempotent writes (POST/PATCH) are never retried by default —
  // a timed-out request may still have been applied by the server.
  const maxRetries = maxRetriesOption ?? (IDEMPOTENT_METHODS.has(method) ? 3 : 0)
  const baseDelay = baseDelayOption ?? 1000
  const signal = fetchOptions.signal
  let lastError

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Don't retry aborted requests
    if (signal?.aborted) {
      const error = new Error('Request aborted')
      error.name = 'AbortError'
      throw error
    }

    try {
      const response = await fetch(resolveUrl(path, baseUrl), {
        ...fetchOptions,
        headers: {
          Accept: 'application/json',
          ...(!isFormData && fetchOptions.body ? { 'Content-Type': 'application/json' } : {}),
          ...fetchOptions.headers,
        },
        body: fetchOptions.body
          ? (isFormData ? fetchOptions.body : JSON.stringify(fetchOptions.body))
          : undefined,
      })

      const data = await parseResponse(response)

      if (!response.ok) {
        const error = new Error(data?.message || response.statusText || 'Request failed')
        error.status = response.status
        error.data = data
        throw error
      }

      circuitBreaker.recordSuccess()
      return data
    } catch (error) {
      lastError = error

      // Don't retry aborted requests
      if (error.name === 'AbortError' || signal?.aborted) {
        throw error
      }

      if (!isRetryableError(error)) break

      if (attempt < maxRetries) {
        const delay = baseDelay * Math.pow(2, attempt)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }
  }

  // Deterministic 4xx responses prove the service is reachable —
  // only transient failures count toward opening the circuit.
  if (isRetryableError(lastError)) {
    circuitBreaker.recordFailure()
  }
  throw lastError
}

export const apiClient = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) => request(path, { method: 'POST', body, ...options }),
  patch: (path, body, options) => request(path, { method: 'PATCH', body, ...options }),
  put: (path, body, options) => request(path, { method: 'PUT', body, ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
}
