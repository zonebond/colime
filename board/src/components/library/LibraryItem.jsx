import styles from './LibraryItem.module.css'

function formatRelativeTime(timestamp, t) {
  if (!timestamp) return ''
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t('chats.justNow')
  if (minutes < 60) return `${minutes}${t('chats.minutesAgo')}`
  if (hours < 24) return `${hours}${t('chats.hoursAgo')}`
  return `${days}${t('chats.daysAgo')}`
}

export default function LibraryItem({ document, onClick, onDelete, t }) {
  const relativeTime = formatRelativeTime(document.updatedAt, t)

  const handleClick = () => {
    onClick(document)
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    onDelete(document.id)
  }

  return (
    <div className={styles.card} onClick={handleClick}>
      <div className={styles.content}>
        <div className={styles.header}>
          <svg className={styles.docIcon} width="18" height="18" viewBox="0 0 256 256" fill="currentColor">
            <path d="M213.66,82.34l-56-56A8,8,0,0,0,152,24H56A16,16,0,0,0,40,40V216a16,16,0,0,0,16,16H200a16,16,0,0,0,16-16V88A8,8,0,0,0,213.66,82.34ZM160,51.31,188.69,80H160ZM200,216H56V40h88V88a8,8,0,0,0,8,8h48V216Zm-42.34-77.66a8,8,0,0,1-11.32,11.32L136,139.31V184a8,8,0,0,1-16,0V139.31l-10.34,10.35a8,8,0,0,1-11.32-11.32l24-24a8,8,0,0,1,11.32,0Z" />
          </svg>
          <span className={styles.title}>{document.title}</span>
        </div>

        <p className={styles.preview}>
          {document.content.slice(0, 120).replace(/[#*`]/g, '')}
          {document.content.length > 120 ? '...' : ''}
        </p>

        <div className={styles.meta}>
          {document.tags && document.tags.length > 0 && (
            <div className={styles.tags}>
              {document.tags.slice(0, 3).map((tag) => (
                <span key={tag} className={styles.tag}>{tag}</span>
              ))}
              {document.tags.length > 3 && (
                <span className={styles.tagMore}>+{document.tags.length - 3}</span>
              )}
            </div>
          )}
          {relativeTime && (
            <span className={styles.date}>
              <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
              </svg>
              {relativeTime}
            </span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={handleDeleteClick} title={t('library.delete')}>
          <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
            <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
