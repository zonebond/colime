import { useRef, useEffect, useState, useMemo } from 'react'
import styles from './TextShimmer.module.css'

export default function TextShimmer({ text, active = true, offset = 0, className = '', as: Tag = 'span' }) {
  const [run, setRun] = useState(active)
  const timerRef = useRef(null)
  const swap = 220

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    if (active) {
      setRun(true)
      return
    }

    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setRun(false)
    }, swap)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [active])

  const style = useMemo(() => ({
    '--text-shimmer-swap': `${swap}ms`,
    '--text-shimmer-index': `${offset}`,
  }), [offset])

  return (
    <Tag
      className={`${styles.shimmer} ${className}`}
      aria-label={text}
      data-active={active ? 'true' : 'false'}
      style={style}
    >
      <span className={styles.shimmerChar} aria-hidden="true">
        <span className={styles.shimmerBase}>{text}</span>
        <span className={styles.shimmerSweep} data-run={run ? 'true' : 'false'}>{text}</span>
      </span>
    </Tag>
  )
}
