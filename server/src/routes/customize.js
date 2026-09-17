import { sql } from '../db/sql.js'
import { refreshStorefront } from '../db/storefront.js'
import { badRequest, notFound } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import { invalidate, tags } from '../lib/cache.js'
import { privateCache } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { THEME_IDS } from '../data/themes.js'
import { adminStore } from '../domain/store.js'
import { HOMEPAGE_BLOCK_TYPES } from '../domain/homepage.js'

/*
 * The storefront customizer writes to `*_draft` columns; publishing copies the
 * drafts over the live columns and appends a version stamp. Because the theme
 * and the homepage tree are free-form documents supplied by a client, both are
 * validated field by field here. Accepting them as opaque jsonb would let a
 * store owner inject an arbitrary string into every visitor's stylesheet or
 * into a link, which is the one genuinely dangerous thing this screen can do.
 */

const HEX = /^#[0-9a-fA-F]{3,8}$/
const FONT_KEYS = [
  'cormorant', 'jost', 'playfair', 'nunito', 'fraunces', 'sourceSans',
  'libre', 'outfit', 'karla', 'cinzel', 'inter', 'raleway', 'ibmPlex',
]

/** Whitelists the theme document; anything unrecognized is dropped. */
function sanitizeTheme(input, current) {
  if (!input || typeof input !== 'object') return current

  const color = (key) => (HEX.test(String(input[key] ?? '')) ? input[key] : current[key])
  const enumeration = (key, allowed) => clean.oneOf(input[key], allowed, current[key])
  const scale = (key) => {
    const value = Number(input[key])
    return Number.isFinite(value) ? Math.min(1.4, Math.max(0.8, value)) : current[key]
  }

  return {
    ...current,
    id: THEME_IDS.includes(input.id) ? input.id : current.id,
    name: clean.text(input.name ?? current.name, 60),
    description: clean.text(input.description ?? current.description, 200),
    layoutStyle: clean.text(input.layoutStyle ?? current.layoutStyle, 40),
    primaryColor: color('primaryColor'),
    secondaryColor: color('secondaryColor'),
    accentColor: color('accentColor'),
    backgroundColor: color('backgroundColor'),
    surfaceColor: color('surfaceColor'),
    textColor: color('textColor'),
    mutedTextColor: color('mutedTextColor'),
    borderColor: color('borderColor'),
    headingFont: clean.oneOf(input.headingFont, FONT_KEYS, current.headingFont),
    bodyFont: clean.oneOf(input.bodyFont, FONT_KEYS, current.bodyFont),
    // A raw CSS length would be injected into a custom property, so allow only
    // a plain number of pixels or a full pill radius.
    borderRadius: /^(\d{1,3}px|999px)$/.test(String(input.borderRadius ?? '')) ? input.borderRadius : current.borderRadius,
    buttonStyle: enumeration('buttonStyle', ['sharp', 'soft', 'pill']),
    cardStyle: enumeration('cardStyle', ['minimal', 'soft', 'bordered']),
    headerStyle: enumeration('headerStyle', ['classic', 'centered', 'minimal', 'split', 'search-rail']),
    footerStyle: enumeration('footerStyle', ['columns', 'centered', 'editorial']),
    productCardStyle: enumeration('productCardStyle', ['minimal', 'bordered', 'overlay', 'editorial', 'gallery']),
    bannerStyle: enumeration('bannerStyle', ['editorial', 'fullscreen', 'split', 'carousel', 'story', 'static']),
    spacingScale: scale('spacingScale'),
    typographyScale: scale('typographyScale'),
    animationLevel: enumeration('animationLevel', ['none', 'subtle', 'expressive']),
  }
}

/** Recursively cleans one homepage section's config. */
function sanitizeSectionConfig(config) {
  if (!config || typeof config !== 'object') return {}
  const out = {}

  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'boolean') out[key] = value
    else if (typeof value === 'number') out[key] = clean.number(value, { min: -10000, max: 100000 })
    else if (Array.isArray(value)) out[key] = clean.stringArray(value, { max: 60, itemLength: 120 })
    else if (typeof value === 'string') {
      // Anything that names a link or an image is scheme-checked; everything
      // else is treated as display copy.
      if (/(url|href|link)$/i.test(key)) out[key] = clean.url(value)
      else if (/image|photo|poster|logo|src/i.test(key)) out[key] = clean.imageUrl(value)
      else out[key] = clean.text(value, 600)
    }
  }
  return out
}

function sanitizeHomepage(input, current) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.sections)) return current

  const sections = input.sections.slice(0, 40).map((section, index) => ({
    id: clean.text(section?.id, 60) || `sec_${index}_${newId('s').slice(-4)}`,
    type: clean.oneOf(section?.type, HOMEPAGE_BLOCK_TYPES, 'product_grid'),
    enabled: section?.enabled === undefined ? true : clean.bool(section.enabled),
    config: sanitizeSectionConfig(section?.config),
  }))

  return {
    version: clean.integer(input.version ?? current.version ?? 1, { min: 1, max: 100000 }),
    status: clean.oneOf(input.status, ['draft', 'published'], 'draft'),
    sections,
  }
}

