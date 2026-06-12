import { useCallback, useEffect, useRef, useState } from 'react'

export function useImeSafeInput({ value = '', onCommit, debounceMs = 0 }) {
  const [draftValue, setDraftValue] = useState(value)
  const [isComposing, setIsComposing] = useState(false)
  const debounceTimerRef = useRef(null)

  const clearDebounceTimer = useCallback(() => {
    if (debounceTimerRef.current) {
      globalThis.clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!isComposing) {
      clearDebounceTimer()
      setDraftValue(value)
    }
  }, [clearDebounceTimer, isComposing, value])

  useEffect(() => clearDebounceTimer, [clearDebounceTimer])

  const scheduleCommit = useCallback((nextValue) => {
    clearDebounceTimer()

    if (debounceMs <= 0) {
      onCommit(nextValue)
      return
    }

    debounceTimerRef.current = globalThis.setTimeout(() => {
      onCommit(nextValue)
      debounceTimerRef.current = null
    }, debounceMs)
  }, [clearDebounceTimer, debounceMs, onCommit])

  const commitValue = useCallback((nextValue) => {
    clearDebounceTimer()
    setDraftValue(nextValue)
    onCommit(nextValue)
  }, [clearDebounceTimer, onCommit])

  const handleChange = useCallback((event) => {
    const nextValue = event.target.value
    setDraftValue(nextValue)

    if (event.nativeEvent.isComposing || isComposing) return
    scheduleCommit(nextValue)
  }, [isComposing, scheduleCommit])

  const handleCompositionStart = useCallback(() => {
    clearDebounceTimer()
    setIsComposing(true)
  }, [clearDebounceTimer])

  const handleCompositionEnd = useCallback((event) => {
    const nextValue = event.currentTarget.value
    clearDebounceTimer()
    setIsComposing(false)
    setDraftValue(nextValue)
    onCommit(nextValue)
  }, [clearDebounceTimer, onCommit])

  return {
    value: draftValue,
    isComposing,
    setDraftValue,
    commitValue,
    handleChange,
    handleCompositionStart,
    handleCompositionEnd,
  }
}
