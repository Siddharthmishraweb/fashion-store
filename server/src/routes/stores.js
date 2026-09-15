import { sql } from '../db/sql.js'
import { refreshStorefront } from '../db/storefront.js'
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js'
import { hashPassword, id as newId } from '../lib/crypto.js'
import { cached, invalidate, tags } from '../lib/cache.js'
import { pageOf, privateCache, publicCache, readPaging, sendRawCached } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { getThemeById, THEMES, THEME_IDS } from '../data/themes.js'
import { adminStore, storePatch } from '../domain/store.js'
import { hasPermission, ROLES } from '../domain/roles.js'

/*
 * GET /stores/resolve is the request every page view starts with:
 *
 * 1. A tiny cached lookup turns the slug or domain into a tenant id.
 * 2. The storefront document lives on stores.storefront_payload and is served
 *    as text, so a warm hit is a Map lookup and a cold hit is one indexed
 *    SELECT. Writes rebuild the document.
 */

/** slug/domain -> identity. Cheap, and it keeps the main cache keyed by tenant. */
async function resolveIdentity(kind, key) {
  return cached(
    `store-id:${kind}:${key}`,
    [tags.storeList(), `store-id:${key}`],
    async () => {
      const [row] = kind === 'slug'
        ? await sql`select id, slug, domain, status from stores where slug = ${key} limit 1`
        : await sql`select id, slug, domain, status from stores where domain = ${key} limit 1`
      return row || null
    },
    120_000,
  )
}

async function storefrontBody(tenantId) {
  const [row] = await sql`
    select storefront_payload::text as payload from stores where id = ${tenantId} limit 1
  `
  if (row?.payload) return row.payload
  return refreshStorefront(tenantId)
}

