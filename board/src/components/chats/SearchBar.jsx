import { useRef, useEffect } from 'react'
import { IconSearch } from '@/components/icons'
import { useImeSafeInput } from '@/hooks/useImeSafeInput'
import styles from './SearchBar.module.css'

export default function SearchBar({ value, onChange, placeholder, debounceMs = 0 }) {
  const inputRef = useRef(null)
  const {
    value: draftValue,
    commitValue,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
  } = useImeSafeInput({ value, onCommit: onChange, debounceMs })

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        inputRef.current?.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return (
    <div className={styles.wrap}>
      <IconSearch className={styles.icon} />
      <input
        ref={inputRef}
        type="text"
        className={styles.input}
        value={draftValue}
        onChange={handleChange}
        onCompositionStart={handleCompositionStart}
        onCompositionEnd={handleCompositionEnd}
        placeholder={placeholder}
      />
      {draftValue && (
        <button className={styles.clear} onClick={() => commitValue('')} aria-label="Clear">
          <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M3 3l6 6M9 3l-6 6" />
          </svg>
        </button>
      )}
    </div>
  )
}
