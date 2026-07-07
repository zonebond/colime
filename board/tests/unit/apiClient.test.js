import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiClient, getCircuitBreaker } from '@/lib/apiClient'

function jsonResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: `Status ${status}`,
    headers: { get: () => 'application/json' },
    json: async () => body,
  }
}

describe('apiClient retry policy', () => {
  beforeEach(() => {
    getCircuitBreaker().reset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('retries GET on 500 and succeeds', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(500))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.get('/x', { baseDelay: 1 })
    expect(result).toEqual({ ok: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('does not retry GET on deterministic 404', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.get('/x', { baseDelay: 1 })).rejects.toMatchObject({ status: 404 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry POST by default even on 500', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.post('/x', { a: 1 }, { baseDelay: 1 })).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries POST when maxRetries is set explicitly', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse(503))
      .mockResolvedValueOnce(jsonResponse(200, { done: true }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await apiClient.post('/x', { a: 1 }, { maxRetries: 2, baseDelay: 1 })
    expect(result).toEqual({ done: true })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('honors maxRetries: 0 to disable GET retries', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(500))
    vi.stubGlobal('fetch', fetchMock)

    await expect(apiClient.get('/x', { maxRetries: 0, baseDelay: 1 })).rejects.toMatchObject({ status: 500 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('merges custom headers with defaults instead of replacing them', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}))
    vi.stubGlobal('fetch', fetchMock)

    await apiClient.post('/x', { a: 1 }, { headers: { 'X-Custom': 'yes' } })

    const [, init] = fetchMock.mock.calls[0]
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Custom': 'yes',
    })
  })

  it('deterministic 4xx failures do not open the circuit breaker', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(404))
    vi.stubGlobal('fetch', fetchMock)

    for (let i = 0; i < 6; i++) {
      await expect(apiClient.get('/x', { baseDelay: 1 })).rejects.toMatchObject({ status: 404 })
    }
    expect(getCircuitBreaker().getState()).toBe('closed')
  })

  it('does not retry aborted requests', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(async () => {
      controller.abort()
      const error = new Error('aborted')
      error.name = 'AbortError'
      throw error
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      apiClient.get('/x', { signal: controller.signal, baseDelay: 1 })
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
