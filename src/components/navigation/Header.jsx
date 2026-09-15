import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useI18n } from '../../context/I18nContext.jsx'
import { useTenant } from '../../context/TenantContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useCart, useWishlist } from '../../context/CommerceContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Button, Drawer, Input, OptimizedImage } from '../common/index.jsx'
import { IconBag, IconHeart, IconHome, IconMenu, IconSearch, IconUser } from '../common/icons.jsx'
import { SearchOverlay } from './SearchOverlay.jsx'
import { engageApi } from '../../services/api/index.js'
import { useMedia } from '../../hooks/index.js'
import { formatCurrency } from '../../utils/index.js'
import { isEmail, safeImageUrl, safeUrl } from '../../utils/security.js'

export function AnnouncementBar({ text, to }) {
  if (!text) return null
  const href = safeUrl(to, { allowExternal: false })
  return <div className="announce">{href ? <Link to={href}>{text}</Link> : text}</div>
}

function MegaPanel({ item, onNavigate }) {
  if (!item?.mega) return null
  const { columns, featured, promo } = item.mega
  return (
    <div className="mega-grid">
      <div className="mega-cols">
        {columns?.map((col) => (
          <div key={col.title}>
            <h4><Link to={col.href} onClick={onNavigate}>{col.title}</Link></h4>
            {col.links?.map((l) => (
              <Link key={l.label} to={l.href} onClick={onNavigate}>{l.label}</Link>
            ))}
          </div>
        ))}
      </div>
      {[featured, promo].filter(Boolean).map((card) => (
        <Link key={card.title} className="mega-card" to={card.href} onClick={onNavigate}>
          <OptimizedImage src={card.image} alt="" sizes="240px" />
          <span>{card.title}</span>
        </Link>
      ))}
    </div>
  )
}

export function Header({ onOpenCart }) {
  const { tenant, navigation } = useTenant()
  const { t } = useI18n()
  const { user } = useAuth()
  const { count } = useCart()
  const { count: wishes } = useWishlist()
  const [menu, setMenu] = useState(false)
  const [search, setSearch] = useState(false)
  const [openId, setOpenId] = useState(null)
  const closeTimer = useRef(null)
  const isDesktop = useMedia('(min-width: 1024px)')
  const base = `/store/${tenant.slug}`
  const items = navigation?.items || []

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const openMega = (item) => {
    clearTimeout(closeTimer.current)
    setOpenId(item.mega ? item.id : null)
  }
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenId(null), 160)
  }

  const activeItem = items.find((i) => i.id === openId)
  const logo = safeImageUrl(tenant.branding?.logo)

  return (
    <header className="header" onKeyDown={(e) => e.key === 'Escape' && setOpenId(null)}>
      <div className="header-main container">
        <div className="header-left">
          {!isDesktop ? (
            <button type="button" className="icon-btn" aria-label="Open menu" aria-expanded={menu} onClick={() => setMenu(true)}>
              <IconMenu />
            </button>
          ) : null}
          <button type="button" className="icon-btn" aria-label={t('action.search')} onClick={() => setSearch(true)}>
            <IconSearch />
          </button>
        </div>

        <Link to={base} className="logo">
          {logo ? <img src={logo} alt={tenant.name} height="36" /> : tenant.logoText}
          <small>{tenant.tagline}</small>
        </Link>

        <div className="header-actions">
          <Link className="icon-btn hide-sm" to={user ? `${base}/account` : `${base}/login`} aria-label={t('action.account')}>
            <IconUser />
          </Link>
          <Link className="icon-btn hide-sm" to={`${base}/wishlist`} aria-label={`${t('action.wishlist')}${wishes ? `, ${wishes} items` : ''}`}>
            <IconHeart filled={wishes > 0} />
            {wishes ? <span className="count">{wishes}</span> : null}
          </Link>
          <button type="button" className="icon-btn" onClick={onOpenCart} aria-label={`${t('action.cart')}${count ? `, ${count} items` : ''}`}>
            <IconBag />
            {count ? <span className="count">{count}</span> : null}
          </button>
        </div>
      </div>

      {isDesktop ? (
        <nav className="nav-desktop" aria-label="Primary">
          {items.map((item) => (
            <div
              key={item.id}
              className="nav-item"
              onMouseEnter={() => openMega(item)}
              onMouseLeave={scheduleClose}
            >
              <Link
                to={item.href}
                aria-haspopup={item.mega ? 'true' : undefined}
                aria-expanded={item.mega ? openId === item.id : undefined}
                onFocus={() => openMega(item)}
              >
                {item.label}
              </Link>
            </div>
          ))}
        </nav>
      ) : null}

      {isDesktop && activeItem ? (
        <div className="mega" onMouseEnter={() => openMega(activeItem)} onMouseLeave={scheduleClose}>
          <MegaPanel item={activeItem} onNavigate={() => setOpenId(null)} />
        </div>
      ) : null}

      <Drawer open={menu} side="left" title={tenant.name} onClose={() => setMenu(false)}>
        <nav className="nav-mobile" aria-label="Storefront">
          {items.map((item) => (
            <Link key={item.id} to={item.href} onClick={() => setMenu(false)}>{item.label}</Link>
          ))}
          <hr />
          <Link to={user ? `${base}/account` : `${base}/login`} onClick={() => setMenu(false)}>
            {user ? 'My account' : 'Sign in'}
          </Link>
          <Link to={`${base}/wishlist`} onClick={() => setMenu(false)}>Wishlist</Link>
        </nav>
      </Drawer>

      {search ? <SearchOverlay base={base} onClose={() => setSearch(false)} /> : null}
    </header>
  )
}

