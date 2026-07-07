import { useEffect, useRef, useState, useCallback } from 'react'
import { Check, Copy, DownloadSimple, DotsThreeOutline, File, FilePdf, FileCsv, FileCode, FileDoc, FileText, FileXls, X, Slideshow, ArrowsOutSimple, ArrowsInSimple } from '@phosphor-icons/react'
import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSlug from 'rehype-slug'
import DOMPurify from 'dompurify'
import { useTranslation } from '@/i18n'
import { ensureLanguage, highlightSync } from '@/lib/highlight'
import sanitizeHtml from '@/lib/sanitize'
import { AttachmentImage } from '@/components/attachments/AttachmentCard'
import CodeBlock from './content-blocks/CodeBlock'
import { getFileExtension } from './message-list/helpers'
import styles from './AttachmentPreviewModal.module.css'

const TYPE_ICON = {
  pdf: FilePdf, csv: FileCsv, code: FileCode, text: FileText, markdown: FileText, docx: FileDoc, sheet: FileXls, file: File,
}
const TYPE_LABEL = {
  markdown: 'Markdown', code: 'Code', text: 'Text', csv: 'Spreadsheet', pdf: 'PDF Document', docx: 'Word Document', sheet: 'Spreadsheet', file: 'File',
}

const SHEET_MAX_ROWS = 200

/** Word (.docx) preview — converts to sanitized HTML via lazily-loaded mammoth. */
function DocxView({ blobUrl, tc }) {
  const [html, setHtml] = useState(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!blobUrl) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const [mammoth, response] = await Promise.all([import('mammoth/mammoth.browser'), fetch(blobUrl)])
        const arrayBuffer = await response.arrayBuffer()
        const result = await (mammoth.default ?? mammoth).convertToHtml({ arrayBuffer })
        if (!cancelled) setHtml(DOMPurify.sanitize(result.value))
      } catch (_) {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [blobUrl])

  if (failed) {
    return <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileDoc size={64} weight="fill" /></div><div className={styles.fileHint}>{tc.previewFailed || 'Preview failed. Download to view.'}</div></div>
  }
  if (html == null) {
    return <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileDoc size={64} weight="fill" /></div><div className={styles.fileHint}>{tc.previewLoading || 'Loading preview...'}</div></div>
  }
  return <div className={styles.docx} dangerouslySetInnerHTML={{ __html: html }} />
}

