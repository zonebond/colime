import assert from 'node:assert/strict'
import { createMockResponsePlan, generateMockResponseStream } from '../src/features/chats/mockChatEngine.js'

const SCENARIOS = [
  '搜索 最新消息',
  'fix build error in chat page',
  'plan the next feature layout',
  'document summary from uploaded file',
  'hello there',
]

function collectChunks(prompt) {
  const plan = createMockResponsePlan(prompt)
  const chunks = Array.from(generateMockResponseStream(plan))
  return { plan, chunks }
}

function assertBlockOrdering(blocks, prompt, chunkIndex) {
  let sawMarkdown = false

  blocks.forEach((block) => {
    if (block.type === 'markdown') {
      sawMarkdown = true
      return
    }

    if (sawMarkdown) {
      throw new assert.AssertionError({
        message: `[${prompt}] chunk ${chunkIndex} has non-markdown block after markdown block`,
      })
    }
  })
}

function assertScenario(prompt) {
  const { plan, chunks } = collectChunks(prompt)

  assert.ok(chunks.length > 0, `[${prompt}] stream should emit at least one chunk`)

  const firstChunk = chunks[0]
  assert.equal(firstChunk.contentBlock?.type, 'thinking', `[${prompt}] first chunk should start with thinking block`)

  const finalChunk = chunks[chunks.length - 1]
  assert.equal(finalChunk.isDone, true, `[${prompt}] final chunk should mark stream done`)
  assert.equal(finalChunk.markdownBlocks.length, plan.sectionChars.length, `[${prompt}] final markdown blocks should match section count`)
  assert.deepEqual(
    finalChunk.markdownBlocks.map((block) => block.content),
    plan.sectionChars,
    `[${prompt}] final markdown blocks should preserve section content`
  )

  let sawToolChunk = false
  let sawMarkdownChunk = false
  let sawSettlingStep = false
  let lastActiveStepId = null
  let sawStepTransition = false

  chunks.forEach((chunk, chunkIndex) => {
    const blocks = chunk.contentBlocks ?? []
    const thinkingBlock = blocks.find((block) => block.type === 'thinking')
    const toolBlocks = blocks.filter((block) => block.type === 'tool-result')
    const markdownBlocks = blocks.filter((block) => block.type === 'markdown')
    const activeStep = chunk.contentBlock?.steps?.find((step) => step.state === 'active') ?? null
    const doneSteps = chunk.contentBlock?.steps?.filter((step) => step.state === 'done') ?? []

    assert.ok(thinkingBlock, `[${prompt}] chunk ${chunkIndex} should include a thinking block`)
    assert.equal(blocks[0]?.type, 'thinking', `[${prompt}] chunk ${chunkIndex} should keep thinking block first`)
    assertBlockOrdering(blocks, prompt, chunkIndex)

    if (activeStep) {
      if (lastActiveStepId && lastActiveStepId !== activeStep.id) {
        sawStepTransition = true
      }
      lastActiveStepId = activeStep.id
    } else if (chunk.isThinking && doneSteps.length > 0) {
      sawSettlingStep = true
    }

    if (activeStep?.type === 'tool') {
      assert.ok(toolBlocks.length > 0, `[${prompt}] chunk ${chunkIndex} should include tool block when tool step is active`)
      sawToolChunk = true
    }

    if (toolBlocks.length > 0) {
      assert.ok(
        blocks.slice(1, 1 + toolBlocks.length).every((block) => block.type === 'tool-result'),
        `[${prompt}] chunk ${chunkIndex} should keep tool blocks directly after thinking block`
      )
    }

    if (markdownBlocks.length > 0) {
      sawMarkdownChunk = true
      assert.equal(thinkingBlock.state, 'done', `[${prompt}] chunk ${chunkIndex} should finish thinking before markdown output`)
      assert.ok(toolBlocks.every((block) => block.state === 'done'), `[${prompt}] chunk ${chunkIndex} should finish tool blocks before markdown output`)
      assert.equal(activeStep, null, `[${prompt}] chunk ${chunkIndex} should not keep an active step once markdown output starts`)
    }
  })

  const expectedToolSteps = plan.steps.filter((step) => step.type === 'tool').length
  if (expectedToolSteps > 0) {
    assert.ok(sawToolChunk, `[${prompt}] stream should emit visible tool chunks`)
    assert.equal(
      finalChunk.contentBlocks.filter((block) => block.type === 'tool-result').length,
      expectedToolSteps,
      `[${prompt}] final chunk should retain all completed tool blocks`
    )
  }

  if (plan.steps.length > 1) {
    assert.ok(sawStepTransition, `[${prompt}] stream should transition between visible steps`)
    assert.ok(sawSettlingStep, `[${prompt}] stream should emit a settling chunk between active steps and markdown output`)
  }

  assert.ok(sawMarkdownChunk, `[${prompt}] stream should eventually emit markdown blocks`)
}

SCENARIOS.forEach(assertScenario)

console.log(`mockChatEngine checks passed for ${SCENARIOS.length} scenarios`)
