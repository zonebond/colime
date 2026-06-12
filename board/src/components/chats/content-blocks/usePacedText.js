import { useState, useEffect, useRef } from 'react'

const TEXT_RENDER_PACE_MS = 24
const TEXT_RENDER_SNAP = /[\s.,!?;:)\]]/

function step(size) {
  if (size <= 12) return 2
  if (size <= 48) return 4
  if (size <= 96) return 8
  return Math.min(24, Math.ceil(size / 8))
}

function nextEnd(text, start) {
  const end = Math.min(text.length, start + step(text.length - start))
  const max = Math.min(text.length, end + 8)
  for (let i = end; i < max; i++) {
    if (TEXT_RENDER_SNAP.test(text[i] ?? '')) return i + 1
  }
  return end
}

export default function usePacedText(text, isStreaming) {
  const [shown, setShown] = useState(text)
  const shownRef = useRef(text)
  const timerRef = useRef(null)

  // Reset when streaming stops — immediately show full text
  useEffect(() => {
    if (!isStreaming) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      shownRef.current = text
      setShown(text)
    }
  }, [isStreaming, text])

  // Pacing loop
  useEffect(() => {
    if (!isStreaming) return

    const currentShown = shownRef.current

    // Reset if text doesn't start with what was shown (retraction)
    if (!text.startsWith(currentShown) || text.length < currentShown.length) {
      shownRef.current = text
      setShown(text)
      return
    }

    // Already showing everything — nothing to pace
    if (text.length === currentShown.length) return

    // Already pacing — skip (prevents double-scheduling)
    if (timerRef.current) return

    function tick() {
      timerRef.current = null
      const current = shownRef.current

      // Re-check: if streaming stopped during timeout
      if (!isStreaming) return

      // Re-check: if text changed in unexpected way
      if (!text.startsWith(current) || text.length < current.length) {
        shownRef.current = text
        setShown(text)
        return
      }

      const end = nextEnd(text, current.length)
      const next = text.slice(0, end)
      shownRef.current = next
      setShown(next)

      if (end < text.length) {
        timerRef.current = setTimeout(tick, TEXT_RENDER_PACE_MS)
      }
    }

    timerRef.current = setTimeout(tick, TEXT_RENDER_PACE_MS)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [text, isStreaming])

  return shown
}
