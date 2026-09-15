import { useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useTenant } from '../../context/TenantContext.jsx'
import { notificationsApi, ordersApi } from '../../services/api/index.js'
import { useAsync, useSubmit } from '../../hooks/index.js'
import {
  Button,
  EmptyState,
  ErrorState,
  Input,
  OptimizedImage,
  Seo,
  Skeleton,
  StatusPill,
} from '../../components/common/index.jsx'
import { ORDER_STATUS } from '../../config/constants.js'
import { formatCurrency, formatDate, timeAgo } from '../../utils/index.js'
import { isPhone, passwordIssues } from '../../utils/security.js'
import { useToast } from '../../context/ToastContext.jsx'

const LINKS = [
  ['profile', 'Profile'],
  ['orders', 'Orders'],
  ['wishlist', 'Wishlist'],
  ['addresses', 'Addresses'],
  ['payments', 'Payments'],
  ['coupons', 'Coupons'],
  ['returns', 'Returns'],
  ['reviews', 'Reviews'],
  ['notifications', 'Notifications'],
  ['preferences', 'Preferences'],
]

export function AccountLayout() {
  const { tenant } = useTenant()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const base = `/store/${tenant.slug}/account`

  if (!user) {
    return (
      <div className="container" style={{ padding: '3rem 0' }}>
        <EmptyState
          title="Sign in to see your account"
          hint="Your orders, wishlist, and addresses live here."
          action={<Link className="btn" to={`/store/${tenant.slug}/login`}>Sign in</Link>}
        />
      </div>
    )
  }

  return (
    <div className="container account-layout">
      <Seo title={`Your account · ${tenant.name}`} noindex />
      <aside>
        <p className="caption">Signed in as</p>
        <h2 className="account-name">{user.name}</h2>
        <nav aria-label="Account">
          {LINKS.map(([slug, label]) => (
            <NavLink key={slug} to={`${base}/${slug}`}>{label}</NavLink>
          ))}
        </nav>
        <Button
          variant="ghost"
          onClick={async () => {
            await logout()
            navigate(`/store/${tenant.slug}`)
          }}
        >
          Sign out
        </Button>
      </aside>
      <section className="account-panel">
        <Outlet />
      </section>
    </div>
  )
}

export function AccountHome() {
  const { user, updateProfile, changePassword } = useAuth()
  const { push } = useToast()
  const [profile, setProfile] = useState({ name: user.name, phone: user.phone || '' })
  const [passwords, setPasswords] = useState({ currentPassword: '', newPassword: '' })

  const saveProfile = useSubmit(async () => {
    if (!profile.name.trim()) throw new Error('Enter your name.')
    if (profile.phone && !isPhone(profile.phone)) throw new Error('Enter a valid mobile number.')
    await updateProfile(profile)
    push('Profile updated')
  })

  const savePassword = useSubmit(async () => {
    const issues = passwordIssues(passwords.newPassword)
    if (issues.length) throw new Error(`New password needs ${issues.join(', ')}.`)
    await changePassword(passwords)
    setPasswords({ currentPassword: '', newPassword: '' })
    push('Password changed. Other sessions were signed out.')
  })

  return (
    <div>
      <h1>Profile</h1>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); saveProfile.submit() }}>
        {saveProfile.error ? <p className="form-error" role="alert">{saveProfile.error}</p> : null}
        <Input label="Name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} />
        <Input label="Email" value={user.email} disabled hint="Contact us to change the email on your account." />
        <Input label="Mobile" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} />
        <Button type="submit" loading={saveProfile.pending}>Save changes</Button>
      </form>

      <h2 style={{ marginTop: '2rem' }}>Password</h2>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); savePassword.submit() }}>
        {savePassword.error ? <p className="form-error" role="alert">{savePassword.error}</p> : null}
        <Input
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={passwords.currentPassword}
          onChange={(e) => setPasswords({ ...passwords, currentPassword: e.target.value })}
        />
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters with upper and lower case letters and a number."
          value={passwords.newPassword}
          onChange={(e) => setPasswords({ ...passwords, newPassword: e.target.value })}
        />
        <Button type="submit" variant="secondary" loading={savePassword.pending}>Change password</Button>
      </form>
    </div>
  )
}

