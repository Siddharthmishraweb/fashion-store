import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useCart, useWishlist } from '../../context/CommerceContext.jsx'
import { useTenant } from '../../context/TenantContext.jsx'
import { Button, EmptyState, Input, OptimizedImage, Seo } from '../../components/common/index.jsx'
import { formatCurrency } from '../../utils/index.js'
import { couponsApi, productsApi } from '../../services/api/index.js'
import { useAsync } from '../../hooks/index.js'
import { ProductSlider } from '../../components/commerce/ProductCard.jsx'
import { useI18n } from '../../context/I18nContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

function CouponBox({ tenantId, subtotal, coupon, setCoupon }) {
  const [code, setCode] = useState(coupon?.coupon?.code || '')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const { push } = useToast()

  const applied = Boolean(coupon)

  return (
    <form
      className="coupon-box"
      onSubmit={async (e) => {
        e.preventDefault()
        if (applied) {
          setCoupon(null)
          setCode('')
          setError('')
          return
        }
        setPending(true)
        setError('')
        try {
          const result = await couponsApi.validate({ tenantId, code, subtotal })
          setCoupon(result)
          push(`${result.coupon.code} applied — you saved ${formatCurrency(result.discount)}`)
        } catch (err) {
          setError(err.message)
          setCoupon(null)
        } finally {
          setPending(false)
        }
      }}
    >
      <Input
        label="Discount code"
        value={code}
        error={error}
        disabled={applied}
        placeholder="WELCOME10"
        onChange={(e) => setCode(e.target.value.toUpperCase())}
      />
      <Button type="submit" variant={applied ? 'ghost' : 'secondary'} loading={pending}>
        {applied ? 'Remove' : 'Apply'}
      </Button>
    </form>
  )
}

