import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { hasPermission, ROLES } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { notificationsApi } from '../../services/api/index.js'
import { storesApi } from '../../services/api/stores.js'
import { useAsync, useMedia } from '../../hooks/index.js'
import { Badge, Button, EmptyState, Skeleton } from '../common/index.jsx'
import { cx, timeAgo } from '../../utils/index.js'

const STORE_LINKS = [
  ['/admin', 'Dashboard', 'store.dashboard'],
  ['/admin/products', 'Products', 'store.products'],
  ['/admin/categories', 'Categories', 'store.categories'],
  ['/admin/collections', 'Collections', 'store.collections'],
  ['/admin/orders', 'Orders', 'store.orders'],
  ['/admin/customers', 'Customers', 'store.customers'],
  ['/admin/inventory', 'Inventory', 'store.inventory'],
  ['/admin/banners', 'Banners', 'store.banners'],
  ['/admin/coupons', 'Coupons', 'store.coupons'],
  ['/admin/reviews', 'Reviews', 'store.reviews'],
  ['/admin/analytics', 'Analytics', 'store.analytics'],
  ['/admin/customize', 'Appearance', 'store.appearance'],
  ['/admin/team', 'Team', 'store.users'],
  ['/admin/settings', 'Settings', 'store.settings'],
]

const SUPER_LINKS = [
  ['/super-admin', 'Dashboard'],
  ['/super-admin/stores', 'Stores'],
  ['/super-admin/themes', 'Themes'],
  ['/super-admin/users', 'Users'],
  ['/super-admin/analytics', 'Analytics'],
  ['/super-admin/settings', 'Settings'],
]

function AccessDenied({ message }) {
  const navigate = useNavigate()
  return (
    <div className="denied">
      <div>
        <h1>Permission denied</h1>
        <p className="muted">{message}</p>
        <Button onClick={() => navigate('/login')}>Sign in</Button>
      </div>
    </div>
  )
}

function NotificationBell({ tenantId }) {
  const [open, setOpen] = useState(false)
  const { data, refetch } = useAsync(
    () => (tenantId ? notificationsApi.list({ tenantId, audience: 'admin' }) : Promise.resolve([])),
    [tenantId],
  )
  const items = data || []
  const unread = items.filter((n) => !n.read).length

  return (
    <div className="bell-wrap">
      <button
        type="button"
        className="icon-btn"
        aria-expanded={open}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">🔔</span>
        {unread ? <span className="bell-dot">{unread}</span> : null}
      </button>
      {open ? (
        <>
          <button type="button" className="popover-shade" aria-label="Close notifications" onClick={() => setOpen(false)} />
          <div className="popover" role="dialog" aria-label="Notifications">
            <header>
              <strong>Notifications</strong>
              {unread ? (
                <button
                  type="button"
                  className="link-btn"
                  onClick={async () => {
                    await notificationsApi.markAllRead(tenantId)
                    refetch()
                  }}
                >
                  Mark all read
                </button>
              ) : null}
            </header>
            {items.length ? (
              <ul>
                {items.slice(0, 8).map((n) => (
                  <li key={n.id} className={n.read ? '' : 'unread'}>
                    <strong>{n.title}</strong>
                    <span className="muted">{n.body}</span>
                    <small className="muted">{timeAgo(n.createdAt)}</small>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted" style={{ padding: 12 }}>Nothing new right now.</p>
            )}
          </div>
        </>
      ) : null}
    </div>
  )
}

function Chrome({ role, links, user, store, onLogout }) {
  const isDesktop = useMedia('(min-width: 1024px)')
  const [navOpen, setNavOpen] = useState(false)
  const location = useLocation()

  useEffect(() => {
    setNavOpen(false)
  }, [location.pathname])

  const visible = useMemo(
    () => links.filter(([, , permission]) => !permission || hasPermission(user.role, permission)),
    [links, user.role],
  )

  return (
    <div className="admin">
      {!isDesktop && navOpen ? <button type="button" className="admin-shade" aria-label="Close menu" onClick={() => setNavOpen(false)} /> : null}

      <aside className={cx('admin-side', !isDesktop && 'floating', navOpen && 'open')} aria-label="Admin navigation">
        <p className="caption">{role}</p>
        <h2 className="admin-brand">{store?.name || env.appName}</h2>
        <nav>
          {visible.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === '/admin' || to === '/super-admin'}>{label}</NavLink>
          ))}
        </nav>
        <div className="admin-side-foot">
          <p className="caption">{user.name}</p>
          <p className="muted" style={{ fontSize: '0.8rem' }}>{String(user.role).replace(/_/g, ' ')}</p>
          <button type="button" className="link-btn" onClick={onLogout}>Sign out</button>
        </div>
      </aside>

      <div className="admin-main">
        <header className="admin-bar">
          {!isDesktop ? (
            <button type="button" className="icon-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen(true)}>☰</button>
          ) : null}
          <div className="admin-bar-title">
            <strong>{store?.name || env.appName}</strong>
            {store?.status ? <Badge tone={store.status === 'active' ? 'success' : 'warn'}>{store.status}</Badge> : null}
          </div>
          <div className="admin-bar-actions">
            {store?.slug ? (
              <Link className="btn btn-ghost btn-sm" to={`/store/${store.slug}`} target="_blank" rel="noreferrer">
                View storefront
              </Link>
            ) : null}
            {user.tenantId ? <NotificationBell tenantId={user.tenantId} /> : null}
          </div>
        </header>
        <div className="admin-canvas">
          <Outlet context={{ store }} />
        </div>
      </div>
    </div>
  )
}

