import { useMemo } from 'react'
import { useTenant } from '../../context/TenantContext.jsx'
import { productsApi } from '../../services/api/products.js'
import { useAsync } from '../../hooks/index.js'
import { HomepageRenderer } from '../../components/commerce/HomepageRenderer.jsx'
import { Skeleton, ErrorState } from '../../components/common/index.jsx'

export default function StoreHome() {
  const { tenant, homepage, banners, categories, collections, testimonials, instagram, basePath } = useTenant()
  const list = collections || []
  const ids = useMemo(
    () => [...new Set(list.flatMap((c) => c.productIds || []))].join(','),
    [list],
  )

  const { data, loading, error, refetch } = useAsync(
    () => productsApi.list({ tenantId: tenant.id, limit: 60, published: 'true', sort: 'newest' }),
    [tenant.id],
    { enabled: Boolean(tenant.id) },
  )
  const { data: curated } = useAsync(
    () => productsApi.list({ tenantId: tenant.id, ids, limit: 60, published: 'true' }),
    [tenant.id, ids],
    { enabled: Boolean(tenant.id && ids) },
  )
  const { data: facets } = useAsync(
    () => productsApi.facets(tenant.id),
    [tenant.id],
    { enabled: Boolean(tenant.id) },
  )

  const latestProducts = Array.isArray(data?.items) ? data.items : []
  const curatedItems = Array.isArray(curated?.items) ? curated.items : []
  const productsByCollection = useMemo(() => {
    const byId = new Map()
    latestProducts.forEach((p) => byId.set(p.id, p))
    curatedItems.forEach((p) => byId.set(p.id, p))
    const map = {}
    list.forEach((col) => {
      map[col.id] = (col.productIds || []).map((id) => byId.get(id)).filter(Boolean)
    })
    return map
  }, [list, latestProducts, curatedItems])

  if (error) return <ErrorState message={error} onRetry={refetch} />

  if (loading && !latestProducts.length) {
    return (
      <div style={{ display: 'grid', gap: 24 }}>
        <Skeleton height={520} />
        <div className="container" style={{ display: 'grid', gap: 16 }}>
          <Skeleton height={260} count={2} radius={2} />
        </div>
      </div>
    )
  }

  return (
    <HomepageRenderer
      homepage={homepage}
      banners={banners}
      categories={categories}
      collections={list}
      productsByCollection={productsByCollection}
      latestProducts={latestProducts}
      facets={facets}
      base={basePath}
      testimonials={testimonials}
      instagram={instagram}
    />
  )
}
