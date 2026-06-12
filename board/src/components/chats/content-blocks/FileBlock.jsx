import { useState } from 'react'
import styles from './FileBlock.module.css'

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'apng', 'avif'])

function getFileExt(name) {
  if (!name) return ''
  const idx = name.lastIndexOf('.')
  return idx >= 0 ? name.slice(idx + 1).toLowerCase() : ''
}

function isImageFile(name) {
  return IMAGE_EXTS.has(getFileExt(name))
}

export default function FileBlock({ block }) {
  const [expanded, setExpanded] = useState(false)
  const name = block.fileName || block.content || ''
  const url = block.url
  const image = isImageFile(name)

  if (image && url) {
    return (
      <div className={styles.fileBlock}>
        <div
          className={`${styles.imagePreview} ${expanded ? styles.imagePreviewExpanded : ''}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <img
            src={url}
            alt={name}
            className={expanded ? styles.imageFull : styles.imageThumb}
            loading="lazy"
          />
        </div>
        <span className={styles.fileBlockName}>{name}</span>
      </div>
    )
  }

  return (
    <div className={styles.fileBlock}>
      <span className={styles.fileBlockIcon}>📄</span>
      <span className={styles.fileBlockName}>{name}</span>
    </div>
  )
}
