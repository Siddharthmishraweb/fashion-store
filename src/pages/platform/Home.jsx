import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { storesApi } from '../../services/api/stores.js'
import { useAsync, useDebounced } from '../../hooks/index.js'
import { EmptyState, ErrorState, Input, OptimizedImage, Seo, Skeleton } from '../../components/common/index.jsx'
import { THEMES, applyTheme } from '../../theme/themes.js'
import { env, publicUrl } from '../../config/env.js'

const PROMISES = [
  ['One platform, many voices', 'Every business gets its own theme, navigation, and homepage — no shared template look.'],
  ['Your domain, your brand', 'Point a custom domain at the platform and the right storefront loads automatically.'],
  ['Built for non-technical owners', 'Banners, products, and page sections are edited in plain language, then published in a click.'],
]

export default function PlatformHome() {
  const [q, setQ] = useState('')
  const search = useDebounced(q, 250)
  const { data, loading, error, refetch } = useAsync(() => storesApi.list({ limit: 24 }), [])

  // The marketplace shell uses a neutral editorial palette of its own.
  useEffect(() => {
    applyTheme(THEMES.find((t) => t.id === 'modern-minimal') || THEMES[0])
  }, [])

  const stores = useMemo(() => {
    const items = data?.items || []
    if (!search) return items
    const needle = search.toLowerCase()
    return items.filter((s) => `${s.name} ${s.city} ${s.tagline}`.toLowerCase().includes(needle))
  }, [data, search])

  return (
    <div className="app-shell platform">
      <Seo
        title={`${env.appName} — independent fashion houses, one platform`}
        description="A white-label marketplace where each saree and fashion house runs its own branded storefront."
        canonical={publicUrl('/')}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: env.appName,
          url: publicUrl('/'),
        }}
      />
      <a className="skip-link" href="#main">Skip to main content</a>

      <header className="header">
        <div className="header-main container">
          <span />
          <Link to="/" className="logo">
            {env.appName}
            <small>{env.appTagline}</small>
          </Link>
          <div className="header-actions">
            <Link className="btn btn-ghost btn-sm" to="/login">Sign in</Link>
          </div>
        </div>
      </header>

      <main id="main">
        <section className="platform-hero container">
          <p className="caption">Multi-tenant fashion commerce</p>
          <h1 className="display">Independent ateliers.<br />One considered platform.</h1>
          <p className="muted lede">
            Each house keeps its own weaves, colour, and voice. You keep one codebase, one deployment, and one place to
            watch it all work.
          </p>
        </section>

        <section className="container promises">
          {PROMISES.map(([title, body]) => (
            <article key={title}>
              <h2>{title}</h2>
              <p className="muted">{body}</p>
            </article>
          ))}
        </section>

        <section className="container store-section">
          <div className="plp-head">
            <div>
              <h2>Browse the houses</h2>
              <p className="muted">{loading ? 'Loading…' : `${stores.length} storefronts open now`}</p>
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
          ) : loading ? (
            <div className="store-cards"><Skeleton height={280} count={6} radius={4} /></div>
          ) : stores.length === 0 ? (
            <EmptyState title="No houses match that search" hint="Try a different name or city." />
          ) : (
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
          )}
        </section>
      </main>

      <footer className="footer">
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
