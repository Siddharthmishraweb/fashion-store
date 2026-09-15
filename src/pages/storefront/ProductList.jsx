import { useState } from 'react'
import { Link, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { useTenant } from '../../context/TenantContext.jsx'
import { productsApi } from '../../services/api/products.js'
import { useAsync, useMedia } from '../../hooks/index.js'
import { ProductGrid } from '../../components/commerce/ProductCard.jsx'
import {
  Breadcrumb,
  Button,
  Drawer,
  EmptyState,
  ErrorState,
  Input,
  Modal,
  OptimizedImage,
  Pagination,
  Rating,
  Select,
  Seo,
  Skeleton,
} from '../../components/common/index.jsx'
import { useCart } from '../../context/CommerceContext.jsx'
import { formatCurrency } from '../../utils/index.js'

const FACET_GROUPS = [
  ['fabric', 'Fabric'],
  ['weave', 'Weave'],
  ['occasion', 'Occasion'],
  ['color', 'Colour'],
  ['region', 'Region'],
  ['pattern', 'Pattern'],
]

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'discount', label: 'Biggest discount' },
  { value: 'rating', label: 'Best rated' },
  { value: 'name', label: 'Name A–Z' },
]

function titleFor(mode, category, query) {
  if (mode === 'search') return query ? `Results for “${query}”` : 'Search'
  if (mode === 'all' || !category) return 'All weaves'
  return category.replace(/-/g, ' ')
}

