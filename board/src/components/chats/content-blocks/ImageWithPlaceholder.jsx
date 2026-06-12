import { memo, useState } from 'react'
import styles from './ImageWithPlaceholder.module.css'

export default memo(function ImageWithPlaceholder({ src, alt }) {
  const [hasError, setHasError] = useState(false)
  const [isLoaded, setIsLoaded] = useState(false)
  const [isHovered, setIsHovered] = useState(false)
  const isBase64 = src?.startsWith('data:image')
  const isUrl = src?.startsWith('http')

  const handleOpenNewTab = (e) => {
    e.stopPropagation()
    window.open(src, '_blank', 'noopener,noreferrer')
  }

  if (hasError) {
    return (
      <figure className={styles.markdownImageWrap}>
        <div className={styles.imageErrorPlaceholder}>
          <svg viewBox="0 0 24 24" className={styles.imageErrorIcon}>
            <path d="M21 19V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2zM8.5 13.5l2.5 3 3.5-4.5 4.5 6H5l3.5-4.5z" fill="currentColor"/>
          </svg>
          <span className={styles.imageErrorText}>Image unavailable</span>
        </div>
        {alt ? <figcaption className={styles.markdownImageCaption}>{alt}</figcaption> : null}
      </figure>
    )
  }

  return (
    <figure
      className={styles.markdownImageWrap}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {!isLoaded && (
        <div className={`${styles.imagePlaceholder} ${isHovered ? styles.imagePlaceholderHovered : ''}`}>
          {isUrl && !isBase64 && <div className={`uiSkeleton ${styles.imageSkeleton}`} />}
          {isBase64 && (
            <div className={styles.imageBase64Placeholder}>
              <img src={src} alt="" className={styles.imageBlurPreview} />
              <div className={styles.imageOverlay} />
            </div>
          )}
        </div>
      )}
      <div className={`${styles.imageActions} ${isHovered && isLoaded ? styles.imageActionsVisible : ''}`}>
        <button type="button" className={styles.imageActionBtn} onClick={handleOpenNewTab} title="Open in new tab">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
            <path d="M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>
          </svg>
        </button>
      </div>
      <img
        src={src}
        alt={alt || ''}
        className={`${styles.markdownImage} ${isLoaded ? styles.markdownImageLoaded : ''}`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
      />
      {alt ? <figcaption className={styles.markdownImageCaption}>{alt}</figcaption> : null}
    </figure>
  )
})
