import { memo, useCallback, useState } from 'react'
import { Copy, Check, AlignCenterHorizontalSimple } from '@phosphor-icons/react'
import AttachmentCard, { getAttachmentName } from '@/components/attachments/AttachmentCard'
import HighlightedText from '../content-blocks/HighlightedText'
import { formatTime } from './helpers'
import styles from './UserMessageRow.module.css'

function resolveModelName(models, providerID, modelID) {
  if (!providerID || !modelID) return modelID || ''
  const match = models?.find(
    (m) => (m.providerId === providerID || m.provider === providerID) && (m.bareId === modelID || m.id === modelID),
  )
  return match?.name ?? modelID
}

function capitalizeAgent(agent) {
  if (!agent) return ''
  return agent[0].toUpperCase() + agent.slice(1)
}

export default memo(function UserMessageRow({ message, tc, onResetToHere, onPreviewAttachment, models, isReverting }) {
  const [copied, setCopied] = useState(false)
  const attachments = Array.isArray(message.attachments) ? message.attachments : []

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation()
    const content = message.content
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content])

  const handleReset = useCallback(() => {
    if (isReverting) return
    onResetToHere?.(message.id)
  }, [message.id, onResetToHere, isReverting])

  const agentLabel = capitalizeAgent(message.agent)
  const modelLabel = resolveModelName(models, message.providerID, message.model)
  const metaItems = [agentLabel, modelLabel].filter(Boolean)
  const metaHead = metaItems.join(' · ')
  const metaTail = formatTime(message.createdAt)

  return (
    <section className={styles.userSection}>
      {attachments.length > 0 ? (
        <div className={styles.userAttachments}>
          {attachments.map((attachment, index) => (
            <AttachmentCard
              key={attachment.id || `${getAttachmentName(attachment)}-${index}`}
              file={attachment}
              onPreview={onPreviewAttachment}
              size="compact"
              className={styles.userAttachmentEntering}
            />
          ))}
        </div>
      ) : null}
      {message.content ? (
        <div className={styles.userBubble}>
          <HighlightedText text={message.content} references={message._references} />
        </div>
      ) : null}
      <div className={styles.userFooter}>
        <span className={styles.userMeta}>
          {metaHead && <span className={styles.userMetaHead}>{metaHead}</span>}
          {metaHead && metaTail && <span className={styles.userMetaSep}>{' · '}</span>}
          {metaTail && <span className={styles.userMetaTail}>{metaTail}</span>}
        </span>
        <span className={styles.userActions}>
          {onResetToHere && (
            <button
              type="button"
              className={styles.userActionBtn}
              onClick={handleReset}
              disabled={isReverting}
              aria-label={tc.resetToHere || 'Reset to here'}
              title={tc.resetToHere || 'Reset to here'}
            >
              <AlignCenterHorizontalSimple size={16} weight="regular" />
            </button>
          )}
          <button
            type="button"
            className={styles.userActionBtn}
            onClick={handleCopy}
            aria-label={copied ? (tc.copied || 'Copied') : (tc.copy || 'Copy')}
            title={copied ? (tc.copied || 'Copied') : (tc.copy || 'Copy')}
          >
            {copied ? <Check size={16} weight="regular" /> : <Copy size={16} weight="regular" />}
          </button>
        </span>
      </div>
    </section>
  )
})
