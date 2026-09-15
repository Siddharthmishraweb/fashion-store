import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { storesApi } from '../../services/api/stores.js'
import { customizeApi } from '../../services/api/index.js'
import { useAsync, useSubmit } from '../../hooks/index.js'
import { TenantProvider } from '../../context/TenantContext.jsx'
import { CartProvider, WishlistProvider } from '../../context/CommerceContext.jsx'
import StoreHome from '../storefront/Home.jsx'
import { Footer, Header } from '../../components/navigation/Header.jsx'
import { Button, Input, Select, Skeleton, Toggle } from '../../components/common/index.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { HOMEPAGE_BLOCKS } from '../../config/constants.js'
import { FONT_CATALOG, THEMES } from '../../theme/themes.js'
import { cx, uid, withinDateRange } from '../../utils/index.js'

const TABS = [
  ['theme', 'Themes'],
  ['colors', 'Colours'],
  ['typography', 'Type'],
  ['layout', 'Layout'],
  ['branding', 'Branding'],
  ['homepage', 'Homepage'],
]

const COLOR_FIELDS = [
  ['primaryColor', 'Primary'],
  ['secondaryColor', 'Secondary'],
  ['accentColor', 'Accent'],
  ['backgroundColor', 'Page background'],
  ['surfaceColor', 'Card surface'],
  ['textColor', 'Text'],
]

const DEVICES = [
  ['desktop', 'Desktop', 1280],
  ['tablet', 'Tablet', 834],
  ['mobile', 'Mobile', 390],
]

const fontOptions = (keys) => keys.map((key) => ({ value: key, label: FONT_CATALOG[key]?.name || key }))

