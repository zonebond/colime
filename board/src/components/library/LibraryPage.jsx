import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useLibraryModel } from '@/features/library/library.hooks'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import sanitizeHtml from '@/lib/sanitize'
import ConfirmDialog from '@/components/chats/ConfirmDialog'
import DocumentDialog from './DocumentDialog'
import LibraryItem from './LibraryItem'
import styles from './LibraryPage.module.css'

const DOC_SKELETON_COUNT = 5

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

function SimpleMarkdownView({ content }) {
  const lines = content.split('\n')
  const elements = []
  let inCodeBlock = false
  let codeContent = []
  let listItems = []
  let inList = false

  const flushList = () => {
    if (listItems.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {listItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      )
      listItems = []
    }
    inList = false
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`pre-${elements.length}`}>
            <code>{codeContent.join('\n')}</code>
          </pre>
        )
        codeContent = []
      } else {
        flushList()
      }
      inCodeBlock = !inCodeBlock
      continue
    }

    if (inCodeBlock) {
      codeContent.push(line)
      continue
    }

    if (line.startsWith('# ')) {
      flushList()
      elements.push(<h1 key={`h1-${i}`}>{line.slice(2)}</h1>)
    } else if (line.startsWith('## ')) {
      flushList()
      elements.push(<h2 key={`h2-${i}`}>{line.slice(3)}</h2>)
    } else if (line.startsWith('### ')) {
      flushList()
      elements.push(<h3 key={`h3-${i}`}>{line.slice(4)}</h3>)
    } else if (line.startsWith('- [ ] ')) {
      inList = true
      listItems.push(
        <span key={`cb-${i}`}>
          <input type="checkbox" disabled /> {line.slice(6)}
        </span>
      )
    } else if (line.startsWith('- ')) {
      inList = true
      listItems.push(line.slice(2))
    } else if (/^\d+\.\s/.test(line)) {
      inList = true
      listItems.push(line.replace(/^\d+\.\s/, ''))
    } else if (line.startsWith('> ')) {
      flushList()
      elements.push(<blockquote key={`bq-${i}`}>{line.slice(2)}</blockquote>)
    } else if (line.startsWith('| ') && line.endsWith(' |')) {
      const cells = line.slice(2, -2).split(' | ')
      if (cells.some((c) => c.match(/^-+$/))) {
        continue
      }
      elements.push(
        <table key={`table-${i}`}>
          <tbody>
            <tr>
              {cells.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          </tbody>
        </table>
      )
    } else if (line.trim() === '') {
      flushList()
    } else {
      flushList()
      let processed = line
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/`(.+?)`/g, '<code>$1</code>')

      if (processed.includes('<code>') || processed.includes('<strong>') || processed.includes('<em>')) {
        elements.push(
          <p key={`p-${i}`} dangerouslySetInnerHTML={{ __html: sanitizeHtml(processed) }} />
        )
      } else {
        elements.push(<p key={`p-${i}`}>{line}</p>)
      }
    }
  }

  flushList()

  return <div className={styles.previewBody}>{elements}</div>
}

