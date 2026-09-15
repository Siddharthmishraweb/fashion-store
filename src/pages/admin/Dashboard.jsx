import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { analyticsApi, ordersApi } from '../../services/api/index.js'
import { useAsync } from '../../hooks/index.js'
import { MiniChart, Stat } from '../../components/admin/AdminChrome.jsx'
import { EmptyState, ErrorState, Skeleton, StatusPill } from '../../components/common/index.jsx'
import { formatCurrency, formatDate } from '../../utils/index.js'

export default function AdminDashboard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useAsync(() => analyticsApi.store(user.tenantId), [user.tenantId])
  const orders = useAsync(() => ordersApi.list({ tenantId: user.tenantId, limit: 6 }), [user.tenantId])

  if (loading) return <Skeleton height={140} count={3} radius={4} />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return null

  const recent = orders.data?.items || data.recentOrders || []
  const needsAttention = data.outOfStock > 0 || data.lowStock > 0

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Welcome back, {user.name.split(' ')[0]}.</p>
        </div>
        <Link className="btn" to="/admin/products/new">Add product</Link>
      </div>

      {needsAttention ? (
        <div className="notice" role="status">
          <strong>Stock needs attention.</strong>{' '}
          {data.outOfStock} product(s) are out of stock and {data.lowStock} are running low.{' '}
          <Link to="/admin/inventory">Open inventory</Link>
        </div>
      ) : null}

      <div className="stats">
        <Stat label="Sales" value={formatCurrency(data.sales)} />
        <Stat label="Your revenue" value={formatCurrency(data.revenue)} />
        <Stat label="Orders" value={data.orders} />
        <Stat label="Products" value={data.products} hint={`${data.publishedProducts} live`} />
        <Stat label="Customers" value={data.customers} />
        <Stat label="Units in stock" value={data.inventory} />
        <Stat label="Conversion" value={`${data.conversion}%`} />
        <Stat label="Cart abandonment" value={`${data.abandonment}%`} />
      </div>

      <div className="dash-grid">
        <div className="admin-card">
          <h3>Gross merchandise value</h3>
          <MiniChart series={data.series} />
        </div>
        <div className="admin-card">
          <h3>Most reviewed</h3>
          {data.topProducts.length === 0 ? (
            <p className="muted">No products yet.</p>
          ) : (
            <ul className="plain-list">
              {data.topProducts.map((p) => (
                <li key={p.name}>
                  <span className="clamp-1">{p.name}</span>
                  <b>{formatCurrency(p.value)}</b>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="admin-card">
        <h3>Recent orders</h3>
        {recent.length === 0 ? (
          <EmptyState title="No orders yet" hint="Share your storefront link to get your first sale." />
        ) : (
          <ul className="plain-list">
            {recent.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`}>{o.number}</Link>
                <span className="muted">{o.customerName} · {formatDate(o.createdAt)}</span>
                <StatusPill status={o.status} />
                <b>{formatCurrency(o.totals?.total)}</b>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
