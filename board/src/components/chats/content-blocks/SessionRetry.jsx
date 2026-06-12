import { useEffect, useState, useMemo } from 'react'
import { useTranslation } from '@/i18n'
import TextShimmer from './TextShimmer'
import styles from './SessionRetry.module.css'

export default function SessionRetry({ status }) {
  const { t } = useTranslation()
  const tc = t('chats')

  const [seconds, setSeconds] = useState(0)

  const nextAt = useMemo(() => {
    if (!status?.next) return null
    const ts = typeof status.next === 'number' ? status.next : Date.parse(status.next)
    return Number.isNaN(ts) ? null : ts
  }, [status?.next])

  useEffect(() => {
    if (!nextAt) return
    const update = () => setSeconds(Math.max(0, Math.round((nextAt - Date.now()) / 1000)))
    update()
    const timer = setInterval(update, 1000)
    return () => clearInterval(timer)
  }, [nextAt])

  if (!status || status.type !== 'retry') return null

  const message = status.message
    ? (status.message.length > 80 ? status.message.slice(0, 80) + '...' : status.message)
    : ''

  const countdown = seconds > 0 ? `${seconds}s` : ''
  const attempt = status.attempt != null ? `Attempt ${status.attempt}` : ''
  const info = [tc.retry || 'Retrying', countdown, attempt].filter(Boolean).join(' · ')

  return (
    <div className={styles.retryCard}>
      <div className={styles.retryHeader}>
        <TextShimmer text={tc.retry || 'Retrying'} active />
        <span className={styles.retryInfo}>{info}</span>
      </div>
      {message && <div className={styles.retryMessage}>{message}</div>}
    </div>
  )
}
