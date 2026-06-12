/* ─────────────────────────────────────────
   Sidebar icons — SVG components
   Each accepts className for animation hooks
───────────────────────────────────────── */
import { Chats, Package, CardsThree, Circuitry, SidebarSimple, Command, X, Plus, PushPin, PushPinSlash, PushPinSimple, Archive, Trash, PencilSimple, Check, CaretLeft, CaretRight, Star, MagnifyingGlass, Eye, EyeSlash, Flask, Circle, WarningCircle, Wrench, Sparkle, Plug, ShieldWarning, Info, ArrowClockwise, Article } from '@phosphor-icons/react'

export { Chats as IconChats }
export { Package as IconAssets }
export { CardsThree as IconProjects }
export { Circuitry as IconLogo }
export { SidebarSimple as IconToggleSidebar }
export { Command as IconWorkspace }
export { X as IconX }
export { Plus as IconPlus }

export function IconNewChat({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M10 3a.75.75 0 0 1 .75.75v5.5h5.5a.75.75 0 0 1 .077 1.496l-.077.004h-5.5v5.5a.75.75 0 0 1-1.5 0v-5.5h-5.5a.75.75 0 0 1 0-1.5h5.5v-5.5A.75.75 0 0 1 10 3" />
    </svg>
  )
}

export function IconSearch({ className }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M8.5 2a6.5 6.5 0 0 1 4.935 10.728l4.419 4.419.064.078a.5.5 0 0 1-.693.693l-.079-.064-4.419-4.42A6.5 6.5 0 1 1 8.5 2m0 1a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11" />
    </svg>
  )
}

export function IconToolbox({ className }) {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden>
      <path d="M12.5 3A1.5 1.5 0 0 1 14 4.5V6h.5A3.5 3.5 0 0 1 18 9.5v6a1.5 1.5 0 0 1-1.5 1.5h-13a1.5 1.5 0 0 1-1.492-1.347L2 15.5v-6A3.5 3.5 0 0 1 5.5 6H6V4.5A1.5 1.5 0 0 1 7.5 3zM3 15.5l.01.1a.5.5 0 0 0 .49.4h13a.5.5 0 0 0 .5-.5V12h-4v.5a.5.5 0 0 1-1 0V12H8v.5a.5.5 0 0 1-1 0V12H3zM5.5 7A2.5 2.5 0 0 0 3 9.5V11h4v-.5a.5.5 0 0 1 1 0v.5h4v-.5a.5.5 0 0 1 1 0v.5h4V9.5A2.5 2.5 0 0 0 14.5 7zm2-3a.5.5 0 0 0-.5.5V6h6V4.5a.5.5 0 0 0-.5-.5z" />
    </svg>
  )
}

export function IconChevron({ className }) {
  return <CaretLeft size={14} weight="bold" className={className} />
}

export function IconMore({ className }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={className} aria-hidden>
      <circle cx="3" cy="8" r="1" />
      <circle cx="8" cy="8" r="1" />
      <circle cx="13" cy="8" r="1" />
    </svg>
  )
}

export function IconDownload({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M10 3v10M10 13l-4-4M10 13l4-4" />
      <path d="M3 17h14" />
    </svg>
  )
}

export function IconUpDown({ className }) {
  return (
    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 8l5-5 5 5M5 14l5 5 5-5" />
    </svg>
  )
}

/* ── Chats icons ── */
export function IconPin({ className, isPinned, badge }) {
  if (badge) {
    return <PushPinSimple size={14} weight={className ? undefined : 'regular'} className={className} />
  }
  const Icon = isPinned ? PushPinSlash : PushPin
  return <Icon size={18} weight={className ? undefined : 'regular'} className={className} />
}

export function IconArchive({ className }) {
  return <Archive size={18} weight={className ? undefined : 'regular'} className={className} />
}

export function IconStar({ className, active }) {
  return <Star size={18} weight={active ? 'fill' : 'regular'} className={className} />
}

export function IconTrash({ className }) {
  return <Trash size={18} weight={className ? undefined : 'regular'} className={className} />
}