function sanitizeNavigation(input, current) {
  if (!input || typeof input !== 'object' || !Array.isArray(input.items)) return current

  const link = (item) => ({
    label: clean.text(item?.label, 60),
    href: clean.url(item?.href),
  })

  const items = input.items.slice(0, 20).map((item, index) => {
    const base = {
      id: clean.text(item?.id, 60) || `nav_${index}`,
      ...link(item),
    }
    if (!item?.mega || typeof item.mega !== 'object') return base

    return {
      ...base,
      mega: {
        columns: (Array.isArray(item.mega.columns) ? item.mega.columns : []).slice(0, 6).map((column) => ({
          title: clean.text(column?.title, 60),
          href: clean.url(column?.href),
          links: (Array.isArray(column?.links) ? column.links : []).slice(0, 12).map(link),
        })),
        featured: item.mega.featured
          ? {
              title: clean.text(item.mega.featured.title, 60),
              image: clean.imageUrl(item.mega.featured.image),
              href: clean.url(item.mega.featured.href),
            }
          : undefined,
        promo: item.mega.promo
          ? {
              title: clean.text(item.mega.promo.title, 60),
              image: clean.imageUrl(item.mega.promo.image),
              href: clean.url(item.mega.promo.href),
            }
          : undefined,
      },
    }
  })

  return { items: items.filter((item) => item.label) }
}

export default async function customizeRoutes(app) {
  /* ------------------------------------------------------- save a draft */
  app.post('/customize/save', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.appearance', clean.text(body.tenantId, 60))

    const [store] = await sql`select * from stores where id = ${tenantId} limit 1`
    if (!store) throw notFound()

    const patch = { draft_updated_at: new Date() }
    if (body.themeDraft !== undefined) {
      patch.theme_draft = sql.json(sanitizeTheme(body.themeDraft, store.theme_draft || store.theme))
    }
    if (body.homepageDraft !== undefined) {
      patch.homepage_draft = sql.json(sanitizeHomepage(body.homepageDraft, store.homepage_draft))
    }
    if (body.navigationDraft !== undefined) {
      patch.navigation_draft = sql.json(sanitizeNavigation(body.navigationDraft, store.navigation_draft))
    }
    if (body.branding !== undefined) {
      const branding = body.branding || {}
      patch.branding = sql.json({
        ...store.branding,
        name: clean.text(branding.name ?? store.branding.name, 80),
        tagline: clean.text(branding.tagline ?? store.branding.tagline, 120),
        logo: branding.logo === undefined ? store.branding.logo : clean.imageUrl(branding.logo) || null,
        favicon: branding.favicon === undefined ? store.branding.favicon : clean.imageUrl(branding.favicon) || null,
      })
      patch.logo_text = clean.text(branding.name ?? store.branding.name, 80)
    }

    if (Object.keys(patch).length === 1) throw badRequest('Nothing to save.')

    const [updated] = await sql`
      update stores set ${sql(patch, ...Object.keys(patch))} where id = ${tenantId} returning *
    `
    // A draft does not change what shoppers see, so only the operator's own
    // view of the store record is invalidated.
    await invalidate(tags.store(tenantId))

    privateCache(reply)
    return { ok: true, status: 'draft', store: adminStore(updated) }
  })

  /* ----------------------------------------------------------- publish */
  app.post('/customize/publish', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.appearance', clean.text(body.tenantId, 60))

    const [updated] = await sql`
      update stores set
        theme = theme_draft,
        theme_id = coalesce(theme_draft ->> 'id', theme_id),
        homepage = jsonb_set(homepage_draft, '{status}', '"published"'),
        navigation = navigation_draft,
        -- Append a publish stamp and keep only the most recent 20.
        versions = (
          select coalesce(jsonb_agg(entry order by position), '[]'::jsonb)
          from jsonb_array_elements(
            versions || jsonb_build_array(jsonb_build_object(
              -- jsonb_build_object takes "any", so the parameter types have to
              -- be spelled out or the planner cannot resolve them.
              'id', ${newId('ver')}::text, 'createdAt', now(), 'label', ${clean.text(body.label, 80) || 'Published'}::text
            ))
          ) with ordinality as history(entry, position)
          where position > greatest(0, jsonb_array_length(versions) + 1 - 20)
        ),
        draft_updated_at = null
      where id = ${tenantId}
      returning *
    `
    if (!updated) throw notFound()

    // Publishing changes the live storefront: rebuild the stored document and
    // drop every cached view of it.
    await refreshStorefront(tenantId)
    await invalidate(tags.storefront(tenantId), `store-id:${updated.slug}`, tags.storeList())

    privateCache(reply)
    return { ok: true, status: 'published', store: adminStore(updated) }
  })
}
