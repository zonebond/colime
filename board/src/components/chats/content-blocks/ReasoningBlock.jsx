import { useState, useEffect } from 'react'
import { useTranslation } from '@/i18n'
import PacedMarkdown from './PacedMarkdown'
import AssistantMarkdown from './AssistantMarkdown'
import styles from './ReasoningBlock.module.css'

export default function ReasoningBlock({ content, isStreaming }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    setExpanded(isStreaming)
  }, [isStreaming])

  if (!content) return null

  const firstLine = content.split('\n')[0]?.slice(0, 80)

  return (
    <div className={styles.reasoningPart}>
      <button
        type="button"
        className={styles.toggle}
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <span className={styles.label}>{t.reasoning || 'Reasoning'}</span>
        {!expanded && firstLine && (
          <span className={styles.preview}>{firstLine}{content.split('\n')[0].length > 80 ? '…' : ''}</span>
        )}
        <span className={`${styles.caret} ${expanded ? styles.caretExpanded : ''}`}>▾</span>
      </button>
      {expanded && (
        <div className={styles.content}>
          {isStreaming ? (
            <PacedMarkdown content={content} isStreaming={isStreaming} />
          ) : (
            <AssistantMarkdown content={content} />
          )}
        </div>
      )}
    </div>
  )
}
