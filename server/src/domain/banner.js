import { badRequest } from '../lib/errors.js'
import { id as newId } from '../lib/crypto.js'
import * as clean from '../lib/sanitize.js'

/*
 * Banners are the one thing non-technical store owners edit most often, and the
 * only place where they paste URLs. Both the call-to-action link and all three
 * image sources are scheme-checked here, so a `javascript:` payload can never
 * reach another shopper's browser.
 */

export function buildBannerDto({ body = {}, existing = null, tenantId, sortOrder }) {
  const base = existing || {}
  const field = (key, sanitize, fallback = '') => {
    const source = body[key] === undefined ? base[key] ?? fallback : body[key]
    return sanitize(source)
  }

  const dto = {
    id: base.id || newId('ban'),
    tenantId: tenantId || base.tenantId,
    name: field('name', (v) => clean.text(v, 80), 'Untitled banner'),
    heading: field('heading', (v) => clean.text(v, 90)),
    subtitle: field('subtitle', (v) => clean.text(v, 160)),
    ctaText: field('ctaText', (v) => clean.text(v, 40)),
    ctaUrl: field('ctaUrl', clean.url),
    desktopImage: field('desktopImage', clean.imageUrl),
    tabletImage: field('tabletImage', clean.imageUrl),
    mobileImage: field('mobileImage', clean.imageUrl),
    overlay: field('overlay', (v) => clean.oneOf(v, ['center', 'left', 'right'], 'center'), 'center'),
    align: field('align', (v) => clean.oneOf(v, ['center', 'left', 'right'], 'center'), 'center'),
    theme: field('theme', (v) => clean.oneOf(v, ['light', 'dark'], 'light'), 'light'),
    status: field('status', (v) => clean.oneOf(v, ['draft', 'published'], 'draft'), 'draft'),
    startDate: field('startDate', clean.dateOnly),
    endDate: field('endDate', clean.dateOnly),
    order: sortOrder === undefined ? clean.integer(base.order ?? 0, { max: 999 }) : sortOrder,
    updatedAt: new Date().toISOString(),
  }

  dto.active = dto.status === 'published'

  // Reject rather than silently blank a URL the owner clearly meant to set.
  if (!dto.heading) throw badRequest('Add a heading so shoppers know what the banner is for.')
  if (!dto.desktopImage) throw badRequest('A desktop image is required (https:// or /local-path).')
  if (body.ctaUrl && !dto.ctaUrl) throw badRequest('That call-to-action link is not a valid http(s) or in-app URL.')
  if (body.tabletImage && !dto.tabletImage) throw badRequest('That tablet image URL is not allowed.')
  if (body.mobileImage && !dto.mobileImage) throw badRequest('That mobile image URL is not allowed.')
  if (dto.startDate && dto.endDate && dto.startDate > dto.endDate) {
    throw badRequest('The end date must fall after the start date.')
  }

  return dto
}

export function bannerRow(dto) {
  return {
    id: dto.id,
    tenant_id: dto.tenantId,
    name: dto.name,
    heading: dto.heading,
    subtitle: dto.subtitle,
    cta_text: dto.ctaText,
    cta_url: dto.ctaUrl,
    desktop_image: dto.desktopImage,
    tablet_image: dto.tabletImage,
    mobile_image: dto.mobileImage,
    overlay: dto.overlay,
    align: dto.align,
    theme: dto.theme,
    status: dto.status,
    start_date: dto.startDate || null,
    end_date: dto.endDate || null,
    sort_order: dto.order,
    payload: dto,
    updated_at: dto.updatedAt,
  }
}
