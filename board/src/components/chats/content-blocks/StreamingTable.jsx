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
  const prevDataRowCount = prevParsed?.dataRows?.length ?? 0

  // Only render complete rows (must match |...| pattern)
  const validRows = dataRows.filter(isMarkdownTableRow)

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
            const cells = parseTableRow(row)
            const isNewRow = rowIndex >= prevDataRowCount
            const isLastRow = rowIndex === validRows.length - 1

            return (
              <tr
                key={rowIndex}
                className={`${styles.streamingTableRow}${isNewRow ? ` ${styles.rowNew}` : ''}`}
              >
                {cells.map((cell, cellIndex) => {
                  const isLastCell = isLastRow && cellIndex === cells.length - 1
                  if (isLastCell) {
                    const prevCell = prevParsed?.dataRows?.[rowIndex]
                      ? (parseTableRow(prevParsed.dataRows[rowIndex])[cellIndex] || '')
                      : ''
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
    </div>
  )
})
