import { useState, useEffect, useRef, useCallback } from 'react'
import TextShimmer from './TextShimmer'
import styles from './ToolStatusTitle.module.css'

export default function ToolStatusTitle({ active, activeText, doneText }) {
  const [animating, setAnimating] = useState(false)
  const [width, setWidth] = useState(undefined)
  const activeRef = useRef(null)
  const doneRef = useRef(null)
  const timerRef = useRef(null)

  const measure = useCallback((el) => {
    if (!el) return
    return `${Math.ceil(el.getBoundingClientRect().width)}px`
  }, [])

  useEffect(() => {
    const first = measure(active ? activeRef.current : doneRef.current)
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }

    setAnimating(true)
    setWidth(first)

    const second = measure(active ? activeRef.current : doneRef.current)
    if (!first || !second || first === second) {
      timerRef.current = setTimeout(() => {
        setAnimating(false)
        setWidth(undefined)
      }, 480)
      return
    }

    requestAnimationFrame(() => {
      setWidth(second)
      timerRef.current = setTimeout(() => {
        setAnimating(false)
        setWidth(undefined)
      }, 480)
    })

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [active, activeText, doneText, measure])

  return (
    <span
      className={`${styles.title} ${animating ? styles.animating : ''}`}
      aria-label={active ? activeText : doneText}
    >
      <span
        className={styles.swap}
        style={{ width: animating ? width : undefined }}
      >
        {(animating || active) && (
          <span className={styles.stateText} ref={activeRef}>
            <TextShimmer text={activeText} active={active} />
          </span>
        )}
        {(animating || !active) && (
          <span className={styles.stateText} ref={doneRef}>
            <TextShimmer text={doneText} active={false} />
          </span>
        )}
      </span>
    </span>
  )
}