export function OrdersPage() {
  const { data, loading, error, refetch } = useAsync(() => ordersApi.list({ limit: 20 }), [])

  if (loading) return <Skeleton height={90} count={3} radius={4} />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data?.items?.length) {
    return <EmptyState title="No orders yet" hint="Once you place an order it will appear here with live tracking." />
  }

  return (
    <div>
      <h1>Orders</h1>
      <ul className="order-list">
        {data.items.map((o) => (
          <li key={o.id}>
            <Link to={`./${o.id}`}>
              <div>
                <b>{o.number}</b>
                <span className="muted">{formatDate(o.createdAt)} · {o.items.length} item(s)</span>
              </div>
              <StatusPill status={o.status} />
              <b>{formatCurrency(o.totals.total)}</b>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function OrderDetailPage() {
  const { orderId } = useParams()
  const { data: order, loading, error, refetch } = useAsync(() => ordersApi.get(orderId), [orderId])

  if (loading) return <Skeleton height={320} radius={4} />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!order) return null

  const reached = new Set((order.timeline || []).map((t) => t.status))
  const journey = ORDER_STATUS.slice(0, 6)

  return (
    <div>
      <h1>Order {order.number}</h1>
      <p className="muted">
        Placed {formatDate(order.createdAt)} · {order.paymentMethod.toUpperCase()} · {order.paymentStatus}
      </p>

      <ol className="tracker">
        {journey.map((status) => (
          <li key={status} className={reached.has(status) ? 'on' : ''}>
            <span className="dot" aria-hidden="true" />
            {status.replace(/_/g, ' ')}
          </li>
        ))}
      </ol>

      {order.tracking ? (
        <p className="notice">Shipped with {order.tracking.carrier} · tracking {order.tracking.code}</p>
      ) : null}

      <ul className="cart-lines">
        {order.items.map((i) => (
          <li className="cart-line" key={i.productId}>
            <OptimizedImage src={i.image} alt="" sizes="96px" />
            <div>
              <b>{i.name}</b>
              <p className="muted">Qty {i.qty} · {formatCurrency(i.price)}</p>
            </div>
            <b className="line-total">{formatCurrency(i.price * i.qty)}</b>
          </li>
        ))}
      </ul>

      <dl className="totals">
        <div><dt>Subtotal</dt><dd>{formatCurrency(order.totals.subtotal)}</dd></div>
        {order.totals.discount ? <div className="is-credit"><dt>Discount</dt><dd>−{formatCurrency(order.totals.discount)}</dd></div> : null}
        <div><dt>Shipping</dt><dd>{order.totals.shipping ? formatCurrency(order.totals.shipping) : 'Complimentary'}</dd></div>
        <div className="grand"><dt>Total</dt><dd>{formatCurrency(order.totals.total)}</dd></div>
      </dl>

      <h2>Delivery address</h2>
      <address className="muted">
        {order.address?.name}<br />
        {order.address?.address}{order.address?.apartment ? `, ${order.address.apartment}` : ''}<br />
        {order.address?.city}, {order.address?.state} {order.address?.pin}<br />
        {order.address?.phone}
      </address>
    </div>
  )
}

export function SimpleAccount({ title, body }) {
  return (
    <div>
      <h1>{title}</h1>
      <p className="muted">{body}</p>
    </div>
  )
}

export function NotificationsPage() {
  const { tenant } = useTenant()
  const { data, loading } = useAsync(
    () => notificationsApi.list({ tenantId: tenant.id, audience: 'customer' }),
    [tenant.id],
  )

  if (loading) return <Skeleton height={70} count={3} radius={4} />
  if (!data?.length) return <EmptyState title="Nothing new" hint="Offers and order updates will show up here." />

  return (
    <div>
      <h1>Notifications</h1>
      <ul className="plain-list">
        {data.map((n) => (
          <li key={n.id}>
            <span>
              <b>{n.title}</b>
              <small className="muted">{n.body}</small>
            </span>
            <small className="muted">{timeAgo(n.createdAt)}</small>
          </li>
        ))}
      </ul>
    </div>
  )
}
