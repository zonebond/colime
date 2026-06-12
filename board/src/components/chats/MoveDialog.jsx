import { createPortal } from 'react-dom'
import { useState, useMemo, useEffect, useRef } from 'react'
import { IconProjects, IconPlus, IconX } from '@/components/icons'
import { useProjectsModel } from '@/features/projects/projects.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import MovingIndicator from '@/components/MovingIndicator'
import styles from './MoveDialog.module.css'

export default function MoveDialog({
  onMove,
  onCancel,
  t,
  count = 1,
  title,
  description,
  excludeProjectIds = [],
}) {
  const [search, setSearch] = useState('')
  const [isMoving, setIsMoving] = useState(false)
  const [showCancelHint, setShowCancelHint] = useState(false)
  const [cancelTimer, setCancelTimer] = useState(null)
  const [isCancelDisabled, setIsCancelDisabled] = useState(false)
  const { projects } = useProjectsModel()

  const moveTimerRef = useRef(null)
  const pendingProjectRef = useRef(null)
  const {
    value: searchDraft,
    handleChange: handleSearchChange,
    handleCompositionStart: handleSearchCompositionStart,
    handleCompositionEnd: handleSearchCompositionEnd,
  } = useImeSafeInput({ value: search, onCommit: setSearch, debounceMs: 160 })

  useEffect(() => {
    if (!isMoving) return undefined

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        if (showCancelHint) {
          clearTimeout(moveTimerRef.current)
          setIsMoving(false)
          setShowCancelHint(false)
          setCancelTimer(null)
        } else {
          setShowCancelHint(true)
          const timer = setTimeout(() => {
            setShowCancelHint(false)
            setCancelTimer(null)
          }, 2000)
          setCancelTimer(timer)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isMoving, showCancelHint])

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const excluded = new Set(excludeProjectIds)
    const availableProjects = projects.filter((project) => !excluded.has(project.id))

    if (!q) return availableProjects
    return availableProjects.filter((project) => project.name.toLowerCase().includes(q))
  }, [excludeProjectIds, projects, search])

  // Get excluded projects that match the search term
  const excludedMatching = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return projects.filter(
      (p) => excludeProjectIds.includes(p.id) && p.name.toLowerCase().includes(q)
    )
  }, [excludeProjectIds, projects, search])

  const dialogTitle = title || t.moveDialogTitle
  const defaultDescription = description || t.moveDialogDefaultDesc
  const dialogDescription = count > 1
    ? `Moving ${count} chats to project`
    : defaultDescription

  const showCreate = search.trim() && filtered.length === 0 && excludedMatching.length === 0

  const handleMove = (projectId) => {
    pendingProjectRef.current = projectId
    setIsMoving(true)
    setShowCancelHint(false)
    setIsCancelDisabled(true)

    if (cancelTimer) {
      clearTimeout(cancelTimer)
      setCancelTimer(null)
    }

    setTimeout(() => {
      setIsCancelDisabled(false)
    }, 400)

    moveTimerRef.current = setTimeout(() => {
      onMove(pendingProjectRef.current)
    }, 4000)
  }

  const handleCancelMove = () => {
    clearTimeout(moveTimerRef.current)
    setIsMoving(false)
    setShowCancelHint(false)
    setIsCancelDisabled(false)
    if (cancelTimer) {
      clearTimeout(cancelTimer)
      setCancelTimer(null)
    }
  }

  return createPortal(
    <div className={styles.overlay} onClick={isMoving ? undefined : onCancel}>
      <div className={styles.dialog} onClick={(event) => event.stopPropagation()}>
        <div className={styles.header}>
          <h2 className={styles.title}>{dialogTitle}</h2>
          {isMoving ? (
            <button
              className={`${styles.cancelBtn} ${showCancelHint ? styles.canceling : ''}`}
              onClick={handleCancelMove}
              disabled={isCancelDisabled}
            >
              {showCancelHint ? (
                <svg className={styles.cancelCircle} viewBox="0 0 36 36">
                  <circle
                    className={styles.cancelCircleBg}
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    strokeWidth="5"
                  />
                  <circle
                    className={styles.cancelCircleFill}
                    cx="18"
                    cy="18"
                    r="15"
                    fill="none"
                    strokeWidth="5"
                    strokeDasharray="94.2"
                    strokeDashoffset="0"
                  />
                </svg>
              ) : (
                <span className={styles.stopBtnText}>{t.moveDialogStop} <span className={styles.escHint}>ESC</span></span>
              )}
            </button>
          ) : (
            <button className={styles.closeBtn} onClick={onCancel} data-tooltip={t.cancel} aria-label={t.cancel}>
              <IconX />
            </button>
          )}
        </div>
        <p className={styles.desc}>
          {showCancelHint
            ? <><span className={styles.descBold}>ESC</span> {t.moveDialogCancelConfirm}</>
            : isMoving
              ? t.moveDialogMoving
              : dialogDescription}
        </p>

        {isMoving ? (
          <div className={styles.movingIndicator}>
            <MovingIndicator size={32} label={t.moveDialogMoving} delay={400} />
            <div className={styles.progressBar}>
              <div className={styles.progressFill} />
            </div>
          </div>
        ) : (
          <>
            <div className={styles.searchWrap}>
              <div className={styles.searchIcon}>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M8.5 2a6.5 6.5 0 0 1 4.935 10.728l4.419 4.419.064.078a.5.5 0 0 1-.693.693l-.079-.064-4.419-4.42A6.5 6.5 0 1 1 8.5 2m0 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11" />
                </svg>
              </div>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={t.moveDialogSearchPlaceholder}
                value={searchDraft}
                onChange={handleSearchChange}
                onCompositionStart={handleSearchCompositionStart}
                onCompositionEnd={handleSearchCompositionEnd}
                autoFocus
              />
            </div>

            <div className={styles.projectList}>
              {filtered.map((project) => (
                <button
                  key={project.id}
                  className={styles.projectItem}
                  onClick={() => handleMove(project.id)}
                >
                  <IconProjects className={styles.projectIcon} />
                  <span className={styles.projectName}>{project.name}</span>
                </button>
              ))}

              {excludedMatching.map((project) => (
                <button
                  key={project.id}
                  className={`${styles.projectItem} ${styles.projectItemDisabled}`}
                  disabled
                >
                  <IconProjects className={styles.projectIcon} />
                  <span className={styles.projectName}>{project.name}</span>
                  <span className={styles.projectItemCurrent}>Current</span>
                </button>
              ))}

              {showCreate && (
                <button
                  className={styles.projectItem}
                  onClick={() => handleMove(search.trim())}
                >
                  <span className={styles.createIcon}>
                    <IconPlus />
                  </span>
                  <span className={styles.createLabel}>{t.moveDialogCreateProject}</span>
                  <span className={styles.createBadge}>
                    <span className={styles.createBadgeIcon}>
                      <IconProjects />
                    </span>
                    <span className={styles.createBadgeText}>{search.trim()}</span>
                  </span>
                </button>
              )}

              {!search.trim() && filtered.length === 0 && !showCreate && (
                <div className={styles.emptyState}>
                  <IconProjects className={styles.emptyStateIcon} />
                  <span className={styles.emptyStateTitle}>{t.moveDialogEmptyTitle}</span>
                  <span className={styles.emptyStateDesc}>{t.moveDialogEmptyDesc}</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