export function IconSelect({ className }) {
  return <Check size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconRename({ className }) {
  return <PencilSimple size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconAddToProject({ className }) {
  return <CardsThree size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconRemoveFromProject({ className }) {
  return <CardsThree size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconChatEmpty({ className }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="6" y="10" width="36" height="28" rx="4" />
      <path d="M14 20h20M14 27h12" />
    </svg>
  )
}

/* ── Popover icons ── */
export function IconSettings({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="10" cy="10" r="3" />
      <path d="M10 2v1.5M10 16.5V18M2 10h1.5M16.5 10H18M4.4 4.4l1.1 1.1M14.5 14.5l1.1 1.1M4.4 15.6l1.1-1.1M14.5 5.5l1.1-1.1" />
    </svg>
  )
}

export function IconLanguage({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 2.5C10 2.5 7 6 7 10s3 7.5 3 7.5" />
      <path d="M10 2.5C10 2.5 13 6 13 10s-3 7.5-3 7.5" />
      <path d="M2.5 10h15" />
    </svg>
  )
}

export function IconHelp({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

export function IconPlans({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M3 5h14M3 10h14M3 15h7" />
    </svg>
  )
}

export function IconApps({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M10 14V6M10 14l-3-3M10 14l3-3" />
      <path d="M3 17h14" />
    </svg>
  )
}

export function IconGift({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <rect x="3" y="7" width="14" height="10" rx="1.5" />
      <path d="M7 7V5.5A3 3 0 0 1 13 5.5V7" />
    </svg>
  )
}

export function IconInfo({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 9v5" />
      <circle cx="10" cy="6.5" r="0.5" fill="currentColor" />
    </svg>
  )
}

export function IconLogout({ className }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M13 10H3M13 10l-3-3M13 10l-3 3" />
      <path d="M9 4H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" />
    </svg>
  )
}

export function IconChevronRight({ className }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" className={className} aria-hidden>
      <path d="M4 2l4 4-4 4" />
    </svg>
  )
}

/* ── Toolbox icons (Phosphor re-exports) ── */
export function IconCheck({ className, size = 12 }) {
  return <Check size={size} weight={className ? undefined : 'regular'} className={className} />
}

export function IconCircle({ className, size = 12 }) {
  return <Circle size={size} weight={className ? undefined : 'regular'} className={className} />
}

export function IconXCircle({ className, size = 12 }) {
  return <X size={size} weight={className ? undefined : 'regular'} className={className} />
}

export function IconEye({ className }) {
  return <Eye size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconEyeSlash({ className }) {
  return <EyeSlash size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconFlask({ className }) {
  return <Flask size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconPencil({ className }) {
  return <PencilSimple size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconTrashSmall({ className }) {
  return <Trash size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconMagnifyingGlass({ className }) {
  return <MagnifyingGlass size={20} weight={className ? undefined : 'regular'} className={className} />
}

export function IconPlusSmall({ className }) {
  return <Plus size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconWarningCircle({ className, size = 12 }) {
  return <WarningCircle size={size} weight={className ? undefined : 'regular'} className={className} />
}

export function IconInfoPhosphor({ className, size = 18 }) {
  return <Info size={size} weight={className ? undefined : 'regular'} className={className} />
}

export function IconWrench({ className }) {
  return <Wrench size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconSparkle({ className }) {
  return <Sparkle size={16} weight={className ? undefined : 'regular'} className={className} />
}

export function IconPlug({ className, size = 48 }) {
  return <Plug size={size} weight={className ? undefined : 'fill'} className={className} />
}

export function IconShieldWarning({ className, size = 48 }) {
  return <ShieldWarning size={size} weight={className ? undefined : 'regular'} className={className} />
}

export function IconCaretRight({ className }) {
  return <CaretRight size={14} weight="bold" className={className} />
}

export function IconReload({ className }) {
  return <ArrowClockwise size={14} weight="bold" className={className} />
}

export function IconArticle({ className }) {
  return <Article size={14} weight="bold" className={className} />
}
