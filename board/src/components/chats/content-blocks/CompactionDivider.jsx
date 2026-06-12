import styles from './CompactionDivider.module.css'

export default function CompactionDivider({ label }) {
  return (
    <div className={styles.compactionPart}>
      <div className={styles.divider}>
        <span className={styles.line} />
        <span className={styles.label}>{label}</span>
        <span className={styles.line} />
      </div>
    </div>
  )
}
