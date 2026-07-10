import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Copy, Check, Files as FilesIcon } from '@phosphor-icons/react'
import { getAgentColor } from '@/lib/agentColor'
import { getFileIcon, getFileColor } from '@/lib/fileIcons'
import { downloadSessionFile, previewSessionFile, listSessionFiles } from '@/features/chats/chats.service'
import { getAttachmentPreviewType } from '@/components/attachments/AttachmentCard'
import AssistantStatus from './AssistantStatus'
import AssistantBlocks from './AssistantBlocks'
import styles from './AssistantMessageRow.module.css'

const FILE_WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch'])

const TYPE_LABEL_MAP = {
  markdown: 'Markdown',
  code: 'Code',
  text: 'Text',
  csv: 'Spreadsheet',
  pdf: 'PDF',
  image: 'Image',
  file: 'File',
}

function typeLabelFor(name) {
  const t = getAttachmentPreviewType({ name, type: '' })
  return TYPE_LABEL_MAP[t] || 'File'
}

function resolveModelName(models, providerID, modelID) {
  if (!providerID || !modelID) return modelID || ''
  const match = models?.find(
    (m) => (m.providerId === providerID || m.provider === providerID) && (m.bareId === modelID || m.id === modelID),
  )
  return match?.name ?? modelID
}

function capitalizeAgent(agent) {
  if (!agent) return ''
  return agent[0].toUpperCase() + agent.slice(1)
}

