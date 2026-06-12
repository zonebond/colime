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

export function parseTableRow(rowStr) {
  const cells = rowStr.split('|').slice(1, -1).map(cell => cell.trim())
  return cells
}

export function isMarkdownTableRow(str) {
  return /^\|.*\|$/.test(str.trim())
}

export function isTableSeparator(str) {
  return /^\|[\s\-|:]+$/.test(str.trim())
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
