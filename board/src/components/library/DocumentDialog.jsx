import { useEffect, useRef, useState } from 'react'
import styles from './DocumentDialog.module.css'

export default function DocumentDialog({
  title,
  document,
  onConfirm,
  onCancel,
  cancelText = 'Cancel',
  confirmText = 'Save',
  pendingText = 'Saving...',
  isSubmitting = false,
  t,
}) {
  const [nextTitle, setNextTitle] = useState(document?.title || '')
  const [nextContent, setNextContent] = useState(document?.content || '')
  const [nextTags, setNextTags] = useState(document?.tags?.join(', ') || '')
  const titleInputRef = useRef(null)

  useEffect(() => {
    titleInputRef.current?.focus()
  }, [])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!nextTitle.trim()) return

    const tags = nextTags
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean)

    onConfirm({
      title: nextTitle.trim(),
      content: nextContent.trim(),
      tags,
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
              <label className={styles.label} htmlFor="doc-title">{t('library.titleLabel')}</label>
              <input
                id="doc-title"
                ref={titleInputRef}
                type="text"
                className={styles.titleInput}
                value={nextTitle}
                onChange={(event) => setNextTitle(event.target.value)}
                placeholder={t('library.titlePlaceholder')}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="doc-content">{t('library.contentLabel')}</label>
              <textarea
                id="doc-content"
                className={styles.contentInput}
                value={nextContent}
                onChange={(event) => setNextContent(event.target.value)}
                placeholder={t('library.contentPlaceholder')}
                rows={12}
                disabled={isSubmitting}
              />
            </div>

            <div className={styles.fieldset}>
              <label className={styles.label} htmlFor="doc-tags">{t('library.tagsLabel')}</label>
              <input
                id="doc-tags"
                type="text"
                className={styles.tagsInput}
                value={nextTags}
                onChange={(event) => setNextTags(event.target.value)}
                placeholder={t('library.tagsPlaceholder')}
                disabled={isSubmitting}
              />
              <span className={styles.hint}>{t('library.tagsHint')}</span>
            </div>
          </div>

          <div className={styles.footer}>
            <div className={styles.actions}>
              <button type="button" className={styles.cancelBtn} onClick={onCancel} disabled={isSubmitting}>
                {cancelText}
              </button>
              <button type="submit" className={styles.confirmBtn} disabled={!nextTitle.trim() || isSubmitting}>
                {isSubmitting ? pendingText : confirmText}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
