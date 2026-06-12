import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

const ERROR_MESSAGES = {
  SERVICE_OVERLOADED: 'The service is currently busy. Please try again in a moment.',
  RATE_LIMITED: 'Rate limit exceeded. Please wait a moment before trying again.',
  AUTH_FAILED: 'Authentication failed. Please check your API key configuration.',
  PERMISSION_DENIED: 'You don\'t have permission to perform this action.',
  NOT_FOUND: 'The requested resource was not found.',
  INVALID_REQUEST: 'The request was invalid. Please check your input and try again.',
  API_ERROR: 'An internal error occurred on the server. Please try again later.',
  SERVICE_UNAVAILABLE: 'The service is temporarily unavailable. Please try again later.',
  NETWORK_ERROR: 'Network error. Please check your internet connection and try again.',
  TIMEOUT: 'Request timed out. Please try again.',
  CANCELLED: 'Request was cancelled.',
  UNKNOWN_ERROR: 'An unexpected error occurred. Please try again.',
}

const API_ERROR_TYPE_TO_CODE = {
  overloaded_error: 'SERVICE_OVERLOADED',
  rate_limit_error: 'RATE_LIMITED',
  authentication_error: 'AUTH_FAILED',
  permission_error: 'PERMISSION_DENIED',
  not_found_error: 'NOT_FOUND',
  invalid_request_error: 'INVALID_REQUEST',
  api_error: 'API_ERROR',
}

const STATUS_CODE_TO_CODE = {
  401: 'AUTH_FAILED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  429: 'RATE_LIMITED',
  500: 'API_ERROR',
  502: 'SERVICE_UNAVAILABLE',
  503: 'SERVICE_UNAVAILABLE',
  504: 'SERVICE_UNAVAILABLE',
  529: 'SERVICE_OVERLOADED',
}

function buildErrorResult(code, statusCode = null) {
  return {
    message: ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN_ERROR,
    code,
    statusCode,
  }
}

function extractStatusCode(errorMessage) {
  const match = errorMessage?.match(/^(\d{3})\s/)
  return match ? parseInt(match[1], 10) : null
}

function extractJsonPayload(errorMessage) {
  const match = errorMessage?.match(/^\d{3}\s(.+)$/)
  if (!match) return null
  try {
    return JSON.parse(match[1])
  } catch {
    return null
  }
}

function resolveErrorCodeFromApiError(apiError) {
  if (apiError.type && API_ERROR_TYPE_TO_CODE[apiError.type]) {
    return API_ERROR_TYPE_TO_CODE[apiError.type]
  }
  return 'API_ERROR'
}

function resolveErrorCodeFromStatusCode(statusCode) {
  return STATUS_CODE_TO_CODE[statusCode] || 'API_ERROR'
}

function parseAnthropicError(error) {
  const statusCode = extractStatusCode(error.message)
  const payload = extractJsonPayload(error.message)

  if (payload?.error) {
    const code = resolveErrorCodeFromApiError(payload.error)
    const message = code === 'API_ERROR' && payload.error.message
      ? payload.error.message
      : ERROR_MESSAGES[code]
    return { message, code, statusCode }
  }

  if (statusCode) {
    const code = resolveErrorCodeFromStatusCode(statusCode)
    return buildErrorResult(code, statusCode)
  }

  if (error.message && !error.message.match(/^\d{3}/)) {
    return { message: error.message, code: 'CUSTOM_ERROR', statusCode: null }
  }

  return buildErrorResult('UNKNOWN_ERROR')
}

function parseNetworkError(error) {
  const msg = error.message?.toLowerCase() || ''

  if (msg.includes('network') || msg.includes('fetch failed') || msg.includes('failed to fetch')) {
    return buildErrorResult('NETWORK_ERROR')
  }

  if (msg.includes('timeout') || msg.includes('timed out') || msg.includes('etimedout')) {
    return buildErrorResult('TIMEOUT')
  }

  if (msg.includes('abort') || msg.includes('cancelled')) {
    return buildErrorResult('CANCELLED')
  }

  return buildErrorResult('UNKNOWN_ERROR')
}

function parseError(error) {
  if (typeof error === 'string') {
    try {
      return parseError(JSON.parse(error))
    } catch {
      return { message: error, code: 'CUSTOM_ERROR', statusCode: null }
    }
  }

  if (error instanceof Error) {
    const networkResult = parseNetworkError(error)
    if (networkResult.code !== 'UNKNOWN_ERROR') {
      return networkResult
    }
    return parseAnthropicError(error)
  }

  if (typeof error === 'object' && error !== null) {
    if (error.message) {
      return parseError(error.message)
    }
    if (error.type) {
      return {
        message: error.message || 'An error occurred',
        code: error.type,
        statusCode: error.status || null,
      }
    }
  }

  return buildErrorResult('UNKNOWN_ERROR')
}

const DEFAULT_MAX_RETRIES = 10
const BASE_DELAY_MS = 1
const MAX_DELAY_MS = 10
const MAX_529_CONSECUTIVE = 3

function getRetryDelay(attempt, baseDelayMs, maxDelayMs) {
  const base = Math.min(baseDelayMs * Math.pow(2, attempt - 1), maxDelayMs)
  const jitter = Math.random() * 0.25 * base
  return base + jitter
}