export default function CustomizerPage() {
  const { user } = useAuth()
  const { push } = useToast()
  const storeQuery = useAsync(() => storesApi.get(user.tenantId), [user.tenantId])
  const store = storeQuery.data
  const resolved = useAsync(
    () => (store ? storesApi.resolve({ slug: store.slug }) : Promise.resolve(null)),
    [store?.slug],
  )

  const [tab, setTab] = useState('theme')
  const [device, setDevice] = useState('desktop')
  const [draft, setDraft] = useState(null)

  const current = draft || (store
    ? {
        themeDraft: store.themeDraft || store.theme,
        homepageDraft: store.homepageDraft || store.homepage,
        navigationDraft: store.navigationDraft || store.navigation,
        branding: store.branding,
      }
    : null)

  const previewConfig = useMemo(() => {
    if (!store || !current) return null
    return {
      tenant: {
        ...store,
        branding: current.branding,
        logoText: current.branding?.name || store.name,
        tagline: current.branding?.tagline || store.tagline,
      },
      theme: current.themeDraft,
      settings: store.settings,
      navigation: current.navigationDraft,
      homepage: current.homepageDraft,
      // Only banners a shopper would actually see belong in the preview.
      banners: (resolved.data?.banners || []).filter(
        (b) => b.status === 'published' && withinDateRange(b.startDate, b.endDate),
      ),
      categories: resolved.data?.categories || [],
      collections: resolved.data?.collections || [],
      testimonials: resolved.data?.testimonials || [],
      instagram: resolved.data?.instagram || [],
    }
  }, [store, current, resolved.data])

  const saveDraft = useSubmit(async () => {
    await customizeApi.save({ tenantId: store.id, ...current })
    push('Draft saved — shoppers still see the published version')
  })

  const publish = useSubmit(async () => {
    await customizeApi.save({ tenantId: store.id, ...current })
    await customizeApi.publish({ tenantId: store.id })
    push('Your storefront has been updated')
    storeQuery.refetch()
  })

  if (storeQuery.loading || !store || !current) {
    return <Skeleton height={480} radius={4} />
  }

  const setTheme = (patch) => setDraft({ ...current, themeDraft: { ...current.themeDraft, ...patch } })
  const dirty = draft !== null

  return (
    <div className="customizer">
      <aside className="customizer-side">
        <div className="admin-top">
          <div>
            <h1>Appearance</h1>
            <p className="muted">{dirty ? 'Unsaved changes' : 'Everything is published'}</p>
          </div>
          <Link className="btn btn-ghost btn-sm" to={`/store/${store.slug}`} target="_blank" rel="noreferrer">Open live</Link>
        </div>

        <div className="tabs" role="tablist">
          {TABS.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={tab === id} className={cx(tab === id && 'on')} onClick={() => setTab(id)}>
              {label}
            </button>
          ))}
        </div>

        <div className="customizer-panel">
          {tab === 'theme' ? (
            <div className="theme-picker">
              {THEMES.map((theme) => (
                <button
                  key={theme.id}
                  type="button"
                  className={cx('theme-option', current.themeDraft.id === theme.id && 'on')}
                  onClick={() => setTheme(theme)}
                >
                  <span className="palette">
                    {[theme.primaryColor, theme.accentColor, theme.backgroundColor, theme.textColor].map((c, i) => (
                      <span key={i} style={{ background: c }} />
                    ))}
                  </span>
                  <span>
                    <b>{theme.name}</b>
                    <small className="muted">{theme.description}</small>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {tab === 'colors' ? (
            <div className="color-fields">
              {COLOR_FIELDS.map(([key, label]) => (
                <label key={key} className="color-field">
                  <span>{label}</span>
                  <input type="color" value={current.themeDraft[key]} onChange={(e) => setTheme({ [key]: e.target.value })} />
                  <code>{current.themeDraft[key]}</code>
                </label>
              ))}
            </div>
          ) : null}

          {tab === 'typography' ? (
            <>
              <Select
                label="Heading typeface"
                value={current.themeDraft.headingFont}
                onChange={(e) => setTheme({ headingFont: e.target.value })}
                options={fontOptions(['cormorant', 'playfair', 'fraunces', 'cinzel', 'outfit', 'libre'])}
              />
              <Select
                label="Body typeface"
                value={current.themeDraft.bodyFont}
                onChange={(e) => setTheme({ bodyFont: e.target.value })}
                options={fontOptions(['jost', 'nunito', 'inter', 'outfit', 'karla', 'sourceSans'])}
              />
            </>
          ) : null}

          {tab === 'layout' ? (
            <>
              <Select
                label="Header style"
                value={current.themeDraft.headerStyle}
                onChange={(e) => setTheme({ headerStyle: e.target.value })}
                options={['classic', 'centered', 'minimal', 'split'].map((v) => ({ value: v, label: v }))}
              />
              <Select
                label="Product card style"
                value={current.themeDraft.productCardStyle}
                onChange={(e) => setTheme({ productCardStyle: e.target.value })}
                options={['minimal', 'bordered', 'overlay', 'editorial'].map((v) => ({ value: v, label: v }))}
              />
              <Select
                label="Button shape"
                value={current.themeDraft.buttonStyle}
                onChange={(e) => setTheme({ buttonStyle: e.target.value })}
                options={[{ value: 'sharp', label: 'Sharp corners' }, { value: 'soft', label: 'Softly rounded' }, { value: 'pill', label: 'Pill' }]}
              />
            </>
          ) : null}

          {tab === 'branding' ? (
            <>
              <Input
                label="Brand name"
                value={current.branding.name || ''}
                onChange={(e) => setDraft({ ...current, branding: { ...current.branding, name: e.target.value } })}
              />
              <Input
                label="Tagline"
                value={current.branding.tagline || ''}
                onChange={(e) => setDraft({ ...current, branding: { ...current.branding, tagline: e.target.value } })}
              />
              <Input
                label="Logo image URL"
                hint="Leave empty to use the brand name as a wordmark"
                value={current.branding.logo || ''}
                onChange={(e) => setDraft({ ...current, branding: { ...current.branding, logo: e.target.value } })}
              />
              <p className="muted">Banners and hero images live under <Link to="/admin/banners">Banners</Link>.</p>
            </>
          ) : null}

          {tab === 'homepage' ? <HomepageBuilder current={current} setDraft={setDraft} /> : null}
        </div>

        {saveDraft.error || publish.error ? (
          <p className="form-error" role="alert">{saveDraft.error || publish.error}</p>
        ) : null}

        <div className="customizer-actions">
          <Button variant="secondary" loading={saveDraft.pending} onClick={saveDraft.submit}>Save draft</Button>
          <Button loading={publish.pending} onClick={publish.submit}>Publish</Button>
          <Button variant="ghost" disabled={!dirty} onClick={() => setDraft(null)}>Discard</Button>
        </div>
      </aside>

      <div className="preview-frame">
        <div className="device-switch" role="tablist" aria-label="Preview size">
          {DEVICES.map(([id, label]) => (
            <button key={id} type="button" role="tab" aria-selected={device === id} className={cx(device === id && 'on')} onClick={() => setDevice(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="preview-scroll">
          <div className="preview-canvas" style={{ width: DEVICES.find(([id]) => id === device)[2] }}>
            {previewConfig ? <LivePreview config={previewConfig} slug={store.slug} /> : null}
          </div>
        </div>
      </div>
    </div>
  )
}

function HomepageBuilder({ current, setDraft }) {
  const sections = current.homepageDraft.sections || []
  const [selected, setSelected] = useState(null)

  const commit = (next) => setDraft({ ...current, homepageDraft: { ...current.homepageDraft, sections: next } })

  const move = (index, dir) => {
    const next = [...sections]
    const swap = index + dir
    if (swap < 0 || swap >= next.length) return
    ;[next[index], next[swap]] = [next[swap], next[index]]
    commit(next)
  }

  const label = (type) => HOMEPAGE_BLOCKS.find((b) => b.type === type)?.label || type
  const active = sections.find((s) => s.id === selected)

  return (
    <div>
      <ul className="builder-list">
        {sections.map((s, i) => (
          <li
            key={s.id}
            className={cx('builder-item', !s.enabled && 'is-off', selected === s.id && 'is-active')}
            draggable
            onDragStart={(e) => e.dataTransfer.setData('text', String(i))}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault()
              const from = Number(e.dataTransfer.getData('text'))
              if (Number.isNaN(from) || from === i) return
              const next = [...sections]
              const [item] = next.splice(from, 1)
              next.splice(i, 0, item)
              commit(next)
            }}
          >
            <button type="button" className="builder-name" onClick={() => setSelected(selected === s.id ? null : s.id)}>
              <b>{label(s.type)}</b>
              {s.config?.title ? <small className="muted">{s.config.title}</small> : null}
            </button>
            <span className="builder-tools">
              <button type="button" className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button type="button" className="icon-btn" aria-label="Move down" disabled={i === sections.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button
                type="button"
                className="link-btn"
                onClick={() => commit(sections.map((x) => (x.id === s.id ? { ...x, enabled: !x.enabled } : x)))}
              >
                {s.enabled ? 'Hide' : 'Show'}
              </button>
              <button
                type="button"
                className="link-btn"
                onClick={() => commit([...sections, { ...s, id: uid('sec'), config: { ...s.config } }])}
              >
                Copy
              </button>
              <button type="button" className="link-btn" onClick={() => commit(sections.filter((x) => x.id !== s.id))}>Delete</button>
            </span>
          </li>
        ))}
      </ul>

      {active ? (
        <div className="builder-editor">
          <h3>{label(active.type)} settings</h3>
          <Input
            label="Title"
            value={active.config?.title || ''}
            onChange={(e) => commit(sections.map((s) => (s.id === active.id ? { ...s, config: { ...s.config, title: e.target.value } } : s)))}
          />
          <Input
            label="Subtitle"
            value={active.config?.subtitle || ''}
            onChange={(e) => commit(sections.map((s) => (s.id === active.id ? { ...s, config: { ...s.config, subtitle: e.target.value } } : s)))}
          />
          {active.type === 'carousel' ? (
            <Toggle
              label="Autoplay slides"
              checked={Boolean(active.config?.autoplay)}
              onChange={(v) => commit(sections.map((s) => (s.id === active.id ? { ...s, config: { ...s.config, autoplay: v } } : s)))}
            />
          ) : null}
        </div>
      ) : null}

      <Select
        label="Add a section"
        value=""
        onChange={(e) => {
          if (!e.target.value) return
          const type = e.target.value
          commit([...sections, { id: uid('sec'), type, enabled: true, config: { title: label(type) } }])
        }}
        options={[{ value: '', label: 'Choose a block…' }, ...HOMEPAGE_BLOCKS.map((b) => ({ value: b.type, label: b.label }))]}
      />
    </div>
  )
}

function LivePreview({ config, slug }) {
  return (
    <TenantProvider slug={slug} previewConfig={config}>
      <CartProvider tenantId={config.tenant.id}>
        <WishlistProvider tenantId={config.tenant.id}>
          <div className="preview-inner">
            <Header onOpenCart={() => {}} />
            <StoreHome />
            <Footer />
          </div>
        </WishlistProvider>
      </CartProvider>
    </TenantProvider>
  )
}
