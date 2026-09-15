import { and, sql } from '../db/sql.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import { cached, invalidate, tags } from '../lib/cache.js'
import { pageOf, privateCache, publicCache, rawArray, readPaging, sendRaw, sendRawCached } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { buildProductDto, productRow } from '../domain/product.js'

/*
 * The catalogue read path. Filters compile to conditions over indexed columns;
 * the rows that come back are already-serialized `payload` strings, so a
 * 24-item page is assembled by joining strings rather than by building and
 * re-encoding 24 objects.
 */

/** Category slugs that mean "everything in this store". */
const BROWSE_ALL = new Set(['sarees', 'fabrics', 'regional', 'accessories', 'all', 'products'])

const SORTS = {
  newest: sql`created_at desc`,
  price_asc: sql`price asc`,
  price_desc: sql`price desc`,
  rating: sql`rating desc, review_count desc`,
  name: sql`name asc`,
  discount: sql`discount_pct desc`,
}

const FACET_COLUMNS = {
  fabric: 'fabric',
  pattern: 'pattern',
  occasion: 'occasion',
  region: 'region',
  weave: 'weave',
  brand: 'brand',
}

/** Normalizes `?fabric=Silk&fabric=Cotton` and `?fabric=Silk,Cotton` alike. */
function multi(value, max = 20) {
  if (value === undefined || value === null) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  return raw.map((item) => clean.text(item, 60)).filter(Boolean).slice(0, max)
}

/**
 * Stable cache key for a filtered catalogue page. Params are sorted so that
 * ?a=1&b=2 and ?b=2&a=1 share one entry, and repeated params are preserved.
 */
function queryKey(query, skip = ['tenantId']) {
  const pairs = []
  for (const [key, value] of Object.entries(query)) {
    if (skip.includes(key)) continue
    if (Array.isArray(value)) for (const item of value) pairs.push(`${key}=${item}`)
    else pairs.push(`${key}=${value}`)
  }
  return pairs.sort().join('&')
}

function categoryCondition(tenantId, slug) {
  if (!slug || BROWSE_ALL.has(slug)) return null
  if (slug === 'sale') return sql`mrp > price`
  if (slug === 'new-arrivals') return sql`badges && array['new']`
  if (slug === 'best-sellers') return sql`badges && array['bestseller']`

  // A slug may be a real category, or shorthand for an attribute value such as
  // /category/banarasi (a weave) or /category/wedding (an occasion).
  const label = slug.replace(/-/g, ' ')
  return sql`(
    category_slug = ${slug}
    or category_id in (select id from categories where tenant_id = ${tenantId} and slug = ${slug})
    or subcategory_id in (select id from categories where tenant_id = ${tenantId} and slug = ${slug})
    or lower(fabric) = ${label}
    or lower(weave) = ${label}
    or lower(region) = ${label}
    or lower(occasion) = ${label}
    or lower(pattern) = ${label}
    or exists (select 1 from unnest(tags) as tag where lower(tag) = ${label})
  )`
}

function buildFilters({ tenantId, query, includeUnpublished }) {
  const conditions = [sql`tenant_id = ${tenantId}`]
  if (!includeUnpublished) conditions.push(sql`published`)

  const q = clean.text(query.q, 80)
  if (q) {
    // Full-text handles whole words; trigram ILIKE catches the partial words a
    // search-as-you-type box produces. Both are indexed.
    conditions.push(sql`(search @@ plainto_tsquery('simple', ${q}) or name ilike ${`%${q}%`})`)
  }

  const category = clean.slugify(query.category)
  const categoryFilter = categoryCondition(tenantId, category)
  if (categoryFilter) conditions.push(categoryFilter)

  for (const [param, column] of Object.entries(FACET_COLUMNS)) {
    const values = multi(query[param])
    if (values.length) conditions.push(sql`${sql(column)} = any(${values}::text[])`)
  }

  const colors = multi(query.color)
  if (colors.length) {
    conditions.push(sql`(color = any(${colors}::text[]) or colors && ${colors}::text[])`)
  }

  const availability = clean.text(query.availability, 20)
  if (availability === 'in_stock') conditions.push(sql`inventory > 0`)
  if (availability === 'out_of_stock') conditions.push(sql`inventory <= 0`)

  const minPrice = clean.number(query.minPrice, { max: 10000000 })
  const maxPrice = clean.number(query.maxPrice, { max: 10000000 })
  if (minPrice > 0) conditions.push(sql`price >= ${minPrice}`)
  if (maxPrice > 0) conditions.push(sql`price <= ${maxPrice}`)

  const collection = clean.text(query.collection, 60)
  if (collection) {
    conditions.push(sql`
      id = any(coalesce(
        (select product_ids from collections where id = ${collection} and tenant_id = ${tenantId}),
        '{}'::text[]
      ))
    `)
  }

  const featured = query.featured
  if (featured !== undefined) conditions.push(sql`featured = ${clean.bool(featured)}`)

  return and(conditions)
}

