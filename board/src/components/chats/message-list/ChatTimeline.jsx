import { memo, useLayoutEffect, useRef, useState } from 'react'
import VirtualMessageList from './VirtualMessageList'
import styles from './ChatTimeline.module.css'

const EXIT_DURATION = 350

const ChatTimeline = memo(function ChatTimeline({ loading, hasChat, messages, tc, onPreviewAttachment, focusedIndex, models, anchorMessageId, onMessageClick, searchHighlightIndex, onConfirmTool, onRetryTool, onResetToHere, isReverting, onViewAllFiles, onPreviewSessionFile }) {
  const prevLoadingRef = useRef(false)
  const [exiting, setExiting] = useState(false)

  useLayoutEffect(() => {
    if (prevLoadingRef.current && !loading && !exiting) {
      setExiting(true)
    }
    prevLoadingRef.current = loading
  })

  useLayoutEffect(() => {
    if (exiting && !loading) {
      const timer = setTimeout(() => setExiting(false), EXIT_DURATION)
      return () => clearTimeout(timer)
    }
  }, [exiting, loading])

  const isLoading = loading || exiting

  if (isLoading) {
    const fadeClass = exiting ? styles.loadingFadeOut : styles.loadingFadeIn
    return (
      <div className={`${styles.loadingView} ${fadeClass}`}>
        <div className={styles.glowStage}>
          <div className={styles.glowOrb} />
          <div className={styles.glowOrbSecondary} />
          <span className={styles.brandMark}>RAVENS</span>
          <div className={styles.thinkingDots}>
            <span /><span /><span />
          </div>
        </div>
      </div>
    )
  }

  if (!hasChat) {
    return <div className={styles.emptyState}>{tc.chatNotFound}</div>
  }

  return (
    <div className={styles.messagesEnter}>
      <VirtualMessageList
        messages={messages}
        tc={tc}
        focusedIndex={focusedIndex}
        models={models}
        onPreviewAttachment={onPreviewAttachment}
        anchorMessageId={anchorMessageId}
        onMessageClick={onMessageClick}
        searchHighlightIndex={searchHighlightIndex}
        onConfirmTool={onConfirmTool}
        onRetryTool={onRetryTool}
        onResetToHere={onResetToHere}
        isReverting={isReverting}
        onViewAllFiles={onViewAllFiles}
        onPreviewSessionFile={onPreviewSessionFile}
      />
    </div>
  )
})

export default ChatTimeline
