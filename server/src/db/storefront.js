import { sql } from './sql.js'
import { notFound } from '../lib/errors.js'
import { storefrontTenant } from '../domain/store.js'

/*
 * The storefront boot document is assembled here and stored on
 * stores.storefront_payload. GET /stores/resolve then returns that column as
 * text: no joins, no JSON.parse, no JSON.stringify on the request path.
 *
 * Call `refreshStorefront` after any write that changes what a shopper sees
 * (theme, homepage, navigation, banners, categories, collections, branding).
 */

export async function loadStorefront(tenantId) {
  const [[store], banners, categories, collections, platform] = await Promise.all([
    sql`select * from stores where id = ${tenantId} limit 1`,
    sql`
      select payload from banners
      where tenant_id = ${tenantId}
        and status = 'published'
        and (start_date is null or start_date <= current_date)
        and (end_date is null or end_date >= current_date)
      order by sort_order
    `,
    sql`
      select id, tenant_id as "tenantId", parent_id as "parentId", slug, name, image,
             published, sort_order as "order"
      from categories where tenant_id = ${tenantId} and published
      order by sort_order
    `,
    sql`
      select id, tenant_id as "tenantId", name, type, product_ids as "productIds", rules
      from collections where tenant_id = ${tenantId}
    `,
    sql`select key, value from platform_content where key in ('testimonials', 'instagram')`,
  ])

  if (!store) throw notFound('We could not find that storefront.')

  const content = Object.fromEntries(platform.map((row) => [row.key, row.value]))

  const byId = new Map(categories.map((row) => [row.id, { ...row, children: [] }]))
  for (const row of byId.values()) {
    if (row.parentId && byId.has(row.parentId)) byId.get(row.parentId).children.push(row)
  }

  return {
    tenant: storefrontTenant(store),
    theme: store.theme,
    settings: store.settings,
    navigation: store.navigation,
    homepage: store.homepage,
    banners: banners.map((row) => row.payload),
    categories: [...byId.values()].filter((row) => !row.parentId),
    collections,
    testimonials: content.testimonials || [],
    instagram: content.instagram || [],
  }
}

/** Rebuilds the stored document and returns the JSON string the API sends. */
export async function refreshStorefront(tenantId) {
  const document = await loadStorefront(tenantId)
  const body = JSON.stringify(document)
  await sql`
    update stores set storefront_payload = ${sql.json(document)}::jsonb where id = ${tenantId}
  `
  return body
}

export async function refreshAllStorefronts() {
  const rows = await sql`select id from stores`
  for (const row of rows) await refreshStorefront(row.id)
}