const RETRY_POLICIES = {
  SERVICE_OVERLOADED:   { retry: true, maxConsecutive: MAX_529_CONSECUTIVE, respectRetryAfter: true },
  RATE_LIMITED:          { retry: true, maxRetries: Infinity, respectRetryAfter: true },
  API_ERROR:             { retry: true },
  SERVICE_UNAVAILABLE:   { retry: true },
  NETWORK_ERROR:         { retry: true },
  TIMEOUT:               { retry: true },
  AUTH_FAILED:           { retry: true, maxRetries: 2, clearCache: true },
  PERMISSION_DENIED:     { retry: false },
  NOT_FOUND:             { retry: false },
  INVALID_REQUEST:       { retry: false },
  CANCELLED:             { retry: false },
  CUSTOM_ERROR:          { retry: false },
}

async function wait(durationMs) {
  return new Promise(resolve => setTimeout(resolve, durationMs))
}

async function withRetry(fn, options = {}) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    baseDelayMs = BASE_DELAY_MS,
    maxDelayMs = MAX_DELAY_MS,
    signal = null,
    onRetry = null,
  } = options

  let attempt = 0
  let consecutive529 = 0

  while (true) {
    attempt++
    try {
      const result = await fn()
      return result
    } catch (error) {
      const parsed = parseError(error)
      const policy = RETRY_POLICIES[parsed.code] || { retry: false }

      if (!policy.retry) throw error
      if (attempt >= maxRetries) throw error
      if (signal?.aborted) throw error

      if (parsed.code === 'SERVICE_OVERLOADED') {
        consecutive529++
        if (consecutive529 >= MAX_529_CONSECUTIVE) {
          throw Object.assign(error, { code: 'OVERLOAD_PERSISTENT' })
        }
      } else {
        consecutive529 = 0
      }

      let delayMs = getRetryDelay(attempt, baseDelayMs, maxDelayMs)
      if (policy.respectRetryAfter && error.headers?.['retry-after']) {
        const retryAfterSec = parseInt(error.headers['retry-after'], 10)
        if (!isNaN(retryAfterSec)) {
          delayMs = Math.max(delayMs, retryAfterSec * 1000)
        }
      }

      if (onRetry) onRetry(attempt, parsed, delayMs)

      await wait(delayMs)
    }
  }
}

function isRetryableError(error) {
  const parsed = parseError(error)
  const policy = RETRY_POLICIES[parsed.code]
  return policy?.retry === true
}

describe('withRetry', () => {
  it('success on first try: returns result, fn called once', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      return 'success'
    }

    const result = await withRetry(fn)
    assert.equal(result, 'success')
    assert.equal(callCount, 1)
  })

  it('retries on retryable error: fails 2 times with SERVICE_UNAVAILABLE → succeeds on 3rd', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      if (callCount < 3) {
        const error = new Error('503 Service Unavailable')
        throw error
      }
      return 'success'
    }

    const result = await withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 })
    assert.equal(result, 'success')
    assert.equal(callCount, 3)
  })

  it('no retry on non-retryable error: fails with PERMISSION_DENIED → throws immediately', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      const error = new Error('403 Forbidden')
      throw error
    }

    await assert.rejects(
      () => withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 }),
      (err) => {
        assert.equal(callCount, 1)
        return true
      }
    )
  })

  it('max retries exceeded: fails 11 times with API_ERROR → throws after 10 retries', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      const error = new Error('500 Internal Server Error')
      throw error
    }

    await assert.rejects(
      () => withRetry(fn, { maxRetries: 10, baseDelayMs: 1, maxDelayMs: 5 }),
      (err) => {
        assert.equal(callCount, 10)
        return true
      }
    )
  })

  it('429 respects retry-after: delay respects header', async () => {
    let callCount = 0
    const delays = []
    const fn = async () => {
      callCount++
      if (callCount < 2) {
        const error = new Error('429 Too Many Requests')
        error.headers = { 'retry-after': '1' }
        throw error
      }
      return 'success'
    }

    const result = await withRetry(fn, {
      baseDelayMs: 1,
      maxDelayMs: 5,
      onRetry: (attempt, parsed, delayMs) => {
        delays.push(delayMs)
      },
    })

    assert.equal(result, 'success')
    assert.equal(callCount, 2)
    assert.ok(delays[0] >= 1000, 'Delay should respect retry-after header (1 second)')
  })

  it('529 consecutive overload: 3 consecutive 529s → throws OVERLOAD_PERSISTENT', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      const error = new Error('529 Overloaded')
      throw error
    }

    await assert.rejects(
      () => withRetry(fn, { baseDelayMs: 1, maxDelayMs: 5 }),
      (err) => {
        assert.equal(err.code, 'OVERLOAD_PERSISTENT')
        assert.equal(callCount, 3)
        return true
      }
    )
  })

  it('auth retry limited: 401 error → retries at most 2 times then gives up', async () => {
    let callCount = 0
    const fn = async () => {
      callCount++
      const error = new Error('401 Unauthorized')
      throw error
    }

    await assert.rejects(
      () => withRetry(fn, { maxRetries: 3, baseDelayMs: 1, maxDelayMs: 5 }),
      (err) => {
        assert.equal(callCount, 3)
        return true
      }
    )
  })

  it('isRetryableError: returns true for SERVICE_UNAVAILABLE, false for PERMISSION_DENIED', () => {
    const serviceUnavailableError = new Error('503 Service Unavailable')
    assert.equal(isRetryableError(serviceUnavailableError), true)

    const permissionDeniedError = new Error('403 Forbidden')
    assert.equal(isRetryableError(permissionDeniedError), false)
  })
})
