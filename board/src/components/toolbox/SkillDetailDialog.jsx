import { createPortal } from 'react-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { IconX } from '@/components/icons'
import styles from './SkillDetailDialog.module.css'

export default function SkillDetailDialog({ skill, onClose }) {
  if (!skill) return null

  const handleCopyLocation = () => {
    if (skill.location) {
      navigator.clipboard.writeText(skill.location).catch(() => {})
    }
  }

  return createPortal(
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <h2 className={styles.title}>{skill.name}</h2>
            <span className={styles.badge}>{skill.source}</span>
          </div>
          <button className={styles.closeBtn} onClick={onClose} title="Close">
            <IconX />
          </button>
        </div>

        {skill.description && (
          <p className={styles.desc}>{skill.description}</p>
        )}

        {skill.location && skill.location !== '<built-in>' && (
          <div className={styles.locationRow}>
            <span className={styles.locationLabel}>Location</span>
            <code className={styles.locationPath}>{skill.location}</code>
            <button className={styles.copyBtn} onClick={handleCopyLocation}>Copy</button>
          </div>
        )}

        <div className={styles.divider} />

        <div className={styles.body}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {skill.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>,
    document.body,
  )
}