export function AdminShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const { data: store } = useAsync(
    () => (user?.tenantId ? storesApi.get(user.tenantId) : Promise.resolve(null)),
    [user?.tenantId],
  )

  if (!user) return <Navigate to="/login" replace state={{ from: '/admin' }} />
  if (user.role === ROLES.SUPER_ADMIN) return <Navigate to="/super-admin" replace />
  if (user.role === ROLES.CUSTOMER) return <AccessDenied message="This area is reserved for store operators." />

  return (
    <Chrome
      role="Store admin"
      links={STORE_LINKS}
      user={user}
      store={store}
      onLogout={async () => {
        await logout()
        navigate('/login')
      }}
    />
  )
}

export function SuperAdminShell() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  if (!user) return <Navigate to="/login" replace state={{ from: '/super-admin' }} />
  if (user.role !== ROLES.SUPER_ADMIN) return <AccessDenied message="Only the platform operator can open this console." />

  return (
    <Chrome
      role="Platform console"
      links={SUPER_LINKS}
      user={user}
      store={{ name: env.appName }}
      onLogout={async () => {
        await logout()
        navigate('/login')
      }}
    />
  )
}

export function DataTable({
  columns,
  rows = [],
  loading,
  search,
  onSearch,
  searchPlaceholder = 'Search',
  actions,
  sort,
  onSort,
  selectable,
  selected = [],
  onSelect,
  emptyTitle = 'Nothing here yet',
  emptyHint,
}) {
  const allSelected = rows.length > 0 && selected.length === rows.length

  return (
    <div className="admin-card table-card">
      {onSearch || actions ? (
        <div className="table-tools">
          {onSearch ? (
            <input
              className="input"
              type="search"
              placeholder={searchPlaceholder}
              value={search || ''}
              onChange={(e) => onSearch(e.target.value)}
              aria-label={searchPlaceholder}
            />
          ) : null}
          {actions ? <div className="table-actions">{actions}</div> : null}
        </div>
      ) : null}

      {loading ? (
        <div style={{ padding: 16, display: 'grid', gap: 8 }}>
          <Skeleton height={34} count={5} />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} hint={emptyHint} />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {selectable ? (
                  <th className="col-check">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      aria-label="Select all rows"
                      onChange={(e) => onSelect?.(e.target.checked ? rows.map((r) => r.id) : [])}
                    />
                  </th>
                ) : null}
                {columns.map((c) => (
                  <th key={c.key} className={c.className}>
                    {onSort && c.sortable ? (
                      <button type="button" className="th-sort" onClick={() => onSort(c.key)}>
                        {c.label}
                        <span aria-hidden="true">{sort === c.key ? ' ▲' : sort === `-${c.key}` ? ' ▼' : ''}</span>
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={selected.includes(row.id) ? 'is-selected' : ''}>
                  {selectable ? (
                    <td className="col-check" data-label="">
                      <input
                        type="checkbox"
                        checked={selected.includes(row.id)}
                        aria-label={`Select ${row.name || row.id}`}
                        onChange={(e) =>
                          onSelect?.(e.target.checked ? [...selected, row.id] : selected.filter((id) => id !== row.id))
                        }
                      />
                    </td>
                  ) : null}
                  {columns.map((c) => (
                    <td key={c.key} data-label={c.label} className={c.className}>
                      {c.render ? c.render(row) : row[c.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

export function Stat({ label, value, delta, hint }) {
  return (
    <div className="stat">
      <span className="caption">{label}</span>
      <b>{value}</b>
      {delta !== undefined ? (
        <span className={cx('stat-delta', delta >= 0 ? 'up' : 'down')}>
          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)}%
        </span>
      ) : null}
      {hint ? <small className="muted">{hint}</small> : null}
    </div>
  )
}

export function MiniChart({ series = [] }) {
  const max = Math.max(...series.map((s) => s.gmv || s.value || 0), 1)
  return (
    <div className="chart">
      {series.map((s) => (
        <div key={s.label} className="bar-col">
          <div
            className="bar"
            style={{ height: `${Math.max(4, ((s.gmv || s.value || 0) / max) * 100)}%` }}
            title={`${s.label}: ${s.gmv ?? s.value}`}
          />
          <small className="muted">{s.label}</small>
        </div>
      ))}
    </div>
  )
}
