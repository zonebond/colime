import { CircleNotch } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import styles from './ResetDialog.module.css'

export default function ResetDialog({
  open,
  onClose,
  onConfirm,
  isReverting,
  revertError,
  title,
  description,
  cancelText,
  confirmText,
  resettingText,
}) {
  if (!open) return null

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.desc}>{description}</p>
        {revertError && <p className={styles.error}>{revertError}</p>}
        <div className={styles.actions}>
          <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={isReverting}>
            {cancelText}
          </button>
          <button type="button" className={styles.confirmBtn} onClick={onConfirm} disabled={isReverting}>
            {isReverting ? (
              <>
                <CircleNotch size={14} weight="bold" className={styles.spinner} />
                {resettingText}
              </>
            ) : (
              confirmText
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
