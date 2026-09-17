import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { storesApi } from '../../services/api/stores.js'
import { useAsync, useDebounced, useInView } from '../../hooks/index.js'
import { EmptyState, ErrorState, Input, OptimizedImage, Seo, Skeleton } from '../../components/common/index.jsx'
import { ThemePreview } from '../../components/commerce/ThemePreview.jsx'
import { THEMES, applyTheme } from '../../theme/themes.js'
import { env, publicUrl } from '../../config/env.js'

const PROMISES = [
  ['Your house, your look', 'Themes, banners, and type are yours. Shoppers never see another atelier’s skin.'],
  ['Live in a day', 'Add products, upload photography to the cloud, publish a homepage. No agency retainer.'],
  ['Profit you can read', 'Cost and dispatch stay in admin. You see net income. Shoppers only ever see the selling price.'],
]

const STEPS = [
  ['01', 'Claim a slug', 'Your storefront lives at /store/your-house — custom domain when you are ready.'],
  ['02', 'Dress the rooms', 'Pick a theme, preview every device, drop in a banner, publish.'],
  ['03', 'Open the doors', 'Catalogue, cart, and checkout are already built. You bring the weaves.'],
]

const HOUSE_PAGE_SIZE = 8

function DeferredPreview({ theme, selected, onSelect }) {
  const [ref, visible] = useInView({ rootMargin: '280px' })
  return (
    <button
      ref={ref}
      type="button"
      className={theme.id === selected ? 'platform-theme-card on' : 'platform-theme-card'}
      onClick={() => onSelect(theme.id)}
    >
      {visible ? <ThemePreview theme={theme} storeName={theme.name} /> : <Skeleton height={220} radius={4} />}
      <span>
        <b>{theme.name}</b>
        <small className="muted">{theme.description}</small>
      </span>
    </button>
  )
}

