import { createPortal } from 'react-dom'
import { useEffect, useRef, useState } from 'react'
import styles from './EditDetailsDialog.module.css'

export default function EditDetailsDialog({
  title,
  nameValue,
  descriptionValue,
  permissionsValue = {},
  nameLabel,
  descriptionLabel,
  namePlaceholder,
  descriptionPlaceholder,
  onConfirm,
  onCancel,
  cancelText = 'Cancel',
  confirmText = 'Confirm',
  pendingText = 'Saving...',
  isSubmitting = false,
}) {
  const [nextName, setNextName] = useState(nameValue)
  const [nextDescription, setNextDescription] = useState(descriptionValue)
  const [nextPermissions, setNextPermissions] = useState({
    bash: permissionsValue.bash || 'ask',
    write: permissionsValue.write || 'ask',
  })
  const nameInputRef = useRef(null)

  useEffect(() => {
    nameInputRef.current?.focus()
    nameInputRef.current?.select()
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!nextName.trim()) return

    onConfirm({
      name: nextName.trim(),
      description: nextDescription.trim(),
      permissions: nextPermissions,
    })
  }

  return createPortal(
    <div className={styles.overlay} onClick={isSubmitting ? undefined : onCancel}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="project-edit-name">{nameLabel}</label>
              <input
                id="project-edit-name"
                ref={nameInputRef}
                type="text"
                className={styles.nameInput}
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                placeholder={namePlaceholder}
                disabled={isSubmitting}
              />
            </div>
            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="project-edit-description">{descriptionLabel}</label>
              <textarea
                id="project-edit-description"
                className={styles.descriptionInput}
                value={nextDescription}
                onChange={(event) => setNextDescription(event.target.value)}
                placeholder={descriptionPlaceholder}
                rows={5}
                disabled={isSubmitting}
              />
            </div>
            <div className={styles.fieldset}>
              <label className={styles.label}>Permissions</label>
              <div className={styles.permissionsGroup}>
                <div className={styles.permissionItem}>
                  <label htmlFor="permission-bash">Bash command</label>
                  <select
                    id="permission-bash"
                    value={nextPermissions.bash}
                    onChange={(e) => setNextPermissions(prev => ({ ...prev, bash: e.target.value }))}
                    disabled={isSubmitting}
                  >
                    <option value="allow">Allow</option>
                    <option value="ask">Ask</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
                <div className={styles.permissionItem}>
                  <label htmlFor="permission-write">Write file</label>
                  <select
                    id="permission-write"
                    value={nextPermissions.write}
                    onChange={(e) => setNextPermissions(prev => ({ ...prev, write: e.target.value }))}
                    disabled={isSubmitting}
                  >
                    <option value="allow">Allow</option>
                    <option value="ask">Ask</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
          <div className={styles.footer}>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
                {cancelText}
              </button>
              <button type="submit" className={styles.confirmBtn} disabled={!nextName.trim() || isSubmitting}>
                {isSubmitting ? pendingText : confirmText}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  )
}
