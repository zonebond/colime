import { useState, useRef, useEffect, useMemo } from 'react'
import { IconStar, IconArchive, IconTrash, IconMore, IconRename, IconAddToProject, IconRemoveFromProject, IconSelect, IconProjects } from '@/components/icons'
import { Subtract } from '@phosphor-icons/react'
import { useProjectsModel } from '@/features/projects/projects.hooks'
import ConfirmDialog from './ConfirmDialog'
import styles from './ChatItem.module.css'
import { createPortal } from 'react-dom'

function relativeTime(timestamp, t) {
  const diff = Date.now() - timestamp
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return t.justNow
  if (minutes < 60) return `${minutes} ${t.minutesAgo}`
  if (hours < 24) return `${hours} ${t.hoursAgo}`
  return `${days} ${t.daysAgo}`
}

export default function ChatItem({ chat, index, isActive, selected, onSelect, onClick, onPin, onArchive, onRename, onAddToProject, onRemoveFromProject, onDelete, t }) {
  const [hovered, setHovered] = useState(false)
  const [badgeHovered, setBadgeHovered] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [showPopover, setShowPopover] = useState(false)
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 })
  const [popoverSide, setPopoverSide] = useState('down')
  const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 })
  const moreBtnRef = useRef(null)
  const badgeRef = useRef(null)
  const delay = Math.min(index * 40, 400)
  const { projects } = useProjectsModel()
  const project = useMemo(() => projects.find((p) => p.id === chat.projectId), [projects, chat.projectId])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (moreBtnRef.current && !moreBtnRef.current.contains(e.target)) {
        setShowPopover(false)
      }
    }
    if (showPopover) {
      document.addEventListener('mousedown', handleClickOutside)
    }
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showPopover])

  useEffect(() => {
    if (badgeHovered && badgeRef.current) {
      const rect = badgeRef.current.getBoundingClientRect()
      setTooltipPos({ top: rect.bottom, left: rect.left })
    }
  }, [badgeHovered])

  const handleDeleteClick = (e) => {
    e.stopPropagation()
    setShowPopover(false)
    setShowDeleteDialog(true)
  }

  const handleDeleteConfirm = () => {
    setShowDeleteDialog(false)
    onDelete(chat.id)
  }

  const handleMoreClick = (e) => {
    e.stopPropagation()
    if (!showPopover && moreBtnRef.current) {
      const rect = moreBtnRef.current.getBoundingClientRect()
      const popoverH = 280
      const spaceBelow = window.innerHeight - rect.bottom - 8
      const spaceAbove = rect.top - 8
      const side = spaceBelow < popoverH && spaceAbove > spaceBelow ? 'up' : 'down'
      setPopoverSide(side)
      setPopoverPos({
        // When opening up: use `bottom` so the popover's lower edge stays
        // exactly 4px above the trigger, regardless of actual height.
        // When opening down: use `top` anchored at rect.bottom + 4.
        top: side === 'down' ? Math.min(rect.bottom + 4, window.innerHeight - popoverH - 8) : undefined,
        bottom: side === 'up' ? window.innerHeight - rect.top + 4 : undefined,
        left: Math.min(rect.right - 140, window.innerWidth - 150),
      })
    }
    setShowPopover(!showPopover)
  }

  return (
    <div
      className={`${styles.item} ${isActive ? styles.active : ''} ${selected ? styles.selected : ''}`}
      style={{ animationDelay: `${delay}ms` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className={`${styles.checkWrap} ${hovered || selected ? styles.checkVisible : ''}`}>
        {!chat._parentID && (
          <input
            type="checkbox"
            className={styles.checkInput}
            checked={selected}
            onChange={() => onSelect(chat.id)}
          />
        )}
      </div>

      <div
        className={`${styles.content} ${chat.isPinned ? styles.starred : ''}`}
        onClick={() => onClick(chat.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && onClick(chat.id)}
      >
        <div className={styles.text}>
          <div className={styles.titleRow}>
            <span className={styles.title}>
              {chat._parentID && <Subtract size={12} weight="bold" className={styles.subIcon} />}
              {chat.title}
            </span>
            {chat.isPinned && (
              <span className={styles.pinBadge}>
                <IconStar active />
              </span>
            )}
          </div>
          <span className={styles.preview}>{chat.preview}</span>
          <div className={styles.bottomRow}>
            <div className={styles.bottomLeft}>
              {project && (
                <span
                  className={styles.projectBadge}
                  ref={badgeRef}
                  onMouseEnter={() => setBadgeHovered(true)}
                  onMouseLeave={() => setBadgeHovered(false)}
                >
                  <IconProjects />
                  {badgeHovered && createPortal(
                    <span className={styles.tooltip} style={{ top: tooltipPos.top, left: tooltipPos.left }}>
                      {project.name}
                    </span>,
                    document.body
                  )}
                </span>
              )}
              <span className={styles.time}>{relativeTime(chat.lastActiveAt, t)}</span>
            </div>
            <div className={`${styles.actions} ${hovered && !chat._parentID ? styles.actionsVisible : ''}`}>
              {!chat._parentID && (
                <button
                  ref={moreBtnRef}
                  className={styles.moreBtn}
                  onClick={handleMoreClick}
                >
                  <IconMore />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
      {showPopover && createPortal(
        <>
          <div
            className={styles.popoverBackdrop}
            onClick={() => setShowPopover(false)}
          />
          <div
            className={`${styles.popover} ${popoverSide === 'up' ? styles.popoverUp : ''}`}
            style={{ top: popoverPos.top, bottom: popoverPos.bottom, left: popoverPos.left }}
            onMouseDown={(e) => e.stopPropagation()}
          >
          <button
            className={styles.popoverItem}
            onClick={(e) => { e.stopPropagation(); onSelect(chat.id); setShowPopover(false) }}
          >
            <IconSelect />
            <span>{t.select}</span>
          </button>
          <button
            className={styles.popoverItem}
            onClick={(e) => { e.stopPropagation(); onRename(chat.id); setShowPopover(false) }}
          >
            <IconRename />
            <span>{t.rename}</span>
          </button>
          {chat.projectId ? (
            <>
              <button
                className={styles.popoverItem}
                onClick={(e) => { e.stopPropagation(); onAddToProject(chat.id); setShowPopover(false) }}
              >
                <IconAddToProject />
                <span>{t.changeProject}</span>
              </button>
              <button
                className={styles.popoverItem}
                onClick={(e) => { e.stopPropagation(); onRemoveFromProject(chat.id); setShowPopover(false) }}
              >
                <IconRemoveFromProject />
                <span>{t.removeFromProject}</span>
              </button>
            </>
          ) : (
            <button
              className={styles.popoverItem}
              onClick={(e) => { e.stopPropagation(); onAddToProject(chat.id); setShowPopover(false) }}
            >
              <IconAddToProject />
              <span>{t.addToProject}</span>
            </button>
          )}
          <div className={styles.popoverDivider} />
          <button
            className={`${styles.popoverItem} ${chat.isPinned ? styles.popoverItemActive : ''}`}
            onClick={(e) => { e.stopPropagation(); onPin(chat.id); setShowPopover(false) }}
          >
            <IconStar active={chat.isPinned} />
            <span>{chat.isPinned ? t.unstar : t.star}</span>
          </button>
          <button
            className={styles.popoverItem}
            onClick={(e) => { e.stopPropagation(); onArchive(chat.id); setShowPopover(false) }}
          >
            <IconArchive />
            <span>{t.archive}</span>
          </button>
          <button
            className={`${styles.popoverItem} ${styles.popoverDelete}`}
            onClick={handleDeleteClick}
          >
            <IconTrash />
            <span>{t.delete}</span>
          </button>
        </div>
        </>,
        document.body
      )}
      {showDeleteDialog && (
        <ConfirmDialog
          title={t.deleteConfirmTitle.replace('{count}', '1').replace('{sCount}', '')}
          description={t.deleteConfirmDesc}
          confirmText={t.delete}
          cancelText={t.cancel}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setShowDeleteDialog(false)}
        />
      )}
    </div>
  )
}