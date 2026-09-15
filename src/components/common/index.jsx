import { Component, useEffect, useId, useMemo, useRef } from 'react'
import { cx } from '../../utils/index.js'
import { env } from '../../config/env.js'
import { safeImageUrl, safeUrl } from '../../utils/security.js'

export function Button({ children, variant = 'primary', size, loading, className, type = 'button', disabled, ...props }) {
  return (
    <button
      type={type}
      className={cx('btn', variant !== 'primary' && `btn-${variant}`, size && `btn-${size}`, loading && 'is-loading', className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className="btn-spinner" aria-hidden="true" /> : null}
      <span>{children}</span>
    </button>
  )
}

export function Input({ label, id, error, hint, required, className, ...props }) {
  const autoId = useId()
  const inputId = id || autoId
  const describedBy = error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined
  return (
    <div className={cx('field', error && 'field-error', className)}>
      {label ? (
        <label htmlFor={inputId}>
          {label}
          {required ? <span aria-hidden="true"> *</span> : null}
        </label>
      ) : null}
      <input
        className="input"
        id={inputId}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        {...props}
      />
      {error ? <span className="field-msg" id={`${inputId}-error`} role="alert">{error}</span> : null}
      {!error && hint ? <span className="field-hint" id={`${inputId}-hint`}>{hint}</span> : null}
    </div>
  )
}

export function Textarea({ label, id, error, hint, rows = 4, required, ...props }) {
  const autoId = useId()
  const inputId = id || autoId
  return (
    <div className={cx('field', error && 'field-error')}>
      {label ? <label htmlFor={inputId}>{label}{required ? <span aria-hidden="true"> *</span> : null}</label> : null}
      <textarea className="input" id={inputId} rows={rows} required={required} aria-invalid={error ? 'true' : undefined} {...props} />
      {error ? <span className="field-msg" role="alert">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function Select({ label, id, options = [], error, hint, ...props }) {
  const autoId = useId()
  const inputId = id || autoId
  return (
    <div className={cx('field', error && 'field-error')}>
      {label ? <label htmlFor={inputId}>{label}</label> : null}
      <select className="select" id={inputId} aria-invalid={error ? 'true' : undefined} {...props}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {error ? <span className="field-msg" role="alert">{error}</span> : null}
      {!error && hint ? <span className="field-hint">{hint}</span> : null}
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint, disabled }) {
  const id = useId()
  return (
    <div className="toggle-row">
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        className={cx('toggle', checked && 'on')}
        onClick={() => onChange(!checked)}
      >
        <span className="toggle-knob" />
      </button>
      <label htmlFor={id}>
        {label}
        {hint ? <small>{hint}</small> : null}
      </label>
    </div>
  )
}

export function Badge({ children, tone }) {
  return <span className={cx('badge', tone && `badge-${tone}`)}>{children}</span>
}

export function StatusPill({ status }) {
  const tone = {
    published: 'success',
    active: 'success',
    delivered: 'success',
    draft: 'muted',
    scheduled: 'info',
    expired: 'warn',
    suspended: 'danger',
    cancelled: 'danger',
  }[status] || 'muted'
  return <span className={cx('pill', `pill-${tone}`)}>{String(status || '').replace(/_/g, ' ')}</span>
}

export function Rating({ value = 0, count }) {
  const rounded = Math.round((Number(value) || 0) * 10) / 10
  const filled = Math.round(rounded)
  return (
    <span className="rating" aria-label={`Rated ${rounded} out of 5`}>
      <span aria-hidden="true">
        {'★★★★★'.slice(0, filled)}
        <span className="muted">{'★★★★★'.slice(filled)}</span>
      </span>
      <span className="muted"> {rounded}{count ? ` (${count})` : ''}</span>
    </span>
  )
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {hint ? <p className="muted">{hint}</p> : null}
      {action}
    </div>
  )
}

function readableError(message) {
  if (!message) return 'Please try again in a moment.'
  if (typeof message === 'string') return message
  if (typeof message === 'object' && typeof message.message === 'string') return message.message
  return 'Please try again in a moment.'
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="error-state" role="alert">
      <h2>Something went wrong</h2>
      <p className="muted">{readableError(message)}</p>
      {onRetry ? <Button onClick={onRetry}>Try again</Button> : null}
    </div>
  )
}

export function Skeleton({ height = 180, count = 1, radius = 2 }) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton" style={{ height, borderRadius: radius }} aria-hidden="true" />
      ))}
    </>
  )
}

