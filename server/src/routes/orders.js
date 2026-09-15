import { config } from '../config/env.js'
import { sql } from '../db/sql.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import { invalidate, tags } from '../lib/cache.js'
import { pageOf, privateCache, readPaging, sendRaw } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { hasPermission, ORDER_STATUS, TERMINAL_STATUS } from '../domain/roles.js'

/*
 * Checkout is the one place where getting it wrong costs real money, so nothing
 * the client sends about price, stock, or discount is believed:
 *
 * - Every line is re-priced from the products table inside the transaction.
 * - Stock is decremented with a conditional UPDATE, so two shoppers racing for
 *   the last piece cannot both succeed.
 * - The coupon is re-evaluated and its usage counter is incremented under the
 *   same lock, which is what stops a single-use code being redeemed twice.
 * - Totals are recomputed and stored; the client's arithmetic is ignored.
 */

const orderPayload = sql`
  jsonb_build_object(
    'id', id, 'number', number, 'tenantId', tenant_id, 'customerId', customer_id,
    'customerName', customer_name, 'customerEmail', customer_email,
    'status', status, 'paymentStatus', payment_status, 'paymentMethod', payment_method,
    'items', items, 'address', address, 'totals', totals, 'timeline', timeline,
    'tracking', tracking, 'note', note, 'createdAt', created_at
  )::text as payload
`

function validateAddress(address) {
  const fields = [
    ['name', 'name'],
    ['phone', 'phone number'],
    ['address', 'street address'],
    ['city', 'city'],
    ['state', 'state'],
    ['pin', 'PIN code'],
  ]
  for (const [field, label] of fields) {
    if (!clean.text(address?.[field], 200)) throw badRequest(`Please add a delivery ${label}.`)
  }
  if (!clean.isPhone(address.phone)) throw badRequest('That delivery phone number looks incorrect.')
  if (!clean.isPin(address.pin)) throw badRequest('That PIN code looks incorrect.')

  return {
    name: clean.text(address.name, 80),
    phone: clean.text(address.phone, 20),
    address: clean.text(address.address, 200),
    apartment: clean.text(address.apartment, 120),
    city: clean.text(address.city, 60),
    state: clean.text(address.state, 60),
    pin: clean.text(address.pin, 10),
  }
}

