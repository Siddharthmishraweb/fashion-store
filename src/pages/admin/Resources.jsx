import { useId, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { productsApi } from '../../services/api/products.js'
import { storesApi } from '../../services/api/stores.js'
import {
  categoriesApi,
  collectionsApi,
  couponsApi,
  customersApi,
  inventoryApi,
  ordersApi,
  reviewsApi,
  staffApi,
} from '../../services/api/index.js'
import { useAsync, useDebounced, useSubmit } from '../../hooks/index.js'
import { DataTable } from '../../components/admin/AdminChrome.jsx'
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Input,
  Pagination,
  Rating,
  Select,
  StatusPill,
  Textarea,
  Toggle,
} from '../../components/common/index.jsx'
import { ORDER_STATUS, PRODUCT_ATTRIBUTES, ROLES } from '../../config/constants.js'
import { cx, downloadFile, formatCurrency, formatDate, slugify, toCsv } from '../../utils/index.js'
import { isEmail, isPhone, safeImageUrl } from '../../utils/security.js'

const PAGE_SIZE = 20

/* --------------------------------------------------------------- products */

export function ProductsAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState('newest')
  const [selected, setSelected] = useState([])
  const [confirmBulk, setConfirmBulk] = useState(false)
  const [busy, setBusy] = useState(false)
  const search = useDebounced(q, 300)
  const tenantId = user?.tenantId

  const { data, loading, error, refetch } = useAsync(
    () => productsApi.list({ tenantId, q: search, sort, page, limit: PAGE_SIZE }),
    [tenantId, search, sort, page],
    { enabled: Boolean(tenantId) },
  )
  const rows = Array.isArray(data?.items) ? data.items : []

  const runBulk = async (action) => {
    setBusy(true)
    try {
      const result = await productsApi.bulk({ ids: selected, action })
      push(`${result.affected} product(s) ${action === 'delete' ? 'deleted' : `${action}ed`}`)
      setSelected([])
      refetch()
    } catch (err) {
      push(err.message)
    } finally {
      setBusy(false)
      setConfirmBulk(false)
    }
  }

  const exportCsv = () => {
    const source = selected.length ? rows.filter((r) => selected.includes(r.id)) : rows
    downloadFile(
      `products-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(source, [
        { key: 'name', label: 'Name' },
        { key: 'sku', label: 'SKU' },
        { key: 'price', label: 'Price' },
        { key: 'mrp', label: 'MRP' },
        { key: 'inventory', label: 'Stock' },
        { key: 'fabric', label: 'Fabric' },
        { key: 'published', label: 'Published', value: (r) => (r.published ? 'yes' : 'no') },
      ]),
    )
    push(`Exported ${source.length} product(s)`)
  }

  if (!tenantId) {
    return (
      <EmptyState
        title="This account is not linked to a store"
        hint="Sign in with a store-owner login (for example admin@atelier-noor.test) before managing products."
      />
    )
  }
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Products</h1>
          <p className="muted">{data?.total ?? 0} products in your catalogue</p>
        </div>
        <Link className="btn" to="/admin/products/new">Add product</Link>
      </div>

      <DataTable
        loading={loading}
        search={q}
        onSearch={(value) => {
          setQ(value)
          setPage(1)
        }}
        searchPlaceholder="Search by name, fabric, or weave"
        selectable
        selected={selected}
        onSelect={setSelected}
        emptyTitle="No products match"
        emptyHint="Try a different search, or add your first product."
        actions={
          <>
            <Select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              aria-label="Sort products"
              options={[
                { value: 'newest', label: 'Newest first' },
                { value: 'name', label: 'Name A–Z' },
                { value: 'price_asc', label: 'Price low to high' },
                { value: 'price_desc', label: 'Price high to low' },
              ]}
            />
            <Button variant="ghost" size="sm" onClick={exportCsv}>Export CSV</Button>
            {selected.length ? (
              <>
                <span className="muted" aria-live="polite">{selected.length} selected</span>
                <Button size="sm" variant="secondary" loading={busy} onClick={() => runBulk('publish')}>Publish</Button>
                <Button size="sm" variant="ghost" loading={busy} onClick={() => runBulk('unpublish')}>Unpublish</Button>
                <Button size="sm" variant="danger" onClick={() => setConfirmBulk(true)}>Delete</Button>
              </>
            ) : null}
          </>
        }
        rows={rows}
        columns={[
          {
            key: 'name',
            label: 'Product',
            render: (r) => (
              <Link to={`/admin/products/${r.id}`} className="cell-product">
                {safeImageUrl(r.images?.[0]?.src) ? <img src={r.images[0].src} alt="" loading="lazy" /> : null}
                <span>
                  <strong>{r.name}</strong>
                  <small className="muted">{r.fabric} · {r.weave}</small>
                </span>
              </Link>
            ),
          },
          { key: 'sku', label: 'SKU' },
          { key: 'price', label: 'Price', render: (r) => formatCurrency(r.price) },
          {
            key: 'inventory',
            label: 'Stock',
            render: (r) => (
              <span className={r.inventory <= 0 ? 'text-danger' : r.inventory <= 5 ? 'text-warn' : ''}>
                {r.inventory <= 0 ? 'Out of stock' : r.inventory}
              </span>
            ),
          },
          { key: 'published', label: 'Status', render: (r) => <StatusPill status={r.published ? 'published' : 'draft'} /> },
          {
            key: 'actions',
            label: 'Actions',
            render: (r) => (
              <span className="cell-actions">
                <Link to={`/admin/products/${r.id}`}>Edit</Link>
                <button
                  type="button"
                  className="link-btn"
                  onClick={async () => {
                    try {
                      await productsApi.update(r.id, { published: !r.published })
                      push(r.published ? 'Moved to draft' : 'Product is live')
                      refetch()
                    } catch (err) {
                      push(err.message)
                    }
                  }}
                >
                  {r.published ? 'Unpublish' : 'Publish'}
                </button>
                <button
                  type="button"
                  className="link-btn"
                  onClick={async () => {
                    await productsApi.duplicate(r.id)
                    push('Duplicated as a draft')
                    refetch()
                  }}
                >
                  Duplicate
                </button>
              </span>
            ),
          },
        ]}
      />

      <Pagination page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />

      <ConfirmDialog
        open={confirmBulk}
        title={`Delete ${selected.length} product(s)?`}
        message="They will be removed from your storefront and from any collections. This cannot be undone."
        confirmLabel="Delete products"
        busy={busy}
        onCancel={() => setConfirmBulk(false)}
        onConfirm={() => runBulk('delete')}
      />
    </div>
  )
}

const PRODUCT_FIELDS = [
  ['name', 'Product name', { required: true }],
  ['sku', 'SKU'],
  ['price', 'Selling price (₹)', { type: 'number', required: true, min: 1 }],
  ['mrp', 'MRP (₹)', { type: 'number', min: 0 }],
  ['inventory', 'Stock on hand', { type: 'number', min: 0 }],
  ['fabric', 'Fabric', { options: PRODUCT_ATTRIBUTES.fabric }],
  ['weave', 'Weave', { options: PRODUCT_ATTRIBUTES.weave }],
  ['color', 'Primary colour', { options: PRODUCT_ATTRIBUTES.color }],
  ['pattern', 'Pattern', { options: PRODUCT_ATTRIBUTES.pattern }],
  ['occasion', 'Occasion', { options: PRODUCT_ATTRIBUTES.occasion }],
  ['region', 'Region', { options: PRODUCT_ATTRIBUTES.region }],
  ['brand', 'Label'],
]

function ComboField({ label, value = '', options, onChange, error }) {
  const id = useId()
  const listed = options.includes(value)
  return (
    <div className={cx('field combo-field', error && 'field-error')}>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        className="select"
        value={listed ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? 'true' : undefined}
      >
        <option value="">None</option>
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      {!listed ? (
        <input
          className="input"
          value={value}
          placeholder={`Type ${label.toLowerCase()}`}
          onChange={(e) => onChange(e.target.value)}
          aria-label={`Custom ${label}`}
        />
      ) : null}
      {error ? <span className="field-msg" role="alert">{error}</span> : null}
    </div>
  )
}

function emptyProductForm() {
  return {
    name: '',
    sku: '',
    description: '',
    price: '',
    mrp: '',
    inventory: 0,
    fabric: 'Silk',
    weave: '',
    color: '',
    pattern: '',
    occasion: 'Festive',
    region: '',
    brand: '',
    care: '',
    shipping: '',
    returns: '',
    published: false,
    images: [],
  }
}

function validateProductForm(form, tenantId) {
  const errors = {}
  const name = String(form.name || '').trim()
  const price = Number(form.price)
  const mrp = form.mrp === '' || form.mrp == null ? 0 : Number(form.mrp)
  const inventory = Number(form.inventory)
  if (!tenantId) errors.form = 'This account is not linked to a store, so the product cannot be saved.'
  if (!name) errors.name = 'A product name is required.'
  if (!Number.isFinite(price) || price <= 0) errors.price = 'Set a selling price above zero.'
  if (form.mrp !== '' && form.mrp != null && (!Number.isFinite(mrp) || mrp < 0)) errors.mrp = 'MRP must be a number.'
  if (Number.isFinite(price) && Number.isFinite(mrp) && mrp > 0 && mrp < price) {
    errors.mrp = 'MRP cannot be lower than the selling price.'
  }
  if (!Number.isFinite(inventory) || inventory < 0) errors.inventory = 'Stock cannot be negative.'
  const images = []
  ;(form.images || []).forEach((img, i) => {
    const src = String(img?.src || '').trim()
    if (!src) return
    if (!safeImageUrl(src)) errors[`image-${i}`] = 'Use an https:// image address or a /local path.'
    else images.push({ src: safeImageUrl(src), alt: img.alt || name })
  })
  return {
    errors,
    payload: {
      name,
      sku: String(form.sku || '').trim(),
      description: form.description || '',
      price,
      mrp: mrp || price,
      inventory: Number.isFinite(inventory) ? inventory : 0,
      fabric: String(form.fabric || '').trim(),
      weave: String(form.weave || '').trim(),
      color: String(form.color || '').trim(),
      pattern: String(form.pattern || '').trim(),
      occasion: String(form.occasion || '').trim(),
      region: String(form.region || '').trim(),
      brand: String(form.brand || '').trim(),
      care: form.care || '',
      shipping: form.shipping || '',
      returns: form.returns || '',
      tenantId,
      images,
    },
  }
}

export function ProductEditor() {
  const { id } = useParams()
  const { user } = useAuth()
  const { push } = useToast()
  const navigate = useNavigate()
  const isNew = !id || id === 'new'
  const tenantId = user?.tenantId

  const { data, loading, error: loadError } = useAsync(
    () => productsApi.get(id, tenantId),
    [id, tenantId],
    { enabled: Boolean(!isNew && id && tenantId) },
  )
  const product = data?.product
  const [draft, setDraft] = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})

  const form = {
    ...emptyProductForm(),
    ...(product || {}),
    ...(draft || {}),
    images: draft?.images || product?.images || [],
  }
  const set = (key, value) => {
    setFieldErrors((current) => {
      if (!current[key]) return current
      const next = { ...current }
      delete next[key]
      return next
    })
    setDraft({ ...form, [key]: value })
  }

  const { submit, pending, error } = useSubmit(async (publish) => {
    const { errors, payload } = validateProductForm(form, tenantId)
    if (Object.keys(errors).length) {
      setFieldErrors(errors)
      throw new Error(errors.form || 'Fix the highlighted fields, then save again.')
    }
    setFieldErrors({})
    payload.published = publish ?? Boolean(form.published)
    if (isNew) await productsApi.create(payload)
    else await productsApi.update(id, payload)
    push(payload.published ? 'Product published' : 'Product saved')
    navigate('/admin/products')
  })

  if (!tenantId) {
    return (
      <EmptyState
        title="This account is not linked to a store"
        hint="Sign in with a store-owner login before adding products."
      />
    )
  }
  if (loadError) return <ErrorState message={loadError} />
  if (loading) return <p className="muted">Loading product…</p>

  return (
    <div>
      <div className="admin-top">
        <h1>{isNew ? 'New product' : form.name || 'Edit product'}</h1>
        <Link className="btn btn-ghost" to="/admin/products">Back to products</Link>
      </div>

      <div className="editor-grid">
        <form
          className="admin-card"
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            submit(false)
          }}
        >
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="grid-2">
            {PRODUCT_FIELDS.map(([key, label, opts = {}]) => (
              opts.options ? (
                <ComboField
                  key={key}
                  label={label}
                  value={form[key] ?? ''}
                  options={opts.options}
                  error={fieldErrors[key]}
                  onChange={(value) => set(key, value)}
                />
              ) : (
                <Input
                  key={key}
                  label={label}
                  value={form[key] ?? ''}
                  required={opts.required}
                  type={opts.type}
                  min={opts.min}
                  error={fieldErrors[key]}
                  onChange={(e) => set(key, e.target.value)}
                />
              )
            ))}
          </div>
          <Textarea label="Description" rows={5} value={form.description} onChange={(e) => set('description', e.target.value)} />
          <div className="grid-2">
            <Textarea label="Care instructions" rows={3} value={form.care} onChange={(e) => set('care', e.target.value)} />
            <Textarea label="Shipping note" rows={3} value={form.shipping} onChange={(e) => set('shipping', e.target.value)} />
          </div>
          <Toggle
            label="Visible on the storefront"
            hint="Drafts are only visible to your team"
            checked={Boolean(form.published)}
            onChange={(v) => set('published', v)}
          />
          <div className="form-actions">
            <Button type="submit" variant="secondary" loading={pending}>Save draft</Button>
            <Button type="button" loading={pending} onClick={() => submit(true)}>Save & publish</Button>
          </div>
        </form>

        <aside className="admin-card">
          <h3>Images</h3>
          <p className="muted">The first valid image is used on listing pages. Paste an https:// address, or leave a row blank to skip it.</p>
          {(form.images || []).map((img, i) => (
            <div key={`${img.src}-${i}`} className="image-row">
              {safeImageUrl(img.src) ? <img src={safeImageUrl(img.src)} alt="" /> : <span className="image-picker-thumb empty" />}
              <Input
                label={`Image ${i + 1} URL`}
                value={img.src}
                error={fieldErrors[`image-${i}`]}
                placeholder="https://…"
                onChange={(e) => {
                  const next = [...form.images]
                  next[i] = { ...next[i], src: e.target.value }
                  set('images', next)
                }}
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={() => set('images', form.images.filter((_, index) => index !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button variant="ghost" onClick={() => set('images', [...(form.images || []), { src: '', alt: form.name }])}>
            Add image
          </Button>
        </aside>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- categories */

export function CategoriesAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error: loadError, refetch } = useAsync(() => categoriesApi.list(user.tenantId), [user.tenantId])
  const [name, setName] = useState('')
  const [confirming, setConfirming] = useState(null)
  const rows = useMemo(
    () => (data || []).flatMap((c) => [c, ...(c.children || [])]),
    [data],
  )

  const { submit, pending, error } = useSubmit(async () => {
    if (!name.trim()) throw new Error('Enter a category name.')
    await categoriesApi.create({ name, slug: slugify(name), tenantId: user.tenantId })
    push('Category added')
    setName('')
    refetch()
  })

  return (
    <div>
      <div className="admin-top">
        <h1>Categories</h1>
      </div>
      <form
        className="admin-card inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
      >
        <Input label="New category" value={name} error={error} onChange={(e) => setName(e.target.value)} placeholder="Festive silks" />
        <Button type="submit" loading={pending}>Add category</Button>
      </form>

      <DataTable
        loading={loading}
        error={loadError}
        onRetry={refetch}
        rows={rows}
        emptyTitle="No categories yet"
        columns={[
          { key: 'name', label: 'Category', render: (r) => (r.parentId ? `— ${r.name}` : r.name) },
          { key: 'slug', label: 'URL slug' },
          { key: 'published', label: 'Status', render: (r) => <StatusPill status={r.published ? 'published' : 'draft'} /> },
          {
            key: 'actions',
            label: 'Actions',
            render: (r) => (
              <span className="cell-actions">
                <button
                  type="button"
                  className="link-btn"
                  onClick={async () => {
                    await categoriesApi.update(r.id, { published: !r.published })
                    push(r.published ? 'Category hidden' : 'Category shown')
                    refetch()
                  }}
                >
                  {r.published ? 'Hide' : 'Show'}
                </button>
                <button type="button" className="link-btn" onClick={() => setConfirming(r)}>Delete</button>
              </span>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete category?"
        message={`"${confirming?.name}" will be removed from your navigation. Products stay in your catalogue.`}
        confirmLabel="Delete category"
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          await categoriesApi.remove(confirming.id)
          push('Category deleted')
          setConfirming(null)
          refetch()
        }}
      />
    </div>
  )
}

export function CollectionsAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error: loadError, refetch } = useAsync(() => collectionsApi.list(user.tenantId), [user.tenantId])
  const [name, setName] = useState('')

  const { submit, pending, error } = useSubmit(async () => {
    if (!name.trim()) throw new Error('Enter a collection name.')
    await collectionsApi.create({ name, tenantId: user.tenantId })
    push('Collection created')
    setName('')
    refetch()
  })

  return (
    <div>
      <div className="admin-top"><h1>Collections</h1></div>
      <form className="admin-card inline-form" onSubmit={(e) => { e.preventDefault(); submit() }}>
        <Input label="New collection" value={name} error={error} onChange={(e) => setName(e.target.value)} placeholder="Diwali edit" />
        <Button type="submit" loading={pending}>Create</Button>
      </form>
      <DataTable
        loading={loading}
        error={loadError}
        onRetry={refetch}
        rows={data || []}
        emptyTitle="No collections yet"
        columns={[
          { key: 'name', label: 'Collection' },
          { key: 'type', label: 'Type' },
          { key: 'count', label: 'Products', render: (r) => (r.productIds || []).length },
        ]}
      />
    </div>
  )
}

/* ----------------------------------------------------------------- orders */

export function OrdersAdmin() {
  const { user } = useAuth()
  const [status, setStatus] = useState('')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const search = useDebounced(q, 300)
  const { data, loading, error, refetch } = useAsync(
    () => ordersApi.list({ tenantId: user.tenantId, status, q: search, page, limit: PAGE_SIZE }),
    [user.tenantId, status, search, page],
  )

  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Orders</h1>
          <p className="muted">{data?.total ?? 0} orders</p>
        </div>
      </div>
      <DataTable
        loading={loading}
        search={q}
        onSearch={(v) => { setQ(v); setPage(1) }}
        searchPlaceholder="Search order number or customer"
        emptyTitle="No orders yet"
        emptyHint="Orders placed on your storefront appear here in real time."
        actions={
          <Select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1) }}
            aria-label="Filter by status"
            options={[{ value: '', label: 'All statuses' }, ...ORDER_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))]}
          />
        }
        rows={data?.items || []}
        columns={[
          { key: 'number', label: 'Order', render: (r) => <Link to={`/admin/orders/${r.id}`}>{r.number}</Link> },
          { key: 'customerName', label: 'Customer' },
          { key: 'createdAt', label: 'Placed', render: (r) => formatDate(r.createdAt) },
          { key: 'total', label: 'Total', render: (r) => formatCurrency(r.totals?.total) },
          { key: 'status', label: 'Status', render: (r) => <StatusPill status={r.status} /> },
          { key: 'paymentStatus', label: 'Payment' },
        ]}
      />
      <Pagination page={data?.page || 1} pages={data?.pages || 1} onPage={setPage} />
    </div>
  )
}

export function OrderAdminDetail() {
  const { id } = useParams()
  const { push } = useToast()
  const { data, loading, error, refetch } = useAsync(() => ordersApi.get(id), [id])
  const [tracking, setTracking] = useState({ carrier: '', code: '' })

  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (loading) return <p className="muted">Loading order…</p>
  if (!data) return null

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>{data.number}</h1>
          <p className="muted">Placed {formatDate(data.createdAt)} · {data.paymentMethod.toUpperCase()} · {data.paymentStatus}</p>
        </div>
        <Link className="btn btn-ghost" to="/admin/orders">All orders</Link>
      </div>

      <div className="editor-grid">
        <div className="admin-card">
          <h3>Items</h3>
          <ul className="order-lines">
            {data.items.map((item) => (
              <li key={item.productId}>
                {safeImageUrl(item.image) ? <img src={item.image} alt="" loading="lazy" /> : null}
                <span>
                  <strong>{item.name}</strong>
                  <small className="muted">Qty {item.qty} · {formatCurrency(item.price)}</small>
                </span>
                <b>{formatCurrency(item.price * item.qty)}</b>
              </li>
            ))}
          </ul>
          <dl className="totals">
            <div><dt>Subtotal</dt><dd>{formatCurrency(data.totals.subtotal)}</dd></div>
            {data.totals.discount ? <div><dt>Discount</dt><dd>−{formatCurrency(data.totals.discount)}</dd></div> : null}
            <div><dt>Shipping</dt><dd>{data.totals.shipping ? formatCurrency(data.totals.shipping) : 'Free'}</dd></div>
            <div className="grand"><dt>Total</dt><dd>{formatCurrency(data.totals.total)}</dd></div>
          </dl>
        </div>

        <aside className="admin-card">
          <h3>Delivery</h3>
          <address className="muted">
            {data.address.name}<br />
            {data.address.address}{data.address.apartment ? `, ${data.address.apartment}` : ''}<br />
            {data.address.city}, {data.address.state} {data.address.pin}<br />
            {data.address.phone}
          </address>

          <h3>Status</h3>
          <Select
            label="Update status"
            value={data.status}
            onChange={async (e) => {
              await ordersApi.update(id, { status: e.target.value })
              push('Order status updated')
              refetch()
            }}
            options={ORDER_STATUS.map((s) => ({ value: s, label: s.replace(/_/g, ' ') }))}
          />
          <ol className="timeline">
            {data.timeline.map((step, i) => (
              <li key={`${step.status}-${i}`}>
                <strong>{step.status.replace(/_/g, ' ')}</strong>
                <small className="muted">{formatDate(step.at)}</small>
              </li>
            ))}
          </ol>

          <h3>Tracking</h3>
          {data.tracking ? (
            <p className="muted">{data.tracking.carrier} · {data.tracking.code}</p>
          ) : null}
          <Input label="Carrier" value={tracking.carrier} onChange={(e) => setTracking({ ...tracking, carrier: e.target.value })} />
          <Input label="Tracking code" value={tracking.code} onChange={(e) => setTracking({ ...tracking, code: e.target.value })} />
          <Button
            variant="secondary"
            onClick={async () => {
              await ordersApi.update(id, { tracking })
              push('Tracking saved')
              refetch()
            }}
          >
            Save tracking
          </Button>
        </aside>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- customers */

export function CustomersAdmin() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const search = useDebounced(q, 300)
  const { data, loading, error, refetch } = useAsync(
    () => customersApi.list({ tenantId: user.tenantId, q: search }),
    [user.tenantId, search],
  )
  if (error) return <ErrorState message={error} onRetry={refetch} />
  return (
    <div>
      <div className="admin-top"><h1>Customers</h1></div>
      <DataTable
        loading={loading}
        search={q}
        onSearch={setQ}
        searchPlaceholder="Search name or email"
        emptyTitle="No customers yet"
        rows={data?.items || []}
        columns={[
          { key: 'name', label: 'Customer', render: (r) => <Link to={`/admin/customers/${r.id}`}>{r.name}</Link> },
          { key: 'email', label: 'Email' },
          { key: 'phone', label: 'Phone' },
          { key: 'lifetimeValue', label: 'Lifetime value', render: (r) => formatCurrency(r.lifetimeValue) },
          { key: 'ordersCount', label: 'Orders' },
        ]}
      />
    </div>
  )
}

export function CustomerAdminDetail() {
  const { id } = useParams()
  const { data, loading, error, refetch } = useAsync(() => customersApi.get(id), [id])
  if (error) return <ErrorState message={error} onRetry={refetch} />
  if (loading) return <p className="muted">Loading customer…</p>
  if (!data) return null
  return (
    <div>
      <div className="admin-top">
        <h1>{data.name}</h1>
        <Link className="btn btn-ghost" to="/admin/customers">All customers</Link>
      </div>
      <div className="admin-card">
        <p className="muted">{data.email} · {data.phone} · lifetime value {formatCurrency(data.lifetimeValue)}</p>
        <h3>Orders</h3>
        {(data.orders || []).length === 0 ? (
          <p className="muted">No orders yet.</p>
        ) : (
          <ul className="plain-list">
            {data.orders.map((o) => (
              <li key={o.id}>
                <Link to={`/admin/orders/${o.id}`}>{o.number}</Link>
                <span className="muted"> · {formatDate(o.createdAt)} · {formatCurrency(o.totals.total)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- inventory */

export function InventoryAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const [status, setStatus] = useState('')
  const { data, loading, error, refetch } = useAsync(
    () => inventoryApi.list({ tenantId: user.tenantId, status }),
    [user.tenantId, status],
  )
  if (error) return <ErrorState message={error} onRetry={refetch} />
  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Inventory</h1>
          <p className="muted">Update stock counts inline — changes apply to the storefront immediately.</p>
        </div>
      </div>
      <DataTable
        loading={loading}
        emptyTitle="Nothing to restock"
        actions={
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            aria-label="Filter inventory"
            options={[
              { value: '', label: 'All products' },
              { value: 'low', label: 'Low stock (≤5)' },
              { value: 'out', label: 'Out of stock' },
            ]}
          />
        }
        rows={(data || []).map((r) => ({ ...r, id: r.sku }))}
        columns={[
          { key: 'product', label: 'Product' },
          { key: 'sku', label: 'SKU' },
          { key: 'variant', label: 'Variant' },
          { key: 'reserved', label: 'Reserved' },
          { key: 'available', label: 'Available' },
          {
            key: 'stock',
            label: 'Stock',
            render: (r) => (
              <input
                className="input input-inline"
                type="number"
                min="0"
                defaultValue={r.stock}
                aria-label={`Stock for ${r.product}`}
                onBlur={async (e) => {
                  const next = Number(e.target.value)
                  if (next === r.stock) return
                  await inventoryApi.update(r.productId, next)
                  push(`${r.product} stock set to ${next}`)
                  refetch()
                }}
              />
            ),
          },
        ]}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- coupons */

export function CouponsAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error: loadError, refetch } = useAsync(() => couponsApi.list(user.tenantId), [user.tenantId])
  const [form, setForm] = useState({ code: '', type: 'percent', value: 10, minOrder: 4999, maxDiscount: 2000, expiresAt: '' })
  const [confirming, setConfirming] = useState(null)

  const { submit, pending, error } = useSubmit(async () => {
    await couponsApi.create({ ...form, tenantId: user.tenantId })
    push('Coupon created')
    setForm({ code: '', type: 'percent', value: 10, minOrder: 4999, maxDiscount: 2000, expiresAt: '' })
    refetch()
  })

  return (
    <div>
      <div className="admin-top"><h1>Coupons</h1></div>
      <form className="admin-card" onSubmit={(e) => { e.preventDefault(); submit() }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="grid-3">
          <Input label="Code" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="FESTIVE15" />
          <Select label="Type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} options={[{ value: 'percent', label: 'Percentage off' }, { value: 'fixed', label: 'Fixed amount off' }]} />
          <Input label={form.type === 'percent' ? 'Percent off' : 'Amount off (₹)'} type="number" min="1" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })} />
          <Input label="Minimum order (₹)" type="number" min="0" value={form.minOrder} onChange={(e) => setForm({ ...form, minOrder: Number(e.target.value) })} />
          <Input label="Maximum discount (₹)" type="number" min="0" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: Number(e.target.value) })} />
          <Input label="Expires on" type="date" value={form.expiresAt} onChange={(e) => setForm({ ...form, expiresAt: e.target.value })} />
        </div>
        <Button type="submit" loading={pending}>Create coupon</Button>
      </form>

      <DataTable
        loading={loading}
        error={loadError}
        onRetry={refetch}
        rows={data || []}
        emptyTitle="No coupons yet"
        columns={[
          { key: 'code', label: 'Code' },
          { key: 'value', label: 'Discount', render: (r) => (r.type === 'percent' ? `${r.value}%` : formatCurrency(r.value)) },
          { key: 'minOrder', label: 'Minimum order', render: (r) => formatCurrency(r.minOrder) },
          { key: 'used', label: 'Redeemed', render: (r) => `${r.used} / ${r.usageLimit}` },
          { key: 'expiresAt', label: 'Expires', render: (r) => formatDate(r.expiresAt) },
          {
            key: 'actions',
            label: 'Actions',
            render: (r) => <button type="button" className="link-btn" onClick={() => setConfirming(r)}>Delete</button>,
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(confirming)}
        title="Delete coupon?"
        message={`${confirming?.code} will stop working at checkout immediately.`}
        confirmLabel="Delete coupon"
        onCancel={() => setConfirming(null)}
        onConfirm={async () => {
          await couponsApi.remove(confirming.id)
          push('Coupon deleted')
          setConfirming(null)
          refetch()
        }}
      />
    </div>
  )
}

/* ---------------------------------------------------------------- reviews */

export function ReviewsAdmin() {
  const { user } = useAuth()
  const { data, loading, error, refetch } = useAsync(() => reviewsApi.list({ tenantId: user.tenantId }), [user.tenantId])
  if (error) return <ErrorState message={error} onRetry={refetch} />
  return (
    <div>
      <div className="admin-top"><h1>Reviews</h1></div>
      <DataTable
        loading={loading}
        rows={(data || []).map((r, i) => ({ ...r, id: r.id || `rev-${i}` }))}
        emptyTitle="No reviews yet"
        emptyHint="Reviews left by verified buyers appear here."
        columns={[
          { key: 'author', label: 'Author' },
          { key: 'rating', label: 'Rating', render: (r) => <Rating value={r.rating} /> },
          { key: 'title', label: 'Title' },
          { key: 'body', label: 'Review', render: (r) => <span className="clamp-2">{r.body}</span> },
          { key: 'verified', label: 'Verified', render: (r) => (r.verified ? 'Verified buyer' : '—') },
          { key: 'createdAt', label: 'Date', render: (r) => formatDate(r.createdAt) },
        ]}
      />
    </div>
  )
}

/* ------------------------------------------------------------------- team */

const ASSIGNABLE_ROLES = [
  { value: ROLES.STORE_ADMIN, label: 'Store admin — everything except billing' },
  { value: ROLES.STORE_MANAGER, label: 'Manager — products, orders, customers' },
  { value: ROLES.CONTENT_MANAGER, label: 'Content — banners, appearance, categories' },
  { value: ROLES.INVENTORY_MANAGER, label: 'Inventory — stock and products' },
]

export function TeamAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data, loading, error, refetch } = useAsync(() => staffApi.list(user.tenantId), [user.tenantId])
  if (error) return <ErrorState message={error} onRetry={refetch} />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Team</h1>
          <p className="muted">Give each colleague only the access they need. Changing a role signs that person out of their current session.</p>
        </div>
      </div>
      <DataTable
        loading={loading}
        rows={data || []}
        emptyTitle="No team members yet"
        columns={[
          { key: 'name', label: 'Name' },
          { key: 'email', label: 'Email' },
          {
            key: 'role',
            label: 'Role',
            render: (r) =>
              r.role === ROLES.STORE_OWNER ? (
                <span className="muted">Owner</span>
              ) : (
                <Select
                  value={r.role}
                  aria-label={`Role for ${r.name}`}
                  onChange={async (e) => {
                    try {
                      await staffApi.updateRole(r.id, e.target.value)
                      push(`${r.name} is now a ${e.target.value.replace(/_/g, ' ')}`)
                      refetch()
                    } catch (err) {
                      push(err.message)
                    }
                  }}
                  options={ASSIGNABLE_ROLES}
                />
              ),
          },
        ]}
      />
    </div>
  )
}

/* --------------------------------------------------------------- settings */

export function StoreSettingsAdmin() {
  const { user } = useAuth()
  const { push } = useToast()
  const { data: store, loading, error: loadError, refetch } = useAsync(() => storesApi.get(user.tenantId), [user.tenantId])
  const [draft, setDraft] = useState(null)

  const form = draft || {
    name: store?.name || '',
    tagline: store?.tagline || '',
    announcement: store?.announcement || '',
    email: store?.email || '',
    phone: store?.phone || '',
    address: store?.address || '',
    city: store?.city || '',
    supportEmail: store?.settings?.supportEmail || '',
    supportPhone: store?.settings?.supportPhone || '',
    locale: store?.settings?.locale || 'en',
  }
  const set = (key, value) => setDraft({ ...form, [key]: value })

  const { submit, pending, error } = useSubmit(async () => {
    if (!form.name.trim()) throw new Error('Your store needs a name.')
    if (!isEmail(form.email)) throw new Error('Enter a valid contact email.')
    if (form.phone && !isPhone(form.phone)) throw new Error('Enter a valid phone number.')
    if (form.supportEmail && !isEmail(form.supportEmail)) throw new Error('Enter a valid support email.')
    await storesApi.update(user.tenantId, {
      name: form.name,
      tagline: form.tagline,
      announcement: form.announcement,
      email: form.email,
      phone: form.phone,
      address: form.address,
      city: form.city,
      branding: { name: form.name, tagline: form.tagline },
      settings: { supportEmail: form.supportEmail, supportPhone: form.supportPhone, locale: form.locale },
    })
    push('Settings saved')
    refetch()
  })

  if (loadError) return <ErrorState message={loadError} onRetry={refetch} />
  if (loading) return <p className="muted">Loading settings…</p>
  if (!store) return <EmptyState title="Store not found" hint="Sign in again to reload your storefront." />

  return (
    <div>
      <div className="admin-top">
        <div>
          <h1>Store settings</h1>
          <p className="muted">Your storefront lives at /store/{store.slug}. Domain and plan changes are handled by the platform team.</p>
        </div>
      </div>

      <form className="admin-card" style={{ maxWidth: 820 }} onSubmit={(e) => { e.preventDefault(); submit() }}>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="grid-2">
          <Input label="Store name" required value={form.name} onChange={(e) => set('name', e.target.value)} />
          <Input label="Tagline" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} />
          <Input label="Contact email" required type="email" value={form.email} onChange={(e) => set('email', e.target.value)} />
          <Input label="Contact phone" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
          <Input label="Support email" type="email" value={form.supportEmail} onChange={(e) => set('supportEmail', e.target.value)} />
          <Input label="Support phone" value={form.supportPhone} onChange={(e) => set('supportPhone', e.target.value)} />
          <Input label="City" value={form.city} onChange={(e) => set('city', e.target.value)} />
          <Select label="Storefront language" value={form.locale} onChange={(e) => set('locale', e.target.value)} options={[{ value: 'en', label: 'English' }, { value: 'hi', label: 'हिन्दी' }]} />
        </div>
        <Textarea label="Address" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} />
        <Input
          label="Announcement bar"
          hint="Shown above the header on every page"
          value={form.announcement}
          onChange={(e) => set('announcement', e.target.value)}
        />
        <div className="form-actions">
          <Button type="submit" loading={pending}>Save settings</Button>
        </div>
      </form>

      <div className="admin-card" style={{ maxWidth: 820 }}>
        <h3>Plan & domain</h3>
        <p className="muted">
          Plan: <strong>{store.subscription}</strong> · Custom domain: <strong>{store.domain}</strong> · Status: <strong>{store.status}</strong>
        </p>
        <p className="muted">Contact the platform team to change your plan, domain, or storefront slug.</p>
      </div>
    </div>
  )
}
