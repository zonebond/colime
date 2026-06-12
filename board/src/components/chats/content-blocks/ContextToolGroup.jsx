import { useState, useMemo } from 'react'
import { CaretDown } from '@phosphor-icons/react'
import ToolStatusTitle from './ToolStatusTitle'
import AnimatedCountList from './AnimatedCountList'
import { getToolEntry } from './toolRegistry'
import styles from './ContextToolGroup.module.css'

const CONTEXT_TOOLS = new Set(['read', 'glob', 'grep', 'list'])

export function isContextTool(toolName) {
  return CONTEXT_TOOLS.has(toolName)
}

/**
 * Aggregate counts by category matching ravens's grouping:
 * - read → read count
 * - glob/grep → search count
 * - list/lsp/repo_overview → list count
 */
function aggregateCounts(items) {
  const counts = { read: 0, search: 0, list: 0 }
  items.forEach(({ step }) => {
    const name = step.label
    if (name === 'read') counts.read++
    else if (name === 'glob' || name === 'grep') counts.search++
    else counts.list++
  })
  return counts
}

/** Build up to 2 per-item summary snippets from tool blocks */
function perItemSummaries(items, toolBlocks) {
  const summaries = []
  for (const { step } of items) {
    if (summaries.length >= 2) break
    const block =
      step.type === 'tool'
        ? toolBlocks.find((b) => b.id === step.id || b.toolId === step.id)
        : null
    if (!block) continue
    const entry = getToolEntry(block.toolName)
    const desc = entry?.description?.(block)
    if (desc) {
      const short = desc.length > 36 ? desc.slice(0, 36) + '…' : desc
      summaries.push(short)
      continue
    }
    const args = entry?.args?.(block)
    if (args?.length) {
      const short = args[0].length > 36 ? args[0].slice(0, 36) + '…' : args[0]
      summaries.push(short)
    }
  }
  return summaries
}

/**
 * Collapsible card that folds consecutive context-gathering tools
 * into a compact summary, matching ravens's context-tool-group design.
 */
export default function ContextToolGroup({
  items,
  toolBlocks,
  circuitBreaker,
  stageMode,
  onConfirmTool,
  onRetryTool,
  BasicToolComponent,
  t,
}) {
  const [expanded, setExpanded] = useState(false)

  const hasActive = items.some(({ step }) =>
    step.state === 'active' || step.state === 'confirm_required' || step.state === 'executing_early'
  )
  const allDone = items.every(({ step }) => step.state === 'done')

  const counts = useMemo(() => aggregateCounts(items), [items])
  const summaries = useMemo(() => perItemSummaries(items, toolBlocks), [items, toolBlocks])

  const activeLabel = t.gatheringContext || 'Exploring'
  const doneLabel = t.gatheredContext || 'Explored'

  return (
    <div className={`${styles.group} ${allDone ? styles.done : ''}`}>
      <button
        type="button"
        className={`${styles.trigger} ${expanded ? styles.triggerSticky : ''}`}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.triggerLabel}>
          <ToolStatusTitle
            active={hasActive}
            activeText={activeLabel}
            doneText={doneLabel}
          />
        </span>
        <span className={styles.triggerSummary}>· <AnimatedCountList counts={counts} t={t} /></span>
        {summaries.map((s, i) => (
          <span key={i} className={styles.triggerItem}>· {s}</span>
        ))}
        <CaretDown
          size={12}
          weight="bold"
          className={`${styles.caret} ${expanded ? styles.caretExpanded : ''}`}
        />
      </button>

      <div className={styles.bodyClip}>
        <div className={`${styles.body} ${expanded ? styles.bodyExpanded : ''}`}>
          <div className={styles.bodyInner}>
            {items.map(({ step }) => {
              const block =
                step.type === 'tool'
                  ? toolBlocks.find(
                      (b) => b.id === step.id || b.toolId === step.id
                    )
                  : null
              return block && BasicToolComponent ? (
                <BasicToolComponent
                  key={step.id}
                  block={block}
                  circuitBreaker={circuitBreaker}
                  stageMode={stageMode}
                  onConfirmTool={onConfirmTool}
                  onRetryTool={onRetryTool}
                />
              ) : null
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
