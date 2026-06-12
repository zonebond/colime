import { useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { Check } from '@phosphor-icons/react'
import styles from './AgentSelector.module.css'

export default function AgentSelector({ agents, loading, selectedAgentId, onSelect, onClose, triggerRef }) {
  const [highlightedIndex, setHighlightedIndex] = useState(-1)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const popoverRef = useRef(null)
  const listRef = useRef(null)

  const filteredAgents = useMemo(() => {
    if (!agents) return []
    return agents.filter((a) => a.enabled !== false && a.isSystem)
  }, [agents])

  useEffect(() => {
    if (triggerRef?.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom,
        left: rect.left,
      })
    }
  }, [triggerRef])

  // Reposition if popover overflows viewport
  useEffect(() => {
    if (!popoverRef.current) return
    const rect = popoverRef.current.getBoundingClientRect()
    if (rect.bottom > window.innerHeight) {
      setPosition((prev) => ({
        ...prev,
        top: prev.top - rect.height - 8,
      }))
    }
    if (rect.top < 0) {
      setPosition((prev) => ({
        ...prev,
        top: 8,
      }))
    }
  }, [position])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.min(prev + 1, filteredAgents.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setHighlightedIndex((prev) => Math.max(prev - 1, 0))
        return
      }
      if (e.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < filteredAgents.length) {
        e.preventDefault()
        onSelect(filteredAgents[highlightedIndex].id)
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [highlightedIndex, filteredAgents.length, onSelect, onClose])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        onClose()
      }
    }
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [onClose])

  useEffect(() => {
    if (highlightedIndex < 0 || !listRef.current) return
    const item = listRef.current.children[highlightedIndex]
    if (item) {
      item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightedIndex])

  useEffect(() => {
    if (!popoverRef.current) return
    const rect = popoverRef.current.getBoundingClientRect()
    if (rect.top < 0) {
      setPosition((prev) => ({ ...prev, top: prev.top - rect.top + 8 }))
    }
  }, [position])

  return createPortal(
    <div
      className={styles.popover}
      ref={popoverRef}
      style={{ position: 'fixed', top: position.top, left: position.left }}
    >
      <div className={styles.list} ref={listRef}>
        {loading && <div className={styles.loading}>Loading...</div>}

        {!loading && filteredAgents.length === 0 && (
          <div className={styles.empty}>No agents found</div>
        )}

        {!loading &&
          filteredAgents.map((agent, index) => {
            const isSelected = agent.id === selectedAgentId
            const isHighlighted = index === highlightedIndex
            return (
              <button
                key={agent.id}
                className={`${styles.agentItem} ${isSelected ? styles.agentItemSelected : ''} ${isHighlighted ? styles.agentItemHighlighted : ''}`}
                onClick={() => onSelect(agent.id)}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                <span className={styles.agentName}>{agent.name}</span>
                {isSelected && <Check size={14} weight="bold" className={styles.checkIcon} />}
              </button>
            )
          })}
      </div>
    </div>,
    document.body,
  )
}
