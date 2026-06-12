import { parseUrlSegments } from './helpers'
import styles from './UrlText.module.css'

export default function UrlText({ text }) {
  const segments = parseUrlSegments(text)

  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === 'text') {
          return <span key={i}>{seg.content}</span>
        }
        return (
          <span key={i} className={styles.urlWrap}>
            <a href={seg.url} target="_blank" rel="noreferrer" className={styles.markdownLink}>
              {seg.url}
            </a>
            <button
              type="button"
              className={styles.urlChip}
              onClick={() => window.open(seg.url, '_blank', 'noopener,noreferrer')}
            >
              {seg.hostname}
            </button>
          </span>
        )
      })}
    </>
  )
}
