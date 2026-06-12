import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import styles from './TextReveal.module.css'

const px = (value, fallback) => {
  if (typeof value === 'number') return `${value}px`
  if (typeof value === 'string') return value
  return `${fallback}px`
}

const ms = (value, fallback) => {
  if (typeof value === 'number') return `${value}ms`
  if (typeof value === 'string') return value
  return `${fallback}ms`
}

const pct = (value, fallback) => {
  const v = value ?? fallback
  return `${v}%`
}

/**
 * TextReveal — animated text transitions with mask-position wipe.
 *
 * When text changes and the new value starts with the old one,
 * the content updates in-place with no transition.
 * Otherwise, the old text wipes out downward while the new text
 * enters from above using a CSS mask-position animation.
 */
export default function TextReveal({
  text = '',
  className = '',
  duration = 450,
  edge = 17,
  travel = 0,
  spring,
  springSoft,
  growOnly = true,
  truncate = false,
}) {
  const [cur, setCur] = useState(text)
  const [old, setOld] = useState(null)
  const [width, setWidth] = useState('auto')
  const [ready, setReady] = useState(false)
  const [swapping, setSwapping] = useState(false)

  const inRef = useRef(null)
  const outRef = useRef(null)
  const frameRef = useRef(null)

  const measure = useCallback(() => {
    const wIn = inRef.current?.scrollWidth ?? 0
    const wOut = outRef.current?.scrollWidth ?? 0
    const next = Math.max(wIn, wOut)
    if (next <= 0) return
    if (growOnly) {
      const prev = Number.parseFloat(width)
      if (Number.isFinite(prev) && next <= prev) return
    }
    setWidth(`${next}px`)
  }, [growOnly, width])

  useEffect(() => {
    if (typeof text !== 'string' || text === cur) return
    if (typeof cur === 'string' && typeof text === 'string' && text.startsWith(cur)) {
      setCur(text)
      measure()
      return
    }
    setSwapping(true)
    setOld(cur)
    setCur(text)

    if (typeof requestAnimationFrame !== 'function') {
      measure()
      void inRef.current?.offsetHeight
      setSwapping(false)
      return
    }
    if (frameRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(frameRef.current)
    }
    frameRef.current = requestAnimationFrame(() => {
      measure()
      void inRef.current?.offsetHeight
      setSwapping(false)
      frameRef.current = null
    })
  }, [text]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    measure()
    const fonts = typeof document !== 'undefined' ? document.fonts : undefined
    if (typeof requestAnimationFrame !== 'function') {
      setReady(true)
      return
    }
    if (!fonts) {
      requestAnimationFrame(() => setReady(true))
      return
    }
    void fonts.ready.finally(() => {
      measure()
      requestAnimationFrame(() => setReady(true))
    })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const wrapperClass = [
    styles.wrapper,
    !ready ? styles.notReady : '',
    swapping ? styles.swapping : '',
    truncate ? styles.truncate : '',
    className,
  ].filter(Boolean).join(' ')

  return (
    <span
      className={wrapperClass}
      aria-label={text ?? ''}
      style={{
        '--text-reveal-duration': ms(duration, 450),
        '--text-reveal-edge': pct(edge, 17),
        '--text-reveal-travel': px(travel, 0),
        '--text-reveal-spring': spring ?? 'cubic-bezier(0.34, 1.08, 0.64, 1)',
        '--text-reveal-spring-soft': springSoft ?? 'cubic-bezier(0.34, 1, 0.64, 1)',
      }}
    >
      <span className={styles.track} style={{ width: truncate ? '100%' : width }}>
        <span className={styles.entering} ref={inRef}>
          {cur ?? ' '}
        </span>
        <span className={styles.leaving} ref={outRef}>
          {old ?? ' '}
        </span>
      </span>
    </span>
  )
}
