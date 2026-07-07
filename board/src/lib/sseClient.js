const DEFAULT_BASE_DELAY = 1000
const DEFAULT_MAX_DELAY = 15000
const DEFAULT_MAX_CONSECUTIVE_FAILURES = 10

/**
 * Incremental SSE parser per the EventSource spec: accumulates multi-line
 * `data:` fields, tracks `event:` names, ignores comment lines, and
 * dispatches on blank-line boundaries. Feed it raw text chunks in any
 * split — it buffers partial lines across chunks.
 *
 * @param {(evt: {event: string, data: string}) => void} onDispatch
 */
export function createSSEParser(onDispatch) {
  let buffer = ''
  let dataLines = []
  let eventType = ''

  function dispatch() {
    if (dataLines.length === 0) {
      eventType = ''
      return
    }
    onDispatch({ event: eventType || 'message', data: dataLines.join('\n') })
    dataLines = []
    eventType = ''
  }

  function processLine(line) {
    if (line === '') {
      dispatch()
      return
    }
    if (line.startsWith(':')) return

    const colonIndex = line.indexOf(':')
    const field = colonIndex === -1 ? line : line.slice(0, colonIndex)
    let value = colonIndex === -1 ? '' : line.slice(colonIndex + 1)
    if (value.startsWith(' ')) value = value.slice(1)

    if (field === 'data') {
      dataLines.push(value)
    } else if (field === 'event') {
      eventType = value
    }
    // 'id' and 'retry' fields are intentionally ignored — reconnection
    // timing is owned by streamEvents and ravens doesn't emit them.
  }

  return {
    feed(chunk) {
      buffer += chunk
      const lines = buffer.split(/\r\n|\r|\n/)
      buffer = lines.pop()
      for (const line of lines) processLine(line)
    },
  }
}

function abortableSleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

/**
 * Connect to an SSE endpoint and keep it alive until aborted.
 *
 * Unlike a bare fetch loop, a dropped or server-closed connection is
 * re-established with exponential backoff (reset as soon as an event
 * arrives), so a transient network blip doesn't silently kill streaming.
 *
 * @param {object} opts
 * @param {string} opts.url
 * @param {(event: {event: string, data: object}) => void} opts.onEvent
 *   Called per event with JSON-parsed data; malformed payloads are skipped.
 * @param {AbortSignal} opts.signal - Abort to disconnect permanently.
 * @param {number} [opts.baseDelay] - Initial reconnect delay in ms.
 * @param {number} [opts.maxDelay] - Reconnect delay cap in ms.
 * @param {number} [opts.maxConsecutiveFailures] - Give up after this many
 *   reconnect attempts that never produced an event.
 * @param {(connected: boolean) => void} [opts.onConnectionChange]
 */
export async function streamEvents({
  url,
  onEvent,
  signal,
  baseDelay = DEFAULT_BASE_DELAY,
  maxDelay = DEFAULT_MAX_DELAY,
  maxConsecutiveFailures = DEFAULT_MAX_CONSECUTIVE_FAILURES,
  onConnectionChange,
}) {
  let consecutiveFailures = 0

  while (!signal?.aborted) {
    let receivedEvent = false

    try {
      const response = await fetch(url, {
        signal,
        headers: { Accept: 'text/event-stream' },
      })

      if (!response.ok || !response.body) {
        const error = new Error(`SSE connection failed: ${response.status}`)
        error.status = response.status
        throw error
      }

      onConnectionChange?.(true)

      const parser = createSSEParser(({ event, data }) => {
        receivedEvent = true
        consecutiveFailures = 0
        try {
          onEvent({ event, data: JSON.parse(data) })
        } catch (_) {
          // skip malformed events
        }
      })

      const reader = response.body.getReader()
      const decoder = new TextDecoder()

      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        parser.feed(decoder.decode(value, { stream: true }))
      }
      // Server closed the stream — fall through and reconnect.
    } catch (error) {
      if (error.name === 'AbortError' || signal?.aborted) return
    }

    onConnectionChange?.(false)
    if (signal?.aborted) return

    consecutiveFailures = receivedEvent ? 1 : consecutiveFailures + 1
    if (consecutiveFailures > maxConsecutiveFailures) {
      console.error('SSE stream gave up after repeated connection failures:', url)
      return
    }

    const backoff = Math.min(baseDelay * 2 ** (consecutiveFailures - 1), maxDelay)
    const jitter = backoff * 0.25 * Math.random()
    await abortableSleep(backoff + jitter, signal)
  }
}
