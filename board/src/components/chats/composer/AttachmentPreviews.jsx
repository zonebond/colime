import AttachmentCard, { getAttachmentName } from '@/components/attachments/AttachmentCard'
import styles from './AttachmentPreviews.module.css'

export default function AttachmentPreviews({ attachments, exitingAttachments = [], onPreview, onRemove }) {
  if (attachments.length === 0 && exitingAttachments.length === 0) {
    return null
  }

  return (
    <div className={styles.attachmentPreviews}>
      {attachments.map((file, index) => (
        <AttachmentCard
          key={file.localId || `${getAttachmentName(file)}-${index}`}
          file={file}
          onPreview={onPreview}
          size="compact"
          onRemove={() => onRemove(file)}
        />
      ))}
      {exitingAttachments.map((file, index) => (
        <div key={`exiting-${file.localId || file.id || index}`} className={styles.attachmentCardExitingWrap}>
          <AttachmentCard
            file={file}
            onPreview={onPreview}
            size="compact"
          />
        </div>
      ))}
    </div>
  )
}
