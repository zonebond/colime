import { cloneElement, useEffect, useRef, useState } from 'react'
import styles from './MessageActions.module.css'

export function MessageActionBtn({ ariaLabel, onClick, children, active = false }) {
  return (
    <button
      type="button"
      className={`${styles.messageActionBtn} ${active ? styles.messageActionBtnActive : ''}`.trim()}
      aria-label={ariaLabel}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function MoreMenu({ trigger, children }) {
  const [show, setShow] = useState(false)
  const wrapRef = useRef(null)

  useEffect(() => {
    if (!show) return
    const close = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setShow(false)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [show])

  return (
    <div ref={wrapRef} className={styles.moreMenuWrap}>
      {cloneElement(trigger, {
        onClick: (e) => {
          e.stopPropagation()
          setShow((prev) => !prev)
          if (trigger.props.onClick) trigger.props.onClick(e)
        },
      })}
      {show && (
        <div className={styles.moreMenu}>
          {children}
        </div>
      )}
    </div>
  )
}

export default function MessageActions({ className = '', children }) {
  return (
    <div className={`${styles.messageActions} ${className || ''}`.trim()}>
      {children}
    </div>
  )
}