export default function ProductListPage({ mode = 'category' }) {
  const { category } = useParams()
  const [params, setParams] = useSearchParams()
  const { tenant } = useTenant()
  const { add } = useCart()
  const ctx = useOutletContext()
  const [quick, setQuick] = useState(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const isDesktop = useMedia('(min-width: 1024px)')

  const page = Math.max(1, Number(params.get('page') || 1))
  const searchTerm = params.get('q') || ''

  const query = {
    tenantId: tenant.id,
    published: 'true',
    page,
    limit: 12,
    q: searchTerm,
    sort: params.get('sort') || 'newest',
    minPrice: params.get('minPrice') || '',
    maxPrice: params.get('maxPrice') || '',
    availability: params.get('availability') || '',
  }
  if (mode === 'category' && category) query.category = category
  FACET_GROUPS.forEach(([key]) => {
    const values = params.getAll(key)
    if (values.length) query[key] = values
  })

  const { data, loading, error, refetch } = useAsync(
    () => productsApi.list(query),
    [tenant.id, params.toString(), category, mode],
  )
  const { data: facets } = useAsync(() => productsApi.facets(tenant.id), [tenant.id])

  const title = titleFor(mode, category, searchTerm)
  const base = `/store/${tenant.slug}`

  const update = (mutator, { resetPage = true } = {}) => {
    const next = new URLSearchParams(params)
    mutator(next)
    if (resetPage) next.delete('page')
    setParams(next, { replace: true })
  }

  const setSingle = (key, value) => update((next) => {
    if (value) next.set(key, value)
    else next.delete(key)
  })

  const toggleFacet = (key, value) => update((next) => {
    const current = next.getAll(key)
    next.delete(key)
    const updated = current.includes(value) ? current.filter((v) => v !== value) : [...current, value]
    updated.forEach((v) => next.append(key, v))
  })

  const activeChips = []
  FACET_GROUPS.forEach(([key, label]) => {
    params.getAll(key).forEach((value) => activeChips.push({ key, value, label: `${label}: ${value}` }))
  })
  if (params.get('minPrice') || params.get('maxPrice')) {
    activeChips.push({
      key: 'price',
      label: `₹${params.get('minPrice') || 0}–₹${params.get('maxPrice') || '∞'}`,
    })
  }
  if (params.get('availability')) activeChips.push({ key: 'availability', label: 'In stock only' })

  const removeChip = (chip) => update((next) => {
    if (chip.key === 'price') {
      next.delete('minPrice')
      next.delete('maxPrice')
    } else if (chip.value) {
      const rest = next.getAll(chip.key).filter((v) => v !== chip.value)
      next.delete(chip.key)
      rest.forEach((v) => next.append(chip.key, v))
    } else {
      next.delete(chip.key)
    }
  })

  const filterPanel = (
    <div className="filters">
      <div className="filter-group">
        <h3>Price</h3>
        <div className="price-inputs">
          <Input
            type="number"
            min="0"
            label="Min"
            value={params.get('minPrice') || ''}
            onChange={(e) => setSingle('minPrice', e.target.value)}
          />
          <Input
            type="number"
            min="0"
            label="Max"
            value={params.get('maxPrice') || ''}
            onChange={(e) => setSingle('maxPrice', e.target.value)}
          />
        </div>
        {facets?.priceRange?.[1] ? (
          <p className="caption">Catalogue range {formatCurrency(facets.priceRange[0])} – {formatCurrency(facets.priceRange[1])}</p>
        ) : null}
      </div>

      <div className="filter-group">
        <h3>Availability</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={params.get('availability') === 'in_stock'}
            onChange={(e) => setSingle('availability', e.target.checked ? 'in_stock' : '')}
          />
          In stock only
        </label>
      </div>

      {FACET_GROUPS.map(([key, label]) => {
        const values = facets?.[key] || []
        if (!values.length) return null
        const selected = params.getAll(key)
        return (
          <details className="filter-group" key={key} open={selected.length > 0}>
            <summary><h3>{label}</h3></summary>
            <div className="check-list">
              {values.map((value) => (
                <label className="check" key={value}>
                  <input type="checkbox" checked={selected.includes(value)} onChange={() => toggleFacet(key, value)} />
                  {value}
                </label>
              ))}
            </div>
          </details>
        )
      })}
    </div>
  )

  return (
    <div className="container plp-page">
      <Seo
        title={`${title} · ${tenant.name}`}
        description={`Browse ${title.toLowerCase()} at ${tenant.name}. ${data?.total || 0} handpicked weaves with pan-India shipping.`}
        canonical={`${window.location.origin}${base}${category ? `/category/${category}` : '/products'}`}
        noindex={mode === 'search'}
      />

      <Breadcrumb
        items={[
          { label: tenant.name, href: base },
          ...(mode === 'search' ? [{ label: 'Search' }] : [{ label: 'Shop', href: `${base}/products` }, { label: title }]),
        ]}
      />

      <div className="plp-head">
        <div>
          <h1>{title}</h1>
          <p className="muted">{loading ? 'Loading…' : `${data?.total || 0} weaves`}</p>
        </div>
        <div className="plp-controls">
          <Select
            aria-label="Sort products"
            value={params.get('sort') || 'newest'}
            onChange={(e) => setSingle('sort', e.target.value)}
            options={SORTS}
          />
          {!isDesktop ? (
            <Button variant="ghost" onClick={() => setFiltersOpen(true)}>
              Filters{activeChips.length ? ` (${activeChips.length})` : ''}
            </Button>
          ) : null}
        </div>
      </div>

      {activeChips.length ? (
        <div className="chips">
          {activeChips.map((chip) => (
            <button type="button" key={`${chip.key}-${chip.value || 'x'}`} className="chip" onClick={() => removeChip(chip)}>
              {chip.label} <span aria-hidden="true">×</span>
              <span className="sr-only">Remove filter</span>
            </button>
          ))}
          <button type="button" className="link-btn" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            Clear all
          </button>
        </div>
      ) : null}

      <div className="plp">
        {isDesktop ? <aside aria-label="Filters">{filterPanel}</aside> : null}

        <div>
          {loading ? (
            <div className="product-grid"><Skeleton count={8} height={340} radius={2} /></div>
          ) : error ? (
            <ErrorState message={error} onRetry={refetch} />
          ) : data?.items?.length ? (
            <>
              <ProductGrid
                products={data.items}
                base={base}
                onQuickView={setQuick}
                onQuickAdd={(p) => {
                  add(p)
                  ctx?.openCart?.()
                }}
              />
              <Pagination
                page={data.page}
                pages={data.pages}
                onPage={(p) => update((next) => next.set('page', String(p)), { resetPage: false })}
              />
            </>
          ) : (
            <EmptyState
              title="Nothing matches those filters"
              hint="Try removing a filter, or browse the full collection."
              action={<Link className="btn" to={`${base}/products`}>View all weaves</Link>}
            />
          )}
        </div>
      </div>

      <Drawer
        open={filtersOpen}
        side="left"
        title="Filter"
        onClose={() => setFiltersOpen(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear all</Button>
            <Button onClick={() => setFiltersOpen(false)}>Show {data?.total || 0} results</Button>
          </>
        }
      >
        {filterPanel}
      </Drawer>

      <Modal open={Boolean(quick)} title={quick?.name} onClose={() => setQuick(null)} size="lg">
        {quick ? (
          <div className="quickview">
            <OptimizedImage src={quick.images?.[0]?.src} alt={quick.name} sizes="(max-width: 700px) 90vw, 320px" />
            <div>
              <p className="caption">{quick.brand}</p>
              <p className="price"><b>{formatCurrency(quick.price)}</b>{quick.mrp > quick.price ? <s>{formatCurrency(quick.mrp)}</s> : null}</p>
              <Rating value={quick.rating} count={quick.reviewCount} />
              <p className="muted">{quick.description}</p>
              <div className="quickview-actions">
                <Button
                  disabled={quick.inventory <= 0}
                  onClick={() => {
                    add(quick)
                    setQuick(null)
                    ctx?.openCart?.()
                  }}
                >
                  {quick.inventory <= 0 ? 'Sold out' : 'Add to bag'}
                </Button>
                <Link className="btn btn-ghost" to={`${base}/product/${quick.slug}`} onClick={() => setQuick(null)}>
                  Full details
                </Link>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
