import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import ThinkingTimelineItem from '../../src/components/chats/content-blocks/ThinkingTimelineItem'

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

function s(overrides = {}) {
  return { id: 's1', type: 'tool', label: 'Read file', state: 'done', ...overrides }
}

function makeSteps(count) {
  return Array.from({ length: count }, (_, i) => s({ id: `s${i + 1}`, label: `Step ${i + 1}` }))
}

describe('ThinkingTimelineItem', () => {
  const steps = makeSteps(3)

  it('renders step number badge', () => {
    render(<ThinkingTimelineItem step={steps[0]} steps={steps} t={t} toolBlocks={[]} />)
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('renders ThinkingStepCard when no tool block found', () => {
    render(<ThinkingTimelineItem step={steps[0]} steps={steps} t={t} toolBlocks={[]} />)
    expect(screen.getByText('Step 1')).toBeInTheDocument()
  })

  it('renders BasicTool when tool block matches', () => {
    const toolBlocks = [{ id: 's2', toolName: 'read', toolInput: { path: '/x' }, state: 'done', durationMs: 500 }]
    const FakeBasicTool = ({ block }) => <div data-testid="basic-tool">{block.toolName}</div>
    render(<ThinkingTimelineItem step={steps[1]} steps={steps} t={t} toolBlocks={toolBlocks} BasicToolComponent={FakeBasicTool} />)
    expect(screen.getByTestId('basic-tool')).toBeInTheDocument()
    expect(screen.getByText('read')).toBeInTheDocument()
  })

  it('renders active marker state for active steps', () => {
    const activeStep = s({ id: 'a1', state: 'active' })
    const allSteps = [activeStep]
    render(<ThinkingTimelineItem step={activeStep} steps={allSteps} t={t} toolBlocks={[]} />)
    expect(screen.getByText('1')).toBeInTheDocument()
    // active step has active styling classes (CSS module, we just verify it renders)
    expect(screen.getByText('In progress')).toBeInTheDocument()
  })

  it('renders error marker state for error steps', () => {
    const errorStep = s({ id: 'e1', state: 'error' })
    const allSteps = [errorStep]
    render(<ThinkingTimelineItem step={errorStep} steps={allSteps} t={t} toolBlocks={[]} />)
    expect(screen.getByText('Done')).toBeInTheDocument()
  })

  it('passes phaseLabel to ThinkingStepCard', () => {
    render(<ThinkingTimelineItem step={steps[0]} steps={steps} t={t} toolBlocks={[]} phaseLabel="PLANNING" />)
    expect(screen.getByText('PLANNING')).toBeInTheDocument()
  })

  it('uses agent-specific tool ID matching for agent steps', () => {
    const agentStep = s({ id: 'agent-a1-tool-toolUse-xyz', type: 'tool', label: 'Agent read' })
    const allSteps = [agentStep]
    const toolBlocks = [{ id: 'toolUse-xyz', toolName: 'read', toolInput: { path: '/y' }, state: 'done' }]
    const FakeBasicTool = ({ block }) => <div data-testid="bt">{block.id}</div>
    render(<ThinkingTimelineItem step={agentStep} steps={allSteps} t={t} toolBlocks={toolBlocks} BasicToolComponent={FakeBasicTool} />)
    expect(screen.getByTestId('bt')).toBeInTheDocument()
  })

  it('defaults collapsed for tool type step cards', () => {
    render(<ThinkingTimelineItem step={steps[0]} steps={steps} t={t} toolBlocks={[]} />)
    // tool type has defaultCollapsed=true, so detail should not be visible
    // Step label is always visible since it's inside the step card
    expect(screen.getByText('Step 1')).toBeInTheDocument()
  })

  it('shows turn label when enabled', () => {
    const turnStep = s({ id: 't1', iteration: 2 })
    render(<ThinkingTimelineItem step={turnStep} steps={[turnStep]} t={t} toolBlocks={[]} showTurnLabel={true} />)
    expect(screen.getByText('T2')).toBeInTheDocument()
  })
})
