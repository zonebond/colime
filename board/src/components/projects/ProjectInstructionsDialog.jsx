import { createPortal } from 'react-dom'
import { useEffect, useMemo, useRef, useState } from 'react'
import styles from './ProjectInstructionsDialog.module.css'

export default function ProjectInstructionsDialog({
  title,
  description,
  value,
  placeholder,
  placeholderRotations = [],
  onChange,
  onSave,
  onCancel,
  cancelText,
  confirmText,
  pendingText,
  isSubmitting = false,
}) {
  const textareaRef = useRef(null)
  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const [placeholderVisible, setPlaceholderVisible] = useState(true)

  const placeholderMessages = useMemo(() => {
    const messages = placeholderRotations.filter(Boolean)
    return messages.length > 0 ? messages : [placeholder]
  }, [placeholder, placeholderRotations])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  useEffect(() => {
    if (value.trim() || placeholderMessages.length <= 1) {
      setPlaceholderVisible(true)
      setPlaceholderIndex(0)
      return undefined
    }

    let swapTimer = null
    const interval = window.setInterval(() => {
      setPlaceholderVisible(false)
      swapTimer = window.setTimeout(() => {
        setPlaceholderIndex((current) => (current + 1) % placeholderMessages.length)
        setPlaceholderVisible(true)
      }, 180)
    }, 2800)

    return () => {
      window.clearInterval(interval)
      window.clearTimeout(swapTimer)
    }
  }, [placeholderMessages, value])

  return createPortal(
    <div className={styles.overlay} onClick={isSubmitting ? undefined : onCancel}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <p className={styles.description}>{description}</p>
        </div>

        <div className={styles.body}>
          <div className={styles.textareaWrap}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={value}
              onChange={(event) => onChange(event.target.value)}
              placeholder=""
              rows={16}
              aria-label={title}
              disabled={isSubmitting}
            />
            {!value.trim() ? (
              <div className={styles.textareaPlaceholder} aria-hidden="true">
                <p className={`${styles.textareaPlaceholderText} ${placeholderVisible ? styles.textareaPlaceholderTextVisible : ''}`}>
                  {placeholderMessages[placeholderIndex]}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.secondaryBtn} onClick={onCancel} disabled={isSubmitting}>
            {cancelText}
          </button>
          <button type="button" className={styles.primaryBtn} onClick={onSave} disabled={isSubmitting}>
            {isSubmitting ? pendingText : confirmText}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