/** Excel (.xlsx/.xls) preview — parses via lazily-loaded SheetJS. */
function SheetView({ blobUrl, tc }) {
  const [workbook, setWorkbook] = useState(null)
  const [failed, setFailed] = useState(false)
  const [activeSheet, setActiveSheet] = useState(0)

  useEffect(() => {
    if (!blobUrl) return undefined
    let cancelled = false
    ;(async () => {
      try {
        const [XLSX, response] = await Promise.all([import('xlsx'), fetch(blobUrl)])
        const arrayBuffer = await response.arrayBuffer()
        const wb = XLSX.read(arrayBuffer, { type: 'array' })
        const sheets = wb.SheetNames.map((name) => ({
          name,
          rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '' }),
        }))
        if (!cancelled) setWorkbook(sheets)
      } catch (_) {
        if (!cancelled) setFailed(true)
      }
    })()
    return () => { cancelled = true }
  }, [blobUrl])

  if (failed) {
    return <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileXls size={64} weight="fill" /></div><div className={styles.fileHint}>{tc.previewFailed || 'Preview failed. Download to view.'}</div></div>
  }
  if (workbook == null) {
    return <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileXls size={64} weight="fill" /></div><div className={styles.fileHint}>{tc.previewLoading || 'Loading preview...'}</div></div>
  }

  const sheet = workbook[activeSheet] ?? workbook[0]
  const rows = sheet?.rows ?? []
  return (
    <>
      {workbook.length > 1 && (
        <div className={styles.sheetTabs}>
          {workbook.map((s, i) => (
            <button
              key={s.name}
              type="button"
              className={`${styles.sheetTab} ${i === activeSheet ? styles.sheetTabActive : ''}`}
              onClick={() => setActiveSheet(i)}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <tbody>
            {rows.slice(0, SHEET_MAX_ROWS).map((row, i) => (
              <tr key={i}>{row.map((cell, j) => <td key={j}>{String(cell)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > SHEET_MAX_ROWS && (
        <div className={styles.footer}>{(tc.sheetPreview || 'Showing first {max} rows of {count} rows').replace('{max}', String(SHEET_MAX_ROWS)).replace('{count}', String(rows.length))}</div>
      )}
    </>
  )
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

  // ESC closes the preview
  useEffect(() => {
    if (!attachment) return undefined
    function handleKey(e) {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [attachment, onClose])

  // Syntax highlighting for code previews via the shared lazy shiki engine
  const [highlightedCode, setHighlightedCode] = useState(null)
  const isCodePreview = attachment?.previewType === 'code'
  const codeLang = getFileExtension(attachment?.file?.name || '')
  useEffect(() => {
    setHighlightedCode(null)
    if (!isCodePreview || !content) return undefined
    let cancelled = false
    ensureLanguage(codeLang)
      .then(() => {
        if (cancelled) return
        setHighlightedCode(highlightSync(content, codeLang || 'text'))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [isCodePreview, content, codeLang])

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
                <span className={styles.typeChip} title={TYPE_LABEL[previewType] || 'File'}>
                  <Icon size={15} weight="fill" />
                </span>
                <span className={styles.fileName}>{file.name}</span>
                {truncated && <span className={styles.truncatedBadge}>{tc.previewTruncated || 'Preview truncated'}</span>}
              </div>
              <div className={styles.headerActions}>
                {onCopyCode && (
                  <span className={styles.headerBtnWrap}>
                    <button type="button" className={styles.downloadBtn} onClick={onCopyCode}>
                      {codeCopied ? <Check size={16} weight="bold" /> : <Copy size={16} weight="bold" />}
                    </button>
                    <span className={styles.headerTooltip}>{codeCopied ? (tc.copied || 'Copied!') : (tc.copy || 'Copy')}</span>
                  </span>
                )}
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
                    <div className={styles.codeWrap}>
                      <div className={styles.lineNumbers}>{content.split('\n').map((_, i) => <span key={i}>{i + 1}</span>)}</div>
                      {highlightedCode ? (
                        <div className={styles.codeHighlighted} dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlightedCode) }} />
                      ) : (
                        <pre className={styles.code}><code>{content}</code></pre>
                      )}
                    </div>
                  ) : <div className={styles.fileCenter}><div className={styles.fileCenterIcon}><FileText size={64} weight="fill" /></div><div className={styles.fileHint}>{tc.previewLoading || 'Loading preview...'}</div></div>}
                </div>
              )}
              {/* Markdown */}
              {isMarkdown && (
                <div className={`${styles.contentWrap} ${styles.markdownWrap}`}>
                  {content ? (
                    <>
                      <div className={styles.markdown} ref={mdRef}>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSlug]}
                          components={{
                            pre: ({ children }) => {
                              const codeChild = Array.isArray(children) ? children[0] : children
                              const codeClassName = codeChild?.props?.className || ''
                              return <CodeBlock className={codeClassName}>{codeChild?.props?.children || children}</CodeBlock>
                            },
                          }}
                        >{content}</ReactMarkdown>
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
              {/* Word document */}
              {previewType === 'docx' && (
                <div className={styles.contentWrap}>
                  <DocxView blobUrl={blobUrl} tc={tc} />
                </div>
              )}
              {/* Excel spreadsheet */}
              {previewType === 'sheet' && (
                <div className={styles.contentWrap}>
                  <SheetView blobUrl={blobUrl} tc={tc} />
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