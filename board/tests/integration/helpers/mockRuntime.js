export function createMockEventEmitter() {
  const events = []
  return {
    emit: (type, payload) => events.push({ type, timestamp: Date.now(), ...payload }),
    getEvents: () => [...events],
    getEventsByType: (type) => events.filter(e => e.type === type),
    clear: () => { events.length = 0 },
  }
}

export function createMockAbortController() {
  let aborted = false
  const listeners = []
  return {
    signal: {
      get aborted() { return aborted },
      addEventListener: (event, handler) => {
        if (event === 'abort') listeners.push(handler)
      },
      removeEventListener: (event, handler) => {
        if (event === 'abort') {
          const idx = listeners.indexOf(handler)
          if (idx >= 0) listeners.splice(idx, 1)
        }
      },
    },
    abort: (reason) => {
      aborted = true
      listeners.forEach(handler => handler({ target: { reason } }))
    },
  }
}
