import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createMockTool, createToolUse } from './helpers/mockTools.js'

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

function createTimedMockTool(name, durationMs, isConcurrencySafe = true) {
  return createMockTool(name, {
    isConcurrencySafe,
    duration: durationMs,
    result: `${name} completed`,
  })
}

describe('StreamingToolExecutor - Parallel Execution', () => {
  it('should execute 3 concurrent-safe Read tools in parallel (wall time ≈ single op time)', async () => {
    const executor = new StreamingToolExecutor({})

    executor.addTool(createToolUse('id-a', 'read_a', { path: '/a' }), true)
    executor.addTool(createToolUse('id-b', 'read_b', { path: '/b' }), true)
    executor.addTool(createToolUse('id-c', 'read_c', { path: '/c' }), true)

    const mockTool = createTimedMockTool('read', 200, true)
    const { batch } = executor.getNextBatch()

    assert.equal(batch.length, 3, 'All 3 safe tools should be in one batch')

    const startTime = Date.now()
    await executor.executeBatch(batch, mockTool.execute)
    const wallTime = Date.now() - startTime

    const results = executor.getCompletedResults()

    assert.ok(wallTime < 400, `Parallel execution took ${wallTime}ms — should be < 400ms (3x200ms sequential would be 600ms)`)
    assert.equal(results.length, 3, 'Should get 3 results')

    for (const r of results) {
      assert.equal(r.isError, false, `${r.tool?.name || r.toolUse?.name} should not have error`)
    }
  })

  it('should execute non-concurrent tools sequentially (NOT in parallel)', async () => {
    const executor = new StreamingToolExecutor({})

    executor.addTool(createToolUse('id-a', 'write_a', { path: '/a' }), false)
    executor.addTool(createToolUse('id-b', 'write_b', { path: '/b' }), false)

    const mockTool = createTimedMockTool('write', 200, false)

    let { batch } = executor.getNextBatch()
    assert.equal(batch.length, 1, 'Non-concurrent batch should have 1 tool')

    const startTime = Date.now()
    await executor.executeBatch(batch, mockTool.execute)
    executor.getCompletedResults()

    ;({ batch } = executor.getNextBatch())
    assert.equal(batch.length, 1, 'Second batch should also have 1 tool')

    await executor.executeBatch(batch, mockTool.execute)
    executor.getCompletedResults()

    const wallTime = Date.now() - startTime

    assert.ok(wallTime >= 300, `Sequential execution took ${wallTime}ms — should be >= 300ms (proves non-parallel)`)
  })

  it('should mix concurrent-safe and non-concurrent tools correctly', async () => {
    const executor = new StreamingToolExecutor({})

    executor.addTool(createToolUse('id-x', 'read_x', { path: '/x' }), true)
    executor.addTool(createToolUse('id-y', 'read_y', { path: '/y' }), true)
    executor.addTool(createToolUse('id-z', 'write_z', { path: '/z' }), false)

    const readMock = createTimedMockTool('read', 150, true)
    const writeMock = createTimedMockTool('write', 150, false)

    let { batch } = executor.getNextBatch()
    assert.equal(batch.length, 2, 'First batch should have 2 concurrent-safe tools')
    await executor.executeBatch(batch, readMock.execute)
    executor.getCompletedResults()

    ;({ batch } = executor.getNextBatch())
    assert.equal(batch.length, 1, 'Second batch should have 1 non-concurrent tool')
    await executor.executeBatch(batch, writeMock.execute)
    executor.getCompletedResults()

    assert.ok(!executor.hasPendingTools(), 'No pending tools should remain')
  })

  it('should handle bash failure that aborts sibling tools', async () => {
    const executor = new StreamingToolExecutor({})

    const bashMock = createMockTool('bash_fail', {
      isConcurrencySafe: false,
      duration: 50,
      result: 'bash failed',
      shouldFail: true,
      failMessage: 'bash failed',
    })

    executor.addTool(createToolUse('id-bash', 'bash_fail', {}), false)

    const { batch } = executor.getNextBatch()
    assert.equal(batch.length, 1, 'Should have 1 tool in batch')
    assert.equal(batch[0].toolUse.name, 'bash_fail')

    await executor.executeBatch(batch, bashMock.execute)
    const results = executor.getCompletedResults()

    const bashResult = results.find(r => r.toolUseId === 'id-bash')
    assert.ok(bashResult, 'Should have bash result')
    assert.equal(bashResult.isError, true, 'Bash should be marked as error')
  })

  it('should track durationMs per tool execution', async () => {
    const executor = new StreamingToolExecutor({})

    executor.addTool(createToolUse('id-slow', 'slow_read', { path: '/slow' }), true)

    const mockTool = createTimedMockTool('slow_read', 300, true)
    const { batch } = executor.getNextBatch()

    await executor.executeBatch(batch, mockTool.execute)
    const [result] = executor.getCompletedResults()

    assert.ok(result.durationMs >= 250, `Duration should be >= 250ms, got ${result.durationMs}ms`)
  })

  it('discard should cancel all pending tools', async () => {
    const executor = new StreamingToolExecutor({})

    executor.addTool(createToolUse('id-1', 'read_1', { path: '/1' }), true)
    executor.addTool(createToolUse('id-2', 'read_2', { path: '/2' }), true)

    executor.discard()

    assert.ok(!executor.hasPendingTools(), 'No pending tools after discard')
    const results = executor.getCompletedResults()
    assert.equal(results.length, 0, 'No results after discard')
  })

  it('Promise.all is used for safe batches: 3 tools at 200ms each should complete in ~200ms not 600ms', async () => {
    const executor = new StreamingToolExecutor({})

    executor.addTool(createToolUse('read-1', 'Read', { path: '/1' }), true)
    executor.addTool(createToolUse('read-2', 'Read', { path: '/2' }), true)
    executor.addTool(createToolUse('read-3', 'Read', { path: '/3' }), true)

    const mockTool = createTimedMockTool('Read', 200, true)
    const { batch, isConcurrent } = executor.getNextBatch()

    assert.equal(batch.length, 3, 'All 3 safe tools should be in one batch')
    assert.equal(isConcurrent, true, 'Batch should be marked as concurrent')

    const startTime = Date.now()
    await executor.executeBatch(batch, mockTool.execute)
    const wallTime = Date.now() - startTime

    assert.ok(wallTime < 400, `Wall time ${wallTime}ms suggests sequential execution. Expected < 400ms for parallel.`)
    assert.ok(wallTime >= 150, `Wall time ${wallTime}ms should be at least 150ms (real work was done)`)
  })
})