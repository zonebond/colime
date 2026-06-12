import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import DiffChanges from './content-blocks/DiffChanges'
import { IconArticle } from '@/components/icons'
import styles from './ChatNavRail.module.css'

const MIN_MESSAGES = 3

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  return `${days}d ago`
}

export default function ChatNavRail({
  messages = [],
  onScrollToMessage,
  focusedIndex = -1,
  activeMessageIndex = -1,
}) {
  const [visible, setVisible] = useState(false)
  const [showTOC, setShowTOC] = useState(false)
  const tickListRef = useRef(null)

  // Only user messages drive ticks
  const userTicks = useMemo(() => {
    const result = []
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]
      if (!msg || (msg.role || 'user') !== 'user') continue
      const blocks = msg.contentBlocks || []
      const toolCount = blocks.filter(
        (b) => b.type === 'tool_result' && b.toolName !== 'todowrite' && b.toolName !== 'todo_write'
      ).length

      result.push({
        index: i,
        content: msg.content || '',
        summary: msg.summary || null,
        toolCount,
        timestamp: msg.createdAt,
      })
    }
    return result
  }, [messages])

  useEffect(() => {
    setVisible(userTicks.length >= MIN_MESSAGES)
  }, [userTicks.length])

  const effectiveActiveIndex = focusedIndex >= 0 ? focusedIndex : activeMessageIndex

  const handleClick = useCallback(
    (messageIndex) => {
      onScrollToMessage?.(messageIndex)
    },
    [onScrollToMessage],
  )

  // Scroll active tick into view
  useEffect(() => {
    if (effectiveActiveIndex < 0 || !tickListRef.current) return
    const activeTick = tickListRef.current.querySelector(
      `[data-tick-index="${effectiveActiveIndex}"]`,
    )
    if (activeTick) {
      activeTick.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [effectiveActiveIndex])

  // Find user message nearest to current scroll position
  const nearestUserIdx = useMemo(() => {
    if (effectiveActiveIndex < 0 || userTicks.length === 0) return -1
    let best = userTicks[0].index
    let bestDist = Infinity
    for (const t of userTicks) {
      const d = Math.abs(t.index - effectiveActiveIndex)
      if (d < bestDist) {
        bestDist = d
        best = t.index
      }
    }
    return best
  }, [effectiveActiveIndex, userTicks])

  const atBottom = effectiveActiveIndex >= 0 && effectiveActiveIndex < messages.length - 2

  if (!visible || userTicks.length === 0) return null

  return (
    <div className={`${styles.navRail} ${visible ? styles.navRailVisible : ''}`}>
      <button
        type="button"
        className={styles.tocToggle}
        onClick={() => setShowTOC((v) => !v)}
        aria-label={showTOC ? 'Hide outline' : 'Show outline'}
      >
        <IconArticle className={`${styles.tocIcon} ${showTOC ? styles.tocIconActive : ''}`} />
      </button>

      <div className={styles.railBody}>
        <div ref={tickListRef} className={styles.tickList}>
          {userTicks.map((msg) => {
            const isNearest = msg.index === nearestUserIdx
            const isFocused = msg.index === focusedIndex

            return (
              <div
                key={msg.index}
                data-tick-index={msg.index}
                className={`${styles.tick} ${isNearest ? styles.tickActive : ''} ${isFocused ? styles.tickFocused : ''}`}
                onClick={() => handleClick(msg.index)}
                role="button"
                tabIndex={0}
                aria-label={msg.summary?.title || msg.content.slice(0, 60)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleClick(msg.index)
                  }
                }}
              >
                <div className={styles.tickLine} />
              </div>
            )
          })}
        </div>

        <div className={`${styles.flyout} ${showTOC ? styles.flyoutPersistent : ''}`}>
          <div className={styles.flyoutScroll}>
            {userTicks.map((msg) => {
              const isNearest = msg.index === nearestUserIdx
              const diffs = msg.summary?.diffs || []
              const title = msg.summary?.title || msg.content.slice(0, 100) || '(empty)'
              const timeStr = timeAgo(msg.timestamp)

              return (
                <button
                  key={msg.index}
                  type="button"
                  data-nav-index={msg.index}
                  className={`${styles.flyoutItem} ${isNearest ? styles.flyoutItemActive : ''}`}
                  onClick={() => handleClick(msg.index)}
                >
                  <span className={styles.flyoutItemBody}>
                    <span className={styles.flyoutItemText}>{title}</span>
                    <span className={styles.flyoutItemMeta}>
                      {msg.toolCount > 0 && (
                        <span className={styles.flyoutToolBadge}>
                          {msg.toolCount} tool{msg.toolCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {timeStr && (
                        <span className={styles.flyoutTime}>{timeStr}</span>
                      )}
                    </span>
                  </span>
                  <DiffChanges changes={diffs.length > 0 ? diffs : []} variant="bars" />
                </button>
              )
            })}
          </div>
        </div>
      </div>

      {atBottom && (
        <button
          type="button"
          className={styles.scrollBottom}
          onClick={() => {
            const last = userTicks[userTicks.length - 1]
            if (last) onScrollToMessage?.(last.index)
          }}
          aria-label="Scroll to bottom"
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 11.5L3.5 7l1-1L8 9.5 11.5 6l1 1z" />
          </svg>
        </button>
      )}
    </div>
  )
}
