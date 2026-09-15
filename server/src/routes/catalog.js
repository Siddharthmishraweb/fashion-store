import { sql } from '../db/sql.js'
import { refreshStorefront } from '../db/storefront.js'
import { badRequest, conflict, notFound } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import { cached, invalidate, tags } from '../lib/cache.js'
import { privateCache, publicCache, rawArray, sendRaw, sendRawCached } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { buildBannerDto, bannerRow } from '../domain/banner.js'

/* Categories, collections, and banners: the merchandising taxonomy. */

const categorySelect = sql`
  id, tenant_id as "tenantId", parent_id as "parentId", slug, name, image,
  published, sort_order as "order"
`

export default async function catalogRoutes(app) {
  /* ------------------------------------------------------------ categories */
  app.get('/categories', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')
    const isOperator = app.ownsTenant(request, tenantId)

    // Operators see hidden categories too, so their view is never cached.
    if (isOperator) {
      privateCache(reply)
      return sql`
        select ${categorySelect} from categories where tenant_id = ${tenantId} order by sort_order, name
      `
    }

    const key = `categories:${tenantId}`
    const body = await cached(
      key,
      [tags.categories(tenantId)],
      async () => {
        const rows = await sql`
          select jsonb_build_object(
            'id', id, 'tenantId', tenant_id, 'parentId', parent_id, 'slug', slug,
            'name', name, 'image', image, 'published', published, 'order', sort_order
          )::text as payload
          from categories where tenant_id = ${tenantId} and published order by sort_order, name
        `
        return rawArray(rows.map((row) => row.payload))
      },
    )

    publicCache(reply, 60)
    return sendRawCached(reply, key, body)
  })

  app.post('/categories', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.categories', clean.text(body.tenantId, 60))

    const name = clean.text(body.name, 60)
    if (!name) throw badRequest('A category name is required.')
    const slug = clean.slugify(body.slug || name)
    if (!clean.isSlug(slug)) throw badRequest('That slug is not valid.')

    const parentId = clean.text(body.parentId, 60) || null
    if (parentId) {
      const [parent] = await sql`
        select id from categories where id = ${parentId} and tenant_id = ${tenantId} limit 1
      `
      if (!parent) throw badRequest('That parent category does not belong to this storefront.')
    }

    const [category] = await sql`
      insert into categories (id, tenant_id, parent_id, slug, name, image, published, sort_order)
      values (
        ${newId('cat')}, ${tenantId}, ${parentId}, ${slug}, ${name},
        ${clean.imageUrl(body.image) || null},
        ${body.published === undefined ? true : clean.bool(body.published)},
        ${clean.integer(body.order ?? 99, { max: 999 })}
      )
      on conflict (tenant_id, slug) do nothing
      returning ${categorySelect}
    `
    if (!category) throw conflict('A category with that slug already exists.')

    await invalidate(tags.categories(tenantId), tags.store(tenantId))
    await refreshStorefront(tenantId)
    reply.code(201)
    return category
  })

  app.patch('/categories/:id', async (request) => {
    const body = request.body || {}
    const [existing] = await sql`select tenant_id from categories where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.categories', existing.tenant_id)

    const patch = {}
    if (body.name !== undefined) patch.name = clean.text(body.name, 60)
    if (body.image !== undefined) patch.image = clean.imageUrl(body.image) || null
    if (body.published !== undefined) patch.published = clean.bool(body.published)
    if (body.order !== undefined) patch.sort_order = clean.integer(body.order, { max: 999 })
    if (!Object.keys(patch).length) throw badRequest('Nothing to update.')

    const [category] = await sql`
      update categories set ${sql(patch, ...Object.keys(patch))}
      where id = ${request.params.id} returning ${categorySelect}
    `
    await invalidate(tags.categories(existing.tenant_id), tags.store(existing.tenant_id))
    await refreshStorefront(existing.tenant_id)
    return category
  })

  app.delete('/categories/:id', async (request) => {
    const [existing] = await sql`select tenant_id from categories where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.categories', existing.tenant_id)

    // Children cascade via the self-referencing foreign key.
    await sql`delete from categories where id = ${request.params.id}`
    await invalidate(tags.categories(existing.tenant_id), tags.store(existing.tenant_id))
    await refreshStorefront(existing.tenant_id)
    return { ok: true }
  })

  /* ----------------------------------------------------------- collections */
  app.get('/collections', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')

    const body = await cached(
      `collections:${tenantId}`,
      [tags.collections(tenantId)],
      async () => {
        const rows = await sql`
          select jsonb_build_object(
            'id', id, 'tenantId', tenant_id, 'name', name, 'type', type,
            'productIds', product_ids, 'rules', rules
          )::text as payload
          from collections where tenant_id = ${tenantId} order by created_at
        `
        return rawArray(rows.map((row) => row.payload))
      },
    )

    publicCache(reply, 60)
    return sendRaw(reply, body)
  })

  app.post('/collections', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.collections', clean.text(body.tenantId, 60))

    const name = clean.text(body.name, 80)
    if (!name) throw badRequest('A collection name is required.')

    // Only products that actually belong to this tenant may be listed.
    const requested = Array.isArray(body.productIds)
      ? body.productIds.map((value) => clean.text(value, 60)).filter(Boolean).slice(0, 500)
      : []
    const owned = requested.length
      ? (await sql`select id from products where tenant_id = ${tenantId} and id = any(${requested}::text[])`)
          .map((row) => row.id)
      : []

    const [collection] = await sql`
      insert into collections (id, tenant_id, name, type, product_ids, rules)
      values (
        ${newId('col')}, ${tenantId}, ${name},
        ${clean.oneOf(body.type, ['manual', 'dynamic'], 'manual')},
        ${owned}, ${sql.json(body.rules && typeof body.rules === 'object' ? body.rules : {})}
      )
      returning id, tenant_id as "tenantId", name, type, product_ids as "productIds", rules
    `

    await invalidate(tags.collections(tenantId), tags.store(tenantId))
    await refreshStorefront(tenantId)
    reply.code(201)
    return collection
  })

  app.patch('/collections/:id', async (request) => {
    const body = request.body || {}
    const [existing] = await sql`select tenant_id from collections where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.collections', existing.tenant_id)

    const patch = {}
    if (body.name !== undefined) patch.name = clean.text(body.name, 80)
    if (Array.isArray(body.productIds)) {
      const requested = body.productIds.map((value) => clean.text(value, 60)).filter(Boolean).slice(0, 500)
      const owned = requested.length
        ? (await sql`
            select id from products where tenant_id = ${existing.tenant_id} and id = any(${requested}::text[])
          `).map((row) => row.id)
        : []
      patch.product_ids = owned
    }
    if (!Object.keys(patch).length) throw badRequest('Nothing to update.')

    const [collection] = await sql`
      update collections set ${sql(patch, ...Object.keys(patch))}
      where id = ${request.params.id}
      returning id, tenant_id as "tenantId", name, type, product_ids as "productIds", rules
    `
    await invalidate(tags.collections(existing.tenant_id), tags.store(existing.tenant_id))
    await refreshStorefront(existing.tenant_id)
    return collection
  })

  /* --------------------------------------------------------------- banners */
  app.get('/banners', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')

    // The banner manager needs drafts and schedules; shoppers get only what is
    // live right now.
    if (app.ownsTenant(request, tenantId)) {
      const rows = await sql`
        select payload::text as payload from banners where tenant_id = ${tenantId} order by sort_order
      `
      privateCache(reply)
      return sendRaw(reply, rawArray(rows.map((row) => row.payload)))
    }

    const key = `banners:live:${tenantId}`
    const body = await cached(
      key,
      [tags.banners(tenantId)],
      async () => {
        const rows = await sql`
          select payload::text as payload from banners
          where tenant_id = ${tenantId} and status = 'published'
            and (start_date is null or start_date <= current_date)
            and (end_date is null or end_date >= current_date)
          order by sort_order
        `
        return rawArray(rows.map((row) => row.payload))
      },
      // Short TTL: a scheduled banner must go live close to its start date.
      60_000,
    )

    publicCache(reply, 30)
    return sendRawCached(reply, key, body)
  })

  app.post('/banners', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.banners', clean.text(body.tenantId, 60))

    const [{ next }] = await sql`
      select coalesce(max(sort_order) + 1, 0) as next from banners where tenant_id = ${tenantId}
    `
    const dto = buildBannerDto({ body, tenantId, sortOrder: next })
    const row = bannerRow(dto)

    await sql`insert into banners ${sql(row, ...Object.keys(row))}`
    await invalidate(tags.banners(tenantId), tags.store(tenantId))
    await refreshStorefront(tenantId)
    reply.code(201)
    return dto
  })

  app.patch('/banners/:id', async (request) => {
    const [existing] = await sql`
      select tenant_id, payload from banners where id = ${request.params.id} limit 1
    `
    if (!existing) throw notFound('That banner no longer exists.')
    app.requireTenant(request, 'store.banners', existing.tenant_id)

    const dto = buildBannerDto({
      body: request.body || {},
      existing: existing.payload,
      tenantId: existing.tenant_id,
    })
    const row = bannerRow(dto)

    await sql`update banners set ${sql(row, ...Object.keys(row))} where id = ${request.params.id}`
    await invalidate(tags.banners(existing.tenant_id), tags.store(existing.tenant_id))
    await refreshStorefront(existing.tenant_id)
    return dto
  })

  app.delete('/banners/:id', async (request) => {
    const [existing] = await sql`select tenant_id from banners where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.banners', existing.tenant_id)

    await sql.begin(async (tx) => {
      await tx`delete from banners where id = ${request.params.id}`
      // Close the gap so the remaining order stays 0..n-1.
      await tx`
        update banners b set sort_order = ordered.position - 1, payload = jsonb_set(b.payload, '{order}', to_jsonb(ordered.position - 1))
        from (
          select id, row_number() over (order by sort_order) as position
          from banners where tenant_id = ${existing.tenant_id}
        ) as ordered
        where b.id = ordered.id
      `
    })

    await invalidate(tags.banners(existing.tenant_id), tags.store(existing.tenant_id))
    await refreshStorefront(existing.tenant_id)
    return { ok: true }
  })

  app.post('/banners/reorder', async (request) => {
    const body = request.body || {}
    const ids = Array.isArray(body.ids)
      ? body.ids.map((value) => clean.text(value, 60)).filter(Boolean).slice(0, 100)
      : []
    const { tenantId } = app.requireTenant(request, 'store.banners', clean.text(body.tenantId, 60))
    if (!ids.length) throw badRequest('Send the banner ids in their new order.')

    // A single statement sets every position from the supplied array, scoped to
    // the caller's tenant so ids from another store are ignored.
    await sql`
      update banners b set
        sort_order = position.index - 1,
        payload = jsonb_set(b.payload, '{order}', to_jsonb(position.index - 1)),
        updated_at = now()
      from (select id, ordinality as index from unnest(${ids}::text[]) with ordinality as t(id, ordinality)) as position
      where b.id = position.id and b.tenant_id = ${tenantId}
    `
    await invalidate(tags.banners(tenantId), tags.store(tenantId))
    await refreshStorefront(tenantId)
    return { ok: true }
  })
}
