import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Input, OptimizedImage, ResponsiveImage } from '../common/index.jsx'
import { HeroCarousel } from '../commerce/HeroCarousel.jsx'
import { ProductGrid, ProductSlider } from '../commerce/ProductCard.jsx'
import { engageApi } from '../../services/api/index.js'
import { useToast } from '../../context/ToastContext.jsx'
import { isEmail, safeUrl } from '../../utils/security.js'

function SectionHead({ title, subtitle }) {
  if (!title) return null
  return (
    <div className="section-head">
      {subtitle ? <p className="caption">{subtitle}</p> : null}
      <h2>{title}</h2>
    </div>
  )
}

function NewsletterSection({ cfg }) {
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  return (
    <section className="section newsletter">
      <div className="container">
        <h2>{cfg.title}</h2>
        <p className="muted">{cfg.subtitle}</p>
        <form
          className="newsletter-box"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!isEmail(email)) {
              setError('Enter a valid email address.')
              return
            }
            setError('')
            setPending(true)
            try {
              await engageApi.newsletter({ email })
              push('Welcome to the list.')
              setEmail('')
            } catch (err) {
              setError(err.message)
            } finally {
              setPending(false)
            }
          }}
        >
          <Input
            type="email"
            label="Email address"
            placeholder="you@example.com"
            value={email}
            error={error}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" loading={pending}>Join</Button>
        </form>
      </div>
    </section>
  )
}

export function HomepageRenderer({
  homepage,
  banners = [],
  categories = [],
  collections = [],
  productsByCollection = {},
  facets,
  base,
  testimonials = [],
  instagram = [],
}) {
  const sections = (homepage?.sections || []).filter((s) => s.enabled)
  return (
    <div>
      {sections.map((section) => (
        <Block
          key={section.id}
          section={section}
          banners={banners}
          categories={categories}
          collections={collections}
          productsByCollection={productsByCollection}
          facets={facets}
          base={base}
          testimonials={testimonials}
          instagram={instagram}
        />
      ))}
    </div>
  )
}

const FALLBACK_FACETS = {
  fabric: ['Silk', 'Cotton', 'Organza', 'Chanderi', 'Linen', 'Georgette'],
  occasion: ['Wedding', 'Festive', 'Party', 'Everyday'],
  region: ['Banaras', 'Kanchipuram', 'Bengal', 'Rajasthan'],
}

