import { useMemo } from 'react'
import styles from './DiagnosticsDisplay.module.css'

function getDiagnostics(diagnostics, filePath) {
  if (!diagnostics || !filePath) return null
  // Support both array and keyed-map (diagnosticsByFile) shapes
  let matches
  if (Array.isArray(diagnostics)) {
    matches = diagnostics
      .filter((d) => {
        const fp = d.filePath || d.file
        return fp === filePath && (d.severity === 1 || d.severity === 'error')
      })
      .slice(0, 3)
  } else if (typeof diagnostics === 'object') {
    // Keyed map: { [filePath]: [...] }
    const list = diagnostics[filePath]
    if (!Array.isArray(list)) return null
    matches = list
      .filter((d) => d.severity === 1 || d.severity === 'error')
      .slice(0, 3)
  } else {
    return null
  }
  return matches.length > 0 ? matches : null
}

function formatLocation(d) {
  // Support opencode range shape: { range: { start: { line, character } } }
  if (d.range?.start) {
    return `[${d.range.start.line + 1}:${d.range.start.character + 1}]`
  }
  // Support flat shape: { line, column } or { line, character }
  const char = d.character ?? d.column
  if (d.line !== undefined && char !== undefined) {
    return `[${d.line}:${char}]`
  }
  return null
}

export default function DiagnosticsDisplay({ diagnostics, filePath }) {
  const items = useMemo(() => getDiagnostics(diagnostics, filePath), [diagnostics, filePath])

  if (!items) return null

  return (
    <div className={styles.diagnostics}>
      {items.map((d, i) => (
        <div key={i} className={styles.diagnosticItem}>
          <span className={styles.label}>Error</span>
          <span className={styles.location}>
            {formatLocation(d)}
          </span>
          <span className={styles.message}>{d.message}</span>
        </div>
      ))}
    </div>
  )
}
