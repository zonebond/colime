import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '@/i18n'
import { useChatsModel } from '@/features/chats/chats.hooks'
import styles from './SubagentFooter.module.css'

export default function SubagentFooter({ parentID, currentID }) {
  const { t } = useTranslation()
  const tc = t('chats') || {}
  const navigate = useNavigate()
  const { chats } = useChatsModel()

  const currentIndex = useMemo(() => {
    // Current session is also a sibling
    const all = (chats ?? [])
      .filter((c) => c._parentID === parentID && !c.isArchived)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
    return all.findIndex((c) => c.id === currentID)
  }, [chats, parentID, currentID])

  const allSiblings = useMemo(() => {
    return (chats ?? [])
      .filter((c) => c._parentID === parentID && !c.isArchived)
      .sort((a, b) => b.lastActiveAt - a.lastActiveAt)
  }, [chats, parentID])

  const total = allSiblings.length

  return (
    <div className={styles.footer}>
      <button
        className={styles.btn}
        onClick={() => navigate(`/chats/${parentID}`)}
      >
        <svg width="16" height="16" viewBox="0 0 256 256" fill="currentColor">
          <path d="M224,128a8,8,0,0,1-8,8H59.31l58.35,58.34a8,8,0,0,1-11.32,11.32l-72-72a8,8,0,0,1,0-11.32l72-72a8,8,0,0,1,11.32,11.32L59.31,120H216A8,8,0,0,1,224,128Z" />
        </svg>
        <span>{tc.backToMainSession}</span>
      </button>
      {total > 1 && (
        <div className={styles.siblingNav}>
          <button
            className={styles.btn}
            disabled={currentIndex <= 0}
            onClick={() => {
              const prev = allSiblings[currentIndex - 1]
              if (prev) navigate(`/chats/${prev.id}`)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
              <path d="M165.66,202.34a8,8,0,0,1-11.32,11.32l-80-80a8,8,0,0,1,0-11.32l80-80a8,8,0,0,1,11.32,11.32L91.31,128Z" />
            </svg>
          </button>
          <span className={styles.siblingLabel}>{currentIndex + 1} / {total}</span>
          <button
            className={styles.btn}
            disabled={currentIndex >= total - 1}
            onClick={() => {
              const next = allSiblings[currentIndex + 1]
              if (next) navigate(`/chats/${next.id}`)
            }}
          >
            <svg width="14" height="14" viewBox="0 0 256 256" fill="currentColor">
              <path d="M181.66,133.66l-80,80a8,8,0,0,1-11.32-11.32L164.69,128,90.34,53.66a8,8,0,0,1,11.32-11.32l80,80A8,8,0,0,1,181.66,133.66Z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
