import { Check, CircleNotch, File, FileCode, FileCsv, FilePdf, FileText, MagnifyingGlass, WarningCircle } from '@phosphor-icons/react'
import { memo, useEffect, useMemo, useState } from 'react'
import styles from './AttachmentCard.module.css'

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff', 'tif', 'heic', 'avif']
const MARKDOWN_EXTENSIONS = ['md', 'markdown']
const CODE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'h', 'go', 'rs', 'rb', 'php', 'swift', 'kt', 'sql', 'sh', 'bash', 'zsh', 'css', 'scss', 'less', 'html', 'xml', 'yaml', 'yml', 'toml', 'json', 'env']

export function getAttachmentName(file) {
  return file?.name || file?.fileName || 'Untitled file'
}

export function getAttachmentExtension(file) {
  const parts = getAttachmentName(file).split('.')
  return parts.length > 1 ? parts.pop().toLowerCase() : ''
}

export function getAttachmentPreviewType(file) {
  const type = file?.type || ''
  const ext = getAttachmentExtension(file)

  if (type.startsWith('image/') || (ext && IMAGE_EXTENSIONS.includes(ext))) return 'image'
  if (type === 'application/pdf') return 'pdf'
  if (type === 'text/csv' || ext === 'csv') return 'csv'
  if (ext && MARKDOWN_EXTENSIONS.includes(ext)) return 'markdown'
  if (type.startsWith('text/')) return 'text'
  if (type === 'application/json') return 'text'
  if (ext && CODE_EXTENSIONS.includes(ext)) return 'code'
  return 'file'
}

function getAttachmentTypeIcon(previewType) {
  const iconMap = {
    pdf: FilePdf,
    csv: FileCsv,
    code: FileCode,
    text: FileText,
    markdown: FileText,
    file: File,
  }

  return iconMap[previewType] || File
}

