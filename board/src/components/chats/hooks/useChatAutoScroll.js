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

  // Programmatic smooth scrolls fire intermediate scroll events that look
  // like user scrolling — suppress follow-cancellation until this time.
  const smoothUntilRef = useRef(0)
  // Frame-by-frame follow animation for streaming output.
  const followAnimRef = useRef(null)
  const followLastSetRef = useRef(-1)

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
      smoothUntilRef.current = Date.now() + 1200
      container.scrollTo({
        top: container.scrollHeight,
        behavior: 'smooth',
      })
    } else {
      container.scrollTop = container.scrollHeight
    }
  }, [scrollAreaRef, markAuto])

  const stopFollowAnim = useCallback(() => {
    if (followAnimRef.current) cancelAnimationFrame(followAnimRef.current)
    followAnimRef.current = null
    followLastSetRef.current = -1
  }, [])

  // Frame-by-frame smooth follow for streaming output: each frame eases
  // toward the (continuously moving) bottom, so the tail glides after new
  // content and never leaves lines parked under the composer overlay.
  const followBottom = useCallback(() => {
    const container = scrollAreaRef.current
    if (!container) return
    if (followAnimRef.current) return // chase already running

    const step = () => {
      followAnimRef.current = null
      const el = scrollAreaRef.current
      if (!el || !autoScrollRef.current) {
        followLastSetRef.current = -1
        return
      }
      // Someone else moved the scroll position between frames (scrollbar
      // drag, keyboard) — the user took over, stop following.
      if (followLastSetRef.current >= 0 && Math.abs(el.scrollTop - followLastSetRef.current) > 4) {
        followLastSetRef.current = -1
        autoScrollRef.current = false
        setShowScrollButton(true)
        return
      }

      const target = el.scrollHeight - el.clientHeight
      const dist = target - el.scrollTop
      if (dist <= 0.5) {
        el.scrollTop = target
        followLastSetRef.current = -1
        markAuto(el)
        return
      }
      // Ease 25% of the remaining distance per frame (min 2px) — converges
      // in ~200ms yet stays fluid while the target keeps moving.
      el.scrollTop = el.scrollTop + Math.max(dist * 0.25, Math.min(dist, 2))
      followLastSetRef.current = el.scrollTop
      followAnimRef.current = requestAnimationFrame(step)
    }

    followAnimRef.current = requestAnimationFrame(step)
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
    // Wait for ChatTimeline exit animation + messages render, then keep
    // re-pinning briefly — late-rendering content grows the scroll height
    // after the first scroll and would hide the last rows behind the composer.
    const timers = [400, 800, 1400].map((delay, i) =>
      setTimeout(() => {
        if (i === 0) {
          autoScrollRef.current = true
          lastMessageCountRef.current = 0
          scrollToBottom('auto')
          return
        }
        if (!autoScrollRef.current) return
        const container = scrollAreaRef.current
        if (!container) return
        if (distanceFromBottom(container) > 2) scrollToBottom('auto')
      }, delay)
    )
    return () => timers.forEach(clearTimeout)
  }, [loading, messages.length, scrollToBottom, distanceFromBottom, scrollAreaRef])

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
    smoothUntilRef.current = 0
    stopFollowAnim()
    setShowScrollButton(false)
    setComposerHeight(null)
    // Re-pin to the bottom over a short window instead of once: late
    // renders (composer measurement, markdown highlight, tool summaries)
    // keep growing the scroll height after the first paint and would
    // otherwise leave the last rows hidden behind the composer overlay.
    const raf = requestAnimationFrame(() => {
      scrollToBottom('auto')
    })
    const timers = [150, 450, 900].map((delay) =>
      setTimeout(() => {
        if (!autoScrollRef.current) return
        const container = scrollAreaRef.current
        if (!container) return
        if (distanceFromBottom(container) > 2) scrollToBottom('auto')
      }, delay)
    )
    return () => {
      cancelAnimationFrame(raf)
      timers.forEach(clearTimeout)
      stopFollowAnim()
    }
  }, [chatId, scrollToBottom, distanceFromBottom, scrollAreaRef, stopFollowAnim])

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

    const observer = new ResizeObserver((entries) => {
      let composerResized = false
      let contentResized = false
      for (const entry of entries) {
        if (entry.target === composerEl) composerResized = true
        if (entry.target === contentEl) contentResized = true
      }
      if (composerResized) updateComposerHeight()

      const container = scrollAreaRef.current
      if (container && !canScroll(container)) return
      if (!isActive()) return
      if (!autoScrollRef.current) return

      // Composer growth shifts the viewport — re-pin instantly. Streaming
      // content growth follows smoothly on a throttle so fast output
      // batches into one glide instead of jumping per delta.
      if (composerResized && !contentResized) {
        scrollToBottom('auto')
        return
      }
      followBottom()
    })

    if (composerEl) observer.observe(composerEl)
    if (contentEl) observer.observe(contentEl)
    return () => observer.disconnect()
  }, [scrollToBottom, followBottom, canScroll, isActive, composerWrapRef, contentRef, scrollAreaRef, chatId])

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
        // Our own scrollTo — content may have grown between the scroll and
        // this event firing; don't mistake it for the user scrolling away.
        if (isAuto(el)) return
        // Mid-flight smooth animation events are programmatic too.
        if (Date.now() < smoothUntilRef.current) return
        // Frames written by the follow chase are ours; genuine takeover is
        // detected inside the chase loop itself.
        if (followAnimRef.current || followLastSetRef.current >= 0) return
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
    // Don't let the frame-chase fight the browser's smooth animation.
    stopFollowAnim()
    scrollToBottom('smooth')
    // If content kept growing during the animation the target is stale —
    // settle with a hard pin once the animation has had time to finish.
    setTimeout(() => {
      if (!autoScrollRef.current) return
      const container = scrollAreaRef.current
      if (container && distanceFromBottom(container) > 2) scrollToBottom('auto')
    }, 750)
  }, [scrollToBottom, scrollAreaRef, distanceFromBottom, stopFollowAnim])

  return {
    showScrollButton,
    composerHeight,
    scrollToBottom,
    scrollToBottomSmooth,
    autoScrollRef,
  }
}
