import { useCallback, useEffect, useRef, useState } from 'react'

export default function useMessageKeyboard({ messages, scrollAreaRef, onCopyMessage }) {
  const [focusedIndex, setFocusedIndex] = useState(-1)
  const lastNavigatedRef = useRef(-1)
  const navTimeoutRef = useRef(null)

  useEffect(() => () => { if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current) }, [])

  const getVisibleMessageIndex = useCallback(() => {
    if (lastNavigatedRef.current >= 0) return lastNavigatedRef.current
    if (!scrollAreaRef?.current) return -1
    const container = scrollAreaRef.current
    const items = container.querySelectorAll('[data-message-index]')
    if (!items.length) return -1

    const containerRect = container.getBoundingClientRect()
    const containerCenter = containerRect.top + containerRect.height / 2

    let closestAssistantIndex = -1
    let closestAssistantDistance = Infinity
    let closestAnyIndex = -1
    let closestAnyDistance = Infinity

    items.forEach((item) => {
      const idx = parseInt(item.getAttribute('data-message-index'), 10)
      const rect = item.getBoundingClientRect()
      const itemCenter = rect.top + rect.height / 2
      const distance = Math.abs(itemCenter - containerCenter)

      if (distance < closestAnyDistance) {
        closestAnyDistance = distance
        closestAnyIndex = idx
      }

      if (idx < messages.length && messages[idx]?.role !== 'user' && distance < closestAssistantDistance) {
        closestAssistantDistance = distance
        closestAssistantIndex = idx
      }
    })

    return closestAssistantIndex >= 0 ? closestAssistantIndex : closestAnyIndex
  }, [scrollAreaRef, messages])

  const scrollToMessage = useCallback((index) => {
    if (index < 0) return
    const container = scrollAreaRef?.current
    if (!container) return

    lastNavigatedRef.current = index
    if (navTimeoutRef.current) clearTimeout(navTimeoutRef.current)
    navTimeoutRef.current = setTimeout(() => {
      navTimeoutRef.current = null
      lastNavigatedRef.current = -1
    }, 800)

    const el = container.querySelector(`[data-message-index="${index}"]`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [scrollAreaRef])

  useEffect(() => {
    const handleKeyDown = (e) => {
      const tag = e.target?.tagName
      const isEditing = tag === 'INPUT' || tag === 'TEXTAREA' || e.target?.isContentEditable

      if (e.key === 'Escape' && focusedIndex >= 0) {
        setFocusedIndex(-1)
        return
      }

      if (isEditing) return

      if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && messages.length > 0) {
        e.preventDefault()
        const visibleIndex = getVisibleMessageIndex()
        const current = visibleIndex >= 0 ? visibleIndex : 0

        let target = current
        if (e.key === 'ArrowUp') {
          for (let i = current - 1; i >= 0; i--) {
            if (messages[i]?.role !== 'user') {
              target = i
              break
            }
          }
        } else {
          for (let i = current + 1; i < messages.length; i++) {
            if (messages[i]?.role !== 'user') {
              target = i
              break
            }
          }
        }

        setFocusedIndex(target)
        scrollToMessage(target)
        return
      }

      if (e.key === 'c' && (e.metaKey || e.ctrlKey) && focusedIndex >= 0 && focusedIndex < messages.length) {
        const msg = messages[focusedIndex]
        const content = msg.role === 'user' ? msg.content : (msg.contentBlocks?.filter((b) => b.type === 'text').map((b) => b.content).join('\n\n') || msg.content)
        if (content) {
          navigator.clipboard.writeText(content).catch(() => {})
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [messages, focusedIndex, onCopyMessage, getVisibleMessageIndex, scrollToMessage])

  return { focusedIndex, scrollToMessage }
}
