import styles from './NavRow.module.css'

/**
 * NavRow — a single sidebar navigation item.
 *
 * Props:
 *   icon        ReactNode  — the icon element
 *   label       string     — the text label
 *   isActive    bool
 *   isClosed    bool       — sidebar collapsed state (controls tooltip visibility)
 *   onClick     fn
 *   onDoubleClick fn       — optional: double click handler
 *   children    ReactNode  — optional: chevron, badge, etc.
 */
export default function NavRow({
  icon,
  label,
  navKey,
  tooltip = label,
  tooltipLabel,
  tooltipMeta,
  isActive,
  isClosed,
  onClick,
  onDoubleClick,
  children,
  className = '',
}) {
  const accessibleTooltip = tooltipLabel ?? (typeof tooltip === 'string' ? tooltip : label)

  return (
    <div
      className={[
        styles.row,
        isActive ? styles.active : '',
        className,
      ].join(' ')}
      data-nav={navKey}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      title={isClosed ? accessibleTooltip : undefined}
      aria-label={isClosed ? accessibleTooltip : undefined}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
    >
      {/* Icon — always visible */}
      <span className={styles.icon}>{icon}</span>

      {/* Label — fades out when closed */}
      <span className={[styles.label, isClosed ? styles.labelHidden : ''].join(' ')}>
        {label}
      </span>

      {/* Extra content (chevron, badge…) — hidden when closed */}
      {children && (
        <span className={[styles.extras, isClosed ? styles.extrasHidden : ''].join(' ')}>
          {children}
        </span>
      )}

      {isClosed && (
        <span className={styles.tooltip} role="tooltip">
          <span>{tooltip}</span>
          {tooltipMeta && <span className={styles.shortcut}>{tooltipMeta}</span>}
        </span>
      )}
    </div>
  )
}
