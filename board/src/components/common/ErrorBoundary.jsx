import { Component } from 'react'
import { LanguageContext, MESSAGES } from '@/i18n/shared'
import styles from './ErrorBoundary.module.css'

/**
 * Catches render errors from its subtree so a single failing component
 * (e.g. malformed LLM markdown) can't white-screen the whole app.
 *
 * Props:
 * - variant: 'page' (default) — full-height fallback for route content;
 *            'inline' — compact fallback for a single message row.
 * - resetKey: when this value changes, the boundary clears its error
 *             state (used to recover on route navigation).
 */
export default class ErrorBoundary extends Component {
  static contextType = LanguageContext

  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null })
    }
  }

  handleRetry = () => {
    this.setState({ error: null })
  }

  translate(key) {
    if (this.context?.t) return this.context.t(key)
    // Boundary may sit above LanguageProvider — fall back to English.
    const value = key.split('.').reduce((acc, part) => acc?.[part], MESSAGES.en)
    return value ?? key
  }

  render() {
    if (!this.state.error) return this.props.children

    const isInline = this.props.variant === 'inline'
    return (
      <div className={isInline ? styles.inline : styles.page} role="alert">
        <span className={styles.title}>{this.translate('errorBoundary.title')}</span>
        {!isInline && (
          <span className={styles.detail}>{this.state.error?.message}</span>
        )}
        <button type="button" className={styles.retry} onClick={this.handleRetry}>
          {this.translate('errorBoundary.retry')}
        </button>
      </div>
    )
  }
}