export function MobileTabBar({ onOpenCart }) {
  const { tenant } = useTenant()
  const { user } = useAuth()
  const { count } = useCart()
  const { count: wishes } = useWishlist()
  const base = `/store/${tenant.slug}`
  return (
    <nav className="tabbar" aria-label="Quick navigation">
      <NavLink to={base} end>
        <IconHome /><span>Home</span>
      </NavLink>
      <NavLink to={`${base}/products`}>
        <IconSearch /><span>Shop</span>
      </NavLink>
      <NavLink to={`${base}/wishlist`}>
        <IconHeart filled={wishes > 0} /><span>Saved</span>
        {wishes ? <span className="count">{wishes}</span> : null}
      </NavLink>
      <button type="button" onClick={onOpenCart}>
        <IconBag /><span>Bag</span>
        {count ? <span className="count">{count}</span> : null}
      </button>
      <NavLink to={user ? `${base}/account` : `${base}/login`}>
        <IconUser /><span>{user ? 'Account' : 'Sign in'}</span>
      </NavLink>
    </nav>
  )
}

function Newsletter() {
  const { t } = useI18n()
  const { push } = useToast()
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  return (
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
          push('You are on the list. Watch your inbox.')
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
        label={t('footer.newsletter')}
        placeholder="you@example.com"
        value={email}
        error={error}
        onChange={(e) => setEmail(e.target.value)}
      />
      <Button type="submit" variant="secondary" loading={pending}>Subscribe</Button>
    </form>
  )
}

