import { useMemo } from 'react'
import styles from './HighlightedText.module.css'

/**
 * Segments text into spans with reference highlights.
 * references: Array of { _type: 'file'|'agent', start: number, end: number }
 */
function segmentText(text, references) {
  if (!text || !references?.length) return [{ text, type: 'plain' }]

  const spans = references
    .filter((r) => r.start != null && r.end != null && r.start < r.end)
    .sort((a, b) => a.start - b.start)

  if (!spans.length) return [{ text, type: 'plain' }]

  // Merge overlapping spans, keeping file type over agent type
  const merged = [spans[0]]
  for (let i = 1; i < spans.length; i++) {
    const prev = merged[merged.length - 1]
    const curr = spans[i]
    if (curr.start <= prev.end) {
      prev.end = Math.max(prev.end, curr.end)
      if (curr._type === 'file') prev._type = 'file'
    } else {
      merged.push(curr)
    }
  }

  const segments = []
  let cursor = 0
  for (const span of merged) {
    if (span.start > cursor) {
      segments.push({ text: text.slice(cursor, span.start), type: 'plain' })
    }
    segments.push({ text: text.slice(span.start, span.end), type: span._type || 'reference' })
    cursor = span.end
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), type: 'plain' })
  }

  return segments
}

export default function HighlightedText({ text, references }) {
  const segments = useMemo(() => segmentText(text, references), [text, references])

  if (!text) return null

  return (
    <span className={styles.highlighted}>
      {segments.map((seg, i) =>
        seg.type === 'plain' ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <span key={i} data-highlight={seg.type}>
            {seg.text}
          </span>
        ),
      )}
    </span>
  )
}
