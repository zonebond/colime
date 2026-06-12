import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { IconArchive, IconMore, IconRename, IconStar, IconTrash } from '@/components/icons'
import styles from './ProjectItem.module.css'

function relativeTime(timestamp, t) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t.justNow || 'Just now'
  if (minutes < 60) return `${minutes} ${t.minutesAgo || 'm ago'}`
  if (hours < 24) return `${hours} ${t.hoursAgo || 'h ago'}`
  return `${days} ${t.daysAgo || 'd ago'}`
}

function getPopoverPosition(rect, menuWidth, menuHeight) {
  const viewportPadding = 12
  const gap = 4
  const left = Math.max(
    viewportPadding,
    Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - viewportPadding)
  )
  const openUp = rect.bottom + gap + menuHeight > window.innerHeight - viewportPadding
    && rect.top - gap - menuHeight >= viewportPadding

  return {
    left,
    top: openUp
      ? rect.top - gap - menuHeight
      : Math.min(rect.bottom + gap, window.innerHeight - menuHeight - viewportPadding),
    side: openUp ? 'top' : 'bottom',
  }
}

export default function ProjectItem({ project, index, onClick, onEditDetails, onArchive, onToggleStar, onDelete, t }) {
  const [showPopover, setShowPopover] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0, side: 'bottom' })
  const moreBtnRef = useRef(null)
  const delay = Math.min(index * 40, 400)

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (moreBtnRef.current && !moreBtnRef.current.contains(event.target)) {
        setShowPopover(false)
      }
    }

    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPopover])

  const handleMoreClick = (event) => {
    event.stopPropagation()
    if (!showPopover && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect()
      setPopoverPos(getPopoverPosition(rect, 140, 164))
    }
    setShowPopover((current) => !current)
  }

  return (
    <div
      className={styles.item}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div
        className={styles.content}
        onClick={() => onClick(project.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => event.key === 'Enter' && onClick(project.id)}
      >
        <div className={styles.text}>
          <div className={styles.titleRow}>
            <span className={styles.title}>{project.name}</span>
            <button
              type="button"
              className={`${styles.starBtn} ${project.isStarred ? styles.starBtnActive : ''}`}
              onClick={(e) => { e.stopPropagation(); onToggleStar(project.id, !project.isStarred) }}
              title={project.isStarred ? (t.unstarProject || 'Unstar') : (t.starProject || 'Star')}
            >
              <IconStar active={project.isStarred} className={project.isStarred ? styles.starActive : styles.starInactive} />
            </button>
          </div>
          <span className={styles.preview}>{project.description || ' '}</span>
          <span className={styles.time}>{t.updated} {relativeTime(project.updatedAt, t)}</span>
        </div>

        <div className={`${styles.actions} ${showPopover ? styles.actionsOpen : ''}`}>
          <button
            ref={moreBtnRef}
            className={styles.moreBtn}
            onClick={handleMoreClick}
            aria-label={`More options for ${project.name}`}
          >
            <IconMore />
          </button>
        </div>
      </div>

      {showPopover && createPortal(
        <>
          <div className={styles.popoverBackdrop} onClick={() => setShowPopover(false)} />
          <div
            className={styles.popover}
            data-side={popoverPos.side}
            style={{ top: popoverPos.top, left: popoverPos.left }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              className={`${styles.popoverItem} ${project.isStarred ? styles.popoverItemActive : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onToggleStar(project.id, !project.isStarred)
                setShowPopover(false)
              }}
            >
              <IconStar active={project.isStarred} />
              <span>{t.star}</span>
            </button>
            <button
                className={styles.popoverItem}
                onClick={(event) => {
                  event.stopPropagation()
                  onEditDetails(project.id)
                  setShowPopover(false)
                }}
              >
                <IconRename />
                <span>{t.editDetails}</span>
              </button>
            <div className={styles.popoverDivider} />
            <button
              className={styles.popoverItem}
              onClick={(event) => {
                event.stopPropagation()
                onArchive(project.id)
                setShowPopover(false)
              }}
            >
              <IconArchive />
              <span>{t.archive}</span>
            </button>
            <button
              className={`${styles.popoverItem} ${styles.popoverDelete}`}
              onClick={(event) => {
                event.stopPropagation()
                onDelete(project.id)
                setShowPopover(false)
              }}
            >
              <IconTrash />
              <span>{t.delete}</span>
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
