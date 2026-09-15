import { useState } from 'react'
import { Link } from 'react-router-dom'
import { analyticsApi, themesApi, usersApi } from '../../services/api/index.js'
import { storesApi } from '../../services/api/stores.js'
import { useAsync, useDebounced, useSubmit } from '../../hooks/index.js'
import { DataTable, MiniChart, Stat } from '../../components/admin/AdminChrome.jsx'
import {
  Button,
  ConfirmDialog,
  ErrorState,
  Input,
  Select,
  Skeleton,
  StatusPill,
} from '../../components/common/index.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { DEFAULT_STORE_SLUG, env } from '../../config/env.js'
import { formatCurrency, formatDate, slugify } from '../../utils/index.js'
import { passwordIssues } from '../../utils/security.js'
import { THEMES } from '../../theme/themes.js'

export default function SuperDashboard() {
  const { data, loading, error, refetch } = useAsync(() => analyticsApi.platform(), [])
  if (loading) return <Skeleton height={200} count={2} radius={4} />
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (!data) return null
  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Platform overview</h1>
          <p className="muted">Every storefront on {env.appName}, at a glance.</p>
        </div>
      </div>
      <div className="stats">
        <Stat label="Storefronts" value={data.stores} hint={`${data.activeStores} active`} />
        <Stat label="Products" value={data.products} />
        <Stat label="Customers" value={data.customers} />
        <Stat label="Orders" value={data.orders} />
        <Stat label="GMV" value={formatCurrency(data.gmv)} />
        <Stat label="Platform revenue" value={formatCurrency(data.revenue)} />
        <Stat label="Conversion" value={`${data.conversion}%`} />
      </div>
      <div className="admin-card">
        <h3>Gross merchandise value</h3>
        <MiniChart series={data.series} />
      </div>
    </div>
  )
}

export function StoresAdmin() {
  const { push } = useToast()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 300)
  const { data, loading, error, refetch } = useAsync(() => storesApi.list({ q: search, limit: 50 }), [search])
  const [form, setForm] = useState({
    name: '', slug: '', ownerName: '', email: '', password: '', phone: '', city: '', themeId: THEMES[0].id,
  })
  const [confirming, setConfirming] = useState(null)

  const { submit, pending, error: formError } = useSubmit(async () => {
    const payload = {
      ...form,
      slug: slugify(form.slug || form.name),
      ownerName: form.ownerName,
      ownerPassword: form.password,
    }
    delete payload.password
    if (!form.name.trim()) throw new Error('A business name is required.')
    if (!form.email.trim()) throw new Error('An owner email is required.')
    const issues = passwordIssues(form.password)
    if (issues.length) throw new Error(`Owner password needs ${issues.join(', ')}.`)
    const store = await storesApi.create(payload)
    push(`${store.name} is live at /store/${store.slug}. The owner can sign in at /login.`)
    setForm({ name: '', slug: '', ownerName: '', email: '', password: '', phone: '', city: '', themeId: THEMES[0].id })
    refetch()
  })

  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Storefronts</h1>
          <p className="muted">{data?.total ?? 0} independent businesses on the platform</p>
        </div>
      </div>

      <form className="admin-card" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <h3>Onboard a business</h3>
        {formError ? <p className="form-error" role="alert">{formError}</p> : null}
        <div className="grid-3">
          <Input label="Business name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input
            label="Storefront slug"
            hint={`vastrika.market/store/${slugify(form.slug || form.name) || 'your-store'}`}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <Input label="Owner name" value={form.ownerName} onChange={(e) => setForm({ ...form, ownerName: e.target.value })} placeholder="House owner" />
          <Input label="Owner email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          <Input
            label="Owner password"
            type="password"
            required
            hint="At least 8 characters, with upper, lower, and a number"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          <Input label="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <Input label="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Select
            label="Starting theme"
            value={form.themeId}
            onChange={(e) => setForm({ ...form, themeId: e.target.value })}
            options={THEMES.map((t) => ({ value: t.id, label: t.name }))}
          />
        </div>
        <Button type="submit" loading={pending}>Create storefront</Button>
      </form>

      <DataTable
        loading={loading}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Search storefronts"
        emptyTitle="No storefronts match"
        rows={data?.items || []}
        columns={[
          {
            key: 'name',
            label: 'Storefront',
            render: (r) => (
              <span>
                <strong>{r.name}</strong>
                <small className="muted">/store/{r.slug} · {r.city}</small>
              </span>
            ),
          },
          { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
          { key: 'subscription', label: 'Plan' },
          { key: 'productsCount', label: 'Products' },
          { key: 'ordersCount', label: 'Orders' },
          { key: 'gmv', label: 'GMV', render: (r) => formatCurrency(r.gmv) },
          { key: 'createdAt', label: 'Joined', render: (r) => formatDate(r.createdAt) },
          {
            key: 'actions',
            label: 'Actions',
            render: (r) => (
              <span className="cell-actions">
                <Link to={`/store/${r.slug}`} target="_blank" rel="noreferrer">Open</Link>
                <button type="button" className="link-btn" onClick={() => setConfirming(r)}>
                  {r.status === 'active' ? 'Suspend' : 'Activate'}
                </button>
              </span>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(confirming)}
        title={confirming?.status === 'active' ? 'Suspend this storefront?' : 'Activate this storefront?'}
        message={
          confirming?.status === 'active'
            ? `${confirming?.name} will stop accepting orders and shoppers will see an unavailable notice.`
            : `${confirming?.name} will become reachable again and can accept orders.`
        }
        confirmLabel={confirming?.status === 'active' ? 'Suspend' : 'Activate'}
        tone={confirming?.status === 'active' ? 'danger' : 'primary'}
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          await storesApi.update(confirming.id, { status: confirming.status === 'active' ? 'suspended' : 'active' })
          push(`${confirming.name} updated`)
          setConfirming(null)
          refetch()
        }}
      />
    </div>
  )
}

