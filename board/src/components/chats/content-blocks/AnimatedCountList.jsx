import AnimatedCountLabel from './AnimatedCountLabel'
import styles from './AnimatedCountList.module.css'

export default function AnimatedCountList({ counts, t }) {
  const { read, search, list } = counts
  const items = []

  if (read > 0) items.push({ count: read, key: 'contextReadCount' })
  if (search > 0) items.push({ count: search, key: 'contextSearchCount' })
  if (list > 0) items.push({ count: list, key: 'contextListCount' })

  if (items.length === 0) return null

  return (
    <span className={styles.list}>
      {items.map((item, index) => (
        <span key={item.key} className={styles.item}>
          {index > 0 && <span className={styles.sep}>, </span>}
          <AnimatedCountLabel count={item.count} labelKey={item.key} t={t} />
        </span>
      ))}
    </span>
  )
}