export function Footer() {
  const { tenant } = useTenant()
  const { t, locale, setLocale } = useI18n()
  const base = `/store/${tenant.slug}`
  return (
    <footer className="footer">
      <div className="container footer-grid">
        <div>
          <div className="logo">{tenant.name}</div>
          <p className="muted">{tenant.tagline}</p>
          <p className="muted">{tenant.address}</p>
          <p className="muted">
            <a href={`mailto:${tenant.settings?.supportEmail || tenant.email}`}>{tenant.settings?.supportEmail || tenant.email}</a>
            {tenant.phone ? ` · ${tenant.phone}` : ''}
          </p>
        </div>
        <div>
          <h3>Shop</h3>
          <p><Link to={`${base}/products`}>All weaves</Link></p>
          <p><Link to={`${base}/category/new-arrivals`}>New arrivals</Link></p>
          <p><Link to={`${base}/category/wedding`}>Wedding</Link></p>
          <p><Link to={`${base}/category/festive`}>Festive</Link></p>
          <p><Link to={`${base}/category/sale`}>Sale</Link></p>
        </div>
        <div>
          <h3>Client care</h3>
          <p><Link to={`${base}/account`}>Your account</Link></p>
          <p><Link to={`${base}/account/orders`}>Track an order</Link></p>
          <p><Link to={`${base}/wishlist`}>Wishlist</Link></p>
          <p><Link to={`${base}/account/returns`}>Returns & exchanges</Link></p>
        </div>
        <div>
          <Newsletter />
          <p style={{ marginTop: 12 }}>
            <button type="button" className="link-btn" onClick={() => setLocale(locale === 'en' ? 'hi' : 'en')}>
              {locale === 'en' ? 'हिन्दी में देखें' : 'View in English'}
            </button>
          </p>
        </div>
      </div>
      <div className="container footer-legal">
        <p className="muted">
          © {new Date().getFullYear()} {tenant.name}. All weaves photographed at our studio. Prices include GST.
        </p>
        <p className="muted">{t('footer.newsletterHint')}</p>
      </div>
    </footer>
  )
}

export function CartDrawer({ open, onClose }) {
  const { items, updateQty, remove, totals, maxQty } = useCart()
  const { tenant } = useTenant()
  const navigate = useNavigate()
  const { t } = useI18n()
  const base = `/store/${tenant.slug}`

  const goto = (path) => {
    onClose()
    navigate(path)
  }

  return (
    <Drawer
      open={open}
      title={`${t('action.cart')}${items.length ? ` (${items.length})` : ''}`}
      onClose={onClose}
      footer={
        items.length ? (
          <div className="drawer-checkout">
            <div className="drawer-total">
              <span>Total</span>
              <b>{formatCurrency(totals.total)}</b>
            </div>
            <Button className="btn-block" onClick={() => goto(`${base}/checkout`)}>Checkout</Button>
            <Button variant="ghost" className="btn-block" onClick={() => goto(`${base}/cart`)}>View bag</Button>
          </div>
        ) : null
      }
    >
      {!items.length ? (
        <div className="drawer-empty">
          <p>{t('empty.cart')}</p>
          <Button onClick={() => goto(`${base}/products`)}>{t('empty.cartHint')}</Button>
        </div>
      ) : (
        <>
          {totals.freeShippingGap > 0 ? (
            <p className="ship-nudge">Add {formatCurrency(totals.freeShippingGap)} more for free shipping.</p>
          ) : (
            <p className="ship-nudge on">Free shipping unlocked.</p>
          )}
          <ul className="cart-lines">
            {items.map((item) => (
              <li className="cart-line" key={item.id}>
                <OptimizedImage src={item.image} alt="" sizes="88px" />
                <div>
                  <Link to={`${base}/product/${item.slug}`} onClick={onClose}><b>{item.name}</b></Link>
                  <p>{formatCurrency(item.price)}</p>
                  <div className="qty">
                    <button type="button" aria-label={`Decrease quantity of ${item.name}`} disabled={item.qty <= 1} onClick={() => updateQty(item.id, item.qty - 1)}>−</button>
                    <span aria-live="polite">{item.qty}</span>
                    <button type="button" aria-label={`Increase quantity of ${item.name}`} disabled={item.qty >= Math.min(maxQty, item.inventory || maxQty)} onClick={() => updateQty(item.id, item.qty + 1)}>+</button>
                  </div>
                  <button type="button" className="link-btn" onClick={() => remove(item.id)}>Remove</button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </Drawer>
  )
}
