import { memo } from 'react'
import styles from './StripeLoader.module.css'

const StripeLoader = memo(function StripeLoader({ width = 48, height = 7, className }) {
  return (
    <div
      className={`${styles.loader} ${className || ''}`}
      style={{ width, height }}
      aria-hidden="true"
    />
  )
})

export default StripeLoader
