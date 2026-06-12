import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ThinkingStepCard from '../../src/components/chats/content-blocks/ThinkingStepCard'

const t = {
  toolStep: 'Tool step',
  thinkingStep: 'Thinking step',
  agentStep: 'Agent step',
  agentFailed: 'Agent failed',
  toolExecutingEarly: 'Early exec',
  agentThinking: 'Agent thinking',
  agentStopped: 'Agent stopped',
  inProgress: 'In progress',
  done: 'Done',
}

function step(overrides = {}) {
  return {
    id: 's1',
    type: 'tool',
    label: 'Read /foo.txt',
    state: 'done',
    durationMs: 500,
    ...overrides,
  }
}

describe('ThinkingStepCard', () => {
  it('renders tool step type label', () => {
    render(<ThinkingStepCard step={step()} t={t} />)
    expect(screen.getByText('Tool step')).toBeInTheDocument()
  })

  it('renders agent step type label', () => {
    render(<ThinkingStepCard step={step({ type: 'agent' })} t={t} />)
    expect(screen.getByText('Agent step')).toBeInTheDocument()
  })

  it('renders thinking step type label for unknown types', () => {
    render(<ThinkingStepCard step={step({ type: 'thinking' })} t={t} />)
    expect(screen.getByText('Thinking step')).toBeInTheDocument()
  })

  it('shows step number and count', () => {
    render(<ThinkingStepCard step={step()} t={t} stepNumber={2} stepCount={5} />)
    expect(screen.getByText('2/5')).toBeInTheDocument()
  })

  it('shows duration for done steps', () => {
    render(<ThinkingStepCard step={step({ durationMs: 1500 })} t={t} />)
    expect(screen.getByText('1.5s')).toBeInTheDocument()
  })

  it('does not show duration for active steps', () => {
    render(<ThinkingStepCard step={step({ state: 'active', durationMs: 500 })} t={t} />)
    // Duration only shown when done — 500ms should not appear
    expect(screen.queryByText('500ms')).toBeNull()
  })

  it('shows phase badge when phaseLabel provided', () => {
    render(<ThinkingStepCard step={step()} t={t} phaseLabel="EXECUTING" />)
    expect(screen.getByText('EXECUTING')).toBeInTheDocument()
  })

  it('shows step content for non-tool types', () => {
    render(<ThinkingStepCard step={step({ type: 'thinking', content: 'Let me think about this...' })} t={t} />)
    expect(screen.getByText('Let me think about this...')).toBeInTheDocument()
  })

  it('shows streaming content for active non-tool steps', () => {
    render(<ThinkingStepCard step={step({ type: 'thinking', state: 'active', content: 'Thinking...' })} t={t} />)
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
  })

  it('shows tool input when present', () => {
    render(<ThinkingStepCard step={step({ toolInput: { path: '/x' } })} t={t} />)
    expect(screen.getByText(/"path": "\/x"/)).toBeInTheDocument()
  })

  it('shows tool result when present', () => {
    render(<ThinkingStepCard step={step({ toolResult: 'result text' })} t={t} />)
    expect(screen.getByText('result text')).toBeInTheDocument()
  })

  it('shows turn badge for multi-turn', () => {
    render(<ThinkingStepCard step={step({ iteration: 3 })} t={t} showTurnLabel={true} />)
    expect(screen.getByText('T3')).toBeInTheDocument()
  })

  it('does not show turn badge when showTurnLabel is false', () => {
    render(<ThinkingStepCard step={step({ iteration: 3 })} t={t} showTurnLabel={false} />)
    expect(screen.queryByText('T3')).toBeNull()
  })

  it('shows error state', () => {
    render(<ThinkingStepCard step={step({ state: 'error' })} t={t} />)
    expect(screen.getByText('Done')).toBeInTheDocument() // tool error uses t.done
  })

  it('shows active state', () => {
    render(<ThinkingStepCard step={step({ state: 'active' })} t={t} />)
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('shows agent subState labels', () => {
    render(<ThinkingStepCard step={step({ type: 'agent', state: 'active', subState: 'thinking' })} t={t} />)
    expect(screen.getByText('Agent thinking')).toBeInTheDocument()
  })
})
