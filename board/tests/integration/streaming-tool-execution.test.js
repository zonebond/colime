import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { createMockTool, mockReadTool, mockWriteTool, createToolUse } from './helpers/mockTools.js'

const ToolStatus = Object.freeze({
  QUEUED: 'queued',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  YIELDED: 'yielded',
})

class StreamingToolExecutor {
  constructor(options = {}) {
    this.tools = new Map()
    this.hasErrored = false
    this.siblingAbortController = new AbortController()
    this.onProgress = options.onProgress || null
    this.onStateChange = options.onStateChange || null
  }

  addTool(toolUse, isConcurrencySafe = false) {
    const tracked = {
      id: toolUse.id,
      toolUse,
      status: ToolStatus.QUEUED,
      isConcurrencySafe,
      promise: null,
      result: null,
      pendingProgress: [],
      progressAvailableResolve: null,
      abortController: new AbortController(),
    }
    this.tools.set(toolUse.id, tracked)
    this._emitStateChange(toolUse.id, null, ToolStatus.QUEUED)
    return tracked
  }

  getNextBatch() {
    const queued = []
    for (const [, tool] of this.tools) {
      if (tool.status === ToolStatus.QUEUED) {
        queued.push(tool)
      }
    }
    if (queued.length === 0) return { batch: [], isConcurrent: false }

    const safe = queued.filter(t => t.isConcurrencySafe)
    const unsafe = queued.filter(t => !t.isConcurrencySafe)

    if (safe.length > 0) {
      return { batch: safe, isConcurrent: true }
    }
    return { batch: [unsafe[0]], isConcurrent: false }
  }

  async executeBatch(batch, executeFn) {
    const promises = batch.map(tracked => this._executeOne(tracked, executeFn))

    if (batch.length > 1) {
      await Promise.all(promises)
    } else {
      await promises[0]
    }
  }

  async _executeOne(tracked, executeFn) {
    this._transition(tracked, ToolStatus.EXECUTING)

    try {
      const result = await executeFn(tracked.toolUse, {
        signal: this.siblingAbortController.signal,
        onProgress: (msg) => {
          tracked.pendingProgress.push(msg)
          if (this.onProgress) this.onProgress(tracked.id, msg)
          if (tracked.progressAvailableResolve) {
            tracked.progressAvailableResolve()
            tracked.progressAvailableResolve = null
          }
        },
      })

      tracked.result = result
      this._transition(tracked, ToolStatus.COMPLETED)

      if (result.isError && tracked.toolUse.name === 'bash') {
        this.hasErrored = true
        this.siblingAbortController.abort('sibling_error')
      }
    } catch (error) {
      if (error === 'sibling_error' || error?.message === 'sibling_error') {
        tracked.result = {
          tool: tracked.toolUse.name,
          output: { content: 'Tool execution cancelled: sibling Bash command failed' },
          content: 'Tool execution cancelled: sibling Bash command failed',
          isError: true,
          durationMs: 0,
          attempts: 0,
        }
      } else {
        tracked.result = {
          tool: tracked.toolUse.name,
          output: { content: error.message || 'Tool execution failed' },
          content: error.message || 'Tool execution failed',
          isError: true,
          durationMs: 0,
          attempts: 0,
        }
      }
      this._transition(tracked, ToolStatus.COMPLETED)
    }
  }

  getCompletedResults() {
    const results = []
    for (const [id, tracked] of this.tools) {
      if (tracked.status === ToolStatus.COMPLETED) {
        results.push({ ...tracked.result, toolUseId: id, toolUse: tracked.toolUse })
        this._transition(tracked, ToolStatus.YIELDED)
        if (tracked.pendingProgress.length > 0) {
          tracked.pendingProgress = []
        }
      }
    }
    return results
  }

  hasPendingTools() {
    for (const [, tracked] of this.tools) {
      if (tracked.status === ToolStatus.QUEUED || tracked.status === ToolStatus.EXECUTING) {
        return true
      }
    }
    return false
  }

  discard() {
    for (const [, tracked] of this.tools) {
      if (tracked.status === ToolStatus.QUEUED || tracked.status === ToolStatus.EXECUTING) {
        tracked.abortController.abort('discarded')
        tracked.result = {
          tool: tracked.toolUse.name,
          output: { content: 'Tool execution discarded: stream fallback' },
          content: 'Tool execution discarded: stream fallback',
          isError: true,
          durationMs: 0,
          attempts: 0,
        }
        tracked.status = ToolStatus.YIELDED
      }
    }
  }

  getTools() {
    return Array.from(this.tools.values())
  }

  _transition(tracked, newStatus) {
    const oldStatus = tracked.status
    tracked.status = newStatus
    if (this.onStateChange) {
      this.onStateChange(tracked.id, oldStatus, newStatus)
    }
  }

  _emitStateChange(toolUseId, oldStatus, newStatus) {
    if (this.onStateChange) {
      this.onStateChange(toolUseId, oldStatus, newStatus)
    }
  }
}

