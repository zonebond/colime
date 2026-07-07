import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  X,
  Folder,
  ArrowUp,
  DownloadSimple,
} from '@phosphor-icons/react'
import { getFileIcon } from '@/lib/fileIcons'
import { listSessionFiles, previewSessionFile, downloadSessionFile } from '@/features/chats/chats.service'
import { getAttachmentPreviewType } from '@/components/attachments/AttachmentCard'
import styles from './SessionFilesPanel.module.css'

function formatSize(bytes) {
  if (bytes == null || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function SessionFilesPanel({
  directory,
  isResponding = false,
  onClose,
  onPreviewFile,
}) {
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [currentPath, setCurrentPath] = useState('.')
  const [showIgnored, setShowIgnored] = useState(false)
  const [selected, setSelected] = useState(null)

  const loadFiles = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const items = await listSessionFiles(directory)
      setFiles(items)
    } catch (e) {
      setError(e.message || 'Failed to load files')
    } finally {
      setLoading(false)
    }
  }, [directory])

  useEffect(() => {
    loadFiles()
  }, [loadFiles, currentPath])

  // Filter files to show only entries at the current browsing depth
  const displayedFiles = useMemo(() => {
    if (!files.length) return []
    const prefix = currentPath === '.' ? '' : currentPath.endsWith('/') ? currentPath : currentPath + '/'
    const seen = new Set()
    return files
      .filter((f) => {
        const fpath = f.path || f.name || ''
        if (currentPath === '.') {
          // Root: show files without slashes, and top-level directories
          const slashIdx = fpath.indexOf('/')
          if (slashIdx === -1) return true
          const topDir = fpath.slice(0, slashIdx)
          if (seen.has(topDir)) return false
          seen.add(topDir)
          return true
        }
        // Subdirectory: match prefix, one level deep
        if (!fpath.startsWith(prefix)) return false
        const rel = fpath.slice(prefix.length)
        if (!rel) return false
        const slashIdx = rel.indexOf('/')
        if (slashIdx !== -1) {
          const subDir = rel.slice(0, slashIdx)
          const fullDir = prefix + subDir
          if (seen.has(fullDir)) return false
          seen.add(fullDir)
          return true
        }
        return true
      })
      .map((f) => {
        const fpath = f.path || f.name || ''
        if (currentPath === '.') {
          const slashIdx = fpath.indexOf('/')
          if (slashIdx === -1) return f
          return { ...f, name: fpath.slice(0, slashIdx), type: 'directory', path: fpath.slice(0, slashIdx), size: null }
        }
        const rel = fpath.slice(prefix.length)
        const slashIdx = rel.indexOf('/')
        if (slashIdx !== -1) {
          const subDir = rel.slice(0, slashIdx)
          return { name: subDir, type: 'directory', path: prefix + subDir, size: null, ignored: f.ignored }
        }
        return { ...f, name: rel }
      })
      .filter((f) => showIgnored ? true : !f.ignored)
      .sort((a, b) => {
        if ((a.type === 'directory') !== (b.type === 'directory')) return a.type === 'directory' ? -1 : 1
        return (a.name || '').localeCompare(b.name || '')
      })
  }, [files, currentPath, showIgnored])

  const breadcrumbs = useMemo(() => {
    if (currentPath === '.') return [{ label: 'root', path: '.' }]
    const parts = currentPath.split('/').filter(Boolean)
    const crumbs = [{ label: 'root', path: '.' }]
    let built = ''
    for (const p of parts) {
      built = built ? `${built}/${p}` : p
      crumbs.push({ label: p, path: built })
    }
    return crumbs
  }, [currentPath])

  const navigateTo = useCallback((path) => {
    setCurrentPath(path)
    setSelected(null)
  }, [])

  const navigateUp = useCallback(() => {
    if (currentPath === '.') return
    const parts = currentPath.split('/')
    parts.pop()
    navigateTo(parts.join('/') || '.')
  }, [currentPath, navigateTo])

  const handlePreview = useCallback(async (name) => {
    const filePath = currentPath === '.' ? name : `${currentPath}/${name}`
    setSelected({ name, path: filePath })
    const pType = getAttachmentPreviewType({ name, type: '' })
    const attachment = { file: { name }, previewType: pType }

    const onDownload = async () => {
      const params = new URLSearchParams({ path: filePath })
      const sid = directory?.split('/sessions/')[1]?.split('/')[0]
      if (sid) params.set('sessionID', sid)
      const a = document.createElement('a')
      a.href = `/ravens/file/download?${params.toString()}`
      a.download = name
      a.click()
    }

    try {
      switch (pType) {
        case 'markdown':
        case 'csv': {
          const blob = await downloadSessionFile(directory, filePath)
          const text = await blob.text()
          onPreviewFile({ attachment, content: text, onDownload, truncated: false })
          break
        }
        case 'code':
        case 'text': {
          const result = await previewSessionFile(directory, filePath, 64000)
          onPreviewFile({ attachment, content: result.text, onDownload, truncated: result.truncated })
          break
        }
        case 'pdf':
        case 'image':
        case 'docx':
        case 'sheet': {
          const blob = await downloadSessionFile(directory, filePath)
          const blobUrl = URL.createObjectURL(blob)
          onPreviewFile({ attachment: { ...attachment, file: { ...attachment.file, url: blobUrl } }, blobUrl, onDownload })
          break
        }
        default: {
          onPreviewFile({ attachment, content: null, onDownload })
        }
      }
    } catch (_) { /* preview failed */ }
  }, [currentPath, directory, onPreviewFile])

  const handleDownload = useCallback((name) => {
    const filePath = currentPath === '.' ? name : `${currentPath}/${name}`
    setSelected({ name, path: filePath })
    const params = new URLSearchParams({ path: filePath })
    const sid = directory?.split('/sessions/')[1]?.split('/')[0]
    if (sid) params.set('sessionID', sid)
    const a = document.createElement('a')
    a.href = `/ravens/file/download?${params.toString()}`
    a.download = name
    a.click()
  }, [currentPath, directory])

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.title}>Session Files</span>
        <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
          <X size={16} weight="bold" />
        </button>
      </div>

      {isResponding && (
        <div className={styles.runningNotice}>
          Agent is running — files may still be changing
        </div>
      )}

      <div className={styles.breadcrumb}>
        {breadcrumbs.map((crumb, i) => (
          <span key={crumb.path}>
            {i > 0 && <span className={styles.breadSep}>/</span>}
            <button
              type="button"
              className={`${styles.breadBtn} ${i === breadcrumbs.length - 1 ? styles.breadActive : ''}`}
              onClick={() => navigateTo(crumb.path)}
            >
              {crumb.label}
            </button>
          </span>
        ))}
        {currentPath !== '.' && (
          <button type="button" className={styles.upBtn} onClick={navigateUp} title="Up">
            <ArrowUp size={14} />
          </button>
        )}
      </div>

      <div className={styles.toolbar}>
        <label className={styles.ignoredToggle}>
          <input
            type="checkbox"
            checked={showIgnored}
            onChange={(e) => setShowIgnored(e.target.checked)}
          />
          Show hidden
        </label>
      </div>

      <div className={styles.fileList}>
        {loading && <div className={styles.loading}>Loading...</div>}
        {error && <div className={styles.error}>{error}</div>}
        {!loading && !error && displayedFiles.length === 0 && (
          <div className={styles.empty}>No files in this directory</div>
        )}
        {!loading && displayedFiles.map((f) => {
          const name = f.name || ''
          const isDir = f.type === 'directory'
          const FileIcon = getFileIcon(name, { isDirectory: isDir })

          return (
            <div
              key={f.path || name}
              className={`${styles.fileRow} ${selected?.path === (f.path || name) ? styles.fileRowSelected : ''}`}
            >
              <button
                type="button"
                className={styles.fileMain}
                onClick={() => isDir ? navigateTo(f.path || name) : handlePreview(name)}
              >
                <span className={styles.fileIcon}>
                  {isDir ? <Folder size={16} weight="fill" /> : <FileIcon size={16} weight="fill" />}
                </span>
                <span className={styles.fileName}>{isDir ? `${name}/` : name}</span>
                {!isDir && f.size != null && (
                  <span className={styles.fileSize}>{formatSize(f.size)}</span>
                )}
              </button>
              {!isDir && (
                <button
                  type="button"
                  className={styles.fileAction}
                  onClick={() => handleDownload(name)}
                  title="Download"
                >
                  <DownloadSimple size={14} weight="bold" />
                </button>
              )}
            </div>
          )
        })}
      </div>

    </div>
  )
}
