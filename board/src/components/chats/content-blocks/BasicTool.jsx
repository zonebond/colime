import { memo, useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { ArrowSquareOut, CaretDown, ArrowClockwise, Subtract, XCircle } from '@phosphor-icons/react'
import { getToolEntry } from './toolRegistry'
import { relativizePaths } from '@/lib/path'
import { getFileIcon } from '@/lib/fileIcons'
import TextShimmer from './TextShimmer'
import AnimatedNumber from './AnimatedNumber'
import ToolErrorCard from './ToolErrorCard'
import ToolOutputSummary from './ToolOutputSummary'
import styles from './BasicTool.module.css'

const FILE_WRITE_TOOLS = new Set(['write', 'edit'])

export default memo(function BasicTool({
  block,
  circuitBreaker,
  className = '',
  stageMode = false,
  onConfirmTool = null,
  onRetryTool = null,
}) {
  const { t } = useTranslation()
  const tc = t('chats') || {}
  const navigate = useNavigate()
  const isRunning = block.state === 'active' || block.state === 'loading'
  const isConfirmRequired = block.state === 'confirm_required'
  const isExecutingEarly = block.state === 'executing_early'
  const isError = block.state === 'error'
  const isDeduped = block.state === 'deduped'
  const circuitState = circuitBreaker?.[block.toolName]
  const isCircuitOpen = circuitState === 'open'
  const isCircuitHalfOpen = circuitState === 'half_open'
  const hasProgress = block.progress && (isRunning || isExecutingEarly)
  const isBusy = isRunning || isExecutingEarly
  const showShimmer = isBusy || isConfirmRequired
  const [expanded, setExpanded] = useState(() => {
    const e = getToolEntry(block.toolName)
    return e.autoExpand?.(block) ?? false
  })
  const [showBody, setShowBody] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [subAnimate, setSubAnimate] = useState(false)
  const startRef = useRef(isRunning ? Date.now() : null)
  const wasBusyRef = useRef(isBusy)
  const deferRef = useRef(null)

  useEffect(() => {
    if (!expanded) {
      setShowBody(false)
      if (deferRef.current) cancelAnimationFrame(deferRef.current)
      return
    }
    deferRef.current = requestAnimationFrame(() => {
      deferRef.current = requestAnimationFrame(() => {
        deferRef.current = null
        setShowBody(true)
      })
    })
    return () => {
      if (deferRef.current) cancelAnimationFrame(deferRef.current)
    }
  }, [expanded])

  useEffect(() => {
    if (isRunning || isExecutingEarly) {
      if (!startRef.current) startRef.current = Date.now()
      const interval = setInterval(() => setElapsed(Date.now() - startRef.current), 1000)
      return () => clearInterval(interval)
    }
    startRef.current = null
    setElapsed(0)
  }, [isRunning, isExecutingEarly])

  const entry = useMemo(() => getToolEntry(block.toolName), [block.toolName])
  const Icon = entry.icon
  const label = useMemo(() => entry.label(block), [entry, block])
  const desc = useMemo(() => entry.description(block), [entry, block])

  // Submessage entry animation: trigger when transitioning from busy → done
  useEffect(() => {
    if (wasBusyRef.current && !isBusy && desc) {
      setSubAnimate(true)
    }
    wasBusyRef.current = isBusy
  }, [isBusy, desc])
  const args = useMemo(() => entry.args?.(block) ?? [], [entry, block])
  const triggerHref = useMemo(() => entry.triggerHref?.(block) ?? null, [entry, block])
  const errorProps = useMemo(() => entry.errorProps?.(block) ?? {}, [entry, block])
  const summary = useMemo(() => entry.renderSummary?.(block) ?? null, [entry, block])
  // The child session ID lives in tool metadata from the moment the
  // subtask starts — read it directly so the drill-down link works while
  // the subtask is still running, not only after renderSummary has output.
  const subagentSessionId = block.toolName === 'task'
    ? (block.toolMetadata?.sessionId ?? (summary?.type === 'task' ? summary.sessionId : null))
    : (summary?.type === 'task' ? summary.sessionId : null)
  const accent = entry.color

  const result = block.toolResult || block.content

  // ── Inline file card display (write/edit tools) ──────────────────
  const isFileWriteTool = FILE_WRITE_TOOLS.has(block.toolName)
  const canShowFileCard = isFileWriteTool && block.toolInput && block.state === 'done'

  const fileName = useMemo(() => {
    if (!canShowFileCard) return null
    const fp = block.toolInput?.filePath || block.toolInput?.path
    return fp ? fp.split('/').pop() : null
  }, [canShowFileCard, block.toolInput])

  const FileIcon = useMemo(() => {
    return getFileIcon(fileName)
  }, [fileName])

  const fileStats = useMemo(() => {
    if (!canShowFileCard || !summary) return null
    if (summary.type !== 'write-edit' && summary.type !== 'apply-patch') return null
    const a = summary.additions ?? 0
    const d = summary.deletions ?? 0
    if (!a && !d) return null
    return { additions: a, deletions: d }
  }, [canShowFileCard, summary])

  const formattedInput = useMemo(() => {
    if (!block.toolInput) return null
    const input = relativizePaths(block.toolInput, block._directory)
    const raw = typeof input === 'string' ? input : JSON.stringify(input)
    try { return JSON.stringify(JSON.parse(raw), null, 2) }
    catch { return raw }
  }, [block.toolInput, block._directory])

  const progressPercent = hasProgress && block.progress.total > 0
    ? Math.round((block.progress.current / block.progress.total) * 100)
    : 0

  const stateClass = isRunning || isExecutingEarly ? styles.stateRunning
    : isConfirmRequired ? styles.stateConfirm
    : isError ? styles.stateError
    : isDeduped ? styles.stateDeduped
    : isCircuitOpen ? styles.stateCircuitOpen
    : isCircuitHalfOpen ? styles.stateCircuitHalf
    : ''

  const metaText = isRunning
    ? <><AnimatedNumber value={Math.ceil(elapsed / 1000)} />s</>
    : isExecutingEarly
      ? 'running'
      : isError
        ? 'Failed'
        : isDeduped
          ? 'cached'
          : isCircuitOpen
            ? 'blocked'
            : isCircuitHalfOpen
              ? 'retrying'
              : block.durationMs
                ? `${Math.round(block.durationMs / 1000)}s`
                : null

  const title = label

  return (
    <>
      <div className={`${styles.card} ${stateClass} ${stageMode ? styles.stage : ''} ${className}`.trim()}>
      <button
        type="button"
        className={`${styles.trigger} ${expanded ? styles.triggerSticky : ''}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className={styles.triggerContent}>
          <span className={styles.triggerIcon}>
            {isError ? (
              <XCircle size={14} weight="fill" className={styles.errorIcon} />
            ) : isBusy ? (
              <span className={styles.spinner} style={{ borderTopColor: accent }} />
            ) : (
              <Icon size={14} weight="fill" className={styles.toolIcon} />
            )}
          </span>

          <span className={styles.triggerInfo}>
            <span className={styles.triggerMain}>
              <span className={styles.triggerTitle}>
                {showShimmer ? (
                  <TextShimmer text={title} active />
                ) : (
                  title
                )}
              </span>
              {canShowFileCard && FileIcon && (
                <span className={styles.fileCardIcon}>
                  <FileIcon size={14} weight="fill" />
                </span>
              )}
              {desc && (
                <span
                  className={`${styles.triggerSubtitle} ${showShimmer ? styles.subtitleAnimated : ''}`}
                  data-sub-animate={subAnimate && !showShimmer ? '' : undefined}
                >
                  {triggerHref ? (
                    <a
                      href={triggerHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.subtitleLink}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {desc}
                    </a>
                  ) : (
                    <span className={styles.subtitleValue}>{desc}</span>
                  )}
                </span>
              )}
              {!showShimmer && fileStats && (
                <span className={styles.fileStats}>+{fileStats.additions} -{fileStats.deletions}</span>
              )}
              {!showShimmer && args.map((arg) => (
                <span key={arg} className={styles.triggerArg}>{arg}</span>
              ))}
            </span>
          </span>
        </span>

        <span className={styles.triggerMeta}>
          {isBusy && (
            <span className={styles.spinner} style={{ width: 12, height: 12, borderTopColor: accent }} />
          )}
          {metaText && (
            <span className={`${styles.metaText} ${isRunning ? styles.metaRunning : ''} ${isError ? styles.metaError : ''}`}>
              {metaText}
            </span>
          )}
          <CaretDown size={12} weight="bold" className={`${styles.caret} ${expanded ? styles.caretExpanded : ''}`} />
        </span>
      </button>

      <div className={styles.contentClip}>
        {hasProgress && (
          <div className={styles.progressWrap}>
            <div className={styles.progressTrack}>
              <div className={styles.progressFill} style={{ width: `${progressPercent}%`, background: accent }} />
            </div>
            {block.progress.message && (
              <span className={styles.progressMsg}>{block.progress.message}</span>
            )}
          </div>
        )}

        <div className={`${styles.body} ${expanded ? styles.bodyExpanded : ''}`}>
          <div className={styles.bodyInner}>
          {showBody ? (
            isConfirmRequired && onConfirmTool && block.toolName !== 'question' ? (
              <div className={styles.confirmActions}>
                <button type="button" className={styles.denyBtn} onClick={() => onConfirmTool(block.toolId, 'deny')}>Deny</button>
                <button type="button" className={styles.allowBtn} onClick={() => onConfirmTool(block.toolId, 'allow')}>Allow</button>
              </div>
            ) : isError ? (
              <div className={styles.content}>
                {formattedInput && <div className={styles.input}>{formattedInput}</div>}
                <ToolErrorCard
                  toolName={block.toolName}
                  error={block.toolResult || ''}
                  directory={block._directory}
                  defaultOpen={false}
                  {...errorProps}
                />
                {onRetryTool && (
                  <button type="button" className={styles.retryBtn} onClick={() => onRetryTool(block.toolId)}>
                    <ArrowClockwise size={14} /> Retry
                  </button>
                )}
              </div>
            ) : (
              <div className={styles.content}>
                {formattedInput && <div className={styles.input}>{formattedInput}</div>}
                {!isRunning && (
                  <ToolOutputSummary
                    summary={entry.renderSummary?.(block)}
                    result={result}
                    directory={block._directory}
                  />
                )}
              </div>
            )
          ) : null}
        </div>
      </div>
      </div>
    </div>
      {subagentSessionId && (
        <div className={styles.subagentDrilldownRow}>
          <span className={styles.subagentDrilldownIcon}>
            <Subtract size={14} weight="bold" />
          </span>
          <button
            className={styles.subagentDrilldown}
            onClick={(e) => { e.stopPropagation(); navigate(`/chats/${subagentSessionId}`) }}
          >
            <span>{tc.viewSession}</span>
            <span className={styles.subagentDrilldownGo}>
              <ArrowSquareOut size={14} weight="bold" />
            </span>
          </button>
        </div>
      )}
    </>
  )
})
