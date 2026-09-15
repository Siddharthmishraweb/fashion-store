import { badRequest } from '../lib/errors.js'
import * as clean from '../lib/sanitize.js'

/*
 * A product has one canonical representation: the DTO the API returns. It is
 * built here from a whitelisted request body, stored verbatim in
 * products.payload, and mirrored into typed columns for filtering. Nothing else
 * in the codebase is allowed to invent a product shape, which is what keeps the
 * stored read model and the query columns from drifting apart.
 */

const MAX_IMAGES = 10
const MAX_VARIANTS = 20

function images(value, fallbackAlt, existing = []) {
  if (!Array.isArray(value)) return existing
  return value
    .slice(0, MAX_IMAGES)
    .map((item) => ({
      src: clean.imageUrl(item?.src),
      alt: clean.text(item?.alt || fallbackAlt, 160),
    }))
    .filter((item) => item.src)
}

function variants(value, base, existing = []) {
  if (!Array.isArray(value)) return existing
  return value.slice(0, MAX_VARIANTS).map((item, index) => {
    const inventory = clean.integer(item?.inventory ?? base.inventory, { max: 100000 })
    return {
      id: clean.text(item?.id, 60) || `${base.id}_v${index + 1}`,
      sku: clean.text(item?.sku || base.sku, 60),
      color: clean.text(item?.color || base.color, 40),
      size: clean.text(item?.size || 'Free size', 40),
      design: clean.text(item?.design || base.pattern, 60),
      fabric: clean.text(item?.fabric || base.fabric, 60),
      price: clean.number(item?.price ?? base.price, { max: 5000000 }),
      inventory,
      availability: inventory > 0,
      images: Array.isArray(item?.images)
        ? item.images.map((src) => clean.imageUrl(src)).filter(Boolean).slice(0, 4)
        : [],
    }
  })
}

/**
 * Merges a request body onto an existing product DTO (or onto defaults for a
 * create) and returns the new DTO. `undefined` means "leave as it was", which is
 * what makes PATCH work without the client resending the whole record.
 */
