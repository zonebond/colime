import { memo, useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import AssistantMarkdown from '../content-blocks/AssistantMarkdown'
import PacedMarkdown from '../content-blocks/PacedMarkdown'
import StreamingTail from '../content-blocks/StreamingTail'
import FileBlock from '../content-blocks/FileBlock'
import CompactionDivider from '../content-blocks/CompactionDivider'
import ReasoningBlock from '../content-blocks/ReasoningBlock'
import BasicTool from '../content-blocks/BasicTool'
import ContextToolGroup, { isContextTool } from '../content-blocks/ContextToolGroup'

import { getErrorMessage } from './helpers'
import styles from './AssistantBlocks.module.css'

const HIDDEN_TOOLS = new Set(['todowrite', 'todo_write'])

function groupInlineContextTools(blocks) {
  if (!blocks || blocks.length < 2) return blocks

  const result = []
  let i = 0
  while (i < blocks.length) {
    const block = blocks[i]
    const isContext = block.type === 'tool_result' && isContextTool(block.toolName)

    if (isContext) {
      const group = [block]
      let j = i + 1
      while (j < blocks.length) {
        const next = blocks[j]
        if (next.type === 'tool_result' && isContextTool(next.toolName)) {
          group.push(next)
          j++
        } else {
          break
        }
      }
      if (group.length >= 2) {
        result.push({ type: 'contextGroup', blocks: group, _id: `ctxgrp-${group[0].id}` })
      } else {
        result.push(block)
      }
      i = j
    } else {
      result.push(block)
      i++
    }
  }
  return result
}

export default memo(function AssistantBlocks({
  message,
  t,
  tc,
  onConfirmTool = null,
  onRetryTool = null,
}) {
  const showReasoning = useAppStore((s) => s.showReasoning)
  const blocks = message.contentBlocks || []
  const isStreaming = message.status === 'loading'

  // Group consecutive done context tools inline, keeping original order
  const orderedBlocks = useMemo(() => {
    return groupInlineContextTools(blocks)
  }, [blocks])

  if (!blocks.length) {
    if (message.status === 'loading') {
      return null
    }

    if (message.status === 'error') {
      const displayMessage = getErrorMessage(message.errorCode, message.error, tc.error)
      return (
        <div className={styles.responseBodyText}>
          <p className={styles.errorText}>{displayMessage}</p>
        </div>
      )
    }

    if (!message.content) {
      return null
    }

    return (
      <div className={styles.responseBodyText}>
        <AssistantMarkdown content={message.content} />
      </div>
    )
  }

  return (
    <div className={styles.responseBlockContent}>
      {orderedBlocks.map((item, blockIdx) => {
        // Context tool group
        if (item.type === 'contextGroup') {
          return (
            <ContextToolGroup
              key={item._id}
              items={item.blocks.map((b) => ({
                type: 'single',
                step: {
                  id: b.id,
                  type: 'tool',
                  label: b.toolName,
                  state: b.state,
                  detail: b.toolResult,
                  toolInput: b.toolInput,
                  toolOutput: b.toolOutput,
                  toolResult: b.toolResult,
                  durationMs: b.durationMs,
                },
              }))}
              toolBlocks={item.blocks}
              onConfirmTool={onConfirmTool}
              onRetryTool={onRetryTool}
              BasicToolComponent={BasicTool}
              t={t}
            />
          )
        }

        // Individual block — render by type in original order
        switch (item.type) {
          case 'reasoning':
            if (!showReasoning) return null
            return (
              <ReasoningBlock
                key={item.id}
                content={item.content}
                isStreaming={isStreaming && item.state === 'active'}
              />
            )

          case 'tool_result':
            if (HIDDEN_TOOLS.has(item.toolName)) return null
            return (
              <BasicTool
                key={item.id}
                block={item}
                onConfirmTool={onConfirmTool}
                onRetryTool={onRetryTool}
              />
            )

          case 'file':
            return <FileBlock key={item.id} block={item} />

          case 'compaction':
            return (
              <CompactionDivider
                key={item.id}
                label={t.sessionCompacted || 'Session compacted'}
              />
            )

          case 'text': {
            const isStreamingTail = isStreaming && blockIdx === orderedBlocks.length - 1

            if (!item.content) return null

            // During streaming, use PacedMarkdown for all text blocks.
            // Completed blocks render instantly (usePacedText skips pacing
            // when text.length matches), while the active tail still paces.
            if (isStreaming && isStreamingTail) {
              return (
                <StreamingTail
                  key={item.id}
                  block={item}
                  isStreaming={isStreaming}
                />
              )
            }

            if (isStreaming) {
              return (
                <PacedMarkdown
                  key={item.id}
                  content={item.content}
                  isStreaming
                />
              )
            }

            return (
              <AssistantMarkdown key={item.id} content={item.content} />
            )
          }

          default:
            return null
        }
      })}

      {/* Fallback: error state when no blocks to render */}
      {orderedBlocks.length === 0 &&
        message.status === 'error' &&
        <p className={styles.errorText}>
          {getErrorMessage(message.errorCode, message.error, tc.error)}
        </p>
      }
    </div>
  )
})