export default function LibraryPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { documents, loading, createDocument, updateDocument, deleteDocument, searchDocuments } = useLibraryModel()

  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState(null)
  const [showDocDialog, setShowDocDialog] = useState(false)
  const [editTargetDoc, setEditTargetDoc] = useState(null)
  const [previewDoc, setPreviewDoc] = useState(null)

  const lp = t('library') || {}
  const search = searchParams.get('search') ?? ''

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    if (!q) return documents

    return documents.filter(
      (doc) =>
        doc.title.toLowerCase().includes(q) ||
        doc.content.toLowerCase().includes(q) ||
        (doc.tags && doc.tags.some((tag) => tag.toLowerCase().includes(q)))
    )
  }, [documents, search])

  const updateQuery = (updates) => {
    const nextParams = new URLSearchParams(searchParams)
    Object.entries(updates).forEach(([key, value]) => {
      if (!value) {
        nextParams.delete(key)
      } else {
        nextParams.set(key, value)
      }
    })
    setSearchParams(nextParams, { replace: true })
  }

  const {
    value: searchDraft,
    handleChange: handleSearchChange,
    handleCompositionStart: handleSearchCompositionStart,
    handleCompositionEnd: handleSearchCompositionEnd,
  } = useImeSafeInput({
    value: search,
    onCommit: (value) => updateQuery({ search: value }),
    debounceMs: 160,
  })

  const handleNewDoc = () => {
    setEditTargetDoc(null)
    setShowDocDialog(true)
  }

  const handleEditDoc = (doc) => {
    setEditTargetDoc(doc)
    setShowDocDialog(true)
    setPreviewDoc(null)
  }

  const handleCreateDocConfirm = async (nextValues) => {
    setShowDocDialog(false)
    await createDocument(nextValues)
  }

  const handleUpdateDocConfirm = async (nextValues) => {
    setShowDocDialog(false)
    if (editTargetDoc) {
      await updateDocument(editTargetDoc.id, nextValues)
    }
    setEditTargetDoc(null)
  }

  const handleDeleteConfirm = async () => {
    await deleteDocument(deleteTargetId)
    setShowDeleteDialog(false)
    setDeleteTargetId(null)
    if (previewDoc && previewDoc.id === deleteTargetId) {
      setPreviewDoc(null)
    }
  }

  const handleDelete = (id) => {
    setDeleteTargetId(id)
    setShowDeleteDialog(true)
  }

  const handlePreview = (doc) => {
    setPreviewDoc(doc)
  }

  const closePreview = () => {
    setPreviewDoc(null)
  }

  const relativeTime = previewDoc ? formatRelativeTime(previewDoc.updatedAt, t) : ''

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <h1 className={styles.title}>{lp.title || t('sidebar.library')}</h1>
          <button className={styles.newBtn} onClick={handleNewDoc}>
            <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
              <path d="M228,128a12,12,0,0,1-12,12H140v76a12,12,0,0,1-24,0V140H40a12,12,0,0,1,0-24h76V40a12,12,0,0,1,24,0v76h76A12,12,0,0,1,228,128Z" />
            </svg>
            {lp.newDocument}
          </button>
        </div>
      </header>

      <div className={styles.container}>
        <div className={styles.toolbarSticky}>
          <div className={styles.toolbar}>
            <div className={styles.searchWrap}>
              <svg className={styles.searchIcon} width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path d="M8.5 2a6.5 6.5 0 0 1 4.935 10.728l4.419 4.419.064.078a.5.5 0 0 1-.693.693l-.079-.064-4.419-4.42A6.5 6.5 0 1 1 8.5 2m0 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11" />
              </svg>
              <input
                type="text"
                className={styles.searchInput}
                placeholder={lp.searchPlaceholder}
                value={searchDraft}
                onChange={handleSearchChange}
                onCompositionStart={handleSearchCompositionStart}
                onCompositionEnd={handleSearchCompositionEnd}
              />
            </div>
          </div>
        </div>

        <div className={styles.listViewport}>
          <div className={styles.list}>
            {loading ? (
              Array.from({ length: DOC_SKELETON_COUNT }).map((_, index) => (
                <div key={`doc-skeleton-${index}`} className={styles.docSkeletonCard}>
                  <div className={`uiSkeleton ${styles.docSkeletonTitle}`} />
                  <div className={`uiSkeleton ${styles.docSkeletonLine}`} />
                  <div className={styles.docSkeletonFooter}>
                    <div className={`uiSkeleton ${styles.docSkeletonTag}`} />
                    <div className={`uiSkeleton ${styles.docSkeletonMeta}`} />
                  </div>
                </div>
              ))
            ) : filtered.length === 0 ? (
              <div className={styles.empty}>
                <p className={styles.emptyText}>{search ? lp.noResults : lp.noDocuments}</p>
                <p className={styles.emptyDesc}>{search ? lp.noResultsDesc : lp.noDocumentsDesc}</p>
              </div>
            ) : (
              filtered.map((doc) => (
                <LibraryItem
                  key={doc.id}
                  document={doc}
                  onClick={handlePreview}
                  onDelete={handleDelete}
                  t={t}
                />
              ))
            )}
          </div>
        </div>

        <div className={styles.listFade} />
      </div>

      {previewDoc && (
        <div className={styles.previewPanel}>
          <div className={styles.previewHeader}>
            <h2 className={styles.previewTitle}>{previewDoc.title}</h2>
            <div className={styles.previewActions}>
              <button className={styles.previewActionBtn} onClick={() => handleEditDoc(previewDoc)} title={lp.edit}>
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M227.31,73.37,182.63,28.68a16,16,0,0,0-22.63,0L36.69,152A15.86,15.86,0,0,0,32,163.31V208a16,16,0,0,0,16,16H92.69A15.86,15.86,0,0,0,104,219.31L227.31,96a16,16,0,0,0,0-22.63ZM92.69,208H48V163.31l88-88L180.69,120Z" />
                </svg>
              </button>
              <button className={`${styles.previewActionBtn} ${styles.delete}`} onClick={() => handleDelete(previewDoc.id)} title={lp.delete}>
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M216,48H176V40a24,24,0,0,0-24-24H104A24,24,0,0,0,80,40v8H40a8,8,0,0,0,0,16h8V208a16,16,0,0,0,16,16H192a16,16,0,0,0,16-16V64h8a8,8,0,0,0,0-16ZM96,40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v8H96Zm96,168H64V64H192ZM112,104v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Zm48,0v64a8,8,0,0,1-16,0V104a8,8,0,0,1,16,0Z" />
                </svg>
              </button>
              <button className={styles.previewActionBtn} onClick={closePreview} title={lp.close}>
                <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
                  <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
                </svg>
              </button>
            </div>
          </div>
          <div className={styles.previewContent}>
            <div className={styles.previewMeta}>
              {previewDoc.tags && previewDoc.tags.length > 0 && (
                previewDoc.tags.map((tag) => (
                  <span key={tag} className={styles.previewTag}>{tag}</span>
                ))
              )}
              {relativeTime && (
                <span className={styles.previewDate}>{relativeTime}</span>
              )}
            </div>
            <SimpleMarkdownView content={previewDoc.content} />
          </div>
        </div>
      )}

      {showDeleteDialog && (
        <ConfirmDialog
          title={lp.confirmDelete}
          description=""
          confirmText={lp.delete}
          cancelText={lp.cancel}
          onConfirm={handleDeleteConfirm}
          onCancel={() => {
            setShowDeleteDialog(false)
            setDeleteTargetId(null)
          }}
        />
      )}

      {showDocDialog && (
        <DocumentDialog
          title={editTargetDoc ? lp.editDocument : lp.newDocument}
          document={editTargetDoc}
          onConfirm={editTargetDoc ? handleUpdateDocConfirm : handleCreateDocConfirm}
          onCancel={() => {
            setShowDocDialog(false)
            setEditTargetDoc(null)
          }}
          cancelText={lp.cancel}
          confirmText={editTargetDoc ? lp.save : lp.create}
          pendingText={lp.savingChanges}
          t={t}
        />
      )}
    </div>
  )
}
