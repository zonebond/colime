import { describe, it, expect } from 'vitest'
import { finalizeStaleMessage } from '@/features/chats/normalize'

const block = (state, extra = {}) => ({ id: 'b1', type: 'tool_result', state, ...extra })

describe('finalizeStaleMessage', () => {
  it('settles a loading assistant message to done', () => {
    const msg = { role: 'assistant', status: 'loading', contentBlocks: [] }
    expect(finalizeStaleMessage(msg).status).toBe('done')
  })

  it('settles active and loading blocks to done', () => {
    const msg = {
      role: 'assistant',
      status: 'done',
      contentBlocks: [block('active'), block('loading'), block('done')],
    }
    const result = finalizeStaleMessage(msg)
    expect(result.contentBlocks.map((b) => b.state)).toEqual(['done', 'done', 'done'])
  })

  it('preserves error states', () => {
    const msg = {
      role: 'assistant',
      status: 'error',
      contentBlocks: [block('error'), block('active')],
    }
    const result = finalizeStaleMessage(msg)
    expect(result.status).toBe('error')
    expect(result.contentBlocks[0].state).toBe('error')
    expect(result.contentBlocks[1].state).toBe('done')
  })

  it('returns settled messages unchanged (same reference)', () => {
    const msg = { role: 'assistant', status: 'done', contentBlocks: [block('done')] }
    expect(finalizeStaleMessage(msg)).toBe(msg)
  })

  it('ignores user messages', () => {
    const msg = { role: 'user', status: 'loading' }
    expect(finalizeStaleMessage(msg)).toBe(msg)
  })
})
