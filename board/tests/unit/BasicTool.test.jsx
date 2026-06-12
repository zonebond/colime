import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import BasicTool from '../../src/components/chats/content-blocks/BasicTool'

function block(overrides = {}) {
  return {
    id: 'tool-1',
    toolId: 'tool-1',
    toolName: 'read',
    toolInput: { path: '/foo/bar.txt' },
    state: 'done',
    durationMs: 1500,
    ...overrides,
  }
}

describe('BasicTool', () => {
  it('renders tool label from registry', () => {
    render(<BasicTool block={block()} />)
    expect(screen.getByText('Read file')).toBeInTheDocument()
  })

  it('renders tool description from registry', () => {
    render(<BasicTool block={block()} />)
    expect(screen.getByText('/foo/bar.txt')).toBeInTheDocument()
  })

  it('shows duration for done state', () => {
    render(<BasicTool block={block({ durationMs: 2500 })} />)
    expect(screen.getByText('3s')).toBeInTheDocument()
  })

  it('shows running state with elapsed time', () => {
    render(<BasicTool block={block({ state: 'active', durationMs: undefined })} />)
    expect(screen.getByText(/Running/)).toBeInTheDocument()
  })

  it('shows confirm_required state with Allow/Deny buttons', () => {
    const onConfirm = vi.fn()
    render(<BasicTool block={block({ state: 'confirm_required', toolInput: { cmd: 'rm -rf' } })} onConfirmTool={onConfirm} />)
    expect(screen.getByText('Allow')).toBeInTheDocument()
    expect(screen.getByText('Deny')).toBeInTheDocument()
  })

  it('calls onConfirmTool with allow when Allow clicked', () => {
    const onConfirm = vi.fn()
    render(<BasicTool block={block({ state: 'confirm_required' })} onConfirmTool={onConfirm} />)
    fireEvent.click(screen.getByText('Allow'))
    expect(onConfirm).toHaveBeenCalledWith('tool-1', 'allow')
  })

  it('calls onConfirmTool with deny when Deny clicked', () => {
    const onConfirm = vi.fn()
    render(<BasicTool block={block({ state: 'confirm_required' })} onConfirmTool={onConfirm} />)
    fireEvent.click(screen.getByText('Deny'))
    expect(onConfirm).toHaveBeenCalledWith('tool-1', 'deny')
  })

  it('shows error state with retry button', () => {
    const onRetry = vi.fn()
    render(<BasicTool block={block({ state: 'error', toolResult: 'Something broke' })} onRetryTool={onRetry} />)
    expect(screen.getByText('Failed')).toBeInTheDocument()
    expect(screen.getByText('Retry')).toBeInTheDocument()
  })

  it('calls onRetryTool when Retry clicked', () => {
    const onRetry = vi.fn()
    render(<BasicTool block={block({ state: 'error', toolResult: 'err' })} onRetryTool={onRetry} />)
    fireEvent.click(screen.getByText('Retry'))
    expect(onRetry).toHaveBeenCalledWith('tool-1')
  })

  it('shows deduped badge', () => {
    render(<BasicTool block={block({ state: 'deduped', durationMs: undefined })} />)
    expect(screen.getByText('Deduped')).toBeInTheDocument()
    expect(screen.getByText('Cached')).toBeInTheDocument()
  })

  it('shows circuit open badge', () => {
    render(<BasicTool
      block={block({ state: 'done' })}
      circuitBreaker={{ read: 'open' }}
    />)
    expect(screen.getByText('Circuit Open')).toBeInTheDocument()
  })

  it('shows circuit half-open badge', () => {
    render(<BasicTool
      block={block({ state: 'done' })}
      circuitBreaker={{ read: 'half_open' }}
    />)
    expect(screen.getByText('Half-Open')).toBeInTheDocument()
  })

  it('toggles expanded state on click', () => {
    render(<BasicTool block={block({ toolInput: { path: 'x' }, toolResult: 'result' })} />)
    const btn = screen.getByRole('button')
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
  })

  it('defaults to expanded for running state', () => {
    render(<BasicTool block={block({ state: 'active' })} />)
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('defaults to expanded for confirm_required state', () => {
    render(<BasicTool block={block({ state: 'confirm_required' })} />)
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('true')
  })

  it('renders formatted tool input and result in expanded body', () => {
    render(<BasicTool block={block({ toolInput: { key: 'val' }, toolResult: 'ok' })} />)
    // Expand first
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByText('ok')).toBeInTheDocument()
  })

  it('renders unknown tool name with default label', () => {
    render(<BasicTool block={block({ toolName: 'some_unknown_tool', toolInput: null })} />)
    expect(screen.getByText('some_unknown_tool')).toBeInTheDocument()
  })

  it('shows progress bar when progress data present', () => {
    render(<BasicTool block={block({
      state: 'active',
      progress: { current: 50, total: 100, message: 'Processing...' },
      durationMs: undefined,
    })} />)
    expect(screen.getByText('Processing...')).toBeInTheDocument()
  })
})