export default async function storeRoutes(app) {
  /* ---------------------------------------------------- public directory */
  app.get('/stores', async (request, reply) => {
    const { page, limit, offset } = readPaging(request.query, { defaultLimit: 24, maxLimit: 48 })
    const q = clean.text(request.query.q, 60)
    const status = clean.text(request.query.status, 20)

    const key = `stores:list:${q}|${status}|${page}|${limit}`
    const body = await cached(
      key,
      [tags.storeList()],
      async () => {
        const rows = await sql`
          select
            jsonb_build_object(
              'id', id, 'slug', slug, 'name', name, 'tagline', tagline, 'domain', domain,
              'city', city, 'status', status, 'themeId', theme_id, 'subscription', subscription,
              'gmv', gmv, 'ordersCount', orders_count, 'productsCount', products_count,
              'customersCount', customers_count, 'coverImage', cover_image, 'createdAt', created_at
            )::text as payload,
            count(*) over() as total
          from stores
          where (${q ? sql`(name ilike ${`%${q}%`} or slug ilike ${`%${q}%`})` : sql`true`})
            and (${status ? sql`status = ${status}` : sql`status <> 'draft'`})
          order by gmv desc, name
          limit ${limit} offset ${offset}
        `
        return pageOf(rows, { page, limit })
      },
    )

    publicCache(reply, 30)
    return sendRawCached(reply, key, body)
  })

  /* ------------------------------------------------- storefront payload */
  app.get('/stores/resolve', async (request, reply) => {
    const slug = clean.text(request.query.slug, 80)
    const domain = clean.text(request.query.domain, 160)
    if (!slug && !domain) throw badRequest('Provide a storefront slug or domain.')

    const identity = await resolveIdentity(slug ? 'slug' : 'domain', slug || domain)
    if (!identity) throw notFound('We could not find that storefront.')
    if (identity.status === 'suspended') throw forbidden('This storefront is temporarily unavailable.')

    const key = `storefront:${identity.id}`
    const body = await cached(
      key,
      tags.storefront(identity.id),
      () => storefrontBody(identity.id),
      120_000,
    )

    publicCache(reply)
    return sendRawCached(reply, key, body)
  })

  /* ------------------------------------------------- single store record */
  app.get('/stores/:id', async (request, reply) => {
    const [store] = await sql`
      select * from stores where id = ${request.params.id} or slug = ${request.params.id} limit 1
    `
    if (!store) throw notFound()
    if (!app.ownsTenant(request, store.id)) throw forbidden()

    privateCache(reply)
    return adminStore(store)
  })

  /* ------------------------------------------------------- create a store */
  app.post('/stores', async (request, reply) => {
    app.requireSuperAdmin(request)
    const body = request.body || {}

    const name = clean.text(body.name, 80)
    if (!name) throw badRequest('A store name is required.')
    const slug = clean.slugify(body.slug || name)
    if (!clean.isSlug(slug)) {
      throw badRequest('The slug may only contain lowercase letters, numbers, and hyphens.')
    }

    const themeId = THEME_IDS.includes(body.themeId) ? body.themeId : 'heritage-luxury'
    const theme = getThemeById(themeId)
    const tagline = clean.text(body.tagline, 120) || 'An independent fashion house'
    const ownerEmail = clean.isEmail(body.email) ? clean.text(body.email, 160).toLowerCase() : ''
    if (!ownerEmail) throw badRequest('An owner email is required so the business can sign in to admin.')
    const ownerPassword = String(body.ownerPassword ?? '')
    const passwordProblems = clean.passwordIssues(ownerPassword)
    if (passwordProblems.length) throw badRequest(`Owner password needs ${passwordProblems.join(', ')}.`)
    const ownerName = clean.text(body.ownerName, 80) || `${name} Owner`

    const store = await sql.begin(async (tx) => {
      const [created] = await tx`
        insert into stores (
          id, slug, domain, name, tagline, email, phone, city, address, announcement,
          status, subscription, theme_id, theme, theme_draft,
          homepage, homepage_draft, navigation, navigation_draft,
          branding, settings, social, versions, logo_text, cover_image
        ) values (
          ${newId('store')}, ${slug}, ${clean.text(body.domain, 120) || `${slug}.example`},
          ${name}, ${tagline}, ${ownerEmail}, ${clean.text(body.phone, 20)},
          ${clean.text(body.city, 60) || 'India'}, '', 'Welcome to our new storefront',
          'active', ${clean.oneOf(body.subscription, ['starter', 'growth', 'enterprise'], 'starter')},
          ${themeId}, ${sql.json(theme)}, ${sql.json(theme)},
          ${sql.json({ version: 1, status: 'published', sections: [] })},
          ${sql.json({ version: 1, status: 'draft', sections: [] })},
          ${sql.json({ items: [] })}, ${sql.json({ items: [] })},
          ${sql.json({ name, tagline, logo: null, favicon: null })},
          ${sql.json({ currency: 'INR', locale: 'en', supportEmail: ownerEmail, supportPhone: '' })},
          ${sql.json({ instagram: `@${slug.replace(/-/g, '')}`, facebook: slug })},
          ${sql.json([])}, ${name}, ${clean.imageUrl(body.coverImage) || null}
        )
        on conflict (slug) do nothing
        returning *
      `
      if (!created) throw conflict('That storefront slug is already taken.')

      const [owner] = await tx`
        insert into users (id, name, email, phone, password_hash, role, tenant_id)
        values (
          ${newId('usr')}, ${ownerName}, ${ownerEmail}, ${clean.text(body.phone, 20)},
          ${await hashPassword(ownerPassword)}, ${ROLES.STORE_OWNER}, ${created.id}
        )
        on conflict (email) do nothing
        returning id
      `
      if (!owner) throw conflict('An account with this email already exists.')
      return created
    })

    await refreshStorefront(store.id)
    await invalidate(tags.storeList())
    reply.code(201)
    return {
      ...adminStore(store),
      owner: { name: ownerName, email: ownerEmail, role: ROLES.STORE_OWNER },
    }
  })

  /* ------------------------------------------------------- update a store */
  app.patch('/stores/:id', async (request) => {
    const auth = app.requireUser(request)
    const [store] = await sql`select * from stores where id = ${request.params.id} limit 1`
    if (!store) throw notFound()

    if (!auth.isSuper) {
      if (store.id !== auth.tenantId) throw forbidden()
      if (!hasPermission(auth.role, 'store.settings')) throw forbidden()
    }

    const { patch, error } = storePatch(request.body || {}, store, { isSuper: auth.isSuper })
    if (error) throw badRequest(error)
    if (!Object.keys(patch).length) return adminStore(store)

    if (patch.settings) patch.settings = sql.json(patch.settings)
    if (patch.branding) patch.branding = sql.json(patch.branding)

    const [updated] = await sql`
      update stores set ${sql(patch, ...Object.keys(patch))} where id = ${store.id} returning *
    `
    await refreshStorefront(store.id)
    await invalidate(tags.store(store.id), tags.storeList(), `store-id:${store.slug}`)
    return adminStore(updated)
  })

  /* -------------------------------------------------------------- themes */
  app.get('/themes', async (request, reply) => {
    // Static data: let the browser and any CDN hold it for an hour.
    publicCache(reply, 3600)
    return THEMES
  })
}
