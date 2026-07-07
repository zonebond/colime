import { useCallback, useEffect, useMemo } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { LanguageContext, MESSAGES } from './shared'

function lookup(messages, keys) {
  let value = messages
  for (const nextKey of keys) {
    value = value?.[nextKey]
  }
  return value
}

export function LanguageProvider({ children }) {
  const locale = useAppStore((state) => state.locale)
  const setLocale = useAppStore((state) => state.setLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = useCallback((key) => {
    const keys = key.split('.')
    // Missing keys fall back to English before surfacing the raw key.
    return lookup(MESSAGES[locale], keys) ?? lookup(MESSAGES.en, keys) ?? key
  }, [locale])

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}
