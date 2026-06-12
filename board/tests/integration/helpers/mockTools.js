const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export function createMockTool(name, options = {}) {
  const {
    isConcurrencySafe = true,
    duration = 10,
    result = 'mock result',
    shouldFail = false,
    failMessage = `${name} failed`,
    onProgress = null,
  } = options

  let callCount = 0
  const calls = []

  return {
    name,
    isConcurrencySafe,
    isReadOnly: isConcurrencySafe,
    getCallCount: () => callCount,
    getCalls: () => [...calls],
    execute: async (toolUse, context = {}) => {
      callCount++
      const call = { toolUse, context, timestamp: Date.now() }
      calls.push(call)

      if (onProgress && context.onProgress) {
        for (const msg of onProgress) {
          context.onProgress(msg)
          await sleep(1)
        }
      }

      await sleep(duration)

      if (shouldFail) {
        throw new Error(failMessage)
      }

      return {
        content: result,
        output: result,
        isError: false,
        durationMs: duration,
      }
    },
  }
}

export const mockReadTool = (name = 'read', opts = {}) =>
  createMockTool(name, { isConcurrencySafe: true, ...opts })

export const mockWriteTool = (name = 'write', opts = {}) =>
  createMockTool(name, { isConcurrencySafe: false, ...opts })

export const mockBashTool = (name = 'bash', opts = {}) =>
  createMockTool(name, { isConcurrencySafe: false, ...opts })

export function createToolUse(id, name, input = {}) {
  return { id, name, input }
}
