import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './AnimatedNumber.module.css'

const TRACK = Array.from({ length: 30 }, (_, i) => i % 10)

function normalize(value) {
  return ((value % 10) + 10) % 10
}

function spin(from, to, direction) {
  if (from === to) return 0
  if (direction > 0) return (to - from + 10) % 10
  return -((from - to + 10) % 10)
}

function Digit({ value, direction }) {
  const [step, setStep] = useState(() => value + 10)
  const [animating, setAnimating] = useState(false)
  const lastRef = useRef(value)

  useEffect(() => {
    const last = lastRef.current
    lastRef.current = value
    const delta = spin(last, value, direction)
    if (!delta) {
      setAnimating(false)
      setStep(value + 10)
      return
    }
    setAnimating(true)
    setStep((prev) => prev + delta)
  }, [value, direction])

  const onTransitionEnd = useCallback(() => {
    setAnimating(false)
    setStep((prev) => normalize(prev) + 10)
  }, [])

  return (
    <span className={styles.digit}>
      <span
        className={styles.strip}
        data-animating={animating ? 'true' : 'false'}
        onTransitionEnd={onTransitionEnd}
        style={{
          '--animated-number-offset': step,
        }}
      >
        {TRACK.map((v, i) => (
          <span key={i} className={styles.cell}>{v}</span>
        ))}
      </span>
    </span>
  )
}

export default function AnimatedNumber({ value, className = '' }) {
  const target = useMemo(() => {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.round(value))
  }, [value])

  const [state, setState] = useState(() => target)
  const [direction, setDirection] = useState(1)
  const prevRef = useRef(state)

  useEffect(() => {
    const current = prevRef.current
    prevRef.current = target
    if (target === current) return
    setDirection(target > current ? 1 : -1)
    setState(target)
  }, [target])

  const label = useMemo(() => state.toString(), [state])
  const digits = useMemo(
    () =>
      Array.from(label, (char) => {
        const code = char.charCodeAt(0) - 48
        return code < 0 || code > 9 ? 0 : code
      }).reverse(),
    [label],
  )
  const width = useMemo(() => `${digits.length}ch`, [digits.length])

  return (
    <span className={`${styles.wrapper} ${className}`} aria-label={label}>
      <span className={styles.value} style={{ '--animated-number-width': width }}>
        {digits.map((d, i) => (
          <Digit key={i} value={d} direction={direction} />
        ))}
      </span>
    </span>
  )
}
