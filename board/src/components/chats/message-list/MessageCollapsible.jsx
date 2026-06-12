import { memo, useEffect, useRef, useState } from 'react'
import styles from './MessageCollapsible.module.css'

const MESSAGE_COLLAPSE_LINES = 25

export default memo(function MessageCollapsible({ children, maxLines = MESSAGE_COLLAPSE_LINES }) {
  const contentRef = useRef(null)
  const [collapsed, setCollapsed] = useState(false)
  const [shouldCollapse, setShouldCollapse] = useState(false)
  const initializedRef = useRef(false)

  useEffect(() => {
    const el = contentRef.current
    if (!el || initializedRef.current) return

    const computed = getComputedStyle(el)
    const lineHeight = parseFloat(computed.lineHeight) || 20
    const threshold = lineHeight * maxLines

    if (el.scrollHeight > threshold) {
      setShouldCollapse(true)
      initializedRef.current = true
    } else {
      setShouldCollapse(false)
    }
  }, [children, maxLines])

  return (
    <div className={styles.collapsibleWrap}>
      <div
        ref={contentRef}
        className={`${styles.collapsibleContent} ${collapsed ? styles.collapsed : ''}`}
        style={collapsed ? { maxHeight: `${maxLines * 1.5}em` } : undefined}
      >
        {children}
      </div>
      {shouldCollapse && (
        <>
          {collapsed && <div className={styles.collapsibleGradient} />}
          <button
            type="button"
            className={styles.collapsibleToggle}
            onClick={() => setCollapsed((prev) => !prev)}
          >
            {collapsed ? 'Show more' : 'Show less'}
          </button>
        </>
      )}
    </div>
  )
})
