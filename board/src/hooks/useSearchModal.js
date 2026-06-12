import { useAppStore } from '@/store/useAppStore'

export function useSearchModal() {
  const isOpen = useAppStore((s) => s.searchModalOpen)
  const open = useAppStore((s) => s.openSearchModal)
  const close = useAppStore((s) => s.closeSearchModal)
  return { isOpen, open, close }
}