export function buildProductDto({ body = {}, existing = null, id, tenantId, slug }) {
  const base = existing || {}

  /**
   * Sanitizes body[key] when the client sent it, otherwise re-sanitizes what is
   * already stored so a legacy record cannot carry an unsafe value forward.
   */
  const field = (key, sanitize, fallback = '') => {
    const source = body[key] === undefined ? base[key] ?? fallback : body[key]
    return sanitize(source)
  }

  const name = field('name', (v) => clean.text(v, 160))
  if (!name) throw badRequest('A product name is required.')

  const price = field('price', (v) => clean.number(v, { max: 5000000 }), 0)
  const mrp = field('mrp', (v) => clean.number(v, { max: 5000000 }), 0)
  if (price <= 0) throw badRequest('Set a selling price above zero.')
  if (mrp && mrp < price) throw badRequest('MRP cannot be lower than the selling price.')

  const fabric = field('fabric', (v) => clean.text(v, 60))
  const weave = field('weave', (v) => clean.text(v, 60))
  const region = field('region', (v) => clean.text(v, 60))
  const occasion = field('occasion', (v) => clean.text(v, 60))
  const pattern = field('pattern', (v) => clean.text(v, 60))
  const color = field('color', (v) => clean.text(v, 40))
  const inventory = field('inventory', (v) => clean.integer(v, { max: 100000 }), 0)

  const dto = {
    id: id || base.id,
    tenantId: tenantId || base.tenantId,
    slug: slug || base.slug,
    name,
    brand: field('brand', (v) => clean.text(v, 80)),
    sku: field('sku', (v) => clean.text(v, 60)),
    description: field('description', (v) => clean.multiline(v, 4000)),
    categoryId: field('categoryId', (v) => clean.text(v, 60) || null, null),
    subcategoryId: field('subcategoryId', (v) => clean.text(v, 60) || null, null),
    categorySlug: field('categorySlug', (v) => clean.slugify(v) || 'sarees', 'sarees'),
    price,
    mrp: mrp || price,
    gst: field('gst', (v) => clean.number(v, { max: 28 }), 5),
    images: images(body.images, name, base.images || []),
    videos: Array.isArray(base.videos) ? base.videos : [],
    fabric,
    color,
    colors: body.colors === undefined
      ? (base.colors?.length ? base.colors : [color].filter(Boolean))
      : clean.stringArray(body.colors, { max: 12, itemLength: 40 }),
    pattern,
    occasion,
    region,
    weave,
    length: field('length', (v) => clean.text(v, 80), '5.5 m + 0.8 m blouse'),
    blouse: field('blouse', (v) => clean.text(v, 120), 'Unstitched blouse piece included'),
    tags: body.tags === undefined
      ? (base.tags?.length ? base.tags : [fabric, region, occasion].filter(Boolean))
      : clean.stringArray(body.tags, { max: 20 }),
    badges: body.badges === undefined
      ? (base.badges?.length ? base.badges : ['new'])
      : clean.stringArray(body.badges, { max: 6, itemLength: 20 }),
    inventory,
    reserved: clean.integer(base.reserved ?? 0, { max: 100000 }),
    dimensions: field('dimensions', (v) => clean.text(v, 120), 'Saree 5.5m · Blouse 0.8m'),
    care: field('care', (v) => clean.multiline(v, 600)),
    shipping: field('shipping', (v) => clean.multiline(v, 600)),
    returns: field('returns', (v) => clean.multiline(v, 600)),
    // Ratings and stock counters are owned by the server, never by the client.
    rating: clean.number(base.rating ?? 0, { max: 5 }),
    reviewCount: clean.integer(base.reviewCount ?? 0, { max: 1000000 }),
    published: body.published === undefined ? Boolean(base.published) : clean.bool(body.published),
    featured: body.featured === undefined ? Boolean(base.featured) : clean.bool(body.featured),
    taxInfo: base.taxInfo || 'Inclusive of GST. Shipping calculated at checkout.',
    craft: weave ? `${weave} weaving tradition${region ? ` of ${region}` : ''}.` : '',
    createdAt: base.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  dto.details = [
    ['Fabric', fabric],
    ['Weave', weave],
    ['Region', region],
    ['Occasion', occasion],
    ['Pattern', pattern],
    ['Colour', color],
  ].filter(([, value]) => value)

  dto.variants = variants(body.variants, dto, base.variants || [])
  return dto
}

/** Maps a DTO onto the products table, including the stored read model. */
export function productRow(dto) {
  return {
    id: dto.id,
    tenant_id: dto.tenantId,
    slug: dto.slug,
    name: dto.name,
    brand: dto.brand,
    sku: dto.sku,
    description: dto.description,
    category_id: dto.categoryId,
    subcategory_id: dto.subcategoryId,
    category_slug: dto.categorySlug,
    price: dto.price,
    mrp: dto.mrp,
    gst: dto.gst,
    fabric: dto.fabric,
    color: dto.color,
    colors: dto.colors,
    pattern: dto.pattern,
    occasion: dto.occasion,
    region: dto.region,
    weave: dto.weave,
    tags: dto.tags,
    badges: dto.badges,
    inventory: dto.inventory,
    reserved: dto.reserved,
    rating: dto.rating,
    review_count: dto.reviewCount,
    published: dto.published,
    featured: dto.featured,
    payload: dto,
    created_at: dto.createdAt,
    updated_at: dto.updatedAt,
  }
}

/** Rebuilds the derived fields after the server changes stock or ratings. */
export function refreshDerived(dto, { rating, reviewCount, inventory } = {}) {
  const next = { ...dto }
  if (rating !== undefined) next.rating = clean.number(rating, { max: 5 })
  if (reviewCount !== undefined) next.reviewCount = clean.integer(reviewCount, { max: 1000000 })
  if (inventory !== undefined) {
    next.inventory = clean.integer(inventory, { max: 100000 })
    next.variants = (next.variants || []).map((variant) => ({
      ...variant,
      availability: next.inventory > 0 && variant.inventory > 0,
    }))
  }
  next.updatedAt = new Date().toISOString()
  return next
}