export default function PlatformHome() {
  const [q, setQ] = useState('')
  const search = useDebounced(q, 250)
  const [page, setPage] = useState(1)
  const [houses, setHouses] = useState([])
  const { data, loading, error, refetch } = useAsync(
    () => storesApi.list({ limit: HOUSE_PAGE_SIZE, page, q: search }),
    [search, page],
  )
  const [previewTheme, setPreviewTheme] = useState(THEMES[0]?.id)
  const [moreRef, moreVisible] = useInView({ rootMargin: '400px' })

  useEffect(() => {
    applyTheme(THEMES.find((t) => t.id === 'heritage-luxury') || THEMES[0])
  }, [])

  useEffect(() => {
    setPage(1)
    setHouses([])
  }, [search])

  useEffect(() => {
    const next = data?.items
    if (!Array.isArray(next)) return
    setHouses((prev) => {
      if (page === 1) return next
      const seen = new Set(prev.map((s) => s.id))
      return [...prev, ...next.filter((s) => !seen.has(s.id))]
    })
  }, [data, page])

  const total = Number(data?.total || 0)
  const hasMore = houses.length < total && !loading && !error

  useEffect(() => {
    if (moreVisible && hasMore) setPage((n) => n + 1)
  }, [moreVisible, hasMore])

  const stores = houses
  const activeTheme = THEMES.find((t) => t.id === previewTheme) || THEMES[0]

  return (
    <div className="app-shell platform">
      <Seo
        title={`${env.appName} — the house of houses`}
        description="A white-label marketplace where each saree and fashion house runs its own branded storefront, with live theme previews and cloud photography."
        canonical={publicUrl('/')}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: env.appName,
          url: publicUrl('/'),
        }}
      />
      <a className="skip-link" href="#main">Skip to main content</a>

      <header className="platform-nav">
        <div className="container platform-nav-inner">
          <Link to="/" className="logo">
            {env.appName}
            <small>{env.appTagline}</small>
          </Link>
          <nav className="platform-nav-links">
            <a href="#themes">Themes</a>
            <a href="#houses">Houses</a>
            <Link to="/login">Sign in</Link>
            <Link className="btn btn-sm" to="/login">Open a house</Link>
          </nav>
        </div>
      </header>

      <main id="main">
        <section className="platform-hero">
          <div className="platform-hero-glow" aria-hidden="true" />
          <div className="container platform-hero-grid">
            <div className="platform-hero-copy">
              <p className="platform-kicker">Multi-tenant fashion commerce</p>
              <h1 className="display">A house of houses.<br /> Each one, unmistakably itself.</h1>
              <p className="lede">
                Vastrika is the platform independent ateliers open on — own theme, own catalogue, own Instagram
                in the footer. You keep one codebase. They keep their voice.
              </p>
              <div className="platform-hero-cta">
                <Link className="btn" to="/login">Start a storefront</Link>
                <a className="btn btn-ghost" href="#houses">Browse the houses</a>
              </div>
              <p className="caption">Owners at /login · Super admin at /super-admin</p>
            </div>
            <div className="platform-hero-stage">
              <ThemePreview theme={activeTheme} storeName={activeTheme.name} className="platform-hero-preview" />
              <p className="caption">Live theme preview — {activeTheme.name}</p>
            </div>
          </div>
        </section>

        <section className="platform-marquee" aria-hidden="true">
          <div className="platform-marquee-track">
            {[...THEMES, ...THEMES].map((theme, i) => (
              <span key={`${theme.id}-${i}`}>{theme.name}</span>
            ))}
          </div>
        </section>

        <section className="container promises" id="why">
          {PROMISES.map(([title, body]) => (
            <article key={title}>
              <h2>{title}</h2>
              <p className="muted">{body}</p>
            </article>
          ))}
        </section>

        <section className="platform-themes" id="themes">
          <div className="container">
            <div className="platform-section-head">
              <div>
                <p className="platform-kicker">Theme library</p>
                <h2>Choose a look. See it before you commit.</h2>
              </div>
              <p className="muted">Every palette below is a live miniature of the storefront — header, hero, and product grid.</p>
            </div>
            <div className="platform-theme-grid">
              {THEMES.map((theme) => (
                <DeferredPreview
                  key={theme.id}
                  theme={theme}
                  selected={previewTheme}
                  onSelect={setPreviewTheme}
                />
              ))}
            </div>
          </div>
        </section>

        <section className="container platform-steps">
          {STEPS.map(([n, title, body]) => (
            <article key={n}>
              <span className="platform-step-n">{n}</span>
              <h3>{title}</h3>
              <p className="muted">{body}</p>
            </article>
          ))}
        </section>

        <section className="container store-section" id="houses">
          <div className="plp-head">
            <div>
              <p className="platform-kicker">The floor</p>
              <h2>Browse the houses</h2>
              <p className="muted">{loading && houses.length === 0 ? 'Loading…' : `${total || stores.length} storefronts open now`}</p>
            </div>
            <Input
              type="search"
              label="Find a house"
              placeholder="Search by name or city"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>

          {error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : houses.length === 0 && loading ? (
            <div className="store-cards"><Skeleton height={280} count={6} radius={4} /></div>
          ) : stores.length === 0 ? (
            <EmptyState title="No houses match that search" hint="Try a different name or city." />
          ) : (
            <>
              <div className="store-cards">
                {stores.map((store) => (
                  <Link className="store-card" key={store.id} to={`/store/${store.slug}`}>
                    <OptimizedImage
                      src={store.coverImage}
                      alt={`${store.name} storefront`}
                      width={600}
                      height={420}
                      sizes="(max-width: 600px) 92vw, (max-width: 1024px) 45vw, 30vw"
                    />
                    <div className="body">
                      <p className="caption">{store.city}</p>
                      <h3>{store.name}</h3>
                      <p className="muted">{store.tagline}</p>
                      <span className="store-meta">{store.productsCount} weaves · visit storefront →</span>
                    </div>
                  </Link>
                ))}
              </div>
              {loading && houses.length > 0 ? <div className="store-cards"><Skeleton height={180} count={2} radius={4} /></div> : null}
              {hasMore ? <div ref={moreRef} aria-hidden="true" style={{ height: 1 }} /> : null}
            </>
          )}
        </section>
      </main>

      <footer className="footer platform-foot">
        <div className="container footer-legal">
          <p className="muted">© {new Date().getFullYear()} {env.appName}. Independent businesses, independently run.</p>
          <p className="muted">
            Store owners sign in at <Link to="/login">/login</Link>. Every brand, product, and photograph in this demo is
            fictional.
          </p>
        </div>
      </footer>
    </div>
  )
}
