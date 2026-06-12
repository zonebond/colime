import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'
import { LanguageContext, MESSAGES } from './shared'

export function LanguageProvider({ children }) {
  const locale = useAppStore((state) => state.locale)
  const setLocale = useAppStore((state) => state.setLocale)

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  const t = (key) => {
    const keys = key.split('.')
    let value = MESSAGES[locale]
    for (const nextKey of keys) {
      value = value?.[nextKey]
    }
    return value ?? key
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </LanguageContext.Provider>
  )
}
