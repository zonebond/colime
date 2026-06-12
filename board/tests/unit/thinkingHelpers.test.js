import { describe, it, expect } from 'vitest'
import {
  formatStepDuration,
  getStepPhase,
  groupStepsByPhase,
  detectParallelBatches,
  getStepNumber,
  getToolBlockForStep,
} from '../../src/components/chats/content-blocks/thinkingHelpers'

// ─── formatStepDuration ───

describe('formatStepDuration', () => {
  it('returns empty string for zero or negative', () => {
    expect(formatStepDuration(0)).toBe('')
    expect(formatStepDuration(-100)).toBe('')
    expect(formatStepDuration()).toBe('')
  })

  it('formats milliseconds (< 1000ms)', () => {
    expect(formatStepDuration(500)).toBe('500ms')
    expect(formatStepDuration(1)).toBe('1ms')
    expect(formatStepDuration(999)).toBe('999ms')
  })

  it('formats seconds with one decimal (< 10s)', () => {
    expect(formatStepDuration(1500)).toBe('1.5s')
    expect(formatStepDuration(9400)).toBe('9.4s')
  })

  it('formats seconds without decimal (>= 10s)', () => {
    expect(formatStepDuration(10000)).toBe('10s')
    expect(formatStepDuration(15500)).toBe('16s')
    expect(formatStepDuration(60000)).toBe('60s')
  })
})

// ─── getStepPhase ───

describe('getStepPhase', () => {
  it('returns explicit phase if set on step', () => {
    expect(getStepPhase({ phase: 'custom' }, 0, 3)).toBe('custom')
  })

  it('returns executing for tool/agent/subtask', () => {
    expect(getStepPhase({ type: 'tool' }, 1, 3)).toBe('executing')
    expect(getStepPhase({ type: 'agent' }, 1, 3)).toBe('executing')
    expect(getStepPhase({ type: 'subtask' }, 1, 3)).toBe('executing')
  })

  it('returns analyzing for retry type', () => {
    expect(getStepPhase({ type: 'retry' }, 1, 3)).toBe('analyzing')
  })

  it('returns planning for first step', () => {
    expect(getStepPhase({ type: 'thinking' }, 0, 3)).toBe('planning')
  })

  it('returns summarizing for last step', () => {
    expect(getStepPhase({ type: 'thinking' }, 2, 3)).toBe('summarizing')
  })

  it('returns analyzing for middle steps without explicit type', () => {
    expect(getStepPhase({ type: 'thinking' }, 1, 4)).toBe('analyzing')
  })
})

// ─── groupStepsByPhase ───

describe('groupStepsByPhase', () => {
  const makeStep = (id, type, state, phase) => ({ id, type, state, phase })

  it('groups consecutive steps with same phase', () => {
    const steps = [
      makeStep('1', 'thinking', 'done'),
      makeStep('2', 'tool', 'done'),
      makeStep('3', 'tool', 'done'),
    ]
    // First step is planning (index 0), then tools are executing
    const groups = groupStepsByPhase(steps)
    expect(groups).toHaveLength(2)
    expect(groups[0].phase).toBe('planning')
    expect(groups[0].steps).toHaveLength(1)
    expect(groups[1].phase).toBe('executing')
    expect(groups[1].steps).toHaveLength(2)
  })

  it('marks group as incomplete if any step is not done', () => {
    const steps = [
      makeStep('1', 'tool', 'done'),
      makeStep('2', 'tool', 'active'),
      makeStep('3', 'tool', 'done'),
    ]
    const groups = groupStepsByPhase(steps)
    expect(groups[0].isComplete).toBe(false)
  })

  it('marks hasActive if any step is active or confirm_required', () => {
    const steps = [
      makeStep('1', 'tool', 'confirm_required'),
    ]
    const groups = groupStepsByPhase(steps)
    expect(groups[0].hasActive).toBe(true)
    expect(groups[0].isComplete).toBe(false)
  })

  it('splits groups when phase changes', () => {
    const steps = [
      makeStep('1', 'thinking', 'done', 'planning'),
      makeStep('2', 'tool', 'done', 'executing'),
      makeStep('3', 'thinking', 'done', 'summarizing'),
    ]
    const groups = groupStepsByPhase(steps)
    expect(groups).toHaveLength(3)
    expect(groups[0].phase).toBe('planning')
    expect(groups[1].phase).toBe('executing')
    expect(groups[2].phase).toBe('summarizing')
  })
})

// ─── detectParallelBatches ───

