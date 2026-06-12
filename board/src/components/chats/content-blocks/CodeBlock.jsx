import { createPortal } from 'react-dom'
import { memo, useEffect, useRef, useState } from 'react'
import { Check, Copy, FileArrowDown, Lightning, SquaresFour, X } from '@phosphor-icons/react'
import { getHighlighter, highlightSync } from '@/lib/highlight'
import sanitizeHtml from '@/lib/sanitize'
import styles from './CodeBlock.module.css'

const CODE_COLLAPSE_THRESHOLD = 20

export default memo(function CodeBlock({ children, className, content, language: langProp }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [output, setOutput] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [highlighted, setHighlighted] = useState(null)
  const codeRef = useRef(null)

  const getCodeText = (node) => {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(getCodeText).join('')
    if (typeof node === 'object' && node !== null && node.props?.children) {
      return getCodeText(node.props.children)
    }
    return ''
  }

  const codeText = content ?? getCodeText(children)
  const lines = codeText.split('\n')
  const lineCount = lines.length
  const shouldCollapse = lineCount > CODE_COLLAPSE_THRESHOLD

  const language = langProp || (() => {
    if (!className) return null
    const match = className.match(/language-(\w+)/)
    return match ? match[1] : null
  })()

  const fileExtension = language ? {
    javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts',
    python: 'py', py: 'py', ruby: 'rb', rust: 'rs', go: 'go',
    java: 'java', c: 'c', cpp: 'cpp', csharp: 'cs', swift: 'swift',
    kotlin: 'kt', php: 'php', html: 'html', css: 'css', scss: 'scss',
    json: 'json', xml: 'xml', yaml: 'yml', sql: 'sql', bash: 'sh',
    shell: 'sh', markdown: 'md', md: 'md', txt: 'txt',
  }[language.toLowerCase()] || language : 'txt'

  // Initialize highlighter and highlight code
  useEffect(() => {
    let cancelled = false

    getHighlighter().then(() => {
      if (cancelled) return
      const result = highlightSync(codeText, language || 'text')
      if (!cancelled) setHighlighted(result)
    })

    return () => { cancelled = true }
  }, [codeText, language])

  const handleCopy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(codeText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // copy failed
    }
  }

  const handleDownload = (e) => {
    e.stopPropagation()
    const blob = new Blob([codeText], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `code.${fileExtension}`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleFullscreen = (e) => {
    e.stopPropagation()
    setIsFullscreen((prev) => !prev)
  }

  const canRun = language === 'js' || language === 'javascript'

  const handleRun = () => {
    const logs = []
    const originalLog = console.log
    console.log = (...args) => logs.push(args.map((a) => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' '))
    try {
      const result = new Function(codeText)()
      if (result !== undefined) logs.push(String(result))
      setOutput(logs.join('\n') || '(no output)')
    } catch (err) {
      setOutput(`Error: ${err.message}`)
    } finally {
      console.log = originalLog
    }
  }

  const block = (
    <div ref={codeRef} className={`${styles.codeBlockWrap} ${!expanded ? styles.codeBlockCollapsed : ''} ${isFullscreen ? styles.codeBlockFullscreen : ''}`}>
      <div className={styles.codeBlockHeader}>
        {language ? (
          <span className={styles.codeLanguage}>{language}</span>
        ) : <span />}
        <div className={styles.codeHeaderActions}>
          {shouldCollapse && !isFullscreen && (
            <button
              type="button"
              className={styles.codeExpandBtn}
              onClick={() => setExpanded((prev) => !prev)}
            >
              {expanded ? 'Collapse' : `${lineCount} lines`}
            </button>
          )}
          <button type="button" className={styles.codeActionBtn} onClick={handleCopy} title="Copy code">
            {copied ? <Check size={14} weight="bold" /> : <Copy size={14} />}
            <span className={styles.codeActionLabel}>{copied ? 'Copied' : 'Copy'}</span>
          </button>
          <button type="button" className={styles.codeActionBtn} onClick={handleDownload} title="Download code">
            <FileArrowDown size={14} />
          </button>
          <button type="button" className={styles.codeActionBtn} onClick={handleFullscreen} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            <SquaresFour size={14} />
          </button>
          {canRun && (
            <button type="button" className={styles.codeRunBtn} onClick={handleRun} title="Run code">
              <Lightning size={14} weight="fill" />
              <span className={styles.codeActionLabel}>Run</span>
            </button>
          )}
        </div>
      </div>
      <div className={styles.codeBlockBody}>
        <div className={styles.lineNumbers} aria-hidden="true">
          {lines.map((_, i) => (
            <span key={i}>{i + 1}</span>
          ))}
        </div>
        {highlighted ? (
          <div className={styles.codeBlock} dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlighted) }} />
        ) : (
          <pre className={styles.codeBlock}><code>{children}</code></pre>
        )}
      </div>
      {output !== null && (
        <div className={styles.codeOutput}>
          <div className={styles.codeOutputHeader}>
            <span>Output</span>
            <button type="button" className={styles.codeOutputClose} onClick={() => setOutput(null)}>
              <X size={12} weight="bold" />
            </button>
          </div>
          <pre className={styles.codeOutputContent}>{output}</pre>
        </div>
      )}
    </div>
  )

  if (isFullscreen) {
    return createPortal(
      <div className={styles.codeFullscreenOverlay} onClick={() => setIsFullscreen(false)}>
        {block}
      </div>,
      document.body
    )
  }

  return block
})
