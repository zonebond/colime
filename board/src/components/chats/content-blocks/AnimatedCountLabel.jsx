import { useMemo } from 'react'
import styles from './AnimatedCountLabel.module.css'

function getPluralKey(baseKey, count, t) {
  const pluralKey = count === 1 ? baseKey : `${baseKey}_other`
  return t[pluralKey] || t[baseKey] || `{{count}} ${baseKey}`
}

export default function AnimatedCountLabel({ count, labelKey, t }) {
  const text = useMemo(
    () => getPluralKey(labelKey, count, t).replace('{{count}}', count),
    [labelKey, count, t]
  )

  return (
    <span className={styles.label}>
      <span className={styles.text}>{text}</span>
    </span>
  )
}
