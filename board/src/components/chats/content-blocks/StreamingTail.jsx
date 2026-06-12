import { memo, useRef, useEffect } from 'react'
import PacedMarkdown from './PacedMarkdown'
import StreamingTable from './StreamingTable'
import { hasTableStructure } from './helpers'
import styles from './StreamingTail.module.css'

function usePrevious(value) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current = value
  })
  return ref.current
}

export default memo(function StreamingTail({ block, isStreaming = true }) {
  const prevContent = usePrevious(block.content)
  const hasTable = hasTableStructure(block.content)

  return (
    <div className={styles.streamingTail}>
      {block.content ? (
        hasTable ? (
          <StreamingTable content={block.content} prevContent={prevContent} />
        ) : (
          <PacedMarkdown
            content={block.content}
            isStreaming={isStreaming}
            className={styles.responseMarkdownStreaming}
          />
        )
      ) : null}
      <span className={styles.streamingCursor} />
    </div>
  )
})
