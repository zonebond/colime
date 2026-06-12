import { useEffect, useRef, useState } from 'react'
import { CaretDown, FileText, DownloadSimple } from '@phosphor-icons/react'
import { useCallback } from 'react'
import styles from './FileAccordion.module.css'

function splitPath(relativePath) {
  const lastSep = relativePath.lastIndexOf('/')
  if (lastSep === -1) return { dir: '', name: relativePath }
  return {
    dir: relativePath.slice(0, lastSep + 1),
    name: relativePath.slice(lastSep + 1),
  }
}

const CHANGE_LABELS = {
  add: 'Created',
  delete: 'Deleted',
  move: 'Moved',
  update: 'Modified',
}

/**
 * Reusable expandable file accordion with sticky header.
 * Used by apply_patch, write, and edit tool results.
 *
 * @param {Object} props
 * @param {string} props.filePath - relative path for display
 * @param {'add'|'update'|'delete'|'move'} [props.changeType]
 * @param {number} [props.additions]
 * @param {number} [props.deletions]
 * @param {boolean} [props.defaultExpanded]
 * @param {React.ReactNode} props.children - body content
 * @param {() => React.ReactNode} [props.renderActions] - extra actions in header
 * @param {string} [props.className]
 * @param {string} [props.directory] - session directory (used to derive sessionID for download URL)
 * @param {boolean} [props.contentTruncated] - true when preview content may be truncated
 */
export default function FileAccordion({
  filePath,
  changeType,
  additions = 0,
  deletions = 0,
  defaultExpanded = true,
  children,
  renderActions,
  className = '',
  directory = '',
  contentTruncated = false,
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showContent, setShowContent] = useState(defaultExpanded)
  const deferRef = useRef(null)

  useEffect(() => {
    if (!expanded) {
      setShowContent(false)
      if (deferRef.current) cancelAnimationFrame(deferRef.current)
      return
    }
    deferRef.current = requestAnimationFrame(() => {
      deferRef.current = requestAnimationFrame(() => {
        deferRef.current = null
        setShowContent(true)
      })
    })
    return () => {
      if (deferRef.current) cancelAnimationFrame(deferRef.current)
    }
  }, [expanded])

  const { dir, name } = splitPath(filePath)

  const handleDownload = useCallback((e) => {
    e.stopPropagation()
    const a = document.createElement('a')
    const params = new URLSearchParams({ path: filePath })
    // Extract sessionID from directory path (e.g. .../sessions/ses_xxx → ses_xxx)
    const sid = directory?.split('/sessions/')[1]?.split('/')[0]
    if (sid) params.set('sessionID', sid)
    a.href = `/ravens/file/download?${params.toString()}`
    a.download = name
    a.click()
  }, [filePath, name, directory])

  const changeLabel = changeType ? CHANGE_LABELS[changeType] : null
  const hasStats = additions > 0 || deletions > 0

  return (
    <div className={`${styles.wrapper} ${className}`}>
      <button
        type="button"
        className={`${styles.trigger} ${expanded ? styles.triggerSticky : ''}`}
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className={styles.fileInfo}>
          <span className={styles.fileIcon}>
            <FileText size={14} weight="fill" />
          </span>
          <div className={styles.filePathContainer}>
            {dir && <span className={styles.directory}>{`‪${dir}‬`}</span>}
            <span className={styles.filename}>{name}</span>
          </div>
          {hasStats && (
            <span className={styles.diffBar}>
              <span
                className={styles.diffAddBar}
                style={{ flex: additions }}
              />
              <span
                className={styles.diffDelBar}
                style={{ flex: deletions }}
              />
            </span>
          )}
        </div>
        <div className={styles.actions}>
          {renderActions?.()}
          {changeLabel && (
            <span className={`${styles.changeBadge} ${styles[`change${changeType.charAt(0).toUpperCase() + changeType.slice(1)}`] || styles.changeModified}`}>
              {changeLabel}
            </span>
          )}
          {hasStats && (
            <span className={styles.diffStats}>
              +{additions} -{deletions}
            </span>
          )}
          <span
            className={styles.downloadBtn}
            onClick={handleDownload}
            title="Download file"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') handleDownload(e) }}
          >
            <DownloadSimple size={14} weight="bold" />
          </span>
          <CaretDown size={12} weight="bold" className={`${styles.caret} ${expanded ? styles.caretExpanded : ''}`} />
        </div>
      </button>
      <div className={`${styles.body} ${expanded ? styles.bodyExpanded : ''}`}>
        <div className={styles.bodyInner}>
          {showContent ? children : null}
          {showContent && contentTruncated && (
            <div className={styles.truncationHint}>
              Preview may be incomplete. <a href="#" onClick={handleDownload}>Download</a> to view full file.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
