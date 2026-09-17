import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useTenant } from '../../context/TenantContext.jsx'
import { productsApi } from '../../services/api/products.js'
import { engageApi, reviewsApi } from '../../services/api/index.js'
import { useAsync, useMedia, useRecentlyViewed, useSubmit } from '../../hooks/index.js'
import {
  Accordion,
  Badge,
  Breadcrumb,
  Button,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  OptimizedImage,
  Rating,
  Seo,
  Skeleton,
  Tabs,
  Textarea,
} from '../../components/common/index.jsx'
import { ProductSlider } from '../../components/commerce/ProductCard.jsx'
import { useCart, useWishlist } from '../../context/CommerceContext.jsx'
import { discountPercent, formatCurrency, formatDate } from '../../utils/index.js'
import { isEmail, isPin } from '../../utils/security.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { publicUrl } from '../../config/env.js'

function ReviewForm({ tenantId, productId, onDone }) {
  const [form, setForm] = useState({ rating: 5, title: '', body: '' })
  const { submit, pending, error } = useSubmit(async () => {
    if (form.body.trim().length < 10) throw new Error('Please write at least a sentence about the weave.')
    await reviewsApi.create({ ...form, tenantId, productId })
    setForm({ rating: 5, title: '', body: '' })
    onDone()
  })

  return (
    <form
      className="review-form"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <h3>Write a review</h3>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <div className="star-input" role="radiogroup" aria-label="Rating">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={form.rating === n}
            aria-label={`${n} star${n > 1 ? 's' : ''}`}
            className={n <= form.rating ? 'on' : ''}
            onClick={() => setForm({ ...form, rating: n })}
          >
            ★
          </button>
        ))}
      </div>
      <Input label="Headline" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Textarea label="Your review" required rows={4} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      <Button type="submit" loading={pending}>Publish review</Button>
    </form>
  )
}

function WaitlistForm({ tenantId, productId }) {
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const { submit, pending, error } = useSubmit(async () => {
    if (!isEmail(email)) throw new Error('Enter a valid email address.')
    await engageApi.waitlist({ email, productId, tenantId })
    push('We will email you the moment this weave is back.')
    setEmail('')
  })
  return (
    <form
      className="waitlist"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <Input
        label="Notify me when it is back"
        type="email"
        placeholder="you@example.com"
        value={email}
        error={error}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" variant="secondary" loading={pending}>Join the waitlist</Button>
    </form>
  )
}

