import { sql } from '../db/sql.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import { privateCache } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'

/*
 * Coupons. The public endpoint is /coupons/validate, which quotes a discount
 * for a cart. It deliberately does not reserve anything: the binding decision
 * is made again inside the checkout transaction, so a quote going stale between
 * the cart and the order cannot over-discount.
 */

const couponSelect = sql`
  id, tenant_id as "tenantId", code, type, value, min_order as "minOrder",
  max_discount as "maxDiscount", first_order as "firstOrder",
  usage_limit as "usageLimit", used, expires_at as "expiresAt",
  product_ids as "productIds", category_ids as "categoryIds"
`

export default async function couponRoutes(app) {
  app.get('/coupons', async (request, reply) => {
    const { tenantId } = app.requireTenant(request, 'store.coupons', clean.text(request.query.tenantId, 60))
    privateCache(reply)
    return sql`select ${couponSelect} from coupons where tenant_id = ${tenantId} order by created_at desc`
  })

  app.post('/coupons', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.coupons', clean.text(body.tenantId, 60))

    const code = clean.text(body.code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (code.length < 4) throw badRequest('Use at least 4 letters or numbers for the code.')

    const type = clean.oneOf(body.type, ['percent', 'fixed'], 'percent')
    const value = clean.number(body.value, { min: 1, max: type === 'percent' ? 90 : 100000 })

    const [coupon] = await sql`
      insert into coupons (
        id, tenant_id, code, type, value, min_order, max_discount,
        first_order, usage_limit, expires_at
      ) values (
        ${newId('cpn')}, ${tenantId}, ${code}, ${type}, ${value},
        ${clean.number(body.minOrder, { max: 1000000 })},
        ${clean.number(body.maxDiscount, { max: 1000000 })},
        ${clean.bool(body.firstOrder)},
        ${clean.integer(body.usageLimit ?? 1000, { min: 1, max: 1000000 })},
        ${clean.dateOnly(body.expiresAt) || null}
      )
      on conflict (tenant_id, code) do nothing
      returning ${couponSelect}
    `
    if (!coupon) throw conflict('That coupon code already exists.')

    privateCache(reply)
    reply.code(201)
    return coupon
  })

  app.delete('/coupons/:id', async (request) => {
    const [existing] = await sql`select tenant_id from coupons where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.coupons', existing.tenant_id)

    await sql`delete from coupons where id = ${request.params.id}`
    return { ok: true }
  })

  app.post('/coupons/validate', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const body = request.body || {}
    const tenantId = clean.text(body.tenantId, 60)
    const code = clean.text(body.code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '')
    const subtotal = clean.number(body.subtotal, { max: 10000000 })
    if (!tenantId || !code) throw badRequest('Enter a coupon code.')

    const [coupon] = await sql`
      select ${couponSelect} from coupons where tenant_id = ${tenantId} and code = ${code} limit 1
    `
    // Same message for "no such code" and "not for this store" so codes from
    // one storefront cannot be probed against another.
    if (!coupon) throw badRequest('That code is not valid for this store.')
    if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date(new Date().toDateString())) {
      throw badRequest('That code has expired.')
    }
    if (coupon.usageLimit && coupon.used >= coupon.usageLimit) {
      throw badRequest('That code has been fully redeemed.')
    }

    const minOrder = Number(coupon.minOrder)
    if (subtotal < minOrder) {
      throw badRequest(`Add ₹${(minOrder - subtotal).toLocaleString('en-IN')} more to use this code.`)
    }

    const value = Number(coupon.value)
    const max = Number(coupon.maxDiscount)
    const discount = coupon.type === 'percent'
      ? Math.min(Math.round((subtotal * value) / 100), max > 0 ? max : Infinity)
      : Math.min(value, subtotal)

    privateCache(reply)
    return { coupon: { code: coupon.code, type: coupon.type, value }, discount }
  })
}
