import { sql } from '../db/sql.js'
import { notFound } from '../lib/errors.js'
import { cached, invalidate, tags } from '../lib/cache.js'
import { privateCache, sendRaw } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'

/*
 * Dashboards are read often and tolerate being a minute stale, which is exactly
 * the shape that caching suits. The monthly series comes from the daily_stats
 * rollup rather than from a scan of the orders table, so the query cost does
 * not grow with order volume.
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

async function monthlySeries(tenantId) {
  const rows = await sql`
    select
      date_trunc('month', day) as month,
      sum(orders)::int as orders,
      sum(gmv) as gmv
    from daily_stats
    where day >= date_trunc('month', current_date) - interval '6 months'
      ${tenantId ? sql`and tenant_id = ${tenantId}` : sql``}
    group by 1
    order by 1
  `
  return rows.map((row) => ({
    label: MONTHS[new Date(row.month).getMonth()],
    gmv: Number(row.gmv),
    orders: row.orders,
  }))
}

export default async function analyticsRoutes(app) {
  /* ------------------------------------------------------------ platform */
  app.get('/analytics/platform', async (request, reply) => {
    app.requireSuperAdmin(request)

    const body = await cached(
      'analytics:platform',
      [tags.storeList()],
      async () => {
        const [[totals], [products], [customers], series] = await Promise.all([
          sql`
            select
              count(*)::int as stores,
              count(*) filter (where status = 'active')::int as "activeStores",
              coalesce(sum(gmv), 0) as gmv,
              coalesce(sum(orders_count), 0)::int as orders
            from stores
          `,
          sql`select count(*)::int as products from products`,
          sql`select count(*)::int as customers from customers`,
          monthlySeries(null),
        ])

        return JSON.stringify({
          ...totals,
          gmv: Number(totals.gmv),
          products: products.products,
          customers: customers.customers,
          // Platform revenue is the commission taken on gross merchandise value.
          revenue: Math.round(Number(totals.gmv) * 0.18),
          conversion: 2.8,
          series,
        })
      },
      60_000,
    )

    privateCache(reply)
    return sendRaw(reply, body)
  })

  /* --------------------------------------------------------------- store */
  app.get('/analytics/store', async (request, reply) => {
    const { tenantId } = app.requireTenant(request, 'store.dashboard', clean.text(request.query.tenantId, 60))

    const body = await cached(
      `analytics:store:${tenantId}`,
      [tags.store(tenantId), tags.products(tenantId)],
      async () => {
        const [[store], [stock], [orderStats], [topProducts], [recentOrders], series] = await Promise.all([
          sql`
            select gmv, orders_count, customers_count from stores where id = ${tenantId} limit 1
          `,
          sql`
            select
              count(*)::int as products,
              count(*) filter (where published)::int as "publishedProducts",
              coalesce(sum(inventory), 0)::int as inventory,
              count(*) filter (where inventory > 0 and inventory <= 5)::int as "lowStock",
              count(*) filter (where inventory <= 0)::int as "outOfStock"
            from products where tenant_id = ${tenantId}
          `,
          sql`
            select
              count(*)::int as orders,
              coalesce(sum(total), 0) as sales,
              count(*) filter (where status = 'placed')::int as "awaitingAction"
            from orders where tenant_id = ${tenantId}
          `,
          sql`
            select coalesce(jsonb_agg(jsonb_build_object('name', name, 'value', value) order by value desc), '[]')::text as payload
            from (
              select name, sold_count as value
              from products
              where tenant_id = ${tenantId}
              order by sold_count desc, rating desc
              limit 5
            ) as ranked
          `,
          sql`
            select coalesce(jsonb_agg(jsonb_build_object(
              'id', id, 'number', number, 'customerName', customer_name, 'status', status,
              'paymentStatus', payment_status, 'totals', totals, 'createdAt', created_at
            ) order by created_at desc), '[]')::text as payload
            from (select * from orders where tenant_id = ${tenantId} order by created_at desc limit 6) as recent
          `,
          monthlySeries(tenantId),
        ])

        const sales = Number(orderStats.sales) || Number(store?.gmv || 0)
        return [
          '{"sales":', sales,
          ',"revenue":', Math.round(sales * 0.82),
          ',"orders":', orderStats.orders || store?.orders_count || 0,
          ',"awaitingAction":', orderStats.awaitingAction,
          ',"products":', stock.products,
          ',"publishedProducts":', stock.publishedProducts,
          ',"customers":', store?.customers_count || 0,
          ',"inventory":', stock.inventory,
          ',"lowStock":', stock.lowStock,
          ',"outOfStock":', stock.outOfStock,
          ',"series":', JSON.stringify(series),
          ',"topProducts":', topProducts.payload,
          ',"recentOrders":', recentOrders.payload,
          '}',
        ].join('')
      },
      30_000,
    )

    privateCache(reply)
    return sendRaw(reply, body)
  })

  /* ---------------------------------------------------------- inventory */
  app.get('/inventory', async (request, reply) => {
    const { tenantId } = app.requireTenant(request, 'store.inventory', clean.text(request.query.tenantId, 60))
    const status = clean.text(request.query.status, 10)

    privateCache(reply)
    return sql`
      select
        sku, name as product, coalesce(nullif(color, ''), '—') as variant,
        inventory as stock, reserved,
        greatest(0, inventory - reserved) as available,
        id as "productId", fabric as category
      from products
      where tenant_id = ${tenantId}
        ${status === 'low' ? sql`and inventory > 0 and inventory <= 5` : sql``}
        ${status === 'out' ? sql`and inventory <= 0` : sql``}
      order by inventory asc, name
      limit 500
    `
  })

  app.patch('/inventory/:productId', async (request) => {
    const body = request.body || {}
    const [existing] = await sql`
      select tenant_id from products where id = ${request.params.productId} limit 1
    `
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.inventory', existing.tenant_id)

    const inventory = clean.integer(body.inventory, { max: 100000 })
    const [updated] = await sql`
      update products set
        inventory = ${inventory},
        payload = jsonb_set(payload, '{inventory}', to_jsonb(${inventory}::int)),
        updated_at = now()
      where id = ${request.params.productId}
      returning id, inventory
    `

    await invalidate(tags.products(existing.tenant_id), `product:${request.params.productId}`)
    return { ok: true, productId: updated.id, inventory: updated.inventory }
  })
}
