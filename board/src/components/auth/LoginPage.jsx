import { useEffect, useRef, useState } from 'react'
import { Eye, EyeSlash, WarningCircle } from '@phosphor-icons/react'
import { useTranslation } from '@/i18n'
import { login } from '@/features/auth/auth.service'
import styles from './LoginPage.module.css'

/**
 * In-app sign-in, replacing the browser's native basic-auth dialog.
 * Ravens no longer sends a `www-authenticate` challenge, so this page is the
 * only credential prompt the user ever sees.
 */
export default function LoginPage({ onAuthenticated }) {
  const { t } = useTranslation()
  const ta = t('auth') || {}

  const [password, setPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (submitting || !password) return

    setSubmitting(true)
    setError(null)
    try {
      const result = await login(password)
      if (result.ok) {
        onAuthenticated?.()
        return
      }
      setError(result.error === 'invalid_credentials' ? 'invalid' : 'failed')
      setPassword('')
      inputRef.current?.focus()
    } catch (_) {
      setError('failed')
    } finally {
      setSubmitting(false)
    }
  }

  const errorText = error === 'invalid'
    ? (ta.invalidPassword || 'Incorrect password')
    : (ta.requestFailed || 'Could not reach the server. Check that it is running.')

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.head}>
          <span className={styles.mark} aria-hidden="true" />
          <div className={styles.titleGroup}>
            <span className={styles.brand}>{t('sidebar.brand') || 'RAVENS'}</span>
            <h1 className={styles.title}>{ta.title || 'Welcome back'}</h1>
          </div>
          <p className={styles.subtitle}>{ta.subtitle || 'Enter your password to continue.'}</p>
        </div>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.field}>
            <label className={styles.label} htmlFor="ravens-password">
              {ta.password || 'Password'}
            </label>
            <div className={styles.inputWrap}>
              <input
                id="ravens-password"
                ref={inputRef}
                type={reveal ? 'text' : 'password'}
                className={`${styles.input} ${error ? styles.inputError : ''}`}
                value={password}
                autoComplete="current-password"
                placeholder={ta.passwordPlaceholder || '••••••••'}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (error) setError(null)
                }}
              />
              <button
                type="button"
                className={styles.reveal}
                onClick={() => setReveal((v) => !v)}
                aria-label={reveal ? (ta.hidePassword || 'Hide password') : (ta.showPassword || 'Show password')}
                tabIndex={-1}
              >
                {reveal ? <EyeSlash size={16} weight="bold" /> : <Eye size={16} weight="bold" />}
              </button>
            </div>
          </div>

          {error ? (
            <div className={styles.error} role="alert">
              <WarningCircle size={14} weight="fill" />
              <span>{errorText}</span>
            </div>
          ) : null}

          <button type="submit" className={styles.submit} disabled={submitting || !password}>
            {submitting ? <span className={styles.spinner} /> : null}
            {submitting ? (ta.signingIn || 'Signing in…') : (ta.signIn || 'Sign in')}
          </button>
        </form>

        <p className={styles.hint}>{ta.hint || 'Set by RAVENS_SERVER_PASSWORD on the server.'}</p>
      </div>
    </div>
  )
}
