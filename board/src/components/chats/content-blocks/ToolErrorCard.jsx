import { useState } from 'react'
import { XCircle, CaretDown, Copy, Check } from '@phosphor-icons/react'
import { getToolEntry } from './toolRegistry'
import { relativizeText } from '@/lib/path'
import styles from './ToolErrorCard.module.css'

export default function ToolErrorCard({ toolName, error, title, subtitle, directory, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const [copied, setCopied] = useState(false)

  const rawError = (error || '')
  // Structured parse: strip "Error: " prefix and tool name prefix if present
  const stripped = rawError.replace(/^Error:\s*/, '').trim()
  const toolPrefix = toolName ? new RegExp(`^${toolName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*`, 'i') : null
  const cleaned = directory
    ? relativizeText(toolPrefix ? stripped.replace(toolPrefix, '') : stripped, directory)
    : (toolPrefix ? stripped.replace(toolPrefix, '') : stripped)
  const displayTitle = title || toolName || 'Tool'
  const displaySubtitle = subtitle || (stripped.includes(': ') ? stripped.split(': ')[0] : null) || 'Failed'

  const handleCopy = async () => {
    if (!cleaned) return
    await navigator.clipboard.writeText(cleaned)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const entry = getToolEntry(toolName)
  const Icon = entry?.icon

  return (
    <div className={`${styles.card} ${open ? styles.open : ''}`}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className={styles.icon}>
          {Icon ? <Icon size={16} weight="regular" /> : <XCircle size={16} weight="regular" />}
        </span>
        <span className={styles.title}>{displayTitle}</span>
        <span className={styles.subtitle}>{displaySubtitle}</span>
        <CaretDown
          size={12}
          weight="bold"
          className={`${styles.caret} ${open ? styles.caretOpen : ''}`}
        />
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.content}>
            <button
              type="button"
              className={styles.copyBtn}
              onClick={(e) => {
                e.stopPropagation()
                handleCopy()
              }}
            >
              {copied ? <Check size={14} weight="bold" /> : <Copy size={14} weight="regular" />}
              <span>{copied ? 'Copied' : 'Copy error'}</span>
            </button>
            {cleaned && <p className={styles.errorText}>{cleaned}</p>}
          </div>
        </div>
      )}
    </div>
  )
}
