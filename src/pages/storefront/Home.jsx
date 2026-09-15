import { useMemo } from 'react'
import { useTenant } from '../../context/TenantContext.jsx'
import { productsApi } from '../../services/api/products.js'
import { useAsync } from '../../hooks/index.js'
import { HomepageRenderer } from '../../components/commerce/HomepageRenderer.jsx'
import { Skeleton } from '../../components/common/index.jsx'

export default function StoreHome() {
  const { tenant, homepage, banners, categories, collections, testimonials, instagram } = useTenant()
  const list = collections || []
  const ids = useMemo(
    () => [...new Set(list.flatMap((c) => c.productIds || []))].join(','),
    [list],
  )

  const { data, loading } = useAsync(
    () => (ids ? productsApi.list({ tenantId: tenant.id, ids, limit: 60, published: 'true' }) : Promise.resolve({ items: [] })),
    [tenant.id, ids],
  )
  const { data: facets } = useAsync(() => productsApi.facets(tenant.id), [tenant.id])

  const products = data?.items || []
  const productsByCollection = useMemo(() => {
    const map = {}
    list.forEach((col) => {
      map[col.id] = products.filter((p) => (col.productIds || []).includes(p.id))
    })
    return map
  }, [list, products])

  if (loading && !products.length) {
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
      facets={facets}
      base={`/store/${tenant.slug}`}
      testimonials={testimonials}
      instagram={instagram}
    />
  )
}
