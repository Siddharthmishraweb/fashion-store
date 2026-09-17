import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { analyticsApi, ordersApi } from '../../services/api/index.js'
import { useAsync } from '../../hooks/index.js'
import { MiniChart, Stat } from '../../components/admin/AdminChrome.jsx'
import { EmptyState, ErrorState, Skeleton, StatusPill } from '../../components/common/index.jsx'
import { formatCurrency, formatDate, formatPercent } from '../../utils/index.js'

export default function AdminDashboard() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useAsync(() => analyticsApi.store(user.tenantId), [user.tenantId])
  const orders = useAsync(() => ordersApi.list({ tenantId: user.tenantId, limit: 6 }), [user.tenantId])

  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (loading) return <Skeleton height={140} count={3} radius={4} />
  if (!data) return null

  const firstName = user?.name?.trim().split(/\s+/)[0] || 'there'
  const topProducts = Array.isArray(data.topProducts) ? data.topProducts : []
  const series = Array.isArray(data.series) ? data.series : []
  const recent = orders.data?.items || data.recentOrders || []
  const needsAttention = data.outOfStock > 0 || data.lowStock > 0

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Dashboard</h1>
          <p className="muted">Welcome back, {firstName}.</p>
        </div>
        <Link className="btn" to="/admin/products/new">Add product</Link>
      </div>

      {needsAttention ? (
        <div className="notice" role="status">
          <strong>Stock needs attention.</strong>{' '}
          {data.outOfStock || 0} product(s) are out of stock and {data.lowStock || 0} are running low.{' '}
          <Link to="/admin/inventory">Open inventory</Link>
        </div>
      ) : null}

      <div className="stats">
        <Stat label="Sales" value={formatCurrency(data.sales)} />
        <Stat label="Net profit" value={formatCurrency(data.netProfit ?? data.revenue)} hint="Sold − cost − dispatch" />
        <Stat label="Orders" value={data.orders ?? 0} />
        <Stat label="Products" value={data.products ?? 0} hint={`${data.publishedProducts ?? 0} live`} />
        <Stat label="Customers" value={data.customers ?? 0} />
        <Stat label="Units in stock" value={data.inventory ?? 0} />
        <Stat label="Conversion" value={formatPercent(data.conversion)} />
        <Stat label="Cart abandonment" value={formatPercent(data.abandonment)} />
      </div>

      <div className="dash-grid">
        <div className="admin-card">
          <h3>Gross merchandise value</h3>
          {series.some((point) => (point.gmv || point.value || 0) > 0) ? (
            <MiniChart series={series} />
          ) : (
            <p className="muted">Sales will appear here after your first paid order.</p>
          )}
        </div>
        <div className="admin-card">
          <h3>Top products</h3>
          {topProducts.length === 0 ? (
            <p className="muted">No products yet.</p>
          ) : (
            <ul className="plain-list">
              {topProducts.map((p) => (
                <li key={p.name}>
                  <span className="clamp-1">{p.name}</span>
                  <b>{p.sold || 0} sold</b>
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
