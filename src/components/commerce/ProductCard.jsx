import { Link } from 'react-router-dom'
import { Badge, Button, OptimizedImage } from '../common/index.jsx'
import { IconHeart } from '../common/icons.jsx'
import { cx, discountPercent, formatCurrency } from '../../utils/index.js'
import { useCart, useWishlist } from '../../context/CommerceContext.jsx'
import { useI18n } from '../../context/I18nContext.jsx'

const BADGE_LABELS = {
  new: 'New in',
  bestseller: 'Best seller',
  trending: 'Trending',
  limited: 'Limited',
  handwoven: 'Handwoven',
  exclusive: 'Exclusive',
  sale: 'On sale',
}

const COLOR_SWATCHES = {
  Ruby: '#7a1f2b',
  Gold: '#c4a35a',
  Ivory: '#f4ead8',
  Blush: '#e4b7b2',
  Indigo: '#1f3a5f',
  Emerald: '#1f5c45',
  Teal: '#2a6a6a',
  Sand: '#c8b39a',
  Maroon: '#6e1023',
  Crimson: '#8b1e3f',
  Sage: '#8aa07a',
  White: '#f7f4ef',
  Ochre: '#c48a3a',
  Champagne: '#e6d3b3',
  Honey: '#c9a227',
}

export function ProductCard({ product, base, showPrice = true, priority, onQuickView, onQuickAdd }) {
  const cart = useCart()
  const { toggle, has } = useWishlist()
  const { t } = useI18n()
  const off = discountPercent(product.price, product.mrp)
  const wished = has(product.id)
  const href = `${base}/product/${product.slug}`
  const images = product.images || []
  const soldOut = Number(product.inventory) <= 0
  const lowStock = !soldOut && Number(product.inventory) <= 3
  const badges = [...new Set(product.badges || [])].slice(0, 2)
  const colors = [...new Set(product.colors || [])].slice(0, 5)
  const quickAdd = onQuickAdd || ((item) => cart?.add?.(item))

  return (
    <article className={cx('product-card', soldOut && 'is-soldout')}>
      <div className="media">
        <Link to={href} aria-label={product.name}>
          <OptimizedImage
            src={images[0]?.src}
            alt={product.name}
            width={600}
            height={800}
            priority={priority}
            sizes="(max-width: 600px) 46vw, (max-width: 1024px) 30vw, 22vw"
          />
          {images[1] ? (
            <OptimizedImage className="hover" src={images[1].src} alt="" width={600} height={800} sizes="(max-width: 600px) 46vw, 22vw" />
          ) : null}
        </Link>

        <div className="card-badges">
          {soldOut ? <Badge tone="muted">Sold out</Badge> : null}
          {!soldOut && badges.map((b) => (
            <Badge key={b} tone={b === 'sale' ? 'sale' : b === 'new' ? 'new' : undefined}>{BADGE_LABELS[b] || b}</Badge>
          ))}
        </div>

        <button
          type="button"
          className={cx('wish', wished && 'on')}
          aria-label={`${wished ? 'Remove' : 'Add'} ${product.name} ${wished ? 'from' : 'to'} wishlist`}
          aria-pressed={wished}
          onClick={() => toggle(product)}
        >
          <IconHeart filled={wished} />
        </button>
      </div>

      <div className="card-body">
        <p className="caption">{product.brand}</p>
        <Link to={href}><h3 className="clamp-2">{product.name}</h3></Link>
        {showPrice ? (
          <p className="price">
            <b>{formatCurrency(product.price)}</b>
            {off ? <s>{formatCurrency(product.mrp)}</s> : null}
            {off ? <span className="off">{off}% off</span> : null}
          </p>
        ) : null}
        {lowStock ? <p className="stock-note">Only {product.inventory} left</p> : null}
        {colors.length > 1 ? (
          <div className="swatches">
            {colors.map((c) => (
              <span key={c} className="swatch" title={c} style={{ background: COLOR_SWATCHES[c] || '#ccc' }}>
                <span className="sr-only">{c}</span>
              </span>
            ))}
          </div>
        ) : null}
        <div className="card-actions">
          {onQuickView ? (
            <Button variant="ghost" size="sm" onClick={() => onQuickView(product)}>{t('action.quickView')}</Button>
          ) : null}
          <Button size="sm" disabled={soldOut} onClick={() => quickAdd(product)}>
            {soldOut ? t('action.soldOut') : t('action.quickAdd')}
          </Button>
        </div>
      </div>
    </article>
  )
}

export function ProductGrid({ products, base, columns, ...rest }) {
  return (
    <div className="product-grid" style={columns ? { '--cols': columns } : undefined}>
      {products.map((p, i) => (
        <ProductCard key={p.id} product={p} base={base} priority={i < 4} {...rest} />
      ))}
    </div>
  )
}

export function ProductSlider({ products, base, ...rest }) {
  return (
    <div className="product-slider" role="region" aria-label="Product carousel">
      {products.map((p) => <ProductCard key={p.id} product={p} base={base} {...rest} />)}
    </div>
  )
}

