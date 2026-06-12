import { useEffect, useRef, useState } from 'react'
import styles from './McpServerDialog.module.css'

export default function McpServerDialog({
  title,
  server,
  onConfirm,
  onCancel,
  cancelText = 'Cancel',
  confirmText = 'Save',
  pendingText = 'Saving...',
  isSubmitting = false,
  t,
}) {
  const [nextName, setNextName] = useState(server?.name || '')
  const [nextDescription, setNextDescription] = useState(server?.description || '')
  const [nextCommand, setNextCommand] = useState(server?.command || '')
  const [nextArgs, setNextArgs] = useState(server?.args?.join('\n') || '')
  const nameInputRef = useRef(null)

  useEffect(() => {
    nameInputRef.current?.focus()
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!nextName.trim()) return

    const args = nextArgs
      .split('\n')
      .map((arg) => arg.trim())
      .filter(Boolean)

    onConfirm({
      name: nextName.trim(),
      description: nextDescription.trim(),
      command: nextCommand.trim(),
      args,
    })
  }

  return (
    <div className={styles.overlay} onClick={isSubmitting ? undefined : onCancel}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
        </div>
        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.body}>
            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="mcp-name">{t('toolbox.nameLabel')}</label>
              <input
                id="mcp-name"
                ref={nameInputRef}
                type="text"
                className={styles.input}
                value={nextName}
                onChange={(event) => setNextName(event.target.value)}
                placeholder={t('toolbox.namePlaceholder')}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="mcp-description">{t('toolbox.descriptionLabel')}</label>
              <textarea
                id="mcp-description"
                className={styles.textarea}
                value={nextDescription}
                onChange={(event) => setNextDescription(event.target.value)}
                placeholder={t('toolbox.descriptionPlaceholder')}
                rows={2}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="mcp-command">{t('toolbox.commandLabel')}</label>
              <input
                id="mcp-command"
                type="text"
                className={styles.input}
                value={nextCommand}
                onChange={(event) => setNextCommand(event.target.value)}
                placeholder="npx @modelcontextprotocol/server-github"
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="mcp-args">{t('toolbox.argsLabel')}</label>
              <textarea
                id="mcp-args"
                className={styles.textarea}
                value={nextArgs}
                onChange={(event) => setNextArgs(event.target.value)}
                placeholder={t('toolbox.argsPlaceholder')}
                rows={3}
                disabled={isSubmitting}
              />
              <span className={styles.hint}>{t('toolbox.argsHint')}</span>
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
    </div>
  )
}