describe('detectParallelBatches', () => {
  const makeStep = (id, type, state) => ({ id, type, state })

  it('returns single items for done steps', () => {
    const steps = [
      makeStep('1', 'tool', 'done'),
      makeStep('2', 'tool', 'done'),
    ]
    const result = detectParallelBatches(steps)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'single', step: steps[0] })
    expect(result[1]).toEqual({ type: 'single', step: steps[1] })
  })

  it('batches 2+ consecutive active tools', () => {
    const steps = [
      makeStep('1', 'tool', 'active'),
      makeStep('2', 'tool', 'active'),
    ]
    const result = detectParallelBatches(steps)
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ type: 'batch', steps: [steps[0], steps[1]] })
  })

  it('batches executing_early tools', () => {
    const steps = [
      makeStep('1', 'tool', 'executing_early'),
      makeStep('2', 'tool', 'executing_early'),
      makeStep('3', 'tool', 'executing_early'),
    ]
    const result = detectParallelBatches(steps)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('batch')
    expect(result[0].steps).toHaveLength(3)
  })

  it('does not batch a single active tool (returns as single)', () => {
    const steps = [
      makeStep('1', 'tool', 'active'),
      makeStep('2', 'tool', 'done'),
    ]
    const result = detectParallelBatches(steps)
    expect(result).toHaveLength(2)
    expect(result[0]).toEqual({ type: 'single', step: steps[0] })
    expect(result[1]).toEqual({ type: 'single', step: steps[1] })
  })

  it('does not batch non-tool types', () => {
    const steps = [
      makeStep('1', 'agent', 'active'),
      makeStep('2', 'agent', 'active'),
    ]
    const result = detectParallelBatches(steps)
    expect(result).toHaveLength(2)
    result.forEach(r => expect(r.type).toBe('single'))
  })

  it('separates multiple batches', () => {
    const steps = [
      makeStep('1', 'tool', 'active'),
      makeStep('2', 'tool', 'active'),
      makeStep('3', 'tool', 'done'),
      makeStep('4', 'tool', 'executing_early'),
      makeStep('5', 'tool', 'executing_early'),
    ]
    const result = detectParallelBatches(steps)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('batch')
    expect(result[1].type).toBe('single')
    expect(result[2].type).toBe('batch')
  })
})

// ─── getStepNumber ───

describe('getStepNumber', () => {
  it('returns 1-based index', () => {
    const steps = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(getStepNumber({ id: 'a' }, steps)).toBe(1)
    expect(getStepNumber({ id: 'c' }, steps)).toBe(3)
  })

  it('returns null for step not in array', () => {
    expect(getStepNumber({ id: 'missing' }, [{ id: 'a' }])).toBeNull()
  })

  it('returns null for empty steps', () => {
    expect(getStepNumber({ id: 'a' }, [])).toBeNull()
  })
})

// ─── getToolBlockForStep ───

describe('getToolBlockForStep', () => {
  it('returns null for non-tool steps', () => {
    expect(getToolBlockForStep({ type: 'agent' }, [])).toBeNull()
    expect(getToolBlockForStep({ type: 'thinking' }, [])).toBeNull()
  })

  it('matches by direct id', () => {
    const blocks = [{ id: 'tool-1', toolName: 'read' }]
    expect(getToolBlockForStep({ type: 'tool', id: 'tool-1' }, blocks)).toBe(blocks[0])
  })

  it('matches by toolId fallback', () => {
    const blocks = [{ id: 'block-1', toolId: 'tool-1', toolName: 'read' }]
    expect(getToolBlockForStep({ type: 'tool', id: 'tool-1' }, blocks)).toBe(blocks[0])
  })

  it('matches agent tool composite IDs', () => {
    const blocks = [{ id: 'toolUse-abc', toolName: 'grep' }]
    expect(getToolBlockForStep({ type: 'tool', id: 'agent-agent1-tool-toolUse-abc' }, blocks)).toBe(blocks[0])
  })

  it('matches agent tool by toolId fallback', () => {
    const blocks = [{ id: 'block-x', toolId: 'toolUse-abc', toolName: 'glob' }]
    expect(getToolBlockForStep({ type: 'tool', id: 'agent-agent1-tool-toolUse-abc' }, blocks)).toBe(blocks[0])
  })

  it('prefers direct id match over toolId match', () => {
    const directBlock = { id: 'tool-1', toolName: 'read' }
    const toolIdBlock = { id: 'other', toolId: 'tool-1', toolName: 'grep' }
    const blocks = [toolIdBlock, directBlock]
    expect(getToolBlockForStep({ type: 'tool', id: 'tool-1' }, blocks)).toBe(directBlock)
  })

  it('returns null when no match found', () => {
    expect(getToolBlockForStep({ type: 'tool', id: 'unknown' }, [])).toBeNull()
    expect(getToolBlockForStep({ type: 'tool', id: 'agent-x-tool-y' }, [{ id: 'z' }])).toBeNull()
  })

  it('does not match non-agent composite IDs', () => {
    const blocks = [{ id: 'abc', toolName: 'read' }]
    // "run-xxx-tool-yyy" does NOT match the agent regex
    expect(getToolBlockForStep({ type: 'tool', id: 'run-xxx-tool-abc' }, blocks)).toBeNull()
  })
})
