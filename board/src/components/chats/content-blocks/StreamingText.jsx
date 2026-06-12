import { memo, useMemo } from 'react'
import styles from './StreamingText.module.css'

export default memo(function StreamingText({ content, prevContent, className = '' }) {
  const chars = useMemo(() => content.split(''), [content])
  const prevLength = prevContent?.length ?? 0

  return (
    <span className={className}>
      {chars.map((char, i) => {
        const isNew = i >= prevLength
        const delay = isNew ? `${Math.min(i - prevLength, 20) * 20}ms` : '0ms'
        return (
          <span
            key={i}
            className={isNew ? styles.charAnimated : ''}
            style={{ animationDelay: delay }}
          >
            {char}
          </span>
        )
      })}
    </span>
  )
})