function formatAttachmentSize(size) {
  if (!Number.isFinite(size) || size <= 0) return ''
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(size / 1024))} KB`
}

function getAttachmentMeta(file, metaMode = 'default') {
  if (file?.uploadStatus === 'uploading') {
    return `Uploading ${file.uploadProgress || 0}%`
  }

  if (file?.uploadStatus === 'error') {
    return 'Upload failed'
  }

  if (metaMode === 'none') {
    return ''
  }

  if (metaMode === 'size') {
    return formatAttachmentSize(file?.size)
  }

  const previewType = getAttachmentPreviewType(file)

  if (previewType === 'csv') return 'Spreadsheet'
  if (previewType === 'pdf') return 'PDF'
  if (previewType === 'markdown' || previewType === 'code' || previewType === 'text') {
    return formatAttachmentSize(file?.size)
  }

  return formatAttachmentSize(file?.size)
}

export function isBlobAttachment(file) {
  return typeof Blob !== 'undefined' && file instanceof Blob
}

export function getAttachmentBlob(file) {
  if (isBlobAttachment(file)) return file
  if (isBlobAttachment(file?.fileBlob)) return file.fileBlob
  return null
}

export function isReadableAttachment(file) {
  return Boolean(getAttachmentBlob(file))
}

export const AttachmentImage = memo(function AttachmentImage({ file, alt, className }) {
  const [src, setSrc] = useState(() => (typeof file?.url === 'string' ? file.url : ''))

  useEffect(() => {
    if (typeof file?.url === 'string' && file.url) {
      setSrc(file.url)
      return undefined
    }

    const blob = getAttachmentBlob(file)

    if (!blob) {
      setSrc('')
      return undefined
    }

    const objectUrl = URL.createObjectURL(blob)
    setSrc(objectUrl)

    return () => {
      URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  if (!src) {
    return (
      <div className={styles.attachmentCardContent}>
        <File size={24} weight="fill" className={styles.attachmentCardIcon} />
      </div>
    )
  }

  return <img src={src} alt={alt} className={className} />
})

export default memo(function AttachmentCard({
  file,
  onPreview = null,
  onRemove = null,
  className = '',
  size = 'default',
  metaMode = 'default',
}) {
  const previewType = getAttachmentPreviewType(file)
  const ext = getAttachmentExtension(file)
  const meta = getAttachmentMeta(file, metaMode)
  const name = getAttachmentName(file)
  const FileTypeIcon = getAttachmentTypeIcon(previewType)
  const isImage = previewType === 'image'
  const uploadStatus = file.uploadStatus || null
  const isUploading = uploadStatus === 'uploading'
  const isErrored = uploadStatus === 'error'
  const isUploaded = uploadStatus === 'uploaded'
  const hasStatus = isUploading || isErrored || isUploaded
  const isCompact = size === 'compact'
  const canPreview = typeof onPreview === 'function' && !isUploading
  const rootClassName = useMemo(() => [
    styles.attachmentCard,
    size === 'compact' ? styles.attachmentCardCompact : '',
    hasStatus ? styles.attachmentCardHasStatus : '',
    className,
  ].filter(Boolean).join(' '), [className, hasStatus, size])
  const bodyClassName = useMemo(() => [
    styles.attachmentCardBtn,
    !canPreview ? styles.attachmentCardStatic : '',
    isImage ? styles.attachmentCardImage : styles.attachmentCardFile,
  ].filter(Boolean).join(' '), [canPreview, isImage])

  const content = (
    <>
      <div className={styles.attachmentCardImageWrap}>
        {isImage ? (
          <AttachmentImage file={file} alt={name} className={styles.attachmentCardImg} />
        ) : (
          <div className={`${styles.attachmentCardContent} ${styles[`attachmentCardContent_${previewType}`] || ''}`}>
            <FileTypeIcon size={24} weight="fill" className={`${styles.attachmentCardIcon} ${styles[`attachmentCardIcon_${previewType}`] || ''}`} />
            <span className={styles.attachmentCardName}>{name}</span>
            {meta ? <span className={styles.attachmentCardInfo}>{meta}</span> : null}
          </div>
        )}
        {canPreview ? (
          <div className={styles.attachmentCardImageOverlay}>
            <MagnifyingGlass size={20} weight="bold" />
          </div>
        ) : null}
      </div>
      {ext ? (
        <div className={styles.attachmentCardBadge}>
          <span className={styles.attachmentCardBadgeText}>{ext}</span>
        </div>
      ) : null}
      {hasStatus ? (
        <div className={`${styles.attachmentStatusBadge} ${isUploading ? styles.attachmentStatusUploading : ''} ${isErrored ? styles.attachmentStatusError : ''} ${isUploaded ? styles.attachmentStatusDone : ''}`.trim()}>
          {isUploading ? <CircleNotch size={12} weight="bold" className={styles.attachmentStatusSpinner} /> : null}
          {isUploaded ? <Check size={12} weight="bold" /> : null}
          {isErrored ? <WarningCircle size={12} weight="fill" /> : null}
          {!isUploaded && !(isErrored && isCompact) ? (
            <span>
              {isUploading ? `${file.uploadProgress || 0}%` : 'Upload failed'}
            </span>
          ) : null}
        </div>
      ) : null}
      {isUploading ? (
        <div className={styles.attachmentProgressTrack}>
          <div className={styles.attachmentProgressFill} style={{ width: `${file.uploadProgress || 0}%` }} />
        </div>
      ) : null}
    </>
  )

  return (
    <div className={rootClassName}>
      {canPreview ? (
        <button type="button" className={bodyClassName} onClick={() => onPreview(file)} aria-label={`${name}${meta ? `, ${meta}` : ''}`}>
          {content}
        </button>
      ) : (
        <div className={bodyClassName} aria-label={`${name}${meta ? `, ${meta}` : ''}`}>
          {content}
        </div>
      )}
      {onRemove ? (
        <button
          type="button"
          className={styles.attachmentCardRemove}
          onClick={onRemove}
          aria-label={`Remove ${name}`}
        >
          <svg width="10" height="10" viewBox="0 0 20 20" fill="currentColor">
            <path d="M15.147 4.146a.5.5 0 0 1 .707.707L10.707 10l5.147 5.147a.5.5 0 0 1-.63.771l-.078-.064L10 10.707l-5.146 5.147a.5.5 0 0 1-.708-.707L9.293 10 4.146 4.853a.5.5 0 0 1 .708-.707L10 9.293z" />
          </svg>
        </button>
      ) : null}
    </div>
  )
})