function Block({ section, banners, categories, productsByCollection, facets, base, testimonials, instagram }) {
  const cfg = section.config || {}
  const products = productsByCollection[cfg.collectionId] || []
  const cta = safeUrl(cfg.ctaUrl, { allowExternal: false }) || `${base}/products`

  switch (section.type) {
    case 'announcement':
      return null

    case 'carousel':
    case 'hero_banner': {
      const selected = (cfg.bannerIds || []).map((id) => banners.find((b) => b.id === id)).filter(Boolean)
      const slides = selected.length ? selected : banners
      if (!slides.length) return null
      return <HeroCarousel banners={slides} config={cfg} base={base} />
    }

    case 'category_grid': {
      const root = categories.find((c) => !c.parentId && c.children?.length)
      const tiles = (root?.children?.length ? root.children : categories.filter((c) => !c.parentId)).slice(0, 8)
      if (!tiles.length) return null
      return (
        <section className="section">
          <div className="container">
            <SectionHead title={cfg.title} subtitle={cfg.subtitle} />
            <div className="cat-grid">
              {tiles.map((c) => (
                <Link className="cat-tile" key={c.id} to={`${base}/category/${c.slug}`}>
                  <OptimizedImage src={c.image} alt={c.name} width={400} height={500} sizes="(max-width: 600px) 45vw, 22vw" />
                  <span>{c.name}</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )
    }

    case 'product_grid':
      if (!products.length) return null
      return (
        <section className="section">
          <div className="container">
            <SectionHead title={cfg.title} subtitle={cfg.subtitle} />
            <ProductGrid products={products} base={base} columns={cfg.columnsDesktop} />
          </div>
        </section>
      )

    case 'product_slider':
    case 'recommended':
    case 'recently_viewed': {
      const list = products.length ? products : Object.values(productsByCollection)[0] || []
      if (!list.length) return null
      return (
        <section className="section">
          <div className="container">
            <SectionHead title={cfg.title || 'Selected for you'} />
            <ProductSlider products={list} base={base} />
          </div>
        </section>
      )
    }

    case 'split_editorial':
    case 'image_text':
      return (
        <section className={`split ${cfg.imagePosition === 'left' ? 'flip' : ''}`}>
          <OptimizedImage src={cfg.image} alt="" width={1200} height={900} sizes="(max-width: 767px) 100vw, 50vw" />
          <div className="split-copy">
            <h2>{cfg.title}</h2>
            <p className="muted">{cfg.body}</p>
            <Link className="btn" to={cta}>{cfg.ctaText || 'Explore'}</Link>
          </div>
        </section>
      )

    case 'collection_banner':
    case 'full_width_image':
      return (
        <section className="promo">
          <ResponsiveImage desktop={cfg.image} mobile={cfg.image} alt="" className="promo-img" />
          <div className="promo-copy">
            <h2>{cfg.title}</h2>
            {cfg.subtitle ? <p>{cfg.subtitle}</p> : null}
            <Link className="btn btn-hero" to={cta}>{cfg.ctaText || 'Shop'}</Link>
          </div>
        </section>
      )

    case 'brand_story':
      return (
        <section className="section story">
          <div className="container narrow">
            <p className="caption">Our house</p>
            <h2>{cfg.title}</h2>
            <p className="muted">{cfg.body}</p>
            {cfg.image ? <OptimizedImage src={cfg.image} alt="" width={1200} height={700} sizes="(max-width: 767px) 100vw, 720px" /> : null}
          </div>
        </section>
      )

    case 'shop_by_fabric':
    case 'shop_by_occasion':
    case 'shop_by_region': {
      const key = section.type.replace('shop_by_', '')
      const values = (facets?.[key]?.length ? facets[key] : FALLBACK_FACETS[key] || []).slice(0, 10)
      if (!values.length) return null
      return (
        <section className="section">
          <div className="container">
            <SectionHead title={cfg.title} />
            <div className="facet-pills">
              {values.map((v) => (
                <Link key={v} className="pill-link" to={`${base}/products?${key}=${encodeURIComponent(v)}`}>{v}</Link>
              ))}
            </div>
          </div>
        </section>
      )
    }

    case 'testimonials':
      if (!testimonials.length) return null
      return (
        <section className="section">
          <div className="container">
            <SectionHead title={cfg.title} />
            <div className="quotes">
              {testimonials.map((q) => (
                <blockquote className="quote" key={q.author}>
                  <p>“{q.quote}”</p>
                  <cite className="caption">{q.author} · {q.role}</cite>
                </blockquote>
              ))}
            </div>
          </div>
        </section>
      )

    case 'instagram':
      if (!instagram.length) return null
      return (
        <section className="section">
          <div className="container">
            <SectionHead title={cfg.title} />
            <div className="ig-grid">
              {instagram.map((src, i) => (
                <OptimizedImage key={`${src}-${i}`} src={src} alt="" width={400} height={400} sizes="(max-width: 600px) 33vw, 16vw" />
              ))}
            </div>
          </div>
        </section>
      )

    case 'newsletter':
      return <NewsletterSection cfg={cfg} />

    case 'countdown':
      return (
        <section className="section centered">
          <div className="container narrow">
            <h2>{cfg.title || 'The festive window is open'}</h2>
            <p className="muted">{cfg.subtitle || 'Limited atelier appointments this season.'}</p>
            <Link className="btn" to={cta}>{cfg.ctaText || 'Book a viewing'}</Link>
          </div>
        </section>
      )

    default:
      return null
  }
}