export default async function productRoutes(app) {
  /* ------------------------------------------------------------ list */
  app.get('/products', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')

    // Only a signed-in operator for this tenant may see unpublished rows, and
    // only when they do not explicitly ask for the published set.
    const wantsPublishedOnly = request.query.published === 'true'
    const includeUnpublished = !wantsPublishedOnly && app.ownsTenant(request, tenantId)

    const { page, limit, offset } = readPaging(request.query)
    const ids = multi(request.query.ids, 100)

    // A specific id list is a lookup, not a filtered page: preserve the order
    // the client asked for so carousels keep their curated sequence.
    if (ids.length) {
      const rows = await sql`
        select payload::text as payload from products
        where tenant_id = ${tenantId} and id = any(${ids}::text[])
          ${includeUnpublished ? sql`` : sql`and published`}
        order by array_position(${ids}::text[], id)
      `
      if (includeUnpublished) privateCache(reply)
      else publicCache(reply)
      return sendRaw(reply, `{"items":[${rows.map((r) => r.payload).join(',')}],"page":1,"limit":${rows.length || 1},"total":${rows.length},"pages":1}`)
    }

    const where = buildFilters({ tenantId, query: request.query, includeUnpublished })
    const order = SORTS[clean.text(request.query.sort, 20)] || SORTS.newest

    const run = async () => {
      const rows = await sql`
        select payload::text as payload, count(*) over() as total
        from products
        where ${where}
        order by ${order}
        limit ${limit} offset ${offset}
      `
      return pageOf(rows, { page, limit })
    }

    // Operator views must never be cached: they contain drafts.
    if (includeUnpublished) {
      privateCache(reply)
      return sendRaw(reply, await run())
    }

    const key = `products:${tenantId}:${queryKey(request.query)}`
    const body = await cached(key, [tags.products(tenantId)], run)
    publicCache(reply)
    return sendRawCached(reply, key, body)
  })

  /* ----------------------------------------------------------- facets */
  app.get('/products/facets', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')

    const key = `facets:${tenantId}`
    const body = await cached(
      key,
      [tags.products(tenantId)],
      async () => {
        // One scan of the tenant's published rows produces every facet list and
        // the price bounds; the arrays are de-duplicated and sorted in SQL so
        // nothing has to be post-processed in JavaScript.
        const [row] = await sql`
          with p as (
            select fabric, colors, pattern, occasion, region, weave, brand, price
            from products where tenant_id = ${tenantId} and published
          )
          select jsonb_build_object(
            'fabric',   coalesce((select array_agg(distinct fabric order by fabric) from p where fabric <> ''), '{}'),
            'color',    coalesce((select array_agg(distinct c order by c) from p, unnest(p.colors) as c where c <> ''), '{}'),
            'pattern',  coalesce((select array_agg(distinct pattern order by pattern) from p where pattern <> ''), '{}'),
            'occasion', coalesce((select array_agg(distinct occasion order by occasion) from p where occasion <> ''), '{}'),
            'region',   coalesce((select array_agg(distinct region order by region) from p where region <> ''), '{}'),
            'weave',    coalesce((select array_agg(distinct weave order by weave) from p where weave <> ''), '{}'),
            'brand',    coalesce((select array_agg(distinct brand order by brand) from p where brand <> ''), '{}'),
            'priceRange', (select array[coalesce(min(price), 0), coalesce(max(price), 0)] from p)
          )::text as payload
        `
        return row.payload
      },
      120_000,
    )

    publicCache(reply, 60)
    return sendRawCached(reply, key, body)
  })

  /* ------------------------------------------------------------ search */
  app.get('/search', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')
    const q = clean.text(request.query.q, 80)

    const key = `search:${tenantId}:${q.toLowerCase()}`
    const body = await cached(
      key,
      [tags.products(tenantId), tags.categories(tenantId)],
      async () => {
        const [products, categories, brands, popular] = await Promise.all([
          sql`
            select payload::text as payload from products
            where tenant_id = ${tenantId} and published
              ${q ? sql`and (search @@ plainto_tsquery('simple', ${q}) or name ilike ${`%${q}%`})` : sql``}
            order by ${q ? sql`rating desc` : sql`created_at desc`}
            limit 6
          `,
          sql`
            select jsonb_build_object('id', id, 'slug', slug, 'name', name)::text as payload
            from categories
            where tenant_id = ${tenantId} and published
              ${q ? sql`and name ilike ${`%${q}%`}` : sql``}
            limit 5
          `,
          sql`
            select distinct brand from products
            where tenant_id = ${tenantId} and published and brand <> ''
              ${q ? sql`and brand ilike ${`%${q}%`}` : sql``}
            limit 5
          `,
          sql`select value from platform_content where key = 'popularSearches' limit 1`,
        ])

        return [
          '{"products":', rawArray(products.map((r) => r.payload)),
          ',"categories":', rawArray(categories.map((r) => r.payload)),
          ',"brands":', JSON.stringify(brands.map((r) => r.brand)),
          ',"popular":', JSON.stringify(popular[0]?.value || []),
          '}',
        ].join('')
      },
      30_000,
    )

    publicCache(reply, 30)
    return sendRawCached(reply, key, body)
  })

  /* --------------------------------------------------- recommendations */
  app.get('/recommendations', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    if (!tenantId) throw badRequest('A tenantId is required.')
    const type = clean.oneOf(clean.text(request.query.type, 20), ['trending', 'fbt', 'new'], 'trending')

    const key = `recs:${tenantId}:${type}`
    const body = await cached(
      key,
      [tags.products(tenantId)],
      async () => {
        const rows = await sql`
          select payload::text as payload from products
          where tenant_id = ${tenantId} and published
            ${type === 'trending' ? sql`and (badges && array['trending'] or featured)` : sql``}
          order by ${type === 'new' ? sql`created_at desc` : sql`rating desc, review_count desc`}
          limit 8
        `
        return `{"items":${rawArray(rows.map((r) => r.payload))},"source":"backend"}`
      },
      60_000,
    )

    publicCache(reply, 60)
    return sendRawCached(reply, key, body)
  })

  /* -------------------------------------------------------- single item */
  app.get('/products/:id', async (request, reply) => {
    const tenantId = clean.text(request.query.tenantId, 60)
    const key = request.params.id
    // An unpublished product is a draft: only the operator who owns it may read
    // it, and their view is never cached, because one cache entry is shared by
    // every caller and would otherwise leak the draft to shoppers.
    const includeUnpublished = Boolean(tenantId) && app.ownsTenant(request, tenantId)

    const build = async () => {
      const [product] = await sql`
        select id, tenant_id, occasion, fabric, payload::text as payload
        from products
        where (id = ${key} or slug = ${key})
          ${tenantId ? sql`and tenant_id = ${tenantId}` : sql``}
          ${includeUnpublished ? sql`` : sql`and published`}
        limit 1
      `
      if (!product) throw notFound('That product is no longer available.')

      const [related, similar, reviews, questions] = await Promise.all([
        sql`
          select payload::text as payload from products
          where tenant_id = ${product.tenant_id} and published and id <> ${product.id}
            and occasion = ${product.occasion}
          order by rating desc limit 8
        `,
        sql`
          select payload::text as payload from products
          where tenant_id = ${product.tenant_id} and published and id <> ${product.id}
            and fabric = ${product.fabric}
          order by rating desc limit 8
        `,
        sql`
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'tenantId', tenant_id, 'productId', product_id, 'author', author,
            'rating', rating, 'title', title, 'body', body, 'images', images,
            'verified', verified, 'createdAt', created_at
          ) order by created_at desc), '[]')::text as payload
          from reviews where product_id = ${product.id}
        `,
        sql`
          select coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'productId', product_id, 'question', question,
            'answer', answer, 'createdAt', created_at
          ) order by created_at desc), '[]')::text as payload
          from questions where product_id = ${product.id}
        `,
      ])

      return [
        '{"product":', product.payload,
        ',"related":', rawArray(related.map((r) => r.payload)),
        ',"similar":', rawArray(similar.map((r) => r.payload)),
        ',"reviews":', reviews[0].payload,
        ',"questions":', questions[0].payload,
        '}',
      ].join('')
    }

    if (includeUnpublished) {
      privateCache(reply)
      return sendRaw(reply, await build())
    }

    const cacheKey = `product:${tenantId}:${key}`
    const body = await cached(
      cacheKey,
      [tags.products(tenantId || 'any'), `product:${key}`],
      build,
    )

    publicCache(reply)
    return sendRawCached(reply, cacheKey, body)
  })

  /* ------------------------------------------------------------- create */
  app.post('/products', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.products', clean.text(body.tenantId, 60))

    const productId = newId('prd')
    const baseSlug = clean.slugify(body.name) || 'product'

    // Slug collisions are resolved in the database, not by reading first and
    // hoping nobody else inserts between the read and the write.
    const [{ slug }] = await sql`
      with candidate as (
        select ${baseSlug} || case when n = 0 then '' else '-' || n end as slug
        from generate_series(0, 50) as n
      )
      select slug from candidate
      where not exists (
        select 1 from products where tenant_id = ${tenantId} and products.slug = candidate.slug
      )
      order by length(slug), slug
      limit 1
    `

    const dto = buildProductDto({ body, id: productId, tenantId, slug })
    const row = productRow(dto)

    await sql.begin(async (tx) => {
      await tx`insert into products ${tx(row, ...Object.keys(row))}`
      await tx`
        update stores set products_count = (select count(*) from products where tenant_id = ${tenantId})
        where id = ${tenantId}
      `
    })

    await invalidate(tags.products(tenantId), tags.store(tenantId))
    reply.code(201)
    return dto
  })

  /* ------------------------------------------------------------- update */
  app.patch('/products/:id', async (request) => {
    const [existing] = await sql`
      select tenant_id, payload from products where id = ${request.params.id} limit 1
    `
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.products', existing.tenant_id)

    const dto = buildProductDto({
      body: request.body || {},
      existing: existing.payload,
      id: request.params.id,
      tenantId: existing.tenant_id,
      slug: existing.payload.slug,
    })
    const row = productRow(dto)
    delete row.created_at

    await sql`update products set ${sql(row, ...Object.keys(row))} where id = ${request.params.id}`
    await invalidate(tags.products(existing.tenant_id), `product:${request.params.id}`, `product:${dto.slug}`)
    return dto
  })

  /* ------------------------------------------------------------- delete */
  app.delete('/products/:id', async (request) => {
    const [existing] = await sql`select tenant_id, slug from products where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    app.requireTenant(request, 'store.products', existing.tenant_id)

    await sql.begin(async (tx) => {
      await tx`delete from products where id = ${request.params.id}`
      // A deleted product must not linger in any manual collection.
      await tx`
        update collections set product_ids = array_remove(product_ids, ${request.params.id})
        where tenant_id = ${existing.tenant_id} and ${request.params.id} = any(product_ids)
      `
      await tx`
        update stores set products_count = (select count(*) from products where tenant_id = ${existing.tenant_id})
        where id = ${existing.tenant_id}
      `
    })

    await invalidate(tags.products(existing.tenant_id), tags.store(existing.tenant_id), `product:${existing.slug}`)
    return { ok: true }
  })

  /* --------------------------------------------------------------- bulk */
  app.post('/products/bulk', async (request) => {
    const body = request.body || {}
    const ids = multi(body.ids)
    const action = clean.oneOf(body.action, ['publish', 'unpublish', 'delete'], 'publish')
    if (!ids.length) throw badRequest('Select at least one product.')

    const owners = await sql`select distinct tenant_id from products where id = any(${ids}::text[])`
    if (owners.length !== 1) throw forbidden('Bulk actions are limited to one storefront at a time.')
    const tenantId = owners[0].tenant_id
    app.requireTenant(request, 'store.products', tenantId)

    const affected = await sql.begin(async (tx) => {
      let rows
      if (action === 'delete') {
        rows = await tx`
          delete from products where id = any(${ids}::text[]) and tenant_id = ${tenantId} returning id
        `
        await tx`
          update collections set product_ids = (
            select coalesce(array_agg(pid), '{}'::text[])
            from unnest(product_ids) as pid
            where pid <> all(${ids}::text[])
          )
          where tenant_id = ${tenantId} and product_ids && ${ids}::text[]
        `
      } else {
        const published = action === 'publish'
        rows = await tx`
          update products set
            published = ${published},
            -- to_jsonb of a typed parameter, not a cast: casting a text
            -- parameter to jsonb would store the string "false".
            payload = jsonb_set(payload, '{published}', to_jsonb(${published}::boolean)),
            updated_at = now()
          where id = any(${ids}::text[]) and tenant_id = ${tenantId}
          returning id
        `
      }
      await tx`
        update stores set products_count = (select count(*) from products where tenant_id = ${tenantId})
        where id = ${tenantId}
      `
      return rows.length
    })

    await invalidate(tags.products(tenantId), tags.store(tenantId), ...ids.map((id) => `product:${id}`))
    return { ok: true, affected, action }
  })

  /* ---------------------------------------------------------- duplicate */
  app.post('/products/:id/duplicate', async (request, reply) => {
    const [existing] = await sql`select * from products where id = ${request.params.id} limit 1`
    if (!existing) throw notFound()
    const { tenantId } = app.requireTenant(request, 'store.products', existing.tenant_id)

    const productId = newId('prd')
    const dto = {
      ...existing.payload,
      id: productId,
      name: `${existing.payload.name} (copy)`,
      slug: `${existing.slug}-copy-${productId.slice(-5)}`,
      sku: existing.payload.sku ? `${existing.payload.sku}-C` : '',
      published: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    const row = productRow(dto)

    await sql`insert into products ${sql(row, ...Object.keys(row))}`
    await invalidate(tags.products(tenantId))
    reply.code(201)
    return dto
  })
}
