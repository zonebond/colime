import { memo, useState } from 'react'
import { X, Warning, Lightning } from '@phosphor-icons/react'
import styles from './ToolConfirmCard.module.css'

const ToolConfirmCard = memo(function ToolConfirmCard({ tool, onConfirm, onDeny, onClose }) {
  const [isClosing, setIsClosing] = useState(false)

  if (!tool) return null

  const { toolName, toolInput, isReadOnly, isDestructive } = tool

  const handleClose = () => {
    setIsClosing(true)
    setTimeout(() => {
      onClose?.()
    }, 200)
  }

  const handleDeny = () => {
    setIsClosing(true)
    setTimeout(() => {
      onDeny?.()
    }, 200)
  }

  const handleAllowOnce = () => {
    setIsClosing(true)
    setTimeout(() => {
      onConfirm?.('allow')
    }, 200)
  }

  const handleAlwaysAllow = () => {
    setIsClosing(true)
    setTimeout(() => {
      onConfirm?.('always')
    }, 200)
  }

  // Parse tool input for display
  const getToolInputDisplay = () => {
    if (!toolInput) return null
    try {
      const parsed = JSON.parse(toolInput)
      // For bash, show the command
      if (parsed.command) {
        return parsed.command
      }
      // For other tools, show formatted JSON
      return JSON.stringify(parsed, null, 2)
    } catch {
      return toolInput
    }
  }

  const inputDisplay = getToolInputDisplay()

  return (
    <div className={`${styles.card} ${isClosing ? styles.cardClosing : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.iconWrap}>
            <Lightning size={18} weight="fill" />
          </div>
          <div className={styles.headerText}>
            <div className={styles.title}>{toolName || 'Tool'}</div>
            <div className={styles.subtitle}>needs your permission to run</div>
          </div>
        </div>
        <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Close">
          <X size={16} weight="bold" />
        </button>
      </div>

      {inputDisplay && (
        <div className={styles.content}>
          <div className={styles.inputLabel}>Command</div>
          <pre className={styles.inputCode}>{inputDisplay}</pre>
        </div>
      )}

      {isDestructive && (
        <div className={styles.warning}>
          <Warning size={14} weight="fill" />
          <span>This tool modifies files</span>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={styles.denyBtn} onClick={handleDeny}>
          Deny
        </button>
        <button type="button" className={styles.allowOnceBtn} onClick={handleAllowOnce}>
          Allow Once
        </button>
        <button type="button" className={styles.alwaysAllowBtn} onClick={handleAlwaysAllow}>
          Always Allow
        </button>
      </div>
    </div>
  )
})

export default ToolConfirmCard
