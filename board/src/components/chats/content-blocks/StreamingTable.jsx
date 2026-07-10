import { memo, useMemo } from 'react'
import StreamingText from './StreamingText'
import PacedMarkdown from './PacedMarkdown'
import { parseTableRow, isMarkdownTableRow, parseTableContent } from './helpers'
import styles from './StreamingTable.module.css'

export default memo(function StreamingTable({ content, prevContent }) {
  const parsed = useMemo(() => parseTableContent(content), [content])
  const prevParsed = useMemo(() => prevContent ? parseTableContent(prevContent) : null, [prevContent])

  if (!parsed || !parsed.headerCells.length) {
    return <StreamingText content={content} prevContent={prevContent} className={styles.responseMarkdownInlineTail} />
  }

  const { preamble, headerCells, dataRows } = parsed

  // parseTableContent puts every line after the separator into dataRows.
  // The table actually ends at the first non-table line — everything from
  // there on is regular markdown that must keep streaming below the table
  // (it used to be dropped until the stream finished, then popped in all
  // at once).
  let tableEnd = dataRows.length
  for (let i = 0; i < dataRows.length; i++) {
    if (dataRows[i].trim() === '' || !isMarkdownTableRow(dataRows[i])) {
      tableEnd = i
      break
    }
  }
  const rowLines = dataRows.slice(0, tableEnd)
  const postamble = dataRows.slice(tableEnd).join('\n').replace(/^\n+/, '')
  const tableIsTail = postamble === ''

  const prevDataRowCount = prevParsed?.dataRows?.filter(isMarkdownTableRow)?.length ?? 0

  // Only render complete rows (must match |...| pattern)
  const validRows = rowLines.filter(isMarkdownTableRow)

  return (
    <div className={styles.tableWrapper}>
      {preamble ? (
        <PacedMarkdown
          content={preamble}
          isStreaming={false}
          className={styles.tablePreamble}
        />
      ) : null}
      <table className={styles.streamingTable}>
        <thead className={styles.streamingTableHeader}>
          <tr className={styles.streamingTableHeaderRow}>
            {headerCells.map((cell, i) => (
              <th key={i} className={styles.streamingTableHeaderCell}>{cell}</th>
            ))}
          </tr>
        </thead>
        <tbody className={styles.streamingTableBody}>
          {validRows.map((row, rowIndex) => {
            const rawCells = parseTableRow(row)
            // Pad the row to the column count so the last cell (which may
            // still be streaming) doesn't create a jagged table layout
            // that reflows every keystroke.
            const cells = rawCells.slice(0, headerCells.length)
            while (cells.length < headerCells.length) cells.push('')

            const isNewRow = rowIndex >= prevDataRowCount
            const isLastRow = rowIndex === validRows.length - 1
            const lastFilledIndex = Math.max(0, rawCells.length - 1)

            return (
              <tr
                key={rowIndex}
                className={`${styles.streamingTableRow}${isNewRow ? ` ${styles.rowNew}` : ''}`}
              >
                {cells.map((cell, cellIndex) => {
                  // Only the last actually-streamed cell of the last row
                  // gets the incremental text animation — and only while
                  // the table is still the streaming tail (no content
                  // after it yet).
                  const isStreamingCell = tableIsTail && isLastRow && cellIndex === lastFilledIndex
                  if (isStreamingCell) {
                    const prevRow = prevParsed?.dataRows?.[rowIndex]
                    const prevCell = prevRow ? (parseTableRow(prevRow)[cellIndex] || '') : ''
                    return (
                      <td key={cellIndex} className={styles.streamingTableCell}>
                        <StreamingText content={cell} prevContent={prevCell} />
                      </td>
                    )
                  }
                  return (
                    <td key={cellIndex} className={styles.streamingTableCell}>{cell}</td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
      {postamble ? (
        <PacedMarkdown
          content={postamble}
          isStreaming
          className={styles.tablePreamble}
        />
      ) : null}
    </div>
  )
})
