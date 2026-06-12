import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useChatsModel } from '@/features/chats/chats.hooks'
import { searchSessions, searchContent } from './search.service'

export function useSessionSearch() {
  const [query, setQuery] = useState('')
  const [sessionResults, setSessionResults] = useState(null)
  const [contentResults, setContentResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const debounceRef = useRef(null)
  const { chats } = useChatsModel()

  const recentChats = useMemo(() => {
    return (chats || [])
      .filter((c) => !c.isArchived)
      .sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0))
  }, [chats])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)

    if (!query.trim()) {
      setSessionResults(null)
      setContentResults(null)
      setLoading(false)
      return
    }

    setLoading(true)
    setSelectedIndex(0)

    debounceRef.current = setTimeout(async () => {
      try {
        const [sessions, content] = await Promise.all([
          searchSessions(query).catch(() => []),
          searchContent(query).catch(() => []),
        ])
        setSessionResults(sessions)
        setContentResults(content)
      } catch {
        setSessionResults([])
        setContentResults([])
      } finally {
        setLoading(false)
      }
    }, 150)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  // Merge results for flat keyboard nav: session matches first, then content matches
  const isSearching = sessionResults !== null || contentResults !== null

  const displayItems = useMemo(() => {
    if (!isSearching) return recentChats

    const items = []

    // Session title matches
    for (const s of sessionResults || []) {
      items.push({ _type: 'session', ...s })
    }

    // Content matches
    for (const c of contentResults || []) {
      items.push({ _type: 'content', ...c })
    }

    return items
  }, [isSearching, recentChats, sessionResults, contentResults])

  const isEmpty = !loading && displayItems.length === 0

  const hasSessionResults = sessionResults !== null && sessionResults.length > 0
  const hasContentResults = contentResults !== null && contentResults.length > 0

  const moveSelection = useCallback(
    (dir) => {
      setSelectedIndex((prev) => {
        const max = displayItems.length - 1
        if (max < 0) return 0
        const next = prev + dir
        if (next < 0) return max
        if (next > max) return 0
        return next
      })
    },
    [displayItems.length],
  )

  return {
    query,
    setQuery,
    results: displayItems,
    sessionResults: sessionResults || [],
    contentResults: contentResults || [],
    loading,
    isEmpty,
    selectedIndex,
    setSelectedIndex,
    moveSelection,
    isSearching,
    hasSessionResults,
    hasContentResults,
  }
}
