import { useEffect } from 'react'
import { useAppStore } from '@/store/useAppStore'

export function useSidebar() {
  const isOpen = useAppStore((state) => state.sidebarOpen)
  const toggle = useAppStore((state) => state.toggleSidebar)
  const open = useAppStore((state) => state.setSidebarOpen)

  useEffect(() => {
    function handleKey(e) {
      if ((e.metaKey || e.ctrlKey) && e.key === '\\') {
        e.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [toggle])

  return {
    isOpen,
    toggle,
    open: () => open(true),
    close: () => open(false),
  }
}
