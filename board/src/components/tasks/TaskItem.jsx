import styles from './TaskItem.module.css'

const STATUS_COLORS = {
  scheduled: 'var(--icon-c)',
  running: 'var(--warning)',
  paused: 'var(--txt3)',
  completed: 'var(--success)',
  failed: 'var(--danger)',
}

const TYPE_LABELS = {
  cron: 'Cron',
  once: 'Once',
  interval: 'Interval',
}

function formatNextRun(timestamp) {
  if (!timestamp) return null
  const diff = timestamp - Date.now()
  if (diff < 0) return { text: 'Overdue', overdue: true }

  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return { text: 'Less than 1 min', overdue: false }
  if (minutes < 60) return { text: `${minutes}m`, overdue: false }
  if (hours < 24) return { text: `${hours}h`, overdue: false }
  return { text: `${days}d`, overdue: false }
}

function formatDatetime(timestamp) {
  if (!timestamp) return null
  const date = new Date(timestamp)
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function TaskItem({ task, onTogglePause, onTrigger, onEdit, onDelete, t }) {
  const statusColor = STATUS_COLORS[task.status] || STATUS_COLORS.scheduled
  const nextRun = formatNextRun(task.nextRunAt)

  const getScheduleText = () => {
    if (task.type === 'cron' && task.cronExpression) {
      return task.cronExpression
    }
    if (task.type === 'interval' && task.intervalMs) {
      const minutes = Math.floor(task.intervalMs / 60000)
      return `Every ${minutes}m`
    }
    if (task.type === 'once' && task.scheduledAt) {
      return formatDatetime(task.scheduledAt)
    }
    return null
  }

  const handlePauseClick = (e) => {
    e.stopPropagation()
    onTogglePause(task.id)
  }

  const handleTriggerClick = (e) => {
    e.stopPropagation()
    onTrigger(task.id)
  }

  const handleEditClick = (e) => {
    e.stopPropagation()
    onEdit(task)
  }

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    onDelete(task.id)
  }

  const isRunning = task.status === 'running'
  const isPaused = task.status === 'paused'
  const isCompleted = task.status === 'completed'

  return (
    <div className={`${styles.card} ${isRunning ? styles.running : ''} ${isPaused ? styles.paused : ''}`}>
      <div className={styles.content} onClick={handleEditClick}>
        <div className={styles.header}>
          <span className={styles.name}>{task.name}</span>
          <span className={styles.typeBadge}>{TYPE_LABELS[task.type] || task.type}</span>
          <span
            className={styles.statusBadge}
            style={{ background: statusColor }}
          >
            {t(`tasks.status.${task.status}`)}
          </span>
        </div>

        {task.description && (
          <p className={styles.description}>{task.description}</p>
        )}

        <div className={styles.meta}>
          {getScheduleText() && (
            <span className={styles.metaItem}>
              <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
              </svg>
              <code>{getScheduleText()}</code>
            </span>
          )}

          {task.timezone && task.type === 'cron' && (
            <span className={styles.metaItem}>
              <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm88,104a87.62,87.62,0,0,1-5.2,30.6L176,139.59V112a80,80,0,0,0-160,0v27.59L40.2,158.6A87.62,87.62,0,0,1,35,128,88,88,0,0,1,128,40a87.65,87.65,0,0,1,88,88Z" />
              </svg>
              {task.timezone}
            </span>
          )}

          {nextRun && (
            <span className={`${styles.metaItem} ${nextRun.overdue ? styles.overdue : ''}`}>
              <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
              </svg>
              {isPaused ? 'Paused' : nextRun.text}
            </span>
          )}

          {task.lastRunAt && (
            <span className={`${styles.metaItem} ${task.lastRunStatus === 'failed' ? styles.failed : ''}`}>
              {task.lastRunStatus === 'completed' && (
                <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm45.66,85.66-56,56a8,8,0,0,1-11.32,0l-24-24a8,8,0,0,1,11.32-11.32L112,148.69l50.34-50.35a8,8,0,0,1,11.32,11.32Z" />
                </svg>
              )}
              {task.lastRunStatus === 'failed' && (
                <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm37.66,130.34a8,8,0,0,1-11.32,11.32L128,139.31l-26.34,26.35a8,8,0,0,1-11.32-11.32L116.69,128,90.34,101.66a8,8,0,0,1,11.32-11.32L128,116.69l26.34-26.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                </svg>
              )}
              {task.lastRunStatus === 'running' && (
                <svg width="12" height="12" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm64-88a8,8,0,0,1-8,8H128a8,8,0,0,1-8-8V72a8,8,0,0,1,16,0v48h48A8,8,0,0,1,192,128Z" />
                </svg>
              )}
              Last: {formatDatetime(task.lastRunAt)}
            </span>
          )}
        </div>
      </div>

      <div className={styles.actions}>
        {!isCompleted && (
          <button
            className={`${styles.actionBtn} ${styles.pauseBtn}`}
            onClick={handlePauseClick}
            title={isPaused ? t('tasks.resume') : t('tasks.pause')}
          >
            {isPaused ? (
              <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                <path d="M232,128a8,8,0,0,1-8,8H64a8,8,0,0,1,0-16H224A8,8,0,0,1,232,128Zm-16-88V216a16,16,0,0,1-16,16H80a16,16,0,0,1-16-16V40A16,16,0,0,1,80,24h64a16,16,0,0,1,16,16ZM176,64H112V192h64Z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                <path d="M216,48H40A16,16,0,0,0,24,64V192a16,16,0,0,0,16,16H216a16,16,0,0,0,16-16V64A16,16,0,0,0,216,48ZM40,64H216v88H40ZM216,192H40V168H216v24Zm-16-48a8,8,0,0,1-8,8H128a8,8,0,0,1,0-16h64A8,8,0,0,1,200,144Z" />
              </svg>
            )}
          </button>
        )}

        {!isRunning && !isCompleted && (
          <button
            className={`${styles.actionBtn} ${styles.triggerBtn}`}
            onClick={handleTriggerClick}
            title={t('tasks.runNow')}
          >
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
              <path d="M232,128a8,8,0,0,1-8,8H48a8,8,0,0,1,0-16H224A8,8,0,0,1,232,128ZM128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Zm-16-88a8,8,0,0,1-8,8H96a8,8,0,0,1,0-16h8A8,8,0,0,1,112,128Z" />
            </svg>
          </button>
        )}

        <button className={styles.actionBtn} onClick={handleEditClick} title={t('tasks.edit')}>
          <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
            <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120Z" />
          </svg>
        </button>

        <button className={`${styles.actionBtn} ${styles.deleteBtn}`} onClick={handleDeleteClick} title={t('tasks.delete')}>
          <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
            <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
          </svg>
        </button>
      </div>
    </div>
  )
}