describe('StreamingToolExecutor', () => {
  let executor
  let stateChanges

  beforeEach(() => {
    stateChanges = []
    executor = new StreamingToolExecutor({
      onStateChange: (id, oldStatus, newStatus) => {
        stateChanges.push({ id, oldStatus, newStatus })
      },
    })
  })

  it('basic state machine: addTool → queued, getNextBatch → batch, executeBatch → executing, getCompletedResults → completed/yielded', async () => {
    const toolUse = createToolUse('tool-1', 'read', { path: '/test' })
    const mockTool = mockReadTool('read', { duration: 5 })

    const tracked = executor.addTool(toolUse, true)
    assert.equal(tracked.status, ToolStatus.QUEUED)

    const { batch, isConcurrent } = executor.getNextBatch()
    assert.equal(batch.length, 1)
    assert.equal(isConcurrent, true)

    await executor.executeBatch(batch, mockTool.execute)

    const results = executor.getCompletedResults()
    assert.equal(results.length, 1)
    assert.equal(results[0].toolUseId, 'tool-1')
    assert.equal(results[0].isError, false)

    const tools = executor.getTools()
    assert.equal(tools[0].status, ToolStatus.YIELDED)
  })

  it('concurrency safety partition: 3 safe tools + 1 unsafe → safe batch first, then unsafe', async () => {
    const safeTool1 = createToolUse('safe-1', 'read', { path: '/a' })
    const safeTool2 = createToolUse('safe-2', 'read', { path: '/b' })
    const safeTool3 = createToolUse('safe-3', 'read', { path: '/c' })
    const unsafeTool = createToolUse('unsafe-1', 'write', { path: '/d' })

    executor.addTool(safeTool1, true)
    executor.addTool(safeTool2, true)
    executor.addTool(safeTool3, true)
    executor.addTool(unsafeTool, false)

    const firstBatch = executor.getNextBatch()
    assert.equal(firstBatch.batch.length, 3)
    assert.equal(firstBatch.isConcurrent, true)
    assert.ok(firstBatch.batch.every(t => t.isConcurrencySafe))

    const mockTool = mockReadTool('read', { duration: 5 })
    await executor.executeBatch(firstBatch.batch, mockTool.execute)
    executor.getCompletedResults()

    const secondBatch = executor.getNextBatch()
    assert.equal(secondBatch.batch.length, 1)
    assert.equal(secondBatch.isConcurrent, false)
    assert.equal(secondBatch.batch[0].isConcurrencySafe, false)
  })

  it('parallel execution of safe tools: 2 read mocks → Promise.all → both complete → 2 results', async () => {
    const tool1 = createToolUse('read-1', 'read', { path: '/x' })
    const tool2 = createToolUse('read-2', 'read', { path: '/y' })

    executor.addTool(tool1, true)
    executor.addTool(tool2, true)

    const mockTool = mockReadTool('read', { duration: 10 })
    const { batch } = executor.getNextBatch()

    const startTime = Date.now()
    await executor.executeBatch(batch, mockTool.execute)
    const elapsed = Date.now() - startTime

    assert.ok(elapsed < 25, 'Parallel execution should not double the duration')

    const results = executor.getCompletedResults()
    assert.equal(results.length, 2)
    assert.ok(results.some(r => r.toolUseId === 'read-1'))
    assert.ok(results.some(r => r.toolUseId === 'read-2'))
  })

  it('serial execution of unsafe tools: 2 write mocks → getNextBatch returns them sequentially', async () => {
    const tool1 = createToolUse('write-1', 'write', { path: '/a' })
    const tool2 = createToolUse('write-2', 'write', { path: '/b' })

    executor.addTool(tool1, false)
    executor.addTool(tool2, false)

    const firstBatch = executor.getNextBatch()
    assert.equal(firstBatch.batch.length, 1)
    assert.equal(firstBatch.isConcurrent, false)
    assert.equal(firstBatch.batch[0].id, 'write-1')

    const mockTool = mockWriteTool('write', { duration: 5 })
    await executor.executeBatch(firstBatch.batch, mockTool.execute)
    executor.getCompletedResults()

    const secondBatch = executor.getNextBatch()
    assert.equal(secondBatch.batch.length, 1)
    assert.equal(secondBatch.isConcurrent, false)
    assert.equal(secondBatch.batch[0].id, 'write-2')
  })

  it('discard mechanism: addTool 3 tools → discard before execution → hasPendingTools = false, no results', () => {
    executor.addTool(createToolUse('tool-1', 'read'), true)
    executor.addTool(createToolUse('tool-2', 'read'), true)
    executor.addTool(createToolUse('tool-3', 'write'), false)

    assert.equal(executor.hasPendingTools(), true)

    executor.discard()

    assert.equal(executor.hasPendingTools(), false)

    const results = executor.getCompletedResults()
    assert.equal(results.length, 0)

    const tools = executor.getTools()
    assert.ok(tools.every(t => t.status === ToolStatus.YIELDED))
  })

  it('progress callback: tool with progress → onProgress called with { toolUseId, message }', async () => {
    const progressCalls = []
    const executorWithProgress = new StreamingToolExecutor({
      onProgress: (toolUseId, message) => {
        progressCalls.push({ toolUseId, message })
      },
    })

    const toolUse = createToolUse('tool-1', 'read')
    executorWithProgress.addTool(toolUse, true)

    const mockTool = mockReadTool('read', {
      duration: 5,
      onProgress: ['step 1', 'step 2', 'step 3'],
    })

    const { batch } = executorWithProgress.getNextBatch()
    await executorWithProgress.executeBatch(batch, mockTool.execute)

    assert.equal(progressCalls.length, 3)
    assert.deepEqual(progressCalls[0], { toolUseId: 'tool-1', message: 'step 1' })
    assert.deepEqual(progressCalls[1], { toolUseId: 'tool-1', message: 'step 2' })
    assert.deepEqual(progressCalls[2], { toolUseId: 'tool-1', message: 'step 3' })
  })
})
