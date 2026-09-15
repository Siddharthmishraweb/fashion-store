import { useState } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { useTenant } from '../../context/TenantContext.jsx'
import { CartProvider, WishlistProvider } from '../../context/CommerceContext.jsx'
import { AnnouncementBar, CartDrawer, Footer, Header, MobileTabBar } from '../navigation/Header.jsx'
import { EmptyState, ErrorBoundary, ErrorState, Seo, Skeleton } from '../common/index.jsx'
import { useMedia } from '../../hooks/index.js'
import { env, publicUrl } from '../../config/env.js'
import { cx } from '../../utils/index.js'

export function StorefrontShell() {
  const { loading, error, tenant, reload } = useTenant()

  if (error || (!loading && !tenant)) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <ErrorState message={error || 'This storefront is unavailable.'} onRetry={reload} />
        <p style={{ textAlign: 'center' }}>
          <Link className="btn btn-ghost" to="/">Browse other stores on {env.appName}</Link>
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="container" style={{ padding: '2rem 0', display: 'grid', gap: 16 }}>
        <Skeleton height={44} radius={4} />
        <Skeleton height={420} radius={4} />
        <Skeleton height={260} radius={4} />
      </div>
    )
  }

  if (tenant.status !== 'active') {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <EmptyState
          title={`${tenant.name} is temporarily closed`}
          hint="The owner has paused this storefront. Do come back soon."
          action={<Link className="btn" to="/">See other houses</Link>}
        />
      </div>
    )
  }

  return (
    <CartProvider tenantId={tenant.id}>
      <WishlistProvider tenantId={tenant.id}>
        <StorefrontFrame />
      </WishlistProvider>
    </CartProvider>
  )
}

function StorefrontFrame() {
  const { tenant, homepage, previewing } = useTenant()
  const [cartOpen, setCartOpen] = useState(false)
  const isDesktop = useMedia('(min-width: 768px)')
  const announce = homepage?.sections?.find((s) => s.type === 'announcement' && s.enabled)
  const storeUrl = publicUrl(`/store/${tenant.slug}`)

  return (
    <div className={cx('app-shell', !isDesktop && 'has-tabbar')}>
      <Seo
        title={`${tenant.name} · ${tenant.tagline}`}
        description={`${tenant.name} — ${tenant.tagline}. Handpicked sarees and weaves, shipped across India.`}
        canonical={storeUrl}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Store',
          name: tenant.name,
          description: tenant.tagline,
          url: storeUrl,
          email: tenant.email,
          telephone: tenant.phone,
          address: { '@type': 'PostalAddress', streetAddress: tenant.address, addressLocality: tenant.city, addressCountry: 'IN' },
        }}
      />
      <a className="skip-link" href="#main">Skip to main content</a>

      {previewing ? (
        <div className="preview-flag" role="status">
          You are previewing a theme. Nothing is saved to this storefront.
        </div>
      ) : null}

      <AnnouncementBar text={announce?.config?.text} to={announce?.config?.link} />
      <Header onOpenCart={() => setCartOpen(true)} />

      <main className="page" id="main">
        <ErrorBoundary>
          <Outlet context={{ openCart: () => setCartOpen(true) }} />
        </ErrorBoundary>
      </main>

      <Footer />
      {!isDesktop ? <MobileTabBar onOpenCart={() => setCartOpen(true)} /> : null}
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </div>
  )
}
