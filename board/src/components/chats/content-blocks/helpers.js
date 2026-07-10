export function parseUrlSegments(text) {
  const urlRegex = /(https?:\/\/[^\s<]+)/g
  const segments = []
  let lastIndex = 0
  let match

  while ((match = urlRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    }
    try {
      const url = match[0]
      const parsed = new URL(url)
      const hostname = parsed.hostname.replace(/^www\./, '')
      segments.push({ type: 'url', url, hostname })
    } catch {
      segments.push({ type: 'text', content: match[0] })
    }
    lastIndex = match.index + match[0].length
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', content: text.slice(lastIndex) })
  }

  return segments
}

/**
 * Split a markdown table row into cells. Tolerates rows that are still
 * being streamed — the trailing '|' may be absent, in which case the
 * unfinished last cell is preserved as-is instead of being sliced off.
 */
export function parseTableRow(rowStr) {
  let s = rowStr.trim()
  if (s.startsWith('|')) s = s.slice(1)
  if (s.endsWith('|')) s = s.slice(0, -1)
  return s.split('|').map((cell) => cell.trim())
}

/**
 * Whether a line looks like a markdown table row. Streaming-tolerant:
 * the closing '|' is not required so the actively-streaming last row
 * still counts (previously it disappeared until its trailing pipe arrived).
 */
export function isMarkdownTableRow(str) {
  const t = str.trim()
  return t.length > 1 && t.startsWith('|')
}

/**
 * Whether a line looks like a markdown table separator. Recognizes
 * partial separators too (e.g. '|-' before the rest of the dashes and
 * pipes arrive), which lets the table renderer switch on earlier and
 * reduces the visible text→table flip.
 */
export function isTableSeparator(str) {
  const t = str.trim()
  if (!t.startsWith('|')) return false
  const body = t.slice(1)
  return body.length > 0 && /^[\s\-|:]+$/.test(body) && body.includes('-')
}

export function hasTableStructure(content) {
  if (!content || !content.includes('|')) return false
  const lines = content.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (isMarkdownTableRow(lines[i]) && isTableSeparator(lines[i + 1])) {
      return true
    }
  }
  return false
}

export function parseTableContent(content) {
  const lines = content.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    if (isMarkdownTableRow(lines[i]) && isTableSeparator(lines[i + 1])) {
      return {
        preamble: lines.slice(0, i).join('\n'),
        headerCells: parseTableRow(lines[i]),
        dataRows: lines.slice(i + 2),
        headerIndex: i,
        separatorIndex: i + 1,
      }
    }
  }
  return null
}
