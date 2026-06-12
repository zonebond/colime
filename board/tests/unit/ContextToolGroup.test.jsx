import { describe, it, expect } from 'vitest'
import { groupContextTools, isContextTool } from '../../src/components/chats/content-blocks/ContextToolGroup'

// ─── isContextTool ───

describe('isContextTool', () => {
  it('returns true for context tools', () => {
    expect(isContextTool('read')).toBe(true)
    expect(isContextTool('glob')).toBe(true)
    expect(isContextTool('grep')).toBe(true)
    expect(isContextTool('list')).toBe(true)
    expect(isContextTool('lsp')).toBe(true)
    expect(isContextTool('repo_overview')).toBe(true)
  })

  it('returns false for non-context tools', () => {
    expect(isContextTool('bash')).toBe(false)
    expect(isContextTool('write')).toBe(false)
    expect(isContextTool('edit')).toBe(false)
    expect(isContextTool('task')).toBe(false)
    expect(isContextTool('unknown')).toBe(false)
  })
})

// ─── groupContextTools ───

describe('groupContextTools', () => {
  const makeSingle = (id, toolName, state = 'done') => ({
    type: 'single',
    step: { id, type: 'tool', label: toolName, state },
  })

  it('folds 2+ consecutive context tool singles into a group', () => {
    const items = [
      makeSingle('1', 'read'),
      makeSingle('2', 'grep'),
    ]
    const result = groupContextTools(items)
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('contextGroup')
    expect(result[0].items).toHaveLength(2)
  })

  it('does not fold a single context tool', () => {
    const items = [
      makeSingle('1', 'read'),
      { type: 'single', step: { id: '2', type: 'tool', label: 'bash', state: 'done' } },
    ]
    const result = groupContextTools(items)
    expect(result).toHaveLength(2)
    result.forEach(r => expect(r.type).toBe('single'))
  })

  it('only folds context tools in done state', () => {
    const items = [
      makeSingle('1', 'read', 'active'),
      makeSingle('2', 'grep', 'done'),
    ]
    const result = groupContextTools(items)
    // Both are singles because the first is active (not done)
    expect(result).toHaveLength(2)
    result.forEach(r => expect(r.type).toBe('single'))
  })

  it('does not fold non-tool singles', () => {
    const items = [
      { type: 'single', step: { id: '1', type: 'agent', label: 'agent', state: 'done' } },
      { type: 'single', step: { id: '2', type: 'agent', label: 'agent', state: 'done' } },
    ]
    const result = groupContextTools(items)
    expect(result).toHaveLength(2)
  })

  it('passes through parallel batches unchanged', () => {
    const items = [
      { type: 'batch', steps: [{ id: '1', type: 'tool', label: 'read', state: 'active' }] },
      makeSingle('2', 'grep'),
      makeSingle('3', 'glob'),
    ]
    const result = groupContextTools(items)
    expect(result).toHaveLength(2) // batch + contextGroup
    expect(result[0].type).toBe('batch')
    expect(result[1].type).toBe('contextGroup')
    expect(result[1].items).toHaveLength(2)
  })

  it('splits groups when interrupted by non-context tool', () => {
    const items = [
      makeSingle('1', 'read'),
      makeSingle('2', 'grep'),
      { type: 'single', step: { id: '3', type: 'tool', label: 'bash', state: 'done' } },
      makeSingle('4', 'list'),
    ]
    const result = groupContextTools(items)
    expect(result).toHaveLength(3)
    expect(result[0].type).toBe('contextGroup')
    expect(result[1].type).toBe('single')
    expect(result[2].type).toBe('single') // single list (not folded, only 1)
  })
})