export function ThemesAdmin() {
  const { data } = useAsync(() => themesApi.list(), [])
  const themes = data || THEMES
  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Theme library</h1>
          <p className="muted">{themes.length} ready-made looks. Store owners can fine-tune colour, type, and layout in Appearance.</p>
        </div>
      </div>
      <div className="theme-grid">
        {themes.map((theme) => (
          <article className="theme-card" key={theme.id}>
            <div className="palette">
              {[theme.primaryColor, theme.accentColor, theme.backgroundColor, theme.textColor].map((c, i) => (
                <span key={`${theme.id}-${i}`} style={{ background: c }} />
              ))}
            </div>
            <div className="theme-card-body">
              <h3>{theme.name}</h3>
              <p className="muted">{theme.description}</p>
              <p className="caption">{theme.headingFont} / {theme.bodyFont} · {theme.layoutStyle}</p>
              <Link className="btn btn-ghost btn-sm" to={`/store/${DEFAULT_STORE_SLUG}?previewTheme=${theme.id}`} target="_blank" rel="noreferrer">
                Live preview
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}

export function UsersAdmin() {
  const [q, setQ] = useState('')
  const [role, setRole] = useState('staff')
  const search = useDebounced(q, 300)
  const { data, loading, error, refetch } = useAsync(() => usersApi.list({ q: search, role, limit: 50 }), [search, role])
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Users & roles</h1>
          <p className="muted">Accounts are scoped to a single storefront. Role changes are made by each store owner under Team.</p>
        </div>
      </div>
      <DataTable
        loading={loading}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Search name or email"
        emptyTitle="No users match"
        actions={
          <Select
            value={role}
            aria-label="Filter by role"
            onChange={(e) => setRole(e.target.value)}
            options={[
              { value: 'staff', label: 'All staff' },
              { value: 'super_admin', label: 'Platform operators' },
              { value: 'store_owner', label: 'Store owners' },
              { value: 'customer', label: 'Shoppers' },
            ]}
          />
        }
        rows={data?.items || []}
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          { key: 'role', label: 'Role', render: (r) => String(r.role).replace(/_/g, ' ') },
          { key: 'storeName', label: 'Storefront' },
        ]}
      />
    </div>
  )
}

export function SuperSettings() {
  return (
    <div>
      <div className="admin-top"><h1>Platform settings</h1></div>
      <div className="admin-card" style={{ maxWidth: 760 }}>
        <h3>Tenant resolution</h3>
        <p className="muted">
          A storefront is found by custom domain first, then by the <code>/store/:slug</code> path. Point a client's
          domain at the platform and add it to their record — no code change or redeploy is needed.
        </p>
        <h3>API</h3>
        <p className="muted">
          Mock vs live data is the vault key <code>USE_MOCK</code> (see <code>src/config/vault.js</code>).
          When it is true the storefront uses the in-browser catalogue. When it is false, set
          <code> VITE_API_URL</code> to the Fastify origin.
        </p>
        <h3>Security posture</h3>
        <ul className="muted plain-list">
          <li>Sessions are short-lived tokens held in sessionStorage, revoked on sign-out and password change.</li>
          <li>Every write is authorised by role and confined to the caller's own storefront.</li>
          <li>Admin-supplied links and image addresses are validated, so <code>javascript:</code> payloads cannot render.</li>
          <li>Checkout re-prices the bag server-side; client totals are never trusted.</li>
          <li>Repeated failed sign-ins are throttled per account.</li>
        </ul>
      </div>
    </div>
  )
}
