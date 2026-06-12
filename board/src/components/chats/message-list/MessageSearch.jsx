import { useState, useRef, useMemo, useEffect } from 'react'
import { MagnifyingGlass, X } from '@phosphor-icons/react'
import styles from './MessageSearch.module.css'

export default function MessageSearch({ messages, onNavigate, onClose }) {
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const matches = useMemo(() => {
    if (!query.trim()) return []
    const lower = query.toLowerCase()
    return messages.reduce((acc, msg, index) => {
      const content = msg.role === 'user'
        ? msg.content
        : (msg.contentBlocks?.filter((b) => b.type === 'text').map((b) => b.content).join(' ') || msg.content)
      if (content && content.toLowerCase().includes(lower)) {
        acc.push(index)
      }
      return acc
    }, [])
  }, [messages, query])

  useEffect(() => {
    setCurrentIndex(0)
  }, [query])

  useEffect(() => {
    if (matches.length > 0) {
      onNavigate(matches[currentIndex])
    }
  }, [currentIndex, matches, onNavigate])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        setCurrentIndex((prev) => (prev - 1 + matches.length) % matches.length)
      } else {
        setCurrentIndex((prev) => (prev + 1) % matches.length)
      }
    } else if (e.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className={styles.searchBar}>
      <MagnifyingGlass size={14} weight="regular" />
      <input
        ref={inputRef}
        type="text"
        className={styles.searchInput}
        placeholder="Search messages..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
      />
      {query && (
        <span className={styles.searchCount}>
          {matches.length > 0 ? `${currentIndex + 1}/${matches.length}` : '0/0'}
        </span>
      )}
      <button type="button" className={styles.searchClose} onClick={onClose}>
        <X size={14} weight="bold" />
      </button>
    </div>
  )
}
