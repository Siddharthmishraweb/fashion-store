import { sql } from '../db/sql.js'
import { badRequest, forbidden, notFound, unauthorized } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import { invalidate, tags } from '../lib/cache.js'
import { privateCache, publicCache, rawArray, sendRaw } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'

/* Reviews, waitlist sign-ups, newsletter capture, and notifications. */

export default async function engageRoutes(app) {
  /* ------------------------------------------------------------- reviews */
  app.get('/reviews', async (request, reply) => {
    const productId = clean.text(request.query.productId, 60)
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!productId && !tenantId) throw badRequest('Provide a productId or tenantId.')

    const rows = await sql`
      select jsonb_build_object(
        'id', id, 'tenantId', tenant_id, 'productId', product_id, 'author', author,
        'rating', rating, 'title', title, 'body', body, 'images', images,
        'verified', verified, 'createdAt', created_at
      )::text as payload
      from reviews
      where (${productId ? sql`product_id = ${productId}` : sql`true`})
        and (${tenantId ? sql`tenant_id = ${tenantId}` : sql`true`})
      order by created_at desc
      limit 200
    `

    publicCache(reply, 30)
    return sendRaw(reply, rawArray(rows.map((row) => row.payload)))
  })

  app.post('/reviews', {
    config: { rateLimit: { max: 5, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const auth = request.auth
    if (!auth) throw unauthorized('Please sign in to write a review.')
    const body = request.body || {}

    const productId = clean.text(body.productId, 60)
    const [product] = await sql`select id, tenant_id from products where id = ${productId} limit 1`
    if (!product) throw notFound('That product no longer exists.')

    const rating = clean.integer(body.rating, { min: 1, max: 5 })
    const reviewBody = clean.multiline(body.body, 1200)
    if (!reviewBody) throw badRequest('Please write a few words about the product.')

    const [user] = await sql`select name from users where id = ${auth.userId} limit 1`

    const review = await sql.begin(async (tx) => {
      // Verified means the reviewer actually bought it.
      const [purchase] = await tx`
        select 1 from orders
        where user_id = ${auth.userId}
          and items @> ${sql.json([{ productId }])}
        limit 1
      `

      const [created] = await tx`
        insert into reviews (id, tenant_id, product_id, user_id, author, rating, title, body, verified)
        values (${newId('rev')}, ${product.tenant_id}, ${productId}, ${auth.userId},
                ${user?.name || 'Customer'}, ${rating}, ${clean.text(body.title, 120)},
                ${reviewBody}, ${Boolean(purchase)})
        -- Matches the partial unique index, which needs the same predicate to
        -- be inferred as the arbiter.
        on conflict (product_id, user_id) where user_id is not null do update set
          rating = excluded.rating,
          title = excluded.title,
          body = excluded.body,
          created_at = now()
        returning jsonb_build_object(
          'id', id, 'tenantId', tenant_id, 'productId', product_id, 'author', author,
          'rating', rating, 'title', title, 'body', body, 'images', images,
          'verified', verified, 'createdAt', created_at
        )::text as payload
      `

      // Recompute the aggregate and push it into the stored read model so the
      // product page shows the new average without a join.
      await tx`
        with agg as (
          select round(avg(rating)::numeric, 1) as rating, count(*)::int as count
          from reviews where product_id = ${productId}
        )
        update products set
          rating = agg.rating,
          review_count = agg.count,
          payload = jsonb_set(
            jsonb_set(payload, '{rating}', to_jsonb(agg.rating)),
            '{reviewCount}', to_jsonb(agg.count)
          )
        from agg
        where products.id = ${productId}
      `

      return created
    })

    await invalidate(tags.products(product.tenant_id), `product:${productId}`)
    privateCache(reply)
    return sendRaw(reply, review.payload, 201)
  })

  /* ------------------------------------------------------------ waitlist */
  app.post('/waitlist', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const body = request.body || {}
    const email = clean.text(body.email, 160).toLowerCase()
    if (!clean.isEmail(email)) throw badRequest('Enter a valid email so we can notify you.')

    const productId = clean.text(body.productId, 60)
    const [product] = productId
      ? await sql`select id, tenant_id from products where id = ${productId} limit 1`
      : []
    if (!product) throw badRequest('That product is no longer listed.')

    await sql`
      insert into waitlist (id, tenant_id, product_id, email)
      values (${newId('wl')}, ${product.tenant_id}, ${product.id}, ${email})
      on conflict (product_id, email) do nothing
    `

    privateCache(reply)
    reply.code(201)
    return { ok: true }
  })

  /* ---------------------------------------------------------- newsletter */
  app.post('/newsletter', {
    config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
  }, async (request, reply) => {
    const body = request.body || {}
    const email = clean.text(body.email, 160).toLowerCase()
    if (!clean.isEmail(email)) throw badRequest('Enter a valid email address.')

    const tenantId = clean.text(body.tenantId, 60) || null
    await sql`
      insert into newsletter_subscribers (id, tenant_id, email)
      values (${newId('nws')},
              ${tenantId ? sql`(select id from stores where id = ${tenantId})` : null},
              ${email})
      on conflict (tenant_id, email) do nothing
    `

    privateCache(reply)
    return { ok: true }
  })

  /* ------------------------------------------------------- notifications */
  app.get('/notifications', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    const audience = clean.oneOf(clean.text(request.query.audience, 20), ['admin', 'customer'], 'customer')
    if (!tenantId) throw badRequest('A tenantId is required.')

    // The admin feed contains operational detail, so it needs ownership.
    if (audience === 'admin' && !app.ownsTenant(request, tenantId)) throw forbidden()

    const rows = await sql`
      select jsonb_build_object(
        'id', id, 'tenantId', tenant_id, 'audience', audience, 'type', type,
        'title', title, 'body', body, 'read', read, 'createdAt', created_at
      )::text as payload
      from notifications
      where tenant_id = ${tenantId} and audience = ${audience}
      order by created_at desc
      limit 50
    `

    privateCache(reply)
    return sendRaw(reply, rawArray(rows.map((row) => row.payload)))
  })

  app.post('/notifications/read', async (request) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.dashboard', clean.text(body.tenantId, 60))

    await sql`
      update notifications set read = true
      where tenant_id = ${tenantId} and audience = 'admin' and not read
    `
    return { ok: true }
  })
}