export default async function orderRoutes(app) {
  /* --------------------------------------------------------------- list */
  app.get('/orders', async (request, reply) => {
    const auth = app.requireUser(request)
    const { page, limit, offset } = readPaging(request.query)
    const status = clean.text(request.query.status, 30)
    const q = clean.text(request.query.q, 60)

    // A customer sees their own orders and nothing else; the tenant filter is
    // ignored for them entirely so it cannot be used to browse a store's book.
    let scope
    if (auth.isCustomer) {
      scope = sql`(user_id = ${auth.userId} or lower(customer_email) = (
        select lower(email) from users where id = ${auth.userId}
      ))`
    } else {
      const { tenantId } = app.requireTenant(request, 'store.orders', clean.text(request.query.tenantId, 60))
      scope = sql`tenant_id = ${tenantId}`
    }

    const rows = await sql`
      select ${orderPayload}, count(*) over() as total
      from orders
      where ${scope}
        ${status && ORDER_STATUS.includes(status) ? sql`and status = ${status}` : sql``}
        ${q ? sql`and (number ilike ${`%${q}%`} or customer_name ilike ${`%${q}%`})` : sql``}
      order by created_at desc
      limit ${limit} offset ${offset}
    `

    privateCache(reply)
    return sendRaw(reply, pageOf(rows, { page, limit }))
  })

  /* --------------------------------------------------------------- detail */
  app.get('/orders/:id', async (request, reply) => {
    const auth = app.requireUser(request)
    const [order] = await sql`
      select id, tenant_id, user_id, customer_email, ${orderPayload}
      from orders where id = ${request.params.id} or number = ${request.params.id} limit 1
    `
    if (!order) throw notFound('We could not find that order.')

    if (auth.isCustomer) {
      const [user] = await sql`select email from users where id = ${auth.userId} limit 1`
      const mine = order.user_id === auth.userId
        || (user && order.customer_email.toLowerCase() === user.email.toLowerCase())
      if (!mine) throw forbidden()
    } else if (!app.ownsTenant(request, order.tenant_id)) {
      throw forbidden()
    }

    privateCache(reply)
    return sendRaw(reply, order.payload)
  })

  /* --------------------------------------------------------------- update */
  app.patch('/orders/:id', async (request, reply) => {
    const body = request.body || {}
    const [existing] = await sql`
      select tenant_id, status from orders where id = ${request.params.id} limit 1
    `
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.orders', existing.tenant_id)

    const nextStatus = body.status === undefined ? null : clean.text(body.status, 30)
    if (nextStatus && !ORDER_STATUS.includes(nextStatus)) {
      throw badRequest('That order status is not recognised.')
    }
    if (nextStatus && nextStatus !== existing.status && TERMINAL_STATUS.includes(existing.status)) {
      throw badRequest(`An order that is already ${existing.status} cannot change status.`)
    }

    const tracking = body.tracking
      ? { carrier: clean.text(body.tracking.carrier, 60), code: clean.text(body.tracking.code, 40) }
      : null

    const [order] = await sql`
      update orders set
        status = coalesce(${nextStatus}::text, status),
        timeline = case
          when ${nextStatus}::text is not null and ${nextStatus}::text <> status
          then timeline || jsonb_build_array(jsonb_build_object('status', ${nextStatus}::text, 'at', now()))
          else timeline
        end,
        tracking = coalesce(${tracking ? sql.json(tracking) : null}::jsonb, tracking),
        note = coalesce(${body.note === undefined ? null : clean.text(body.note, 400)}::text, note),
        updated_at = now()
      where id = ${request.params.id}
      returning ${orderPayload}
    `

    privateCache(reply)
    return sendRaw(reply, order.payload)
  })

  /* ------------------------------------------------------------- checkout */
  app.post('/checkout', {
    config: { rateLimit: { max: 12, timeWindow: '1 minute' } },
    schema: {
      body: {
        type: 'object',
        required: ['tenantId', 'items', 'address'],
        properties: {
          tenantId: { type: 'string', maxLength: 60 },
          items: {
            type: 'array',
            minItems: 1,
            maxItems: 50,
            items: {
              type: 'object',
              required: ['productId'],
              properties: {
                productId: { type: 'string', maxLength: 60 },
                qty: { type: 'integer', minimum: 1, maximum: 10 },
              },
            },
          },
          address: { type: 'object' },
          couponCode: { type: 'string', maxLength: 24 },
          paymentMethod: { type: 'string', maxLength: 20 },
          email: { type: 'string', maxLength: 160 },
        },
      },
    },
  }, async (request, reply) => {
    const body = request.body
    const auth = request.auth
    const tenantId = clean.text(body.tenantId, 60)
    const address = validateAddress(body.address)
    const paymentMethod = clean.oneOf(body.paymentMethod, ['upi', 'card', 'netbanking', 'cod'], 'upi')

    // Collapse duplicate lines for the same product before touching stock.
    const wanted = new Map()
    for (const line of body.items) {
      const productId = clean.text(line.productId, 60)
      if (!productId) continue
      const qty = clean.integer(line.qty ?? 1, { min: 1, max: config.commerce.maxQtyPerLine })
      wanted.set(productId, Math.min(config.commerce.maxQtyPerLine, (wanted.get(productId) || 0) + qty))
    }
    if (!wanted.size) throw badRequest('Your bag is empty.')

    const guestEmail = clean.text(body.email, 160)
    if (!auth && !clean.isEmail(guestEmail)) {
      throw badRequest('Please add an email address so we can send your confirmation.')
    }

    const order = await sql.begin(async (tx) => {
      const [store] = await tx`select id, status from stores where id = ${tenantId} limit 1`
      if (!store) throw badRequest('We could not identify the storefront for this order.')
      if (store.status !== 'active') throw badRequest('This storefront is not accepting orders right now.')

      const lines = []
      let subtotal = 0

      // Always touch rows in the same order. Two concurrent checkouts sharing
      // two products would otherwise be able to deadlock against each other.
      for (const productId of [...wanted.keys()].sort()) {
        const qty = wanted.get(productId)

        // The conditional UPDATE *is* the reservation: it only succeeds while
        // enough stock exists, and it returns the authoritative price. Inside a
        // single UPDATE, `inventory` still reads as the pre-update value, so the
        // stored read model can be corrected in the same statement.
        const [reserved] = await tx`
          update products set
            inventory = inventory - ${qty},
            sold_count = sold_count + ${qty},
            payload = jsonb_set(payload, '{inventory}', to_jsonb(inventory - ${qty})),
            updated_at = now()
          where id = ${productId} and tenant_id = ${tenantId} and published and inventory >= ${qty}
          returning id, name, price, payload -> 'images' -> 0 ->> 'src' as image
        `
        if (!reserved) {
          const [product] = await tx`
            select name, inventory, published from products
            where id = ${productId} and tenant_id = ${tenantId} limit 1
          `
          if (!product) throw badRequest('One of the items in your bag is no longer available.')
          if (!product.published) throw badRequest(`${product.name} is no longer on sale.`)
          throw badRequest(
            product.inventory > 0
              ? `Only ${product.inventory} left of ${product.name}.`
              : `${product.name} has just sold out.`,
          )
        }

        const price = Number(reserved.price)
        subtotal += price * qty
        lines.push({ productId: reserved.id, name: reserved.name, image: reserved.image || '', price, qty })
      }

      /* ------------------------------------------------------- discount */
      let discount = 0
      let appliedCode = null
      const code = clean.text(body.couponCode, 24).toUpperCase()
      if (code) {
        // FOR UPDATE serializes redemptions of the same coupon.
        const [coupon] = await tx`
          select * from coupons
          where tenant_id = ${tenantId} and code = ${code}
          for update
        `
        const usable = coupon
          && (!coupon.expires_at || new Date(coupon.expires_at) >= new Date(new Date().toDateString()))
          && (!coupon.usage_limit || coupon.used < coupon.usage_limit)
          && subtotal >= Number(coupon.min_order)

        if (usable) {
          const value = Number(coupon.value)
          const max = Number(coupon.max_discount)
          discount = coupon.type === 'percent'
            ? Math.min(Math.round((subtotal * value) / 100), max > 0 ? max : Infinity)
            : Math.min(value, subtotal)
          appliedCode = coupon.code
          await tx`update coupons set used = used + 1 where id = ${coupon.id}`
        }
        // An unusable code is silently dropped rather than failing the order;
        // the cart already validated it through /coupons/validate.
      }

      /* --------------------------------------------------------- totals */
      const shipping = subtotal - discount >= config.commerce.freeShippingThreshold
        ? 0
        : config.commerce.shippingFee
      const total = Math.max(0, subtotal - discount + shipping)
      const rate = config.commerce.gstRate
      const totals = {
        subtotal,
        shipping,
        discount,
        // Prices are GST-inclusive, so tax is the component inside the subtotal.
        tax: Math.round((subtotal / (1 + rate)) * rate),
        total,
        ...(appliedCode ? { couponCode: appliedCode } : {}),
      }

      /* ------------------------------------------------ customer record */
      const email = auth
        ? (await tx`select email from users where id = ${auth.userId} limit 1`)[0]?.email || guestEmail
        : guestEmail

      const [customer] = await tx`
        insert into customers (id, tenant_id, user_id, name, email, phone, addresses)
        values (${newId('cus')}, ${tenantId}, ${auth?.userId || null}, ${address.name},
                ${email}, ${address.phone}, ${sql.json([{ id: newId('addr'), ...address, isDefault: true }])})
        on conflict (tenant_id, email) do update set
          name = excluded.name,
          phone = excluded.phone,
          user_id = coalesce(customers.user_id, excluded.user_id),
          orders_count = customers.orders_count + 1,
          lifetime_value = customers.lifetime_value + ${total}
        returning id
      `

      const [created] = await tx`
        insert into orders (
          id, number, tenant_id, customer_id, user_id, customer_name, customer_email,
          status, payment_status, payment_method, items, address, totals, timeline, total
        ) values (
          ${newId('ord')}, ${sql`'VK' || nextval('order_number_seq')`}, ${tenantId},
          ${customer.id}, ${auth?.userId || null}, ${address.name}, ${email},
          'placed', ${paymentMethod === 'cod' ? 'pending' : 'paid'}, ${paymentMethod},
          ${sql.json(lines)}, ${sql.json(address)}, ${sql.json(totals)},
          ${sql.json([{ status: 'placed', at: new Date().toISOString() }])}, ${total}
        )
        returning ${orderPayload}, number
      `

      /* ----------------------------------------------- counters and alerts */
      await tx`
        update stores set
          orders_count = orders_count + 1,
          gmv = gmv + ${total},
          customers_count = (select count(*) from customers where tenant_id = ${tenantId})
        where id = ${tenantId}
      `
      await tx`
        insert into daily_stats (tenant_id, day, orders, gmv)
        values (${tenantId}, current_date, 1, ${total})
        on conflict (tenant_id, day) do update set
          orders = daily_stats.orders + 1,
          gmv = daily_stats.gmv + ${total}
      `
      await tx`
        insert into notifications (id, tenant_id, audience, type, title, body)
        values (${newId('ntf')}, ${tenantId}, 'admin', 'order', 'New order',
                ${`Order ${created.number} for ${lines.length} item(s)`})
      `
      // Remove anyone waiting on an item they have now bought.
      await tx`
        delete from waitlist
        where email = ${email} and product_id = any(${[...wanted.keys()]}::text[])
      `

      return created
    })

    await invalidate(tags.products(tenantId), tags.store(tenantId))
    privateCache(reply)
    return sendRaw(reply, order.payload, 201)
  })
}
