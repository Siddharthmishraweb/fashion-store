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

function rate(part, whole) {
  const den = Number(whole)
  if (!den) return 0
  return Math.round((Number(part) / den) * 1000) / 10
}

async function monthlySeries(tenantId) {
  const rows = await sql`
    select
      date_trunc('month', day) as month,
      sum(orders)::int as orders,
      sum(gmv) as gmv,
      sum(net_profit) as "netProfit"
    from daily_stats
    where day >= date_trunc('month', current_date) - interval '6 months'
      ${tenantId ? sql`and tenant_id = ${tenantId}` : sql``}
    group by 1
    order by 1
  `
  const byMonth = new Map(rows.map((row) => {
    const date = new Date(row.month)
    return [`${date.getFullYear()}-${date.getMonth()}`, {
      gmv: Number(row.gmv) || 0,
      orders: row.orders || 0,
      netProfit: Number(row.netProfit) || 0,
    }]
  }))
  const now = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (6 - index), 1)
    const stats = byMonth.get(`${date.getFullYear()}-${date.getMonth()}`) || { gmv: 0, orders: 0, netProfit: 0 }
    return { label: MONTHS[date.getMonth()], ...stats }
  })
}

export default async function analyticsRoutes(app) {
  /* ------------------------------------------------------------ platform */
  app.get('/analytics/platform', async (request, reply) => {
    app.requireSuperAdmin(request)

    const body = await cached(
      'analytics:platform:v2',
      [tags.storeList()],
      async () => {
        const [[totals], [products], [customers], [profit], shops, series] = await Promise.all([
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
          sql`
            select coalesce(sum(net_profit), 0) as "netProfit"
            from orders
            where status not in ('cancelled', 'returned', 'refunded')
          `,
          sql`
            select
              s.id, s.slug, s.name, s.city, s.status, s.gmv, s.orders_count as "ordersCount",
              coalesce((
                select sum(o.net_profit) from orders o
                where o.tenant_id = s.id and o.status not in ('cancelled', 'returned', 'refunded')
              ), 0) as "netProfit"
            from stores s
            order by s.gmv desc, s.name
          `,
          monthlySeries(null),
        ])

        const gmv = Number(totals.gmv) || 0
        const netProfit = Number(profit.netProfit) || 0
        return JSON.stringify({
          ...totals,
          gmv,
          products: products.products,
          customers: customers.customers,
          revenue: gmv,
          netProfit,
          netIncome: netProfit,
          conversion: 2.8,
          shops: shops.map((shop) => ({
            ...shop,
            gmv: Number(shop.gmv) || 0,
            netProfit: Number(shop.netProfit) || 0,
          })),
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
      `analytics:store:v3:${tenantId}`,
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
              coalesce(sum(net_profit) filter (where status not in ('cancelled', 'returned', 'refunded')), 0) as "netProfit",
              count(*) filter (where status = 'placed')::int as "awaitingAction",
              count(*) filter (where status in ('cancelled', 'returned', 'refunded'))::int as lost
            from orders where tenant_id = ${tenantId}
          `,
          sql`
            select coalesce(jsonb_agg(jsonb_build_object(
              'name', name, 'sold', sold, 'reviews', reviews
            ) order by sold desc, reviews desc), '[]')::text as payload
            from (
              select name, sold_count as sold, review_count as reviews
              from products
              where tenant_id = ${tenantId}
              order by sold_count desc, review_count desc, rating desc
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
        const netProfit = Number(orderStats.netProfit) || 0
        const orders = orderStats.orders || store?.orders_count || 0
        const customers = store?.customers_count || 0
        const conversion = customers > 0 ? rate(orders, customers) : (orders > 0 ? 100 : 0)
        const abandonment = rate(orderStats.lost, orders)
        return [
          '{"sales":', sales,
          ',"revenue":', netProfit,
          ',"netProfit":', netProfit,
          ',"orders":', orders,
          ',"awaitingAction":', orderStats.awaitingAction,
          ',"products":', stock.products,
          ',"publishedProducts":', stock.publishedProducts,
          ',"customers":', customers,
          ',"inventory":', stock.inventory,
          ',"lowStock":', stock.lowStock,
          ',"outOfStock":', stock.outOfStock,
          ',"conversion":', conversion,
          ',"abandonment":', abandonment,
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
