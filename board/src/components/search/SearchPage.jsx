import { useTranslation } from '@/i18n'
import styles from './Placeholder.module.css'

export default function SearchPage() {
  const { t } = useTranslation()
  return (
    <div className={styles.container}>
      <h1 className={styles.title}>{t('sidebar.search')}</h1>
      <p className={styles.desc}>{t('placeholder.comingSoon')}</p>
    </div>
  )
}