export default function CartPage() {
  const { items, updateQty, remove, saveForLater, moveToCart, saved, totals, setCoupon, coupon, maxQty } = useCart()
  const { tenant } = useTenant()
  const { t } = useI18n()
  const base = `/store/${tenant.slug}`
  const rec = useAsync(() => productsApi.recommendations({ tenantId: tenant.id, type: 'trending' }), [tenant.id])

  if (!items.length) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <Seo title={`Your bag · ${tenant.name}`} noindex />
        <EmptyState
          title={t('empty.cart')}
          hint={t('empty.cartHint')}
          action={<Link className="btn" to={`${base}/products`}>Explore the collection</Link>}
        />
        {rec.data?.items?.length ? (
          <section className="strip">
            <h2>Popular right now</h2>
            <ProductSlider products={rec.data.items} base={base} />
          </section>
        ) : null}
      </div>
    )
  }

  return (
    <div className="container cart-page">
      <Seo title={`Your bag (${items.length}) · ${tenant.name}`} noindex />
      <h1>Your bag</h1>

      <div className="cart-layout">
        <div>
          <ul className="cart-lines">
            {items.map((item) => (
              <li className="cart-line" key={item.id}>
                <OptimizedImage src={item.image} alt="" sizes="110px" />
                <div>
                  <Link to={`${base}/product/${item.slug}`}><b>{item.name}</b></Link>
                  <p>{formatCurrency(item.price)}{item.mrp > item.price ? <s>{formatCurrency(item.mrp)}</s> : null}</p>
                  <div className="qty">
                    <button type="button" aria-label={`Decrease quantity of ${item.name}`} disabled={item.qty <= 1} onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                    <span aria-live="polite">{item.qty}</span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.name}`}
                      disabled={item.qty >= Math.min(maxQty, item.inventory || maxQty)}
                      onClick={() => updateQty(item.id, item.qty + 1)}
                    >
                      +
                    </button>
                  </div>
                  <div className="cart-line-actions">
                    <button type="button" className="link-btn" onClick={() => saveForLater(item.id)}>Save for later</button>
                    <button type="button" className="link-btn" onClick={() => remove(item.id)}>Remove</button>
                  </div>
                </div>
                <b className="line-total">{formatCurrency(item.price * item.qty)}</b>
              </li>
            ))}
          </ul>

          {saved.length ? (
            <section className="strip">
              <h2>Saved for later</h2>
              <ul className="cart-lines">
                {saved.map((s) => (
                  <li className="cart-line" key={s.id}>
                    <OptimizedImage src={s.image} alt="" sizes="110px" />
                    <div>
                      <Link to={`${base}/product/${s.slug}`}><b>{s.name}</b></Link>
                      <p>{formatCurrency(s.price)}</p>
                      <button type="button" className="link-btn" onClick={() => moveToCart(s.id)}>Move to bag</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {rec.data?.items?.length ? (
            <section className="strip">
              <h2>You may also like</h2>
              <ProductSlider products={rec.data.items} base={base} />
            </section>
          ) : null}
        </div>

        <aside className="summary-card">
          <h2>Summary</h2>
          <dl className="totals">
            <div><dt>Subtotal</dt><dd>{formatCurrency(totals.subtotal)}</dd></div>
            {totals.discount ? <div className="is-credit"><dt>Discount</dt><dd>−{formatCurrency(totals.discount)}</dd></div> : null}
            <div><dt>Shipping</dt><dd>{totals.shipping ? formatCurrency(totals.shipping) : 'Complimentary'}</dd></div>
            <div><dt>GST (included)</dt><dd>{formatCurrency(totals.includedTax)}</dd></div>
            <div className="grand"><dt>Total</dt><dd>{formatCurrency(totals.total)}</dd></div>
          </dl>

          {totals.savings > 0 ? <p className="savings">You save {formatCurrency(totals.savings)} on this order.</p> : null}
          {totals.freeShippingGap > 0 ? (
            <p className="ship-nudge">Add {formatCurrency(totals.freeShippingGap)} more for free shipping.</p>
          ) : (
            <p className="ship-nudge on">Free shipping applied.</p>
          )}

          <CouponBox tenantId={tenant.id} subtotal={totals.subtotal} coupon={coupon} setCoupon={setCoupon} />

          <Link className="btn btn-block" to={`${base}/checkout`}>Proceed to checkout</Link>
          <p className="caption">Estimated delivery 3–6 days · 7-day returns</p>
        </aside>
      </div>
    </div>
  )
}

export function WishlistPage() {
  const { items, remove } = useWishlist()
  const { add } = useCart()
  const { tenant } = useTenant()
  const { t } = useI18n()
  const { push } = useToast()
  const base = `/store/${tenant.slug}`

  if (!items.length) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <Seo title={`Wishlist · ${tenant.name}`} noindex />
        <EmptyState
          title={t('empty.wishlist')}
          hint={t('empty.wishlistHint')}
          action={<Link className="btn" to={`${base}/products`}>Explore the collection</Link>}
        />
      </div>
    )
  }

  const share = async () => {
    const url = window.location.href
    if (navigator.share) {
      try {
        await navigator.share({ title: `Wishlist · ${tenant.name}`, url })
        return
      } catch {
        /* the user dismissed the sheet */
      }
    }
    await navigator.clipboard?.writeText(url)
    push('Wishlist link copied to your clipboard')
  }

  return (
    <div className="container" style={{ padding: '1.5rem 0 3rem' }}>
      <Seo title={`Wishlist (${items.length}) · ${tenant.name}`} noindex />
      <div className="plp-head">
        <h1>Wishlist</h1>
        <Button variant="ghost" onClick={share}>Share wishlist</Button>
      </div>
      <ul className="cart-lines">
        {items.map((item) => (
          <li className="cart-line" key={item.id}>
            <OptimizedImage src={item.image} alt="" sizes="110px" />
            <div>
              <Link to={`${base}/product/${item.slug}`}><b>{item.name}</b></Link>
              <p>{formatCurrency(item.price)}</p>
              <p className="muted">{item.inventory > 0 ? 'In stock' : 'Out of stock — check back soon'}</p>
              <div className="cart-line-actions">
                <Button size="sm" disabled={item.inventory <= 0} onClick={() => add(item)}>Move to bag</Button>
                <button type="button" className="link-btn" onClick={() => remove(item.id)}>Remove</button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
