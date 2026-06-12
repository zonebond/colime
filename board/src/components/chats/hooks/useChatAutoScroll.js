import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export default function useChatAutoScroll({
  scrollAreaRef,
  composerWrapRef,
  contentRef,
  composerInputRef,
  messages,
  loading,
  isResponding,
  composerValue,
  chatId,
  anchorMessageId,
  setAnchorMessageId,
}) {
  const autoScrollRef = useRef(true)
  const lastMessageCountRef = useRef(0)

  const autoRef = useRef(undefined)
  const autoTimerRef = useRef(undefined)

  const settlingRef = useRef(false)
  const settleTimerRef = useRef(undefined)

  const [showScrollButton, setShowScrollButton] = useState(false)
  const [composerHeight, setComposerHeight] = useState(null)

  const isActive = useCallback(() => {
    return loading || isResponding || settlingRef.current
  }, [loading, isResponding])

  const distanceFromBottom = useCallback((el) => {
    return el.scrollHeight - el.clientHeight - el.scrollTop
  }, [])

  const canScroll = useCallback((el) => {
    return el.scrollHeight - el.clientHeight > 1
  }, [])

  const markAuto = useCallback((el) => {
    autoRef.current = {
      top: Math.max(0, el.scrollHeight - el.clientHeight),
      time: Date.now(),
    }
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => {
      autoRef.current = undefined
      autoTimerRef.current = undefined
    }, 1500)
  }, [])

  const isAuto = useCallback((el) => {
    const a = autoRef.current
    if (!a) return false
    if (Date.now() - a.time > 1500) {
      autoRef.current = undefined
      return false
    }
    return Math.abs(el.scrollTop - a.top) < 2
  }, [])

  const scrollToBottom = useCallback((behavior = 'smooth') => {
    const container = scrollAreaRef.current
    if (!container) return

    markAuto(container)

    if (behavior === 'smooth') {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }, [scrollAreaRef, markAuto])

  const autoScrollToBottom = useCallback((force = false) => {
    if (!force && !isActive()) return
    const container = scrollAreaRef.current
    if (!container) return

    const distance = distanceFromBottom(container)
    if (distance < 2) {
      markAuto(container)
      return
    }
    scrollToBottom('auto')
  }, [isActive, scrollAreaRef, distanceFromBottom, markAuto, scrollToBottom])

  const handleUserScrollStop = useCallback(() => {
    const container = scrollAreaRef.current
    if (!container) return
    if (!canScroll(container)) {
      if (autoScrollRef.current) {
        autoScrollRef.current = false
        setShowScrollButton(true)
      }
      return
    }
    if (autoScrollRef.current) {
      autoScrollRef.current = false
      setShowScrollButton(true)
    }
  }, [canScroll, scrollAreaRef])

  const updateScrollState = useCallback(() => {
    const container = scrollAreaRef.current
    if (!container) return

    const dist = container.scrollHeight - container.scrollTop - container.clientHeight
    const isNearBottom = dist < 200

    if (isNearBottom && !autoScrollRef.current) {
      autoScrollRef.current = true
      setShowScrollButton(false)
    } else if (!isNearBottom && autoScrollRef.current) {
      autoScrollRef.current = false
      setShowScrollButton(true)
    }
  }, [scrollAreaRef])

  // Auto-resize textarea based on content
  useLayoutEffect(() => {
    if (!composerInputRef.current) return
    const next = composerInputRef.current
    next.style.height = 'auto'
    const maxHeight = 220
    const minHeight = 28
    const height = Math.max(minHeight, Math.min(next.scrollHeight, maxHeight))
    next.style.height = `${height}px`
    next.style.overflowY = next.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }, [composerValue, composerInputRef])

  // Auto-scroll on new messages
  useLayoutEffect(() => {
    if (!scrollAreaRef.current) return
    const nextMessageCount = messages.length
    if (autoScrollRef.current || nextMessageCount > lastMessageCountRef.current) {
      requestAnimationFrame(() => {
        scrollToBottom('auto')
        updateScrollState()
      })
    }
    lastMessageCountRef.current = nextMessageCount
  }, [loading, isResponding, messages.length, scrollToBottom, updateScrollState, scrollAreaRef])

  // Scroll to bottom when loading finishes (after exit animation completes)
  const prevLoadingRef = useRef(false)
  useEffect(() => {
    const wasLoading = prevLoadingRef.current
    prevLoadingRef.current = loading
    if (!wasLoading || loading || messages.length === 0) return
    // Wait for ChatTimeline exit animation + messages render before scrolling
    const timer = setTimeout(() => {
      autoScrollRef.current = true
      lastMessageCountRef.current = 0
      scrollToBottom('auto')
    }, 400)
    return () => clearTimeout(timer)
  }, [loading, messages.length, scrollToBottom])

  // Reset scroll state on chat switch
  useEffect(() => {
    autoScrollRef.current = true
    lastMessageCountRef.current = 0
    autoRef.current = undefined
    settlingRef.current = false
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = undefined
    }
    setShowScrollButton(false)
    setComposerHeight(null)
    // Defer scroll to ensure DOM has settled after render
    requestAnimationFrame(() => {
      scrollToBottom('auto')
    })
  }, [chatId, scrollToBottom])

  // Scroll state is managed by the scroll event handler below.
  // We deliberately do NOT call updateScrollState on every render — doing so
  // would re-enable autoScrollRef when a click-triggered re-render happens
  // while the user is near (but not at) the bottom, causing an abrupt jump.

  // ResizeObserver — track composer height and auto-scroll
  useEffect(() => {
    const composerEl = composerWrapRef.current
    const contentEl = contentRef.current
    if (!composerEl && !contentEl) return

    const updateComposerHeight = () => {
      if (!composerEl) return
      const height = composerEl.offsetHeight
      setComposerHeight(height)
    }

    updateComposerHeight()

    const observer = new ResizeObserver(() => {
      updateComposerHeight()
      const container = scrollAreaRef.current
      if (container && !canScroll(container)) return
      if (!isActive()) return
      if (!autoScrollRef.current) return
      scrollToBottom('auto')
    })

    if (composerEl) observer.observe(composerEl)
    if (contentEl) observer.observe(contentEl)
    return () => observer.disconnect()
  }, [scrollToBottom, canScroll, isActive, composerWrapRef, contentRef, scrollAreaRef, chatId])

  // Maintain scroll position when composer height changes (e.g. user typing)
  useLayoutEffect(() => {
    if (composerHeight == null) return
    if (!autoScrollRef.current) return
    scrollToBottom('auto')
  }, [composerHeight, scrollToBottom])

  // 300ms settling period after response ends (matches opencode's working→settling transition)
  useEffect(() => {
    settlingRef.current = false
    if (settleTimerRef.current) {
      clearTimeout(settleTimerRef.current)
      settleTimerRef.current = undefined
    }

    if (loading || isResponding) return

    settlingRef.current = true
    settleTimerRef.current = setTimeout(() => {
      settlingRef.current = false
    }, 300)
  }, [loading, isResponding])

  // overflowAnchor management
  useEffect(() => {
    const el = scrollAreaRef.current
    if (!el) return
    el.style.overflowAnchor = autoScrollRef.current ? 'none' : 'auto'
  })

  // Scroll event handler
  useEffect(() => {
    const container = scrollAreaRef.current
    if (!container) return

    const handleScroll = () => {
      const el = scrollAreaRef.current
      if (!el) return

      if (!canScroll(el)) {
        if (!autoScrollRef.current) {
          autoScrollRef.current = true
          setShowScrollButton(false)
        }
        return
      }

      if (distanceFromBottom(el) < 10) {
        if (!autoScrollRef.current) {
          autoScrollRef.current = true
          setShowScrollButton(false)
        }
        return
      }

      if (!autoScrollRef.current && isAuto(el)) {
        autoScrollToBottom(false)
        return
      }

      if (autoScrollRef.current) {
        if (isActive() && distanceFromBottom(el) <= 2) return
        autoScrollRef.current = false
        setShowScrollButton(true)
      }

      // Clear anchor when user scrolls near bottom
      if (distanceFromBottom(el) < 200 && anchorMessageId) {
        setAnchorMessageId(null)
      }
    }

    container.addEventListener('scroll', handleScroll, { passive: true })
    return () => container.removeEventListener('scroll', handleScroll)
  }, [scrollAreaRef, canScroll, distanceFromBottom, isAuto, autoScrollToBottom, isActive, anchorMessageId, setAnchorMessageId])

  // Wheel event
  useEffect(() => {
    const container = scrollAreaRef.current
    if (!container) return

    const handleWheel = (e) => {
      if (e.deltaY >= 0) return
      const target = e.target instanceof Element ? e.target : undefined
      const nested = target?.closest('[data-scrollable]')
      if (nested && nested !== container) return
      handleUserScrollStop()
    }

    container.addEventListener('wheel', handleWheel, { passive: true })
    return () => container.removeEventListener('wheel', handleWheel)
  }, [scrollAreaRef, handleUserScrollStop])

  // Text selection
  useEffect(() => {
    const handleSelection = () => {
      if (!isActive()) return
      const selection = window.getSelection()
      if (selection && selection.toString().length > 0) {
        handleUserScrollStop()
      }
    }

    document.addEventListener('selectionchange', handleSelection)
    return () => document.removeEventListener('selectionchange', handleSelection)
  }, [isActive, handleUserScrollStop])

  const scrollToBottomSmooth = useCallback(() => {
    autoScrollRef.current = true
    setShowScrollButton(false)
    scrollToBottom('smooth')
  }, [scrollToBottom])

  return {
    showScrollButton,
    composerHeight,
    scrollToBottom,
    scrollToBottomSmooth,
    autoScrollRef,
  }
}