export function Breadcrumb({ items = [] }) {
  return (
    <nav aria-label="Breadcrumb" className="breadcrumb">
      <ol>
        {items.map((item, i) => {
          const href = safeUrl(item.href, { allowExternal: false })
          const isLast = i === items.length - 1
          return (
            <li key={item.href || item.label}>
              {href && !isLast ? <a href={href}>{item.label}</a> : <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export function Pagination({ page, pages, onPage }) {
  if (!pages || pages <= 1) return null
  return (
    <nav className="pagination" aria-label="Pagination">
      <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
      <span className="muted" aria-live="polite">Page {page} of {pages}</span>
      <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
    </nav>
  )
}

/** Traps focus inside an overlay and restores it to the opener on close. */
function useOverlay(open, onClose, ref) {
  useEffect(() => {
    if (!open) return undefined
    const opener = document.activeElement
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
        return
      }
      if (event.key !== 'Tab' || !ref.current) return
      const focusable = ref.current.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    const timer = setTimeout(() => {
      const target = ref.current?.querySelector('[data-autofocus], button, input, select, textarea, a[href]')
      target?.focus()
    }, 20)

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      clearTimeout(timer)
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [open, onClose, ref])
}

export function Modal({ open, title, onClose, children, size = 'md', footer }) {
  const ref = useRef(null)
  useOverlay(open, onClose, ref)
  if (!open) return null
  return (
    <div className="modal-backdrop" onMouseDown={onClose} role="presentation">
      <div
        ref={ref}
        className={cx('modal', `modal-${size}`)}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="overlay-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close dialog">×</button>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-foot">{footer}</footer> : null}
      </div>
    </div>
  )
}

export function Drawer({ open, side = 'right', title, onClose, children, footer }) {
  const ref = useRef(null)
  useOverlay(open, onClose, ref)
  if (!open) return null
  return (
    <div className="drawer-backdrop" onMouseDown={onClose} role="presentation">
      <aside
        ref={ref}
        className={`drawer drawer-${side}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="overlay-head">
          <h3>{title}</h3>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close panel">×</button>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-foot">{footer}</footer> : null}
      </aside>
    </div>
  )
}

export function ConfirmDialog({ open, title = 'Are you sure?', message, confirmLabel = 'Confirm', tone = 'danger', busy, onConfirm, onCancel }) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant={tone} loading={busy} onClick={onConfirm} data-autofocus>{confirmLabel}</Button>
        </>
      }
    >
      <p className="muted">{message}</p>
    </Modal>
  )
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={value === tab.id}
          className={value === tab.id ? 'on' : ''}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export function Accordion({ items }) {
  return (
    <div className="accordion">
      {items.map((item) => (
        <details key={item.title}>
          <summary>{item.title}</summary>
          <div className="muted" style={{ paddingTop: 8 }}>{item.body}</div>
        </details>
      ))}
    </div>
  )
}

const WIDTHS = [480, 768, 1024, 1440, 1920]

/** Builds a width-based srcset for CDN URLs that accept a `w` query parameter. */
function buildSrcSet(src) {
  if (!src || !/[?&]w=\d+/.test(src)) return undefined
  return WIDTHS.map((w) => `${src.replace(/([?&]w=)\d+/, `$1${w}`)} ${w}w`).join(', ')
}

export function OptimizedImage({
  src,
  alt = '',
  width,
  height,
  priority,
  sizes = '(max-width: 600px) 50vw, (max-width: 1024px) 33vw, 25vw',
  className,
  style,
  onError,
}) {
  const safe = safeImageUrl(src)
  const srcSet = useMemo(() => buildSrcSet(safe), [safe])
  const handleError = (e) => {
    e.currentTarget.classList.add('is-broken')
    onError?.(e)
  }
  if (!safe) return <div className={cx('img-fallback', className)} style={{ width, height, ...style }} aria-hidden="true" />
  return (
    <img
      src={safe}
      srcSet={srcSet}
      sizes={srcSet ? sizes : undefined}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      className={className}
      style={style}
      onError={handleError}
    />
  )
}

/** Art-directed image: separate crops per breakpoint, used by hero banners. */
export function ResponsiveImage({ desktop, tablet, mobile, alt = '', priority, className, style }) {
  const desktopSrc = safeImageUrl(desktop)
  const tabletSrc = safeImageUrl(tablet) || desktopSrc
  const mobileSrc = safeImageUrl(mobile) || tabletSrc
  if (!desktopSrc && !mobileSrc) return <div className={cx('img-fallback', className)} style={style} aria-hidden="true" />
  return (
    <picture>
      <source media="(max-width: 600px)" srcSet={mobileSrc} />
      <source media="(max-width: 1024px)" srcSet={tabletSrc} />
      <img
        src={desktopSrc || mobileSrc}
        alt={alt}
        className={className}
        style={style}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding={priority ? 'sync' : 'async'}
      />
    </picture>
  )
}

export function Seo({ title, description, canonical, image, noindex, jsonLd }) {
  const serialized = jsonLd ? JSON.stringify(jsonLd) : ''
  useEffect(() => {
    if (title) document.title = title
    const set = (name, content, attr = 'name') => {
      let el = document.head.querySelector(`meta[${attr}="${name}"]`)
      if (!content) {
        el?.remove()
        return
      }
      if (!el) {
        el = document.createElement('meta')
        el.setAttribute(attr, name)
        document.head.appendChild(el)
      }
      el.setAttribute('content', content)
    }
    set('description', description)
    set('robots', noindex ? 'noindex, nofollow' : 'index, follow')
    set('og:title', title, 'property')
    set('og:description', description, 'property')
    set('og:image', safeImageUrl(image), 'property')
    set('og:type', 'website', 'property')
    set('twitter:card', 'summary_large_image')

    if (canonical) {
      let link = document.head.querySelector('link[rel="canonical"]')
      if (!link) {
        link = document.createElement('link')
        link.rel = 'canonical'
        document.head.appendChild(link)
      }
      link.href = canonical
    }

    let script = document.getElementById('jsonld')
    if (serialized) {
      if (!script) {
        script = document.createElement('script')
        script.type = 'application/ld+json'
        script.id = 'jsonld'
        document.head.appendChild(script)
      }
      script.textContent = serialized
    } else {
      script?.remove()
    }
  }, [title, description, canonical, image, noindex, serialized])
  return null
}

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ui]', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="boundary" role="alert">
        <h1>This section could not be displayed</h1>
        <p className="muted">
          The rest of the site is still working. Reload the page, or head back to the homepage.
        </p>
        <div className="boundary-actions">
          <Button onClick={() => window.location.reload()}>Reload page</Button>
          <Button variant="ghost" onClick={() => { window.location.href = env.homePath }}>Go to homepage</Button>
        </div>
      </div>
    )
  }
}