function formatSize(bytes) {
  if (bytes == null || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(ms) {
  if (!ms || ms < 0) return ''
  const total = Math.round(ms / 1000)
  if (total < 60) return `${total}s`
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  if (minutes < 60) return `${minutes}m ${seconds}s`
  const hours = Math.floor(minutes / 60)
  const remainMin = minutes % 60
  return `${hours}h ${remainMin}m`
}

export default memo(function AssistantMessageRow({ message, tc, models, onConfirmTool, onRetryTool, isLastMessage = true, groupFiles, onViewAllFiles, onPreviewSessionFile }) {
  const [copied, setCopied] = useState(false)
  const isDone = message.status !== 'loading'

  // ── Determine produced files source ──────────────────────────────
  // groupFiles is supplied by VirtualMessageList for group-aware file
  // collection. Three states:
  //   undefined → legacy, not in a group-enabled list
  //   null      → assistant message that isn't the last in its group
  //   [...]     → last assistant message in group, carries all files
  const producedFiles = useMemo(() => {
    if (!isDone) return []
    if (groupFiles !== undefined) {
      return groupFiles || []
    }
    // Legacy per-message mode (groupFiles prop not passed)
    const seen = new Map()
    for (const block of message.contentBlocks || []) {
      if (block.type !== 'tool_result') continue
      if (!FILE_WRITE_TOOLS.has(block.toolName)) continue
      if (block.state !== 'done') continue
      const fp = block.toolInput?.filePath || block.toolInput?.path
      if (!fp) continue
      const name = fp.split('/').pop()
      if (!name) continue
      // Dedupe by basename, later write wins
      seen.set(name, {
        fileName: name,
        filePath: fp,
        rawPath: fp,
        _directory: message._directory || block._directory,
      })
    }
    return Array.from(seen.values())
  }, [message.contentBlocks, message._directory, isDone, groupFiles])

  // ── Cross-reference with disk to get real paths and sizes ─────────
  const [diskLookup, setDiskLookup] = useState(null)
  useEffect(() => {
    if (!isDone || !producedFiles.length || !message._directory) {
      setDiskLookup(null)
      return
    }
    let cancelled = false
    listSessionFiles(message._directory).then((items) => {
      if (cancelled) return
      const byName = {}
      for (const f of items) {
        if (f.path && f.name && f.type !== 'directory') {
          byName[f.name] = { path: f.path, size: f.size }
        }
      }
      setDiskLookup(byName)
    }).catch(() => {
      if (!cancelled) setDiskLookup({})
    })
    return () => { cancelled = true }
  }, [isDone, producedFiles.length, message._directory])

  // Resolve produced file against disk: use disk path if basename matches.
  // Files marked _mentioned were extracted from text (not tool input) —
  // drop them if they can't be confirmed on disk to avoid showing
  // hallucinated / stale references.
  const resolvedFiles = useMemo(() => {
    if (!diskLookup) {
      // Before disk lookup resolves, show tool-produced files as-is
      // but suppress _mentioned entries until we can verify them.
      return producedFiles.filter(f => !f._mentioned)
    }
    return producedFiles
      .map(f => {
        const disk = diskLookup[f.fileName]
        if (disk) return { ...f, filePath: disk.path, size: disk.size }
        // Mentioned file not found on disk → drop it
        if (f._mentioned) return null
        return f
      })
      .filter(Boolean)
  }, [producedFiles, diskLookup])

  const fileSizeMap = useMemo(() => {
    if (!diskLookup) return null
    const map = {}
    for (const [name, info] of Object.entries(diskLookup)) {
      if (info.path && info.size != null) map[info.path] = info.size
    }
    return map
  }, [diskLookup])

  // ── Preview handler ─────────────────────────────────────────────
  const handlePreview = useCallback(async (e, file) => {
    e.stopPropagation()
    const pType = getAttachmentPreviewType({ name: file.fileName, type: '' })
    // Fall back to the bare filename (session files live at the session
    // root) and the row's directory when disk resolution hasn't landed yet.
    const filePath = file.filePath || file.fileName
    const directory = file._directory || message._directory

    // Build base attachment shape
    const attachment = { file: { name: file.fileName }, previewType: pType }

    // Download action for the modal
    const onDownload = async () => {
      const blob = await downloadSessionFile(directory, filePath)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = file.fileName
      a.click()
      URL.revokeObjectURL(url)
    }

    // Fetch content based on previewType
    try {
      switch (pType) {
        case 'markdown':
        case 'csv': {
          // Full file for markdown (rendering) and csv (need 20+ lines)
          const blob = await downloadSessionFile(directory, filePath)
          const text = await blob.text()
          onPreviewSessionFile({ attachment, content: text, onDownload, truncated: false })
          break
        }
        case 'code':
        case 'text': {
          const result = await previewSessionFile(directory, filePath, 64000)
          onPreviewSessionFile({ attachment, content: result.text, onDownload, truncated: result.truncated })
          break
        }
        case 'pdf':
        case 'image':
        case 'docx':
        case 'sheet': {
          const blob = await downloadSessionFile(directory, filePath)
          const blobUrl = URL.createObjectURL(blob)
          onPreviewSessionFile({ attachment: { ...attachment, file: { ...attachment.file, url: blobUrl } }, blobUrl, onDownload })
          break
        }
        default: {
          // file — just show download
          onPreviewSessionFile({ attachment, content: null, onDownload })
        }
      }
    } catch (_) { /* preview failed silently */ }
  }, [message._directory, onPreviewSessionFile])

  const handleCopy = useCallback(async (e) => {
    e.stopPropagation()
    const textBlocks = (message.contentBlocks || [])
      .filter((b) => b.type === 'text' && b.content)
      .map((b) => b.content)
      .join('\n\n')
    const content = textBlocks || message.content || ''
    if (!content) return
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [message.content, message.contentBlocks])

  const agentLabel = capitalizeAgent(message.agent)
  const modelLabel = resolveModelName(models, message.providerID, message.model)
  const durationMs = message.completedAt && message.createdAt
    ? new Date(message.completedAt).getTime() - new Date(message.createdAt).getTime()
    : null
  const durationLabel = formatDuration(durationMs)
  const interrupted = message.stopReason === 'abort' || message.errorCode === 'MessageAbortedError'
  const agentColor = getAgentColor(message.agent)
  const metaItems = [agentLabel, modelLabel, durationLabel, interrupted ? 'Interrupted' : ''].filter(Boolean)
  const metaText = metaItems.join(' · ')

  return (
    <section className={styles.responseBlock}>
      <AssistantStatus message={message} t={tc} tc={tc} onConfirmTool={onConfirmTool} onRetryTool={onRetryTool} />
      <AssistantBlocks
        message={message}
        t={tc}
        tc={tc}
        onConfirmTool={onConfirmTool}
        onRetryTool={onRetryTool}
      />
      {isDone && resolvedFiles.length > 0 && (
        <div className={styles.producedFiles}>
          <div className={styles.producedFilesLabel}>
            {tc.filesThisRound || 'Files this round'}
          </div>
          <div className={styles.producedFilesGrid}>
            {resolvedFiles.map((file) => {
              const FileIcon = getFileIcon(file.fileName)
              const fileColor = getFileColor(file.fileName)
              const size = file.size
              const typeLabel = typeLabelFor(file.fileName)
              return (
                <div
                  key={file.filePath}
                  className={styles.producedFileCard}
                  onClick={(e) => handlePreview(e, file)}
                  title={`Preview ${file.fileName}`}
                >
                  <span className={styles.producedFileIcon} style={{ color: fileColor }}>
                    <FileIcon size={20} weight="fill" />
                  </span>
                  <span className={styles.producedFileInfo}>
                    <span className={styles.producedFileName}>{file.fileName}</span>
                    <span className={styles.producedFileMeta}>
                      {typeLabel}
                      {size != null ? ` · ${formatSize(size)}` : ''}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>
          {onViewAllFiles && (
            <button
              type="button"
              className={styles.producedFilesViewAll}
              onClick={(e) => { e.stopPropagation(); onViewAllFiles() }}
            >
              <FilesIcon size={12} weight="regular" />
              {tc.viewAllFiles || 'View all files'}
            </button>
          )}
        </div>
      )}

      {isDone && isLastMessage && (
        <div className={styles.responseFooter}>
          <button
            type="button"
            className={styles.responseActionBtn}
            onClick={handleCopy}
            aria-label={copied ? (tc.copied || 'Copied') : (tc.copy || 'Copy response')}
            title={copied ? (tc.copied || 'Copied') : (tc.copy || 'Copy response')}
          >
            {copied ? <Check size={16} weight="regular" /> : <Copy size={16} weight="regular" />}
          </button>
          {metaText && (
            <span className={styles.responseMeta}>
              {agentLabel && (
                <span style={{ color: agentColor, fontWeight: 500 }}>{agentLabel}</span>
              )}
              {agentLabel ? ` · ${[modelLabel, durationLabel, interrupted ? 'Interrupted' : ''].filter(Boolean).join(' · ')}` : metaText}
            </span>
          )}
        </div>
      )}
    </section>
  )
})