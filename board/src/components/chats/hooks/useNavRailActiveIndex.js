import { useState, useEffect, useRef } from 'react'

export default function useNavRailActiveIndex({ scrollAreaRef, messageCount }) {
  const [activeIndex, setActiveIndex] = useState(-1)
  const activeRef = useRef(-1)
  const rafRef = useRef(null)

  useEffect(() => {
    const container = scrollAreaRef.current
    if (!container || messageCount === 0) {
      setActiveIndex(-1)
      activeRef.current = -1
      return
    }

    const compute = () => {
      const items = container.querySelectorAll('[data-message-index]')
      if (items.length === 0) return

      const containerRect = container.getBoundingClientRect()
      const anchorPoint = container.scrollTop + container.clientHeight * 0.4
      let closestIdx = -1
      let closestDist = Infinity

      for (const item of items) {
        const idx = parseInt(item.getAttribute('data-message-index'), 10)
        const rect = item.getBoundingClientRect()
        const itemTop = rect.top - containerRect.top + container.scrollTop
        const itemCenter = itemTop + rect.height / 2
        const d = Math.abs(itemCenter - anchorPoint)
        if (d < closestDist) {
          closestDist = d
          closestIdx = idx
        }
      }

      if (closestIdx !== activeRef.current) {
        activeRef.current = closestIdx
        setActiveIndex(closestIdx)
      }
    }

    const handleScroll = () => {
      if (rafRef.current) return
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null
        compute()
      })
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    compute()

    return () => {
      container.removeEventListener('scroll', handleScroll)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [scrollAreaRef, messageCount])

  return activeIndex
}
