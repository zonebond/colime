import { describe, it, expect, vi, afterEach } from 'vitest'
import { createSSEParser, streamEvents } from '@/lib/sseClient'

function collectParser() {
  const events = []
  const parser = createSSEParser((evt) => events.push(evt))
  return { events, parser }
}

describe('createSSEParser', () => {
  it('parses a simple data event', () => {
    const { events, parser } = collectParser()
    parser.feed('data: {"a":1}\n\n')
    expect(events).toEqual([{ event: 'message', data: '{"a":1}' }])
  })

  it('joins multi-line data fields with newlines', () => {
    const { events, parser } = collectParser()
    parser.feed('data: line1\ndata: line2\n\n')
    expect(events).toEqual([{ event: 'message', data: 'line1\nline2' }])
  })

  it('tracks event: field names', () => {
    const { events, parser } = collectParser()
    parser.feed('event: update\ndata: x\n\n')
    expect(events).toEqual([{ event: 'update', data: 'x' }])
  })

  it('ignores comment lines', () => {
    const { events, parser } = collectParser()
    parser.feed(': keepalive\n\ndata: x\n\n')
    expect(events).toEqual([{ event: 'message', data: 'x' }])
  })

  it('buffers partial lines across chunk boundaries', () => {
    const { events, parser } = collectParser()
    parser.feed('data: {"long')
    parser.feed('Value":true}')
    parser.feed('\n\n')
    expect(events).toEqual([{ event: 'message', data: '{"longValue":true}' }])
  })

  it('handles CRLF line endings', () => {
    const { events, parser } = collectParser()
    parser.feed('data: x\r\n\r\ndata: y\r\n\r\n')
    expect(events).toEqual([
      { event: 'message', data: 'x' },
      { event: 'message', data: 'y' },
    ])
  })

  it('does not dispatch without a terminating blank line', () => {
    const { events, parser } = collectParser()
    parser.feed('data: incomplete\n')
    expect(events).toEqual([])
  })

  it('resets event name after dispatch', () => {
    const { events, parser } = collectParser()
    parser.feed('event: special\ndata: a\n\ndata: b\n\n')
    expect(events).toEqual([
      { event: 'special', data: 'a' },
      { event: 'message', data: 'b' },
    ])
  })
})

function sseBody(text) {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text))
      controller.close()
    },
  })
}

describe('streamEvents', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('delivers parsed JSON events and stops on abort', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: sseBody('data: {"n":1}\n\ndata: {"n":2}\n\n'),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const received = []
    await streamEvents({
      url: '/event',
      signal: controller.signal,
      baseDelay: 1,
      onEvent: (evt) => {
        received.push(evt.data)
        if (received.length === 2) controller.abort()
      },
    })

    expect(received).toEqual([{ n: 1 }, { n: 2 }])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reconnects after a network failure', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new TypeError('network error'))
      .mockImplementationOnce(async () => ({
        ok: true,
        status: 200,
        body: sseBody('data: {"ok":true}\n\n'),
      }))
    vi.stubGlobal('fetch', fetchMock)

    const received = []
    await streamEvents({
      url: '/event',
      signal: controller.signal,
      baseDelay: 1,
      onEvent: (evt) => {
        received.push(evt.data)
        controller.abort()
      },
    })

    expect(received).toEqual([{ ok: true }])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('skips malformed JSON payloads without dying', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      body: sseBody('data: not-json\n\ndata: {"good":1}\n\n'),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const received = []
    await streamEvents({
      url: '/event',
      signal: controller.signal,
      baseDelay: 1,
      onEvent: (evt) => {
        received.push(evt.data)
        controller.abort()
      },
    })

    expect(received).toEqual([{ good: 1 }])
  })

  it('gives up after maxConsecutiveFailures failed connections', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const controller = new AbortController()
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500, body: null }))
    vi.stubGlobal('fetch', fetchMock)

    await streamEvents({
      url: '/event',
      signal: controller.signal,
      baseDelay: 1,
      maxConsecutiveFailures: 2,
      onEvent: () => {},
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
