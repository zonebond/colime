import { createPortal } from 'react-dom'
import { useState, useEffect, useRef } from 'react'
import styles from './RenameDialog.module.css'

export default function RenameDialog({ title, value, onConfirm, onCancel, cancelText = 'Cancel', confirmText = 'Confirm' }) {
  const [inputValue, setInputValue] = useState(value)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (inputValue.trim()) {
      onConfirm(inputValue.trim())
    }
  }

  return createPortal(
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            className={styles.input}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          <div className={styles.actions}>
            <button type="button" className={styles.cancelBtn} onClick={onCancel}>
              {cancelText}
            </button>
            <button type="submit" className={styles.confirmBtn} disabled={!inputValue.trim()}>
              {confirmText}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
