import { useEffect, useRef, useState, useCallback } from 'react'
import { Check, Copy, DownloadSimple, DotsThreeOutline, File, FilePdf, FileCsv, FileCode, FileText, X, Slideshow, ArrowsOutSimple, ArrowsInSimple } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import { useTranslation } from '@/i18n'
import { AttachmentImage } from '@/components/attachments/AttachmentCard'
import { getFileExtension } from './message-list/helpers'
import styles from './AttachmentPreviewModal.module.css'

const TYPE_ICON = {
  pdf: FilePdf, csv: FileCsv, code: FileCode, text: FileText, markdown: FileText, file: File,
}
const TYPE_LABEL = {
  markdown: 'Markdown', code: 'Code', text: 'Text', csv: 'Spreadsheet', pdf: 'PDF Document', file: 'File',
}

function extractHeadings(container) {
  if (!container) return []
  const els = container.querySelectorAll('h1, h2, h3')
  return Array.from(els).map((el) => ({
    id: el.id,
    text: el.textContent?.trim() || '',
    level: parseInt(el.tagName[1], 10),
    el,
  }))
}

export default function AttachmentPreviewModal({
  attachment, content, codeCopied, onClose, onCopyCode, onDownload, blobUrl, truncated,
}) {
  const { t } = useTranslation()
  const tc = t('chats') || {}
  const blobRef = useRef(null)
  const mdRef = useRef(null)
  const observerRef = useRef(null)
  const [headings, setHeadings] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Clean up blob URLs
  useEffect(() => {
    blobRef.current = blobUrl || null
    return () => { if (blobRef.current) { URL.revokeObjectURL(blobRef.current); blobRef.current = null } }
  }, [blobUrl])

  // Extract headings after markdown renders
  useEffect(() => {
    if (!mdRef.current) return
    const timer = setTimeout(() => setHeadings(extractHeadings(mdRef.current)), 50)
    return () => clearTimeout(timer)
  }, [content])

  // IntersectionObserver for scroll-spy
  useEffect(() => {
    if (!mdRef.current || headings.length === 0) return
    const container = mdRef.current
    const activeMap = new Map()

    observerRef.current?.disconnect()
    observerRef.current = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          activeMap.set(e.target.id, e.isIntersecting)
        }
        // Find first visible heading (top-down)
        for (const h of headings) {
          if (activeMap.get(h.id)) { setActiveId(h.id); break }
        }
      },
      { root: container, rootMargin: '-40px 0px -70% 0px', threshold: 0 },
    )
    for (const h of headings) { if (h.el) observerRef.current.observe(h.el) }
    return () => observerRef.current?.disconnect()
  }, [headings])

  const scrollToHeading = useCallback((id) => {
    if (!mdRef.current) return
    const el = mdRef.current.querySelector(`#${CSS.escape(id)}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const previewType = attachment?.previewType
  const file = attachment?.file

  if (!attachment) return null
  const Icon = TYPE_ICON[previewType] || File
  const isMarkdown = previewType === 'markdown'
  const hasOutline = isMarkdown && headings.length >= 2

  return createPortal(
    <>
      <div className={styles.backdrop} onClick={onClose} />
      <div
        className={`${styles.modal} ${isFullscreen ? styles.modalFullscreen : ''}`}
        data-type={previewType}
      >
        {/* Image */}
        {previewType === 'image' && (
          <>
            <div className={styles.imageHeader}>
              <span className={styles.imageName}>{file.name}</span>
              <div className={styles.headerActions}>
                {onDownload && (
                  <span className={styles.headerBtnWrap}>
                    <button type="button" className={styles.downloadBtn} onClick={onDownload}><DownloadSimple size={16} weight="bold" /></button>
                    <span className={styles.headerTooltip}>{tc.download || 'Download'}</span>
                  </span>
                )}
                <span className={styles.headerBtnWrap}>
                  <button type="button" className={`${styles.downloadBtn} ${isFullscreen ? styles.btnActive : ''}`} onClick={() => setIsFullscreen(v => !v)}>
                    {isFullscreen ? <ArrowsInSimple size={16} weight="bold" /> : <ArrowsOutSimple size={16} weight="bold" />}
                  </button>
                  <span className={styles.headerTooltip}>{isFullscreen ? (tc.exitFullscreen || 'Exit fullscreen') : (tc.fullscreen || 'Fullscreen')}</span>
                </span>
                <button type="button" className={styles.closeBtn} onClick={onClose}><X size={18} weight="bold" /></button>
              </div>
            </div>
            <div className={styles.imageWrap}>
              <AttachmentImage file={file} alt={file.name} className={styles.image} />
            </div>
          </>
        )}
        {/* Non-image */}
        {previewType !== 'image' && (
          <>
            <div className={styles.header}>
              <div className={styles.headerLeft}>
                <span className={styles.fileName}>{file.name}</span>
              </div>
              <div className={styles.headerActions}>
                {onDownload && (
                  <span className={styles.headerBtnWrap}>
                    <button type="button" className={styles.downloadBtn} onClick={onDownload}><DownloadSimple size={16} weight="bold" /></button>
                    <span className={styles.headerTooltip}>{tc.download || 'Download'}</span>
                  </span>
                )}
                <span className={styles.headerBtnWrap}>
                  <button type="button" className={styles.downloadBtn}><DotsThreeOutline size={16} weight="bold" /></button>
                  <span className={styles.headerTooltip}>{tc.more || 'More'}</span>
                </span>
                <span className={styles.headerDivider} />
                <span className={styles.headerBtnWrap}>
                  <button type="button" className={styles.downloadBtn}>
                    <Slideshow size={16} weight="bold" />
                  </button>
                  <span className={styles.headerTooltip}>{tc.sideView || 'Side view'}</span>
                </span>
                <span className={styles.headerBtnWrap}>
                  <button type="button" className={`${styles.downloadBtn} ${isFullscreen ? styles.btnActive : ''}`} onClick={() => setIsFullscreen(v => !v)}>
                    {isFullscreen ? <ArrowsInSimple size={16} weight="bold" /> : <ArrowsOutSimple size={16} weight="bold" />}
                  </button>
                  <span className={styles.headerTooltip}>{isFullscreen ? (tc.exitFullscreen || 'Exit fullscreen') : (tc.fullscreen || 'Fullscreen')}</span>
                </span>
                <button type="button" className={styles.closeBtn} onClick={onClose}><X size={18} weight="bold" /></button>
              </div>
            </div>
            <div className={styles.typeBar}>
              <div className={styles.typeLeft}>
                <span className={styles.typeIcon}><Icon size={14} /></span>
                <span className={styles.typeLabel}>{TYPE_LABEL[previewType] || 'File'}</span>
                {truncated && <span className={styles.truncatedBadge}>{tc.previewTruncated || 'Preview truncated'}</span>}
              </div>
              {onCopyCode && (
                <button type="button" className={styles.copyBtn} onClick={onCopyCode}>
                  {codeCopied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
                  <span>{codeCopied ? 'Copied!' : 'Copy'}</span>
                </button>
              )}
            </div>
            <div className={styles.body}>
              {/* PDF */}
              {previewType === 'pdf' && (
                <div className={styles.contentWrap}>
                  {blobUrl ? <iframe src={blobUrl} className={styles.pdfFrame} title={file.name} /> : <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FilePdf size={64} weight="fill" /></div><div className={styles.fileHint}>Loading PDF...</div></div>}
                </div>
              )}
              {/* CSV */}
              {previewType === 'csv' && (
                <div className={styles.contentWrap}>
                  <div className={styles.tableWrap}>
                    {content ? (
                      <table className={styles.table}><tbody>{content.split('\n').slice(0, 20).map((line, i) => { const cols = line.split(','); return <tr key={i}>{cols.map((col, j) => <td key={j}>{col}</td>)}</tr> })}</tbody></table>
                    ) : <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileCsv size={64} weight="fill" /></div><div className={styles.fileHint}>Loading content...</div></div>}
                  </div>
                </div>
              )}
              {/* Code / Text */}
              {(previewType === 'code' || previewType === 'text') && (
                <div className={styles.contentWrap}>
                  {content ? (
                    <div className={styles.codeWrap}><div className={styles.lineNumbers}>{content.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div><pre className={styles.code}><code className={previewType === 'code' ? `language-${getFileExtension(file?.name)}` : ''}>{content}</code></pre></div>
                  ) : <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileText size={64} weight="fill" /></div><div className={styles.fileHint}>Loading content...</div></div>}
                </div>
              )}
              {/* Markdown */}
              {isMarkdown && (
                <div className={`${styles.contentWrap} ${styles.markdownWrap}`}>
                  {content ? (
                    <>
                      <div className={styles.markdown} ref={mdRef}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>{content}</ReactMarkdown>
                      </div>
                      {hasOutline && (
                        <div
                          className={`${styles.tickBar} ${outlineOpen ? styles.tickBarOpen : ''}`}
                          onMouseEnter={() => setOutlineOpen(true)}
                          onMouseLeave={() => setOutlineOpen(false)}
                        >
                          {outlineOpen ? (
                            <aside className={styles.outlinePanel} onClick={(e) => e.stopPropagation()}>
                              <nav className={styles.outlineNav}>
                                {headings.map((h) => (
                                  <button
                                    key={h.id}
                                    type="button"
                                    className={`${styles.outlineItem} ${styles[`outlineLv${h.level}`]} ${activeId === h.id ? styles.outlineItemActive : ''}`}
                                    title={h.text}
                                    onClick={() => scrollToHeading(h.id)}
                                  >
                                    {h.text}
                                  </button>
                                ))}
                              </nav>
                            </aside>
                          ) : (
                            <div className={styles.ticks} onClick={() => setOutlineOpen(v => !v)} title="Show outline">
                              {headings.map((h) => (
                                <span
                                  key={h.id}
                                  className={`${styles.tick} ${styles[`tickLv${h.level}`]} ${activeId === h.id ? styles.tickActive : ''}`}
                                  onClick={(e) => { e.stopPropagation(); scrollToHeading(h.id) }}
                                  title={h.text}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileText size={64} weight="fill" /></div><div className={styles.fileHint}>Loading content...</div></div>}
                </div>
              )}
              {/* Fallback */}
              {previewType === 'file' && (
                <div className={styles.contentWrap}>
                  <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><File size={64} weight="fill" /></div><div className={styles.fileHint}>{tc.previewNotAvailable || 'Preview not available. Download to view.'}</div></div>
                </div>
              )}
            </div>
            {previewType === 'csv' && content && content.split('\n').length > 20 && (
              <div className={styles.footer}>{tc.csvPreview || 'Showing first 20 rows of {count} rows'.replace('{count}', String(content.split('\n').length))}</div>
            )}
          </>
        )}
      </div>
    </>,
    document.body
  )
}