import { useMemo, useState } from 'react'
import { BANNER_ASPECTS, STOCK_LIBRARY } from '../../config/media.js'
import { bannersApi } from '../../services/api/index.js'
import { storesApi } from '../../services/api/stores.js'
import { useAsync, useSubmit } from '../../hooks/index.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import {
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  ResponsiveImage,
  Select,
  Skeleton,
  StatusPill,
} from '../../components/common/index.jsx'
import { cx, formatDate, withinDateRange } from '../../utils/index.js'
import { safeImageUrl, safeUrl } from '../../utils/security.js'

const BLANK = {
  name: '',
  heading: '',
  subtitle: '',
  ctaText: 'Shop the collection',
  ctaUrl: '',
  desktopImage: '',
  tabletImage: '',
  mobileImage: '',
  overlay: 'center',
  align: 'center',
  theme: 'light',
  status: 'draft',
  startDate: '',
  endDate: '',
}

const POSITIONS = [
  { value: 'center', label: 'Centre' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
]

function scheduleLabel(banner) {
  if (banner.status !== 'published') return 'Not live'
  if (!banner.startDate && !banner.endDate) return 'Live now'
  if (!withinDateRange(banner.startDate, banner.endDate)) {
    return new Date(banner.startDate || 0) > new Date() ? `Scheduled ${formatDate(banner.startDate)}` : `Ended ${formatDate(banner.endDate)}`
  }
  return `Live until ${banner.endDate ? formatDate(banner.endDate) : 'further notice'}`
}

function validate(form) {
  const errors = {}
  if (!form.heading.trim()) errors.heading = 'Shoppers need a headline.'
  if (!form.desktopImage.trim()) errors.desktopImage = 'Pick or paste a desktop image.'
  else if (!safeImageUrl(form.desktopImage)) errors.desktopImage = 'Use an https:// image address or a /local path.'
  if (form.mobileImage && !safeImageUrl(form.mobileImage)) errors.mobileImage = 'Use an https:// image address or a /local path.'
  if (form.tabletImage && !safeImageUrl(form.tabletImage)) errors.tabletImage = 'Use an https:// image address or a /local path.'
  if (form.ctaUrl && !safeUrl(form.ctaUrl)) errors.ctaUrl = 'Links must start with https:// or / inside your store.'
  if (form.ctaText && !form.ctaUrl) errors.ctaUrl = 'Add the page this button should open.'
  if (form.startDate && form.endDate && form.startDate > form.endDate) errors.endDate = 'The end date must come after the start date.'
  return errors
}

function DevicePreview({ form, device }) {
  const aspect = BANNER_ASPECTS[device]
  return (
    <div className="banner-preview">
      <div className={cx('banner-frame', `is-${device}`)} style={{ aspectRatio: aspect.ratio }}>
        <ResponsiveImage
          desktop={device === 'desktop' ? form.desktopImage : device === 'tablet' ? form.tabletImage || form.desktopImage : form.mobileImage || form.desktopImage}
          alt=""
          priority
          className="banner-frame-img"
        />
        <div className={cx('banner-frame-copy', `overlay-${form.overlay}`, `tone-${form.theme}`)} style={{ textAlign: form.align }}>
          {form.subtitle ? <p className="caption">{form.subtitle}</p> : null}
          <h3>{form.heading || 'Your headline appears here'}</h3>
          {form.ctaText ? <span className="btn btn-sm">{form.ctaText}</span> : null}
        </div>
      </div>
      <p className="muted" style={{ fontSize: '0.78rem' }}>{aspect.label} · recommended {aspect.guidance}</p>
    </div>
  )
}

function ImagePicker({ label, field, form, setField, error, hint }) {
  const [open, setOpen] = useState(false)
  const preview = safeImageUrl(form[field])
  return (
    <div className="image-picker">
      <Input
        label={label}
        value={form[field]}
        error={error}
        hint={hint}
        placeholder="https://…"
        onChange={(e) => setField(field, e.target.value)}
      />
      <div className="image-picker-row">
        {preview ? <img src={preview} alt="" className="image-picker-thumb" /> : <span className="image-picker-thumb empty" aria-hidden="true" />}
        <Button variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? 'Close library' : 'Choose from library'}
        </Button>
        {form[field] ? <Button variant="ghost" size="sm" onClick={() => setField(field, '')}>Clear</Button> : null}
      </div>
      {open ? (
        <div className="stock-grid">
          {STOCK_LIBRARY.map((item) => (
            <button
              key={item.id}
              type="button"
              className="stock-tile"
              onClick={() => {
                setField(field, item[field === 'mobileImage' ? 'mobile' : field === 'tabletImage' ? 'tablet' : 'desktop'])
                setOpen(false)
              }}
            >
              <img src={item.thumb} alt={item.label} loading="lazy" />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function BannerEditor({ banner, storeSlug, onClose, onSaved }) {
  const isNew = !banner?.id
  const [form, setForm] = useState(() => ({ ...BLANK, ...(banner || {}), ctaUrl: banner?.ctaUrl || `/store/${storeSlug}/products` }))
  const [device, setDevice] = useState('desktop')
  const [touched, setTouched] = useState(false)
  const errors = useMemo(() => validate(form), [form])
  const hasErrors = Object.keys(errors).length > 0

  const setField = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const { submit, pending, error } = useSubmit(async (status) => {
    setTouched(true)
    if (Object.keys(validate({ ...form, status })).length) throw new Error('Please fix the highlighted fields.')
    const payload = { ...form, status }
    const saved = isNew ? await bannersApi.create(payload) : await bannersApi.update(banner.id, payload)
    onSaved(saved, status)
  })

  return (
    <Drawer
      open
      side="right"
      title={isNew ? 'New banner' : 'Edit banner'}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" loading={pending} onClick={() => submit('draft')}>Save draft</Button>
          <Button loading={pending} onClick={() => submit('published')}>
            {form.status === 'published' ? 'Save & keep live' : 'Publish'}
          </Button>
        </>
      }
    >
      <div className="banner-editor">
        <div className="device-switch" role="tablist" aria-label="Preview device">
          {Object.entries(BANNER_ASPECTS).map(([key, meta]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={device === key}
              className={device === key ? 'on' : ''}
              onClick={() => setDevice(key)}
            >
              {meta.label}
            </button>
          ))}
        </div>
        <DevicePreview form={form} device={device} />

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <Input label="Internal name" hint="Only your team sees this" value={form.name} onChange={(e) => setField('name', e.target.value)} placeholder="Diwali hero" />
        <Input label="Headline" required value={form.heading} error={touched ? errors.heading : undefined} onChange={(e) => setField('heading', e.target.value)} />
        <Input label="Supporting line" value={form.subtitle} onChange={(e) => setField('subtitle', e.target.value)} />

        <div className="grid-2">
          <Input label="Button text" value={form.ctaText} onChange={(e) => setField('ctaText', e.target.value)} />
          <Input
            label="Button link"
            value={form.ctaUrl}
            error={touched ? errors.ctaUrl : undefined}
            hint={`Inside your store, e.g. /store/${storeSlug}/category/wedding`}
            onChange={(e) => setField('ctaUrl', e.target.value)}
          />
        </div>

        <ImagePicker label="Desktop image" field="desktopImage" form={form} setField={setField} error={touched ? errors.desktopImage : undefined} />
        <ImagePicker label="Tablet image" field="tabletImage" form={form} setField={setField} error={touched ? errors.tabletImage : undefined} hint="Optional — falls back to desktop" />
        <ImagePicker label="Mobile image" field="mobileImage" form={form} setField={setField} error={touched ? errors.mobileImage : undefined} hint="Optional — a taller crop reads better on phones" />

        <div className="grid-3">
          <Select label="Text block position" value={form.overlay} onChange={(e) => setField('overlay', e.target.value)} options={POSITIONS} />
          <Select label="Text alignment" value={form.align} onChange={(e) => setField('align', e.target.value)} options={POSITIONS} />
          <Select
            label="Text colour"
            value={form.theme}
            onChange={(e) => setField('theme', e.target.value)}
            options={[{ value: 'light', label: 'Light text on dark scrim' }, { value: 'dark', label: 'Dark text on light scrim' }]}
          />
        </div>

        <div className="grid-2">
          <Input type="date" label="Start showing" value={form.startDate} onChange={(e) => setField('startDate', e.target.value)} />
          <Input type="date" label="Stop showing" value={form.endDate} error={touched ? errors.endDate : undefined} onChange={(e) => setField('endDate', e.target.value)} />
        </div>

        {touched && hasErrors ? <p className="form-error" role="alert">Fix the highlighted fields to publish.</p> : null}
      </div>
    </Drawer>
  )
}

export function BannersAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data: store } = useAsync(() => storesApi.get(user.tenantId), [user.tenantId])
  const { data, loading, error, refetch } = useAsync(() => bannersApi.list(user.tenantId), [user.tenantId])
  const [editing, setEditing] = useState(null)
  const [confirming, setConfirming] = useState(null)
  const [busy, setBusy] = useState(false)

  const banners = data || []
  const storeSlug = store?.slug || ''

  const setStatus = async (banner, status) => {
    try {
      await bannersApi.update(banner.id, { status })
      push(status === 'published' ? 'Banner is live on your storefront' : 'Banner moved to draft')
      refetch()
    } catch (err) {
      push(err.message)
    }
  }

  const move = async (banner, direction) => {
    const ids = banners.map((b) => b.id)
    const from = ids.indexOf(banner.id)
    const to = from + direction
    if (to < 0 || to >= ids.length) return
    ids.splice(to, 0, ids.splice(from, 1)[0])
    await bannersApi.reorder(user.tenantId, ids)
    refetch()
  }

  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Banners</h1>
          <p className="muted">Edit the words and pictures, preview each screen size, then publish. Live banners appear in your homepage carousel.</p>
        </div>
        <Button onClick={() => setEditing({})}>New banner</Button>
      </div>

      {loading ? (
        <div className="banner-list"><Skeleton height={150} count={3} radius={4} /></div>
      ) : banners.length === 0 ? (
        <EmptyState
          title="No banners yet"
          hint="Create your first hero banner to greet shoppers on the homepage."
          action={<Button onClick={() => setEditing({})}>Create a banner</Button>}
        />
      ) : (
        <ul className="banner-list">
          {banners.map((banner, i) => (
            <li key={banner.id} className={cx('banner-row', banner.status === 'published' && 'is-live')}>
              <div className="banner-thumb">
                <ResponsiveImage desktop={banner.desktopImage} mobile={banner.mobileImage} alt="" className="banner-frame-img" />
              </div>
              <div className="banner-meta">
                <div className="banner-meta-head">
                  <strong>{banner.name || banner.heading}</strong>
                  <StatusPill status={banner.status} />
                </div>
                <p className="banner-heading">{banner.heading}</p>
                {banner.subtitle ? <p className="muted">{banner.subtitle}</p> : null}
                <p className="caption">{scheduleLabel(banner)} · updated {formatDate(banner.updatedAt)}</p>
              </div>
              <div className="banner-actions">
                <Button size="sm" onClick={() => setEditing(banner)}>Edit</Button>
                {banner.status === 'published' ? (
                  <Button size="sm" variant="ghost" onClick={() => setStatus(banner, 'draft')}>Unpublish</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => setStatus(banner, 'published')}>Publish</Button>
                )}
                <div className="banner-order">
                  <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(banner, -1)}>↑</button>
                  <button type="button" className="icon-btn" aria-label="Move down" disabled={i === banners.length - 1} onClick={() => move(banner, 1)}>↓</button>
                </div>
                <Button size="sm" variant="ghost" onClick={() => setConfirming(banner)}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <BannerEditor
          banner={editing.id ? editing : null}
          storeSlug={storeSlug}
          onClose={() => setEditing(null)}
          onSaved={(_, status) => {
            setEditing(null)
            push(status === 'published' ? 'Banner published' : 'Banner saved as draft')
            refetch()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete this banner?"
        message={`"${confirming?.name || confirming?.heading}" will be removed from your storefront immediately. This cannot be undone.`}
        confirmLabel="Delete banner"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          setBusy(true)
          try {
            await bannersApi.remove(confirming.id)
            push('Banner deleted')
            refetch()
          } catch (err) {
            push(err.message)
          } finally {
            setBusy(false)
            setConfirming(null)
          }
        }}
      />
    </div>
  )
}

export default BannersAdmin
