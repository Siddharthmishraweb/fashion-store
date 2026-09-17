import * as clean from '../lib/sanitize.js'
import { THEME_IDS } from '../data/themes.js'

/*
 * Two views of a store exist and the difference is a security boundary:
 *
 * - `storefrontTenant` is public. It carries branding and contact details only.
 * - `adminStore` is what a store operator sees, including drafts and counters.
 *
 * Commercial fields (status, subscription, custom domain) are writable only by
 * the platform operator, which is enforced in `storePatch`.
 */

/** Public shape embedded in GET /stores/resolve. */
export function storefrontTenant(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    domain: row.domain,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    status: row.status,
    logoText: row.logo_text,
    branding: row.branding,
    social: row.social,
    settings: row.settings,
    announcement: row.announcement,
  }
}

/** Shape returned to the store owner and the platform console. */
export function adminStore(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    domain: row.domain,
    email: row.email,
    phone: row.phone,
    city: row.city,
    address: row.address,
    announcement: row.announcement,
    status: row.status,
    subscription: row.subscription,
    themeId: row.theme_id,
    theme: row.theme,
    themeDraft: row.theme_draft,
    homepage: row.homepage,
    homepageDraft: row.homepage_draft,
    navigation: row.navigation,
    navigationDraft: row.navigation_draft,
    branding: row.branding,
    settings: row.settings,
    social: row.social,
    versions: row.versions,
    logoText: row.logo_text,
    logo: row.logo,
    favicon: row.favicon,
    coverImage: row.cover_image,
    gmv: Number(row.gmv),
    ordersCount: row.orders_count,
    productsCount: row.products_count,
    customersCount: row.customers_count,
    draftUpdatedAt: row.draft_updated_at,
    createdAt: row.created_at,
  }
}

/** Compact shape for the platform directory and the super-admin store table. */
export function storeSummary(row) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    domain: row.domain,
    city: row.city,
    status: row.status,
    themeId: row.theme_id,
    subscription: row.subscription,
    gmv: Number(row.gmv),
    ordersCount: row.orders_count,
    productsCount: row.products_count,
    customersCount: row.customers_count,
    coverImage: row.cover_image,
    createdAt: row.created_at,
  }
}

/**
 * Builds the column patch for PATCH /stores/:id. `isSuper` gates the fields
 * that decide what a tenant is allowed to do, so a store admin cannot lift
 * their own suspension or move themselves onto another plan or domain.
 */
export function storePatch(body, row, { isSuper }) {
  const patch = {}

  if (body.name !== undefined) patch.name = clean.text(body.name, 80)
  if (body.tagline !== undefined) patch.tagline = clean.text(body.tagline, 120)
  if (body.announcement !== undefined) patch.announcement = clean.text(body.announcement, 200)
  if (body.phone !== undefined) patch.phone = clean.text(body.phone, 20)
  if (body.address !== undefined) patch.address = clean.text(body.address, 200)
  if (body.city !== undefined) patch.city = clean.text(body.city, 60)
  if (body.email !== undefined) {
    if (!clean.isEmail(body.email)) return { error: 'That email address looks incorrect.' }
    patch.email = clean.text(body.email, 120)
  }

  if (body.settings !== undefined) {
    const settings = body.settings || {}
    patch.settings = {
      ...row.settings,
      supportEmail: clean.isEmail(settings.supportEmail)
        ? clean.text(settings.supportEmail, 120)
        : row.settings.supportEmail,
      supportPhone: clean.text(settings.supportPhone, 20),
      locale: clean.oneOf(settings.locale, ['en', 'hi'], row.settings.locale || 'en'),
      currency: 'INR',
    }
  }

  if (body.social !== undefined) {
    const social = body.social || {}
    patch.social = {
      ...(row.social || {}),
      instagram: clean.instagramHandle(social.instagram),
      facebook: clean.text(social.facebook ?? row.social?.facebook, 80),
    }
  }

  if (body.branding !== undefined) {
    const branding = body.branding || {}
    patch.branding = {
      ...row.branding,
      name: clean.text(branding.name ?? row.branding.name, 80),
      tagline: clean.text(branding.tagline ?? row.branding.tagline, 120),
      logo: branding.logo === undefined ? row.branding.logo : clean.imageUrl(branding.logo) || null,
      favicon: branding.favicon === undefined ? row.branding.favicon : clean.imageUrl(branding.favicon) || null,
    }
    patch.logo_text = patch.branding.name
  }

  if (isSuper) {
    if (body.status !== undefined) patch.status = clean.oneOf(body.status, ['active', 'suspended', 'draft'], row.status)
    if (body.subscription !== undefined) {
      patch.subscription = clean.oneOf(body.subscription, ['starter', 'growth', 'enterprise'], row.subscription)
    }
    if (body.domain !== undefined) patch.domain = clean.text(body.domain, 120) || null
    if (body.themeId !== undefined && THEME_IDS.includes(body.themeId)) patch.theme_id = body.themeId
  }

  return { patch }
}
