import { memo } from 'react'
import TextShimmer from '../content-blocks/TextShimmer'
import TextReveal from '../content-blocks/TextReveal'
import { getErrorMessage } from './helpers'
import styles from './AssistantStatus.module.css'

export default memo(function AssistantStatus({ message, t, tc }) {
  const hasContent = message.contentBlocks?.some(
    (b) => (b.type === 'text' && b.content) || b.type === 'tool_result'
  )

  // Extract first line from reasoning blocks for live preview
  const reasoningHeading = message.contentBlocks?.find((b) => b.type === 'reasoning' && b.content)?.content?.split('\n')[0]?.replace(/^#+\s*/, '').slice(0, 80) || null

  // Session-turn thinking area when loading and no visible content yet
  if (message.status === 'loading' && !hasContent) {
    return (
      <div className={styles.thinkingArea}>
        <TextShimmer text={t.thinking || 'Thinking'} active />
        {reasoningHeading && (
          <TextReveal
            text={reasoningHeading}
            className={styles.thinkingReasoningHeading}
            travel={25}
            duration={700}
          />
        )}
      </div>
    )
  }

  if (message.stopReason === 'cancelled') {
    return (
      <button type="button" className={styles.statusPill}>
        <span>Stopped</span>
      </button>
    )
  }

  if (message.status === 'error') {
    const displayMessage = getErrorMessage(message.errorCode, message.error, tc.error)
    return (
      <button type="button" className={`${styles.statusPill} ${styles.statusPillError}`}>
        <span>{displayMessage}</span>
      </button>
    )
  }

  return null
})