export default function ProductDetail() {
  const { productSlug } = useParams()
  const { tenant, basePath } = useTenant()
  const { data, loading, error, refetch } = useAsync(
    () => productsApi.get(productSlug, tenant.id),
    [productSlug, tenant.id],
  )
  const { add, maxQty } = useCart()
  const { toggle, has } = useWishlist()
  const { items: recentlyViewed, push: pushRecent } = useRecentlyViewed(tenant.id)
  const { user } = useAuth()
  const { t } = useI18n()
  const ctx = useOutletContext()
  const navigate = useNavigate()
  const isMobile = useMedia('(max-width: 767px)')

  const [image, setImage] = useState(0)
  const [qty, setQty] = useState(1)
  const [tab, setTab] = useState('description')
  const [zoom, setZoom] = useState(false)
  const [pin, setPin] = useState('')

  const product = data?.product

  useEffect(() => {
    setImage(0)
    setQty(1)
  }, [productSlug])

  useEffect(() => {
    if (product) pushRecent(product)
  }, [product, pushRecent])

  const base = basePath
  const images = useMemo(() => (product?.images || []).filter((img) => img?.src), [product])

  if (error) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <ErrorState message={error} onRetry={refetch} />
      </div>
    )
  }
  if (loading) {
    return (
      <div className="container" style={{ padding: '1.5rem 0' }}>
        <div className="pdp">
          <Skeleton height={560} radius={2} />
          <div style={{ display: 'grid', gap: 12 }}><Skeleton height={40} count={6} radius={2} /></div>
        </div>
      </div>
    )
  }
  if (!product) {
    return (
      <div className="container" style={{ padding: '2rem 0' }}>
        <EmptyState title="This weave is no longer listed" action={<Link className="btn" to={`${base}/products`}>Browse the collection</Link>} />
      </div>
    )
  }

  const off = discountPercent(product.price, product.mrp)
  const current = images[image] || images[0] || { src: '', alt: product.name }
  const soldOut = product.inventory <= 0
  const ceiling = Math.min(maxQty, product.inventory || maxQty)
  const reviews = data.reviews || []

  const addToBag = () => {
    add(product, qty)
    ctx?.openCart?.()
  }

  return (
    <div className="container pdp-page">
      <Seo
        title={`${product.name} · ${tenant.name}`}
        description={product.description.slice(0, 155)}
        image={images[0]?.src}
        canonical={publicUrl(`${base}/product/${product.slug}`)}
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Product',
          name: product.name,
          description: product.description,
          image: images.map((i) => i.src),
          sku: product.sku,
          brand: { '@type': 'Brand', name: product.brand },
          aggregateRating: product.reviewCount
            ? { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: product.reviewCount }
            : undefined,
          offers: {
            '@type': 'Offer',
            priceCurrency: 'INR',
            price: product.price,
            availability: soldOut ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock',
          },
        }}
      />

      <Breadcrumb
        items={[
          { label: tenant.name, href: base },
          { label: 'Shop', href: `${base}/products` },
          { label: product.occasion, href: `${base}/category/${String(product.occasion).toLowerCase()}` },
          { label: product.name },
        ]}
      />

      <div className="pdp">
        <div className="gallery">
          <div className="gallery-main">
            <button type="button" className="gallery-zoom" onClick={() => setZoom(true)} aria-label="Zoom image">
              <OptimizedImage
                src={current.src}
                alt={current.alt || product.name}
                width={900}
                height={1200}
                priority
                sizes="100vw"
              />
            </button>
          </div>
          {images.length > 1 ? (
            <div className="thumbs" role="tablist" aria-label="Product images">
              {images.map((img, i) => (
                <button
                  key={`${img.src}-${i}`}
                  type="button"
                  role="tab"
                  aria-selected={i === image}
                  aria-label={`View image ${i + 1}`}
                  className={i === image ? 'on' : ''}
                  onClick={() => setImage(i)}
                >
                  <img
                    src={img.src}
                    alt=""
                    loading="lazy"
                    onError={(e) => {
                      const frame = e.currentTarget.closest('button')
                      if (frame) frame.hidden = true
                    }}
                  />
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className="pdp-info">
          <p className="caption">{product.brand}</p>
          <h1>{product.name}</h1>
          <Rating value={product.rating} count={product.reviewCount} />

          <p className="price">
            <b>{formatCurrency(product.price)}</b>
            {off ? <s>{formatCurrency(product.mrp)}</s> : null}
            {off ? <span className="off">{off}% off</span> : null}
          </p>
          <p className="muted">{product.taxInfo}</p>

          {product.badges?.length ? (
            <div className="badge-row">
              {[...new Set(product.badges)].map((b) => <Badge key={b}>{b}</Badge>)}
            </div>
          ) : null}

          <ul className="spec-list">
            <li><span>Fabric</span><b>{product.fabric}</b></li>
            <li><span>Weave</span><b>{product.weave}</b></li>
            <li><span>Colour</span><b>{product.color}</b></li>
            <li><span>Length</span><b>{product.length}</b></li>
          </ul>
          <p className="muted">{product.blouse}</p>

          {soldOut ? (
            <>
              <p className="stock-out">Currently unavailable</p>
              <WaitlistForm tenantId={tenant.id} productId={product.id} />
            </>
          ) : (
            <>
              {product.inventory <= 3 ? <p className="stock-note">Only {product.inventory} left in the atelier</p> : null}
              <div className="pdp-buy">
                <div className="qty">
                  <button type="button" aria-label="Decrease quantity" disabled={qty <= 1} onClick={() => setQty(qty - 1)}>−</button>
                  <span aria-live="polite">{qty}</span>
                  <button type="button" aria-label="Increase quantity" disabled={qty >= ceiling} onClick={() => setQty(qty + 1)}>+</button>
                </div>
                <Button className="pdp-add-inline" onClick={addToBag}>{t('action.addToCart')}</Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    add(product, qty)
                    navigate(`${base}/checkout`)
                  }}
                >
                  {t('action.buyNow')}
                </Button>
                <Button variant="ghost" onClick={() => toggle(product)} aria-pressed={has(product.id)}>
                  {has(product.id) ? 'Saved' : 'Save'}
                </Button>
              </div>
            </>
          )}

          <div className="pincode">
            <Input
              label="Check delivery"
              inputMode="numeric"
              maxLength={6}
              placeholder="560001"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
              error={pin.length === 6 && !isPin(pin) ? 'Enter a valid 6-digit PIN code.' : undefined}
            />
            {isPin(pin) ? <p className="muted">Delivers in 3–6 days to {pin}. Cash on delivery available.</p> : null}
          </div>

          <Accordion
            items={[
              { title: t('pdp.details'), body: product.details.map((d) => `${d[0]}: ${d[1]}`).join(' · ') },
              { title: t('pdp.fabric'), body: `${product.fabric} · ${product.weave} · ${product.region}` },
              { title: t('pdp.craft'), body: product.craft },
              { title: t('pdp.care'), body: product.care },
              { title: t('pdp.shipping'), body: product.shipping },
              { title: t('pdp.returns'), body: product.returns },
            ].filter((item) => item.body)}
          />
        </div>
      </div>

      <section className="pdp-tabs">
        <Tabs
          value={tab}
          onChange={setTab}
          tabs={[
            { id: 'description', label: t('pdp.description') },
            { id: 'reviews', label: `${t('pdp.reviews')} (${reviews.length})` },
            { id: 'questions', label: t('pdp.questions') },
          ]}
        />
        <div className="tab-panel">
          {tab === 'description' ? <p className="prose">{product.description}</p> : null}

          {tab === 'reviews' ? (
            <div className="reviews">
              {reviews.length === 0 ? <p className="muted">No reviews yet — be the first.</p> : null}
              {reviews.map((r) => (
                <article key={r.id} className="review">
                  <header>
                    <b>{r.author}</b>
                    {r.verified ? <Badge tone="success">Verified buyer</Badge> : null}
                    <span className="muted">{formatDate(r.createdAt)}</span>
                  </header>
                  <Rating value={r.rating} />
                  {r.title ? <h3>{r.title}</h3> : null}
                  <p className="muted">{r.body}</p>
                </article>
              ))}
              {user ? (
                <ReviewForm tenantId={tenant.id} productId={product.id} onDone={refetch} />
              ) : (
                <p className="muted">
                  <Link to={`${base}/login`}>Sign in</Link> to write a review.
                </p>
              )}
            </div>
          ) : null}

          {tab === 'questions' ? (
            (data.questions || []).length ? (
              (data.questions || []).map((q) => (
                <div key={q.id} className="qa">
                  <b>{q.question}</b>
                  <p className="muted">{q.answer}</p>
                </div>
              ))
            ) : (
              <p className="muted">No questions yet. Write to us and we will answer here.</p>
            )
          ) : null}
        </div>
      </section>

      {data.related?.length ? (
        <section className="strip">
          <h2>{t('pdp.related')}</h2>
          <ProductSlider products={data.related} base={base} />
        </section>
      ) : null}

      {data.similar?.length ? (
        <section className="strip">
          <h2>{t('pdp.completeLook')}</h2>
          <ProductSlider products={data.similar} base={base} />
        </section>
      ) : null}

      {recentlyViewed.length > 1 ? (
        <section className="strip">
          <h2>Recently viewed</h2>
          <div className="recent-row">
            {recentlyViewed
              .filter((p) => p.id !== product.id)
              .slice(0, 6)
              .map((p) => (
                <Link key={p.id} to={`${base}/product/${p.slug}`} className="recent-card">
                  <OptimizedImage src={p.image} alt="" sizes="160px" />
                  <span>{p.name}</span>
                  <b>{formatCurrency(p.price)}</b>
                </Link>
              ))}
          </div>
        </section>
      ) : null}

      <Modal open={zoom} title={product.name} onClose={() => setZoom(false)} size="lg">
        <img src={current.src} alt={product.name} className="zoom-img" loading="lazy" decoding="async" />
      </Modal>

      {isMobile && !soldOut ? (
        <div className="sticky-atc">
          <div>
            <b>{formatCurrency(product.price)}</b>
            {off ? <s>{formatCurrency(product.mrp)}</s> : null}
          </div>
          <Button onClick={addToBag}>{t('action.addToCart')}</Button>
        </div>
      ) : null}
    </div>
  )
}
