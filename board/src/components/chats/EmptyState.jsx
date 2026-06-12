import { IconChatEmpty } from '@/components/icons'
import styles from './EmptyState.module.css'

export default function EmptyState({ type, t }) {
  const isNoChats = type === 'no-chats'

  return (
    <div className={styles.wrap}>
      <IconChatEmpty className={styles.icon} />
      <span className={styles.title}>{isNoChats ? t.noChats : t.noResults}</span>
      <span className={styles.desc}>{isNoChats ? t.noChatsDesc : t.noResultsDesc}</span>
    </div>
  )
}