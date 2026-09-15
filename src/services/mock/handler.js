import { hasPermission, ORDER_STATUS, ROLES } from '../../config/constants.js'
import { env } from '../../config/env.js'
import { slugify, uid, withinDateRange } from '../../utils/index.js'
import {
  constantTimeEqual,
  demoHash,
  isEmail,
  isPhone,
  isSlug,
  makeSalt,
  makeToken,
  passwordIssues,
  safeImageUrl,
  safeUrl,
  sanitizeMultiline,
  sanitizeText,
} from '../../utils/security.js'
import { THEMES } from '../../theme/themes.js'
import { delay, getDb, mutate } from './db.js'

/*
 * Browser-side stand-in for the REST service. Every route mirrors the
 * authorization the real backend must enforce: a session token is resolved to a
 * user, the user's role is checked against the permission the route needs, and
 * writes are confined to the caller's own tenant. Request bodies are whitelisted
 * field by field so a crafted payload cannot reassign tenantId, role, or price.
 */

function json(data, status = 200) {
  return { ok: status < 400, status, data }
}

const notFound = (message = 'Not found') => json({ message }, 404)
const unauthorized = (message = 'Please sign in to continue') => json({ message }, 401)
const forbidden = (message = 'You do not have access to this resource') => json({ message }, 403)
const badRequest = (message = 'Invalid request') => json({ message }, 400)

function paginate(list, searchParams) {
  const page = Math.max(1, Number(searchParams.get('page') || 1))
  const limit = Math.min(60, Math.max(1, Number(searchParams.get('limit') || 24)))
  const start = (page - 1) * limit
  return {
    items: list.slice(start, start + limit),
    page,
    limit,
    total: list.length,
    pages: Math.ceil(list.length / limit) || 1,
  }
}

function matchPath(pattern, pathname) {
  const keys = []
  const regex = new RegExp(
    '^' +
      pattern.replace(/\/:([^/]+)/g, (_, key) => {
        keys.push(key)
        return '/([^/]+)'
      }) +
      '$',
  )
  const match = pathname.match(regex)
  if (!match) return null
  const params = {}
  keys.forEach((key, i) => {
    params[key] = decodeURIComponent(match[i + 1])
  })
  return params
}

/* ---------------------------------------------------------------- sessions */

function readToken(headers) {
  const raw = headers.Authorization || headers.authorization || ''
  return raw.startsWith('Bearer ') ? raw.slice(7) : ''
}

function currentUser(headers) {
  const token = readToken(headers)
  if (!token) return null
  const db = getDb()
  const session = (db.sessions || []).find((s) => constantTimeEqual(s.token, token))
  if (!session) return null
  if (session.expiresAt <= Date.now()) {
    mutate((d) => {
      d.sessions = (d.sessions || []).filter((s) => s.token !== token)
    })
    return null
  }
  return db.users.find((u) => u.id === session.userId) || null
}

function publicUser(user) {
  if (!user) return null
  const { password, passwordHash, passwordSalt, ...safe } = user
  return safe
}

function createSession(userId) {
  const token = makeToken()
  const expiresAt = Date.now() + env.sessionTtlMs
  mutate((db) => {
    db.sessions = [...(db.sessions || []).filter((s) => s.expiresAt > Date.now()), { token, userId, expiresAt }]
  })
  return { token, expiresAt }
}

/** Resolves the tenant a staff request may touch, or an error response. */
function requireStaff(headers, permission, requestedTenantId) {
  const user = currentUser(headers)
  if (!user) return { error: unauthorized() }
  if (user.role === ROLES.SUPER_ADMIN) {
    return { user, tenantId: requestedTenantId || null }
  }
  if (!hasPermission(user.role, permission)) return { error: forbidden() }
  if (!user.tenantId) return { error: forbidden() }
  if (requestedTenantId && requestedTenantId !== user.tenantId) return { error: forbidden('Wrong storefront') }
  return { user, tenantId: user.tenantId }
}

function requireSuperAdmin(headers) {
  const user = currentUser(headers)
  if (!user) return { error: unauthorized() }
  if (user.role !== ROLES.SUPER_ADMIN) return { error: forbidden() }
  return { user }
}

/** True when the caller may read or write a record belonging to `tenantId`. */
function ownsTenant(user, tenantId) {
  return user?.role === ROLES.SUPER_ADMIN || (Boolean(tenantId) && user?.tenantId === tenantId)
}

/* ------------------------------------------------------------ field picking */

const pick = {
  text: (value, max = 200) => sanitizeText(value, max),
  long: (value, max = 4000) => sanitizeMultiline(value, max),
  url: (value) => safeUrl(value),
  image: (value) => safeImageUrl(value),
  number: (value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return min
    return Math.min(max, Math.max(min, Math.round(n * 100) / 100))
  },
  bool: (value) => value === true || value === 'true',
  date: (value) => {
    const raw = String(value ?? '').trim()
    return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : ''
  },
  enumeration: (value, allowed, fallback = allowed[0]) => (allowed.includes(value) ? value : fallback),
}

function bannerFromBody(body, existing = {}) {
  const next = {
    name: pick.text(body.name ?? existing.name ?? 'Untitled banner', 80),
    heading: pick.text(body.heading ?? existing.heading ?? '', 90),
    subtitle: pick.text(body.subtitle ?? existing.subtitle ?? '', 160),
    ctaText: pick.text(body.ctaText ?? existing.ctaText ?? '', 40),
    ctaUrl: body.ctaUrl === undefined ? existing.ctaUrl || '' : pick.url(body.ctaUrl),
    desktopImage: body.desktopImage === undefined ? existing.desktopImage || '' : pick.image(body.desktopImage),
    tabletImage: body.tabletImage === undefined ? existing.tabletImage || '' : pick.image(body.tabletImage),
    mobileImage: body.mobileImage === undefined ? existing.mobileImage || '' : pick.image(body.mobileImage),
    overlay: pick.enumeration(body.overlay ?? existing.overlay, ['center', 'left', 'right'], 'center'),
    align: pick.enumeration(body.align ?? existing.align, ['center', 'left', 'right'], 'center'),
    theme: pick.enumeration(body.theme ?? existing.theme, ['light', 'dark'], 'light'),
    status: pick.enumeration(body.status ?? existing.status, ['draft', 'published'], 'draft'),
    startDate: body.startDate === undefined ? existing.startDate || '' : pick.date(body.startDate),
    endDate: body.endDate === undefined ? existing.endDate || '' : pick.date(body.endDate),
    order: pick.number(body.order ?? existing.order ?? 0, { max: 999 }),
    updatedAt: new Date().toISOString(),
  }
  next.active = next.status === 'published'
  return next
}

function validateBanner(banner, body) {
  if (!banner.heading) return 'Add a heading so shoppers know what the banner is for.'
  if (!banner.desktopImage) return 'A desktop image URL is required (https:// or /local-path).'
  if (body.ctaUrl && !banner.ctaUrl) return 'That call-to-action link is not a valid http(s) or in-app URL.'
  if (body.desktopImage && !banner.desktopImage) return 'That desktop image URL is not allowed.'
  if (body.mobileImage && !banner.mobileImage) return 'That mobile image URL is not allowed.'
  if (banner.startDate && banner.endDate && banner.startDate > banner.endDate) return 'The end date must fall after the start date.'
  return null
}

function productFromBody(body, existing = {}) {
  const name = pick.text(body.name ?? existing.name ?? '', 120)
  const images = Array.isArray(body.images)
    ? body.images
        .map((img) => ({ src: pick.image(img?.src), alt: pick.text(img?.alt || name, 120) }))
        .filter((img) => img.src)
    : existing.images || []
  return {
    name,
    description: pick.long(body.description ?? existing.description ?? '', 4000),
    brand: pick.text(body.brand ?? existing.brand ?? '', 80),
    sku: pick.text(body.sku ?? existing.sku ?? '', 40),
    price: pick.number(body.price ?? existing.price ?? 0, { max: 5000000 }),
    mrp: pick.number(body.mrp ?? existing.mrp ?? 0, { max: 5000000 }),
    inventory: pick.number(body.inventory ?? existing.inventory ?? 0, { max: 100000 }),
    fabric: pick.text(body.fabric ?? existing.fabric ?? '', 60),
    color: pick.text(body.color ?? existing.color ?? '', 40),
    pattern: pick.text(body.pattern ?? existing.pattern ?? '', 60),
    occasion: pick.text(body.occasion ?? existing.occasion ?? '', 60),
    region: pick.text(body.region ?? existing.region ?? '', 60),
    weave: pick.text(body.weave ?? existing.weave ?? '', 60),
    care: pick.long(body.care ?? existing.care ?? '', 600),
    shipping: pick.long(body.shipping ?? existing.shipping ?? '', 600),
    returns: pick.long(body.returns ?? existing.returns ?? '', 600),
    categorySlug: pick.text(body.categorySlug ?? existing.categorySlug ?? 'sarees', 60),
    published: body.published === undefined ? Boolean(existing.published) : pick.bool(body.published),
    featured: body.featured === undefined ? Boolean(existing.featured) : pick.bool(body.featured),
    images,
  }
}

/* --------------------------------------------------------------- storefront */

export function visibleBanners(db, storeId) {
  return db.banners
    .filter((b) => b.tenantId === storeId && b.status === 'published' && b.active !== false && withinDateRange(b.startDate, b.endDate))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

function storefrontPayload(store) {
  const db = getDb()
  return {
    tenant: {
      id: store.id,
      slug: store.slug,
      name: store.name,
      tagline: store.tagline,
      domain: store.domain,
      email: store.email,
      phone: store.phone,
      address: store.address,
      city: store.city,
      status: store.status,
      logoText: store.logoText,
      branding: store.branding,
      social: store.social,
      settings: store.settings,
    },
    theme: store.theme,
    settings: store.settings,
    navigation: store.navigation,
    homepage: store.homepage,
    banners: visibleBanners(db, store.id),
    categories: db.categories.filter((c) => c.tenantId === store.id && c.published !== false),
    collections: db.collections.filter((c) => c.tenantId === store.id),
    testimonials: db.testimonials,
    instagram: db.instagram,
  }
}

/* ------------------------------------------------------------- product list */

const BROWSE_ALL = ['sarees', 'fabrics', 'regional', 'accessories', 'all', 'products']

function matchesCategory(product, slug, db) {
  if (BROWSE_ALL.includes(slug)) return true
  if (slug === 'sale') return product.mrp > product.price
  if (slug === 'new-arrivals') return product.badges.includes('new')
  if (slug === 'best-sellers') return product.badges.includes('bestseller')
  if (product.categorySlug === slug) return true

  const category = db.categories.find((c) => c.tenantId === product.tenantId && c.slug === slug)
  if (category) {
    if (product.categoryId === category.id || product.subcategoryId === category.id) return true
    const label = category.name.toLowerCase()
    if ([product.fabric, product.weave, product.region, product.occasion, product.pattern].some((v) => String(v).toLowerCase() === label)) {
      return true
    }
  }
  const label = slug.replace(/-/g, ' ')
  return [product.fabric, product.weave, product.region, product.occasion]
    .some((v) => String(v).toLowerCase() === label) || product.tags.map((t) => t.toLowerCase()).includes(label)
}

function filterProducts(list, params) {
  const db = getDb()
  let items = [...list]
  const q = sanitizeText(params.get('q') || '', 80).toLowerCase()
  const category = params.get('category')
  const min = Number(params.get('minPrice') || 0)
  const max = Number(params.get('maxPrice') || 0)
  const sort = params.get('sort') || 'newest'

  if (q) {
    items = items.filter((p) =>
      [p.name, p.brand, p.fabric, p.region, p.occasion, p.weave, p.pattern].join(' ').toLowerCase().includes(q),
    )
  }
  if (category) items = items.filter((p) => matchesCategory(p, category, db))

  const facets = [
    ['fabric', (p, v) => p.fabric === v],
    ['color', (p, v) => p.color === v || p.colors.includes(v)],
    ['pattern', (p, v) => p.pattern === v],
    ['occasion', (p, v) => p.occasion === v],
    ['region', (p, v) => p.region === v],
    ['weave', (p, v) => p.weave === v],
    ['brand', (p, v) => p.brand === v],
  ]
  facets.forEach(([key, predicate]) => {
    const values = params.getAll(key).filter(Boolean)
    if (values.length) items = items.filter((p) => values.some((v) => predicate(p, v)))
  })

  const availability = params.get('availability')
  if (availability === 'in_stock') items = items.filter((p) => p.inventory > 0)
  if (availability === 'out_of_stock') items = items.filter((p) => p.inventory <= 0)
  if (min > 0) items = items.filter((p) => p.price >= min)
  if (max > 0) items = items.filter((p) => p.price <= max)

  const collection = params.get('collection')
  if (collection) {
    const col = db.collections.find((c) => c.id === collection)
    items = col ? items.filter((p) => col.productIds.includes(p.id)) : []
  }

  if (sort === 'price_asc') items.sort((a, b) => a.price - b.price)
  else if (sort === 'price_desc') items.sort((a, b) => b.price - a.price)
  else if (sort === 'rating') items.sort((a, b) => b.rating - a.rating)
  else if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === 'discount') items.sort((a, b) => (b.mrp - b.price) / b.mrp - (a.mrp - a.price) / a.mrp)

  return items
}

/* -------------------------------------------------------------------- routes */

const routes = [
  ['GET', '/health', () => json({ ok: true, mock: true, version: 1 })],

  ['GET', '/themes', () => json(THEMES)],

  /* ---- auth ---- */

  ['POST', '/auth/login', ({ body }) => {
    const email = sanitizeText(body?.email, 120).toLowerCase()
    const password = String(body?.password ?? '')
    if (!isEmail(email) || !password) return badRequest('Enter a valid email and password.')
    const db = getDb()
    const user = db.users.find((u) => u.email.toLowerCase() === email)
    // Always compute a hash so a missing account and a wrong password cost the same.
    const candidate = demoHash(password, user?.passwordSalt || 'no-such-user')
    if (!user || !constantTimeEqual(candidate, user.passwordHash)) {
      return json({ message: 'Email or password is incorrect.' }, 401)
    }
    const session = createSession(user.id)
    return json({ ...session, user: publicUser(user) })
  }],

  ['POST', '/auth/register', ({ body }) => {
    const email = sanitizeText(body?.email, 120).toLowerCase()
    const name = sanitizeText(body?.name, 80)
    const phone = sanitizeText(body?.phone, 20)
    const password = String(body?.password ?? '')
    if (!name) return badRequest('Please tell us your name.')
    if (!isEmail(email)) return badRequest('That email address looks incorrect.')
    if (phone && !isPhone(phone)) return badRequest('That phone number looks incorrect.')
    const issues = passwordIssues(password)
    if (issues.length) return badRequest(`Password needs ${issues.join(', ')}.`)
    if (getDb().users.some((u) => u.email.toLowerCase() === email)) {
      return badRequest('An account with this email already exists.')
    }

    const passwordSalt = makeSalt()
    let created
    mutate((db) => {
      created = {
        id: uid('usr'),
        name,
        email,
        phone,
        passwordSalt,
        passwordHash: demoHash(password, passwordSalt),
        role: ROLES.CUSTOMER,
        tenantId: sanitizeText(body?.tenantId, 40) || null,
        createdAt: new Date().toISOString(),
      }
      db.users.push(created)
    })
    const session = createSession(created.id)
    return json({ ...session, user: publicUser(created) }, 201)
  }],

  ['POST', '/auth/otp/request', ({ body }) => {
    const phone = sanitizeText(body?.phone, 20)
    const email = sanitizeText(body?.email, 120).toLowerCase()
    if (!phone && !email) return badRequest('Enter a phone number or email.')
    if (phone && !isPhone(phone)) return badRequest('That phone number looks incorrect.')
    if (email && !isEmail(email)) return badRequest('That email address looks incorrect.')
    return json({ sent: true, to: phone || email, expiresIn: 300 })
  }],

  ['POST', '/auth/otp/verify', ({ body }) => {
    const phone = sanitizeText(body?.phone, 20)
    const email = sanitizeText(body?.email, 120).toLowerCase()
    if (!/^\d{6}$/.test(String(body?.otp ?? ''))) return badRequest('Enter the 6-digit code.')
    if (String(body.otp) !== '123456') return badRequest('That code is incorrect or has expired.')

    const db = getDb()
    let user = db.users.find((u) => (phone && u.phone === phone) || (email && u.email.toLowerCase() === email))
    if (!user) {
      const passwordSalt = makeSalt()
      mutate((d) => {
        user = {
          id: uid('usr'),
          name: 'Guest',
          email: email || `${phone.replace(/\D/g, '')}@otp.local`,
          phone,
          passwordSalt,
          passwordHash: demoHash(makeToken(), passwordSalt),
          role: ROLES.CUSTOMER,
          tenantId: sanitizeText(body?.tenantId, 40) || null,
          createdAt: new Date().toISOString(),
        }
        d.users.push(user)
      })
    }
    const session = createSession(user.id)
    return json({ ...session, user: publicUser(user) })
  }],

  ['POST', '/auth/forgot', ({ body }) => {
    const email = sanitizeText(body?.email, 120)
    if (!isEmail(email)) return badRequest('That email address looks incorrect.')
    // Always the same answer so the response cannot be used to enumerate accounts.
    return json({ sent: true })
  }],

  ['POST', '/auth/logout', ({ headers }) => {
    const token = readToken(headers)
    mutate((db) => {
      db.sessions = (db.sessions || []).filter((s) => s.token !== token)
    })
    return json({ ok: true })
  }],

  ['GET', '/auth/me', ({ headers }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized()
    return json(publicUser(user))
  }],

  ['PATCH', '/auth/me', ({ headers, body }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized()
    const name = sanitizeText(body?.name, 80)
    const phone = sanitizeText(body?.phone, 20)
    if (phone && !isPhone(phone)) return badRequest('That phone number looks incorrect.')
    let updated
    mutate((db) => {
      updated = db.users.find((u) => u.id === user.id)
      if (name) updated.name = name
      if (phone) updated.phone = phone
    })
    return json(publicUser(updated))
  }],

  ['POST', '/auth/password', ({ headers, body }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized()
    const current = String(body?.currentPassword ?? '')
    if (!constantTimeEqual(demoHash(current, user.passwordSalt), user.passwordHash)) {
      return badRequest('Your current password is incorrect.')
    }
    const issues = passwordIssues(String(body?.newPassword ?? ''))
    if (issues.length) return badRequest(`Password needs ${issues.join(', ')}.`)
    const passwordSalt = makeSalt()
    mutate((db) => {
      const record = db.users.find((u) => u.id === user.id)
      record.passwordSalt = passwordSalt
      record.passwordHash = demoHash(String(body.newPassword), passwordSalt)
      // Changing a password invalidates every other session for that account.
      db.sessions = (db.sessions || []).filter((s) => s.userId !== user.id || constantTimeEqual(s.token, readToken(headers)))
    })
    return json({ ok: true })
  }],

  /* ---- stores ---- */

  ['GET', '/stores', ({ searchParams }) => {
    const db = getDb()
    const q = sanitizeText(searchParams.get('q') || '', 60).toLowerCase()
    let items = db.stores.map((s) => ({
      id: s.id,
      slug: s.slug,
      name: s.name,
      tagline: s.tagline,
      domain: s.domain,
      city: s.city,
      status: s.status,
      themeId: s.themeId,
      subscription: s.subscription,
      gmv: s.gmv,
      ordersCount: s.ordersCount,
      productsCount: s.productsCount,
      customersCount: s.customersCount,
      coverImage: s.coverImage,
      createdAt: s.createdAt,
    }))
    if (q) items = items.filter((s) => s.name.toLowerCase().includes(q) || s.slug.includes(q))
    const status = searchParams.get('status')
    if (status) items = items.filter((s) => s.status === status)
    return json(paginate(items, searchParams))
  }],

  ['GET', '/stores/resolve', ({ searchParams }) => {
    const db = getDb()
    const slug = sanitizeText(searchParams.get('slug') || '', 60)
    const domain = sanitizeText(searchParams.get('domain') || '', 120)
    const store = db.stores.find((s) => (slug && s.slug === slug) || (domain && s.domain === domain))
    if (!store) return notFound('We could not find that storefront.')
    if (store.status === 'suspended') return json({ message: 'This storefront is temporarily unavailable.' }, 403)
    return json(storefrontPayload(store))
  }],

  ['GET', '/stores/:id', ({ params, headers }) => {
    const store = getDb().stores.find((s) => s.id === params.id || s.slug === params.id)
    if (!store) return notFound()
    const user = currentUser(headers)
    if (!ownsTenant(user, store.id)) return forbidden()
    return json(store)
  }],

  ['POST', '/stores', ({ body, headers }) => {
    const auth = requireSuperAdmin(headers)
    if (auth.error) return auth.error
    const slug = slugify(body?.slug || body?.name)
    const name = sanitizeText(body?.name, 80)
    if (!name) return badRequest('A store name is required.')
    if (!isSlug(slug)) return badRequest('The slug may only contain lowercase letters, numbers, and hyphens.')
    if (getDb().stores.some((s) => s.slug === slug)) return badRequest('That storefront slug is already taken.')

    const themeId = THEMES.some((t) => t.id === body?.themeId) ? body.themeId : 'heritage-luxury'
    const theme = THEMES.find((t) => t.id === themeId)
    let store
    mutate((db) => {
      store = {
        id: uid('store'),
        slug,
        name,
        tagline: sanitizeText(body?.tagline, 120) || 'An independent fashion house',
        domain: sanitizeText(body?.domain, 120) || `${slug}.example`,
        email: isEmail(body?.email) ? sanitizeText(body.email, 120) : `hello@${slug}.example`,
        phone: sanitizeText(body?.phone, 20),
        city: sanitizeText(body?.city, 60) || 'India',
        address: '',
        announcement: 'Welcome to our new storefront',
        status: 'active',
        subscription: pick.enumeration(body?.subscription, ['starter', 'growth', 'enterprise'], 'starter'),
        themeId,
        theme: JSON.parse(JSON.stringify(theme)),
        themeDraft: JSON.parse(JSON.stringify(theme)),
        logoText: name,
        logo: null,
        favicon: null,
        social: { instagram: `@${slug.replace(/-/g, '')}`, facebook: slug },
        settings: { currency: 'INR', locale: 'en', supportEmail: `hello@${slug}.example`, supportPhone: '' },
        branding: { name, tagline: sanitizeText(body?.tagline, 120) || '', logo: null, favicon: null },
        navigation: { items: [] },
        navigationDraft: { items: [] },
        homepage: { version: 1, status: 'published', sections: [] },
        homepageDraft: { version: 1, status: 'draft', sections: [] },
        versions: [],
        createdAt: new Date().toISOString(),
        gmv: 0,
        ordersCount: 0,
        productsCount: 0,
        customersCount: 0,
        coverImage: safeImageUrl(body?.coverImage) || null,
      }
      db.stores.push(store)
    })
    return json(store, 201)
  }],

  ['PATCH', '/stores/:id', ({ params, body, headers }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized()
    const store = getDb().stores.find((s) => s.id === params.id)
    if (!store) return notFound()

    const isSuper = user.role === ROLES.SUPER_ADMIN
    if (!isSuper) {
      if (store.id !== user.tenantId) return forbidden()
      if (!hasPermission(user.role, 'store.settings')) return forbidden()
    }

    const patch = {}
    if (body.name !== undefined) patch.name = sanitizeText(body.name, 80)
    if (body.tagline !== undefined) patch.tagline = sanitizeText(body.tagline, 120)
    if (body.announcement !== undefined) patch.announcement = sanitizeText(body.announcement, 200)
    if (body.phone !== undefined) patch.phone = sanitizeText(body.phone, 20)
    if (body.address !== undefined) patch.address = sanitizeText(body.address, 200)
    if (body.city !== undefined) patch.city = sanitizeText(body.city, 60)
    if (body.email !== undefined) {
      if (!isEmail(body.email)) return badRequest('That email address looks incorrect.')
      patch.email = sanitizeText(body.email, 120)
    }
    if (body.settings !== undefined) {
      patch.settings = {
        ...store.settings,
        supportEmail: isEmail(body.settings.supportEmail) ? sanitizeText(body.settings.supportEmail, 120) : store.settings.supportEmail,
        supportPhone: sanitizeText(body.settings.supportPhone, 20),
        locale: pick.enumeration(body.settings.locale, ['en', 'hi'], store.settings.locale),
        currency: 'INR',
      }
    }
    if (body.branding !== undefined) {
      patch.branding = {
        ...store.branding,
        name: sanitizeText(body.branding.name ?? store.branding.name, 80),
        tagline: sanitizeText(body.branding.tagline ?? store.branding.tagline, 120),
        logo: body.branding.logo === undefined ? store.branding.logo : safeImageUrl(body.branding.logo) || null,
        favicon: body.branding.favicon === undefined ? store.branding.favicon : safeImageUrl(body.branding.favicon) || null,
      }
      patch.logoText = patch.branding.name
    }
    // Ownership, billing, and lifecycle stay with the platform operator.
    if (isSuper) {
      if (body.status !== undefined) patch.status = pick.enumeration(body.status, ['active', 'suspended', 'draft'], store.status)
      if (body.subscription !== undefined) patch.subscription = pick.enumeration(body.subscription, ['starter', 'growth', 'enterprise'], store.subscription)
      if (body.domain !== undefined) patch.domain = sanitizeText(body.domain, 120)
    }

    let updated
    mutate((db) => {
      updated = db.stores.find((s) => s.id === params.id)
      Object.assign(updated, patch)
    })
    return json(updated)
  }],

  /* ---- products ---- */

  ['GET', '/products', ({ searchParams, headers }) => {
    const db = getDb()
    const tenantId = searchParams.get('tenantId')
    let items = db.products.filter((p) => !tenantId || p.tenantId === tenantId)
    if (searchParams.get('published') === 'true') items = items.filter((p) => p.published)
    else if (!ownsTenant(currentUser(headers), tenantId)) items = items.filter((p) => p.published)
    items = filterProducts(items, searchParams)
    const ids = searchParams.get('ids')
    if (ids) {
      const wanted = ids.split(',').filter(Boolean)
      items = wanted.map((id) => items.find((p) => p.id === id)).filter(Boolean)
    }
    return json(paginate(items, searchParams))
  }],

  ['GET', '/products/facets', ({ searchParams }) => {
    const tenantId = searchParams.get('tenantId')
    const items = getDb().products.filter((p) => p.tenantId === tenantId && p.published)
    const collect = (key) => [...new Set(items.map((p) => p[key]).filter(Boolean))].sort()
    return json({
      fabric: collect('fabric'),
      color: [...new Set(items.flatMap((p) => p.colors || []))].sort(),
      pattern: collect('pattern'),
      occasion: collect('occasion'),
      region: collect('region'),
      weave: collect('weave'),
      brand: collect('brand'),
      priceRange: items.length
        ? [Math.min(...items.map((p) => p.price)), Math.max(...items.map((p) => p.price))]
        : [0, 0],
    })
  }],

  ['GET', '/products/:id', ({ params, searchParams }) => {
    const db = getDb()
    const tenantId = searchParams.get('tenantId')
    const product = db.products.find(
      (p) => p.id === params.id || (p.slug === params.id && (!tenantId || p.tenantId === tenantId)),
    )
    if (!product) return notFound('That product is no longer available.')
    const siblings = db.products.filter((p) => p.tenantId === product.tenantId && p.id !== product.id && p.published)
    return json({
      product,
      related: siblings.filter((p) => p.occasion === product.occasion).slice(0, 8),
      similar: siblings.filter((p) => p.fabric === product.fabric).slice(0, 8),
      reviews: db.reviews.filter((r) => r.productId === product.id),
      questions: db.questions.filter((q) => q.productId === product.id),
    })
  }],

  ['POST', '/products', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.products', body?.tenantId)
    if (auth.error) return auth.error
    const tenantId = auth.tenantId
    if (!tenantId) return badRequest('Choose a storefront for this product.')
    const fields = productFromBody(body)
    if (!fields.name) return badRequest('A product name is required.')
    if (fields.price <= 0) return badRequest('Set a selling price above zero.')
    if (fields.mrp && fields.mrp < fields.price) return badRequest('MRP cannot be lower than the selling price.')

    let product
    mutate((db) => {
      const baseSlug = slugify(fields.name) || 'product'
      const taken = new Set(db.products.filter((p) => p.tenantId === tenantId).map((p) => p.slug))
      let slug = `${baseSlug}-${slugify(db.stores.find((s) => s.id === tenantId)?.slug || '')}`
      let n = 2
      while (taken.has(slug)) slug = `${baseSlug}-${n++}`
      product = {
        id: uid('prd'),
        tenantId,
        slug,
        ...fields,
        gst: 5,
        colors: fields.color ? [fields.color] : [],
        tags: [fields.fabric, fields.region, fields.occasion].filter(Boolean),
        badges: ['new'],
        videos: [],
        reserved: 0,
        length: '5.5 m + 0.8 m blouse',
        blouse: 'Unstitched blouse piece included',
        dimensions: 'Saree 5.5m · Blouse 0.8m',
        taxInfo: 'Inclusive of GST. Shipping calculated at checkout.',
        craft: fields.weave ? `${fields.weave} weaving tradition.` : '',
        details: [
          ['Fabric', fields.fabric],
          ['Weave', fields.weave],
          ['Region', fields.region],
          ['Occasion', fields.occasion],
          ['Pattern', fields.pattern],
          ['Colour', fields.color],
        ].filter(([, value]) => value),
        rating: 0,
        reviewCount: 0,
        variants: [],
        createdAt: new Date().toISOString(),
      }
      db.products.unshift(product)
      const store = db.stores.find((s) => s.id === tenantId)
      if (store) store.productsCount = db.products.filter((p) => p.tenantId === tenantId).length
    })
    return json(product, 201)
  }],

  ['PATCH', '/products/:id', ({ params, body, headers }) => {
    const existing = getDb().products.find((p) => p.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.products', existing.tenantId)
    if (auth.error) return auth.error
    const fields = productFromBody(body, existing)
    if (!fields.name) return badRequest('A product name is required.')
    if (fields.mrp && fields.mrp < fields.price) return badRequest('MRP cannot be lower than the selling price.')

    let product
    mutate((db) => {
      product = db.products.find((p) => p.id === params.id)
      Object.assign(product, fields, { updatedAt: new Date().toISOString() })
    })
    return json(product)
  }],

  ['DELETE', '/products/:id', ({ params, headers }) => {
    const existing = getDb().products.find((p) => p.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.products', existing.tenantId)
    if (auth.error) return auth.error
    mutate((db) => {
      db.products = db.products.filter((p) => p.id !== params.id)
      db.collections.forEach((c) => {
        c.productIds = (c.productIds || []).filter((id) => id !== params.id)
      })
      const store = db.stores.find((s) => s.id === existing.tenantId)
      if (store) store.productsCount = db.products.filter((p) => p.tenantId === existing.tenantId).length
    })
    return json({ ok: true })
  }],

  ['POST', '/products/bulk', ({ body, headers }) => {
    const ids = Array.isArray(body?.ids) ? body.ids.map((id) => sanitizeText(id, 40)) : []
    const action = pick.enumeration(body?.action, ['publish', 'unpublish', 'delete'], 'publish')
    if (!ids.length) return badRequest('Select at least one product.')
    const db = getDb()
    const targets = db.products.filter((p) => ids.includes(p.id))
    const tenants = [...new Set(targets.map((p) => p.tenantId))]
    if (tenants.length !== 1) return forbidden('Bulk actions are limited to one storefront at a time.')
    const auth = requireStaff(headers, 'store.products', tenants[0])
    if (auth.error) return auth.error

    mutate((d) => {
      if (action === 'delete') {
        d.products = d.products.filter((p) => !ids.includes(p.id))
      } else {
        d.products.forEach((p) => {
          if (ids.includes(p.id)) p.published = action === 'publish'
        })
      }
      const store = d.stores.find((s) => s.id === tenants[0])
      if (store) store.productsCount = d.products.filter((p) => p.tenantId === tenants[0]).length
    })
    return json({ ok: true, affected: targets.length, action })
  }],

  ['POST', '/products/:id/duplicate', ({ params, headers }) => {
    const existing = getDb().products.find((p) => p.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.products', existing.tenantId)
    if (auth.error) return auth.error
    let copy
    mutate((db) => {
      copy = {
        ...existing,
        id: uid('prd'),
        name: `${existing.name} (copy)`,
        slug: `${existing.slug}-copy-${Math.random().toString(36).slice(2, 6)}`,
        sku: `${existing.sku}-C`,
        published: false,
        createdAt: new Date().toISOString(),
      }
      db.products.unshift(copy)
    })
    return json(copy, 201)
  }],

  /* ---- search & recommendations ---- */

  ['GET', '/search', ({ searchParams }) => {
    const db = getDb()
    const tenantId = searchParams.get('tenantId')
    const q = sanitizeText(searchParams.get('q') || '', 80).toLowerCase()
    const tenantProducts = db.products.filter((p) => p.tenantId === tenantId && p.published)
    const products = q
      ? tenantProducts
          .filter((p) => `${p.name} ${p.fabric} ${p.weave} ${p.region}`.toLowerCase().includes(q))
          .slice(0, 6)
      : tenantProducts.slice(0, 6)
    const categories = db.categories
      .filter((c) => c.tenantId === tenantId && c.name.toLowerCase().includes(q))
      .slice(0, 5)
    const brands = [...new Set(tenantProducts.map((p) => p.brand))].filter((b) => b.toLowerCase().includes(q)).slice(0, 5)
    return json({ products, categories, brands, popular: db.popularSearches })
  }],

  ['GET', '/recommendations', ({ searchParams }) => {
    const db = getDb()
    const tenantId = searchParams.get('tenantId')
    const type = searchParams.get('type') || 'trending'
    let items = db.products.filter((p) => p.tenantId === tenantId && p.published)
    if (type === 'trending') items = items.filter((p) => p.badges.includes('trending') || p.featured)
    if (type === 'fbt') items = items.slice(3, 7)
    return json({ items: items.slice(0, 8), source: 'backend' })
  }],

  /* ---- taxonomy ---- */

  ['GET', '/categories', ({ searchParams }) => {
    const tenantId = searchParams.get('tenantId')
    return json(getDb().categories.filter((c) => !tenantId || c.tenantId === tenantId))
  }],

  ['POST', '/categories', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.categories', body?.tenantId)
    if (auth.error) return auth.error
    const name = sanitizeText(body?.name, 60)
    if (!name) return badRequest('A category name is required.')
    const slug = slugify(body?.slug || name)
    if (!isSlug(slug)) return badRequest('That slug is not valid.')
    if (getDb().categories.some((c) => c.tenantId === auth.tenantId && c.slug === slug)) {
      return badRequest('A category with that slug already exists.')
    }
    let category
    mutate((db) => {
      category = {
        id: uid('cat'),
        tenantId: auth.tenantId,
        slug,
        name,
        parentId: sanitizeText(body?.parentId, 60) || null,
        image: safeImageUrl(body?.image) || null,
        published: body?.published === undefined ? true : pick.bool(body.published),
        order: pick.number(body?.order ?? 99, { max: 999 }),
        children: [],
      }
      db.categories.push(category)
    })
    return json(category, 201)
  }],

  ['PATCH', '/categories/:id', ({ params, body, headers }) => {
    const existing = getDb().categories.find((c) => c.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.categories', existing.tenantId)
    if (auth.error) return auth.error
    let category
    mutate((db) => {
      category = db.categories.find((c) => c.id === params.id)
      if (body.name !== undefined) category.name = sanitizeText(body.name, 60)
      if (body.image !== undefined) category.image = safeImageUrl(body.image) || null
      if (body.published !== undefined) category.published = pick.bool(body.published)
      if (body.order !== undefined) category.order = pick.number(body.order, { max: 999 })
    })
    return json(category)
  }],

  ['DELETE', '/categories/:id', ({ params, headers }) => {
    const existing = getDb().categories.find((c) => c.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.categories', existing.tenantId)
    if (auth.error) return auth.error
    mutate((db) => {
      db.categories = db.categories.filter((c) => c.id !== params.id)
    })
    return json({ ok: true })
  }],

  ['GET', '/collections', ({ searchParams }) => {
    const tenantId = searchParams.get('tenantId')
    return json(getDb().collections.filter((c) => !tenantId || c.tenantId === tenantId))
  }],

  ['POST', '/collections', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.collections', body?.tenantId)
    if (auth.error) return auth.error
    const name = sanitizeText(body?.name, 80)
    if (!name) return badRequest('A collection name is required.')
    let collection
    mutate((db) => {
      collection = {
        id: uid('col'),
        tenantId: auth.tenantId,
        name,
        type: pick.enumeration(body?.type, ['manual', 'dynamic'], 'manual'),
        productIds: Array.isArray(body?.productIds) ? body.productIds.map((id) => sanitizeText(id, 40)) : [],
        rules: {},
      }
      db.collections.push(collection)
    })
    return json(collection, 201)
  }],

  ['PATCH', '/collections/:id', ({ params, body, headers }) => {
    const existing = getDb().collections.find((c) => c.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.collections', existing.tenantId)
    if (auth.error) return auth.error
    let collection
    mutate((db) => {
      collection = db.collections.find((c) => c.id === params.id)
      if (body.name !== undefined) collection.name = sanitizeText(body.name, 80)
      if (Array.isArray(body.productIds)) collection.productIds = body.productIds.map((id) => sanitizeText(id, 40))
    })
    return json(collection)
  }],

  /* ---- banners ---- */

  ['GET', '/banners', ({ searchParams, headers }) => {
    const tenantId = searchParams.get('tenantId')
    const db = getDb()
    if (ownsTenant(currentUser(headers), tenantId)) {
      return json(db.banners.filter((b) => b.tenantId === tenantId).sort((a, b) => (a.order ?? 0) - (b.order ?? 0)))
    }
    return json(visibleBanners(db, tenantId))
  }],

  ['POST', '/banners', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.banners', body?.tenantId)
    if (auth.error) return auth.error
    if (!auth.tenantId) return badRequest('Choose a storefront for this banner.')
    const fields = bannerFromBody(body)
    const invalid = validateBanner(fields, body)
    if (invalid) return badRequest(invalid)
    let banner
    mutate((db) => {
      const count = db.banners.filter((b) => b.tenantId === auth.tenantId).length
      banner = { id: uid('ban'), tenantId: auth.tenantId, ...fields, order: count }
      db.banners.push(banner)
    })
    return json(banner, 201)
  }],

  ['PATCH', '/banners/:id', ({ params, body, headers }) => {
    const existing = getDb().banners.find((b) => b.id === params.id)
    if (!existing) return notFound('That banner no longer exists.')
    const auth = requireStaff(headers, 'store.banners', existing.tenantId)
    if (auth.error) return auth.error
    const fields = bannerFromBody(body, existing)
    const invalid = validateBanner(fields, body)
    if (invalid) return badRequest(invalid)
    let banner
    mutate((db) => {
      banner = db.banners.find((b) => b.id === params.id)
      Object.assign(banner, fields)
    })
    return json(banner)
  }],

  ['DELETE', '/banners/:id', ({ params, headers }) => {
    const existing = getDb().banners.find((b) => b.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.banners', existing.tenantId)
    if (auth.error) return auth.error
    mutate((db) => {
      db.banners = db.banners.filter((b) => b.id !== params.id)
      db.banners.filter((b) => b.tenantId === existing.tenantId).forEach((b, i) => {
        b.order = i
      })
    })
    return json({ ok: true })
  }],

  ['POST', '/banners/reorder', ({ body, headers }) => {
    const ids = Array.isArray(body?.ids) ? body.ids.map((id) => sanitizeText(id, 40)) : []
    const auth = requireStaff(headers, 'store.banners', body?.tenantId)
    if (auth.error) return auth.error
    mutate((db) => {
      db.banners.forEach((b) => {
        if (b.tenantId !== auth.tenantId) return
        const index = ids.indexOf(b.id)
        if (index > -1) b.order = index
      })
    })
    return json({ ok: true })
  }],

  /* ---- orders ---- */

  ['GET', '/orders', ({ searchParams, headers }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized()
    const db = getDb()
    let items

    if (user.role === ROLES.CUSTOMER) {
      const customerIds = db.customers.filter((c) => c.email === user.email).map((c) => c.id)
      items = db.orders.filter((o) => o.customerId === user.id || customerIds.includes(o.customerId))
    } else {
      const tenantId = searchParams.get('tenantId') || user.tenantId
      if (!ownsTenant(user, tenantId)) return forbidden()
      if (!hasPermission(user.role, 'store.orders')) return forbidden()
      items = db.orders.filter((o) => !tenantId || o.tenantId === tenantId)
    }

    const status = searchParams.get('status')
    if (status) items = items.filter((o) => o.status === status)
    const q = sanitizeText(searchParams.get('q') || '', 60).toLowerCase()
    if (q) items = items.filter((o) => o.number.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
    items = [...items].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    return json(paginate(items, searchParams))
  }],

  ['GET', '/orders/:id', ({ params, headers }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized()
    const db = getDb()
    const order = db.orders.find((o) => o.id === params.id || o.number === params.id)
    if (!order) return notFound('We could not find that order.')
    if (user.role === ROLES.CUSTOMER) {
      const customerIds = db.customers.filter((c) => c.email === user.email).map((c) => c.id)
      if (order.customerId !== user.id && !customerIds.includes(order.customerId)) return forbidden()
    } else if (!ownsTenant(user, order.tenantId)) {
      return forbidden()
    }
    return json(order)
  }],

  ['PATCH', '/orders/:id', ({ params, body, headers }) => {
    const existing = getDb().orders.find((o) => o.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.orders', existing.tenantId)
    if (auth.error) return auth.error
    if (body.status && !ORDER_STATUS.includes(body.status)) return badRequest('That order status is not recognised.')
    let order
    mutate((db) => {
      order = db.orders.find((o) => o.id === params.id)
      if (body.status && body.status !== order.status) {
        order.status = body.status
        order.timeline.push({ status: body.status, at: new Date().toISOString() })
      }
      if (body.tracking) {
        order.tracking = {
          carrier: sanitizeText(body.tracking.carrier, 60),
          code: sanitizeText(body.tracking.code, 40),
        }
      }
      if (body.note !== undefined) order.note = sanitizeText(body.note, 400)
    })
    return json(order)
  }],

  ['POST', '/checkout', ({ body, headers }) => {
    const user = currentUser(headers)
    const db = getDb()
    const store = db.stores.find((s) => s.id === body?.tenantId)
    if (!store) return badRequest('We could not identify the storefront for this order.')
    if (store.status !== 'active') return badRequest('This storefront is not accepting orders right now.')

    const cart = Array.isArray(body?.items) ? body.items : []
    if (!cart.length) return badRequest('Your bag is empty.')

    const address = body?.address || {}
    for (const [field, label] of [['name', 'name'], ['phone', 'phone number'], ['address', 'street address'], ['city', 'city'], ['state', 'state'], ['pin', 'PIN code']]) {
      if (!sanitizeText(address[field], 200)) return badRequest(`Please add a delivery ${label}.`)
    }
    if (!isPhone(address.phone)) return badRequest('That delivery phone number looks incorrect.')

    // Prices and stock are re-read from the catalogue; the client total is never trusted.
    const lines = []
    for (const line of cart) {
      const product = db.products.find((p) => p.id === line.productId && p.tenantId === store.id)
      if (!product) return badRequest('One of the items in your bag is no longer available.')
      if (!product.published) return badRequest(`${product.name} is no longer on sale.`)
      const qty = Math.max(1, Math.min(10, Number(line.qty) || 1))
      if (product.inventory < qty) return badRequest(`Only ${product.inventory} left of ${product.name}.`)
      lines.push({ productId: product.id, name: product.name, image: product.images[0]?.src || '', price: product.price, qty })
    }

    const subtotal = lines.reduce((sum, l) => sum + l.price * l.qty, 0)
    let discount = 0
    if (body?.couponCode) {
      const coupon = db.coupons.find(
        (c) => c.tenantId === store.id && c.code.toLowerCase() === String(body.couponCode).toLowerCase(),
      )
      if (coupon && subtotal >= coupon.minOrder) {
        discount = coupon.type === 'percent'
          ? Math.min(Math.round((subtotal * coupon.value) / 100), coupon.maxDiscount || Infinity)
          : coupon.value
      }
    }
    const shipping = subtotal - discount >= 2999 ? 0 : 149
    const total = Math.max(0, subtotal - discount + shipping)

    let order
    mutate((d) => {
      order = {
        id: uid('ord'),
        number: 'VK' + Math.floor(10000 + Math.random() * 89999),
        tenantId: store.id,
        customerId: user?.id || 'guest',
        customerName: sanitizeText(address.name, 80),
        customerEmail: user?.email || sanitizeText(body?.email, 120),
        status: 'placed',
        paymentStatus: body?.paymentMethod === 'cod' ? 'pending' : 'paid',
        paymentMethod: pick.enumeration(body?.paymentMethod, ['upi', 'card', 'netbanking', 'cod'], 'upi'),
        items: lines,
        address: {
          name: sanitizeText(address.name, 80),
          phone: sanitizeText(address.phone, 20),
          address: sanitizeText(address.address, 200),
          apartment: sanitizeText(address.apartment, 120),
          city: sanitizeText(address.city, 60),
          state: sanitizeText(address.state, 60),
          pin: sanitizeText(address.pin, 10),
        },
        totals: { subtotal, shipping, discount, tax: Math.round((subtotal / 1.05) * 0.05), total },
        timeline: [{ status: 'placed', at: new Date().toISOString() }],
        tracking: null,
        createdAt: new Date().toISOString(),
      }
      d.orders.unshift(order)
      lines.forEach((line) => {
        const product = d.products.find((p) => p.id === line.productId)
        if (product) product.inventory = Math.max(0, product.inventory - line.qty)
      })
      const target = d.stores.find((s) => s.id === store.id)
      if (target) {
        target.ordersCount += 1
        target.gmv += total
      }
      d.notifications.unshift({
        id: uid('ntf'),
        tenantId: store.id,
        audience: 'admin',
        type: 'order',
        title: 'New order',
        body: `Order ${order.number} for ${lines.length} item(s)`,
        read: false,
        createdAt: new Date().toISOString(),
      })
    })
    return json(order, 201)
  }],

  /* ---- customers ---- */

  ['GET', '/customers', ({ searchParams, headers }) => {
    const auth = requireStaff(headers, 'store.customers', searchParams.get('tenantId'))
    if (auth.error) return auth.error
    let items = getDb().customers.filter((c) => !auth.tenantId || c.tenantId === auth.tenantId)
    const q = sanitizeText(searchParams.get('q') || '', 60).toLowerCase()
    if (q) items = items.filter((c) => c.name.toLowerCase().includes(q) || c.email.includes(q))
    return json(paginate(items, searchParams))
  }],

  ['GET', '/customers/:id', ({ params, headers }) => {
    const db = getDb()
    const customer = db.customers.find((c) => c.id === params.id)
    if (!customer) return notFound()
    const auth = requireStaff(headers, 'store.customers', customer.tenantId)
    if (auth.error) return auth.error
    return json({ ...customer, orders: db.orders.filter((o) => o.customerId === customer.id) })
  }],

  /* ---- staff ---- */

  ['GET', '/staff', ({ searchParams, headers }) => {
    const auth = requireStaff(headers, 'store.users', searchParams.get('tenantId'))
    if (auth.error) return auth.error
    const items = getDb()
      .users.filter((u) => u.tenantId === auth.tenantId && u.role !== ROLES.CUSTOMER)
      .map(publicUser)
    return json(items)
  }],

  ['PATCH', '/staff/:id', ({ params, body, headers }) => {
    const target = getDb().users.find((u) => u.id === params.id)
    if (!target) return notFound()
    const auth = requireStaff(headers, 'store.users', target.tenantId)
    if (auth.error) return auth.error
    const allowed = [ROLES.STORE_ADMIN, ROLES.STORE_MANAGER, ROLES.CONTENT_MANAGER, ROLES.INVENTORY_MANAGER]
    if (target.role === ROLES.STORE_OWNER || target.role === ROLES.SUPER_ADMIN) {
      return forbidden('Owner accounts can only be changed by the platform operator.')
    }
    if (!allowed.includes(body?.role)) return badRequest('Choose one of the available staff roles.')
    let updated
    mutate((db) => {
      updated = db.users.find((u) => u.id === params.id)
      updated.role = body.role
      // Force the account to re-authenticate so the new role takes effect everywhere.
      db.sessions = (db.sessions || []).filter((s) => s.userId !== params.id)
    })
    return json(publicUser(updated))
  }],

  ['GET', '/users', ({ searchParams, headers }) => {
    const auth = requireSuperAdmin(headers)
    if (auth.error) return auth.error
    const db = getDb()
    const role = searchParams.get('role')
    const q = sanitizeText(searchParams.get('q') || '', 60).toLowerCase()
    let items = db.users.map((u) => ({
      ...publicUser(u),
      storeName: db.stores.find((s) => s.id === u.tenantId)?.name || '—',
    }))
    if (role === 'staff') items = items.filter((u) => u.role !== ROLES.CUSTOMER)
    else if (role) items = items.filter((u) => u.role === role)
    if (q) items = items.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
    return json(paginate(items, searchParams))
  }],

  /* ---- coupons ---- */

  ['GET', '/coupons', ({ searchParams, headers }) => {
    const auth = requireStaff(headers, 'store.coupons', searchParams.get('tenantId'))
    if (auth.error) return auth.error
    return json(getDb().coupons.filter((c) => c.tenantId === auth.tenantId))
  }],

  ['POST', '/coupons', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.coupons', body?.tenantId)
    if (auth.error) return auth.error
    const code = sanitizeText(body?.code, 24).toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (code.length < 4) return badRequest('Use at least 4 letters or numbers for the code.')
    if (getDb().coupons.some((c) => c.tenantId === auth.tenantId && c.code === code)) {
      return badRequest('That coupon code already exists.')
    }
    const type = pick.enumeration(body?.type, ['percent', 'fixed'], 'percent')
    const value = pick.number(body?.value, { min: 1, max: type === 'percent' ? 90 : 100000 })
    let coupon
    mutate((db) => {
      coupon = {
        id: uid('cpn'),
        tenantId: auth.tenantId,
        code,
        type,
        value,
        minOrder: pick.number(body?.minOrder, { max: 1000000 }),
        maxDiscount: pick.number(body?.maxDiscount, { max: 1000000 }),
        firstOrder: pick.bool(body?.firstOrder),
        usageLimit: pick.number(body?.usageLimit ?? 1000, { max: 1000000 }),
        used: 0,
        expiresAt: pick.date(body?.expiresAt),
        productIds: [],
        categoryIds: [],
      }
      db.coupons.unshift(coupon)
    })
    return json(coupon, 201)
  }],

  ['DELETE', '/coupons/:id', ({ params, headers }) => {
    const existing = getDb().coupons.find((c) => c.id === params.id)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.coupons', existing.tenantId)
    if (auth.error) return auth.error
    mutate((db) => {
      db.coupons = db.coupons.filter((c) => c.id !== params.id)
    })
    return json({ ok: true })
  }],

  ['POST', '/coupons/validate', ({ body }) => {
    const db = getDb()
    const code = sanitizeText(body?.code, 24).toLowerCase()
    const coupon = db.coupons.find((c) => c.tenantId === body?.tenantId && c.code.toLowerCase() === code)
    if (!coupon) return badRequest('That code is not valid for this store.')
    if (coupon.expiresAt && !withinDateRange('', coupon.expiresAt)) return badRequest('That code has expired.')
    if (coupon.usageLimit && coupon.used >= coupon.usageLimit) return badRequest('That code has been fully redeemed.')
    const subtotal = pick.number(body?.subtotal, { max: 10000000 })
    if (subtotal < coupon.minOrder) {
      return badRequest(`Add ₹${(coupon.minOrder - subtotal).toLocaleString('en-IN')} more to use this code.`)
    }
    const discount = coupon.type === 'percent'
      ? Math.min(Math.round((subtotal * coupon.value) / 100), coupon.maxDiscount || Infinity)
      : Math.min(coupon.value, subtotal)
    return json({ coupon: { code: coupon.code, type: coupon.type, value: coupon.value }, discount })
  }],

  /* ---- reviews, questions, waitlist ---- */

  ['GET', '/reviews', ({ searchParams }) => {
    const productId = searchParams.get('productId')
    const tenantId = searchParams.get('tenantId')
    return json(
      getDb().reviews.filter(
        (r) => (!productId || r.productId === productId) && (!tenantId || r.tenantId === tenantId),
      ),
    )
  }],

  ['POST', '/reviews', ({ body, headers }) => {
    const user = currentUser(headers)
    if (!user) return unauthorized('Please sign in to write a review.')
    const db = getDb()
    const product = db.products.find((p) => p.id === body?.productId)
    if (!product) return notFound('That product no longer exists.')
    const rating = pick.number(body?.rating, { min: 1, max: 5 })
    const reviewBody = pick.long(body?.body, 1200)
    if (!reviewBody) return badRequest('Please write a few words about the product.')

    let review
    mutate((d) => {
      review = {
        id: uid('rev'),
        tenantId: product.tenantId,
        productId: product.id,
        author: user.name,
        rating,
        title: pick.text(body?.title, 120),
        body: reviewBody,
        images: [],
        verified: d.orders.some((o) => o.customerId === user.id && o.items.some((i) => i.productId === product.id)),
        createdAt: new Date().toISOString(),
      }
      d.reviews.unshift(review)
      const target = d.products.find((p) => p.id === product.id)
      const all = d.reviews.filter((r) => r.productId === product.id)
      target.reviewCount = all.length
      target.rating = Math.round((all.reduce((s, r) => s + r.rating, 0) / all.length) * 10) / 10
    })
    return json(review, 201)
  }],

  ['POST', '/waitlist', ({ body }) => {
    const email = sanitizeText(body?.email, 120)
    if (!isEmail(email)) return badRequest('Enter a valid email so we can notify you.')
    const productId = sanitizeText(body?.productId, 40)
    mutate((db) => {
      db.waitlist = [...(db.waitlist || []).filter((w) => !(w.email === email && w.productId === productId)), {
        id: uid('wl'),
        email,
        productId,
        tenantId: sanitizeText(body?.tenantId, 40),
        createdAt: new Date().toISOString(),
      }]
    })
    return json({ ok: true }, 201)
  }],

  ['POST', '/newsletter', ({ body }) => {
    const email = sanitizeText(body?.email, 120)
    if (!isEmail(email)) return badRequest('Enter a valid email address.')
    return json({ ok: true })
  }],

  /* ---- notifications ---- */

  ['GET', '/notifications', ({ searchParams, headers }) => {
    const user = currentUser(headers)
    const tenantId = searchParams.get('tenantId')
    const audience = searchParams.get('audience') || 'customer'
    if (audience === 'admin' && !ownsTenant(user, tenantId)) return forbidden()
    return json(
      getDb().notifications.filter(
        (n) => (!tenantId || n.tenantId === tenantId) && n.audience === audience,
      ),
    )
  }],

  ['POST', '/notifications/read', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.dashboard', body?.tenantId)
    if (auth.error) return auth.error
    mutate((db) => {
      db.notifications.forEach((n) => {
        if (n.tenantId === auth.tenantId && n.audience === 'admin') n.read = true
      })
    })
    return json({ ok: true })
  }],

  /* ---- analytics ---- */

  ['GET', '/analytics/platform', ({ headers }) => {
    const auth = requireSuperAdmin(headers)
    if (auth.error) return auth.error
    const db = getDb()
    return json({
      ...db.analytics.platform,
      stores: db.stores.length,
      activeStores: db.stores.filter((s) => s.status === 'active').length,
      products: db.products.length,
      gmv: db.stores.reduce((sum, s) => sum + s.gmv, 0),
      orders: db.stores.reduce((sum, s) => sum + s.ordersCount, 0),
    })
  }],

  ['GET', '/analytics/store', ({ searchParams, headers }) => {
    const auth = requireStaff(headers, 'store.dashboard', searchParams.get('tenantId'))
    if (auth.error) return auth.error
    const db = getDb()
    const tenantId = auth.tenantId
    const store = db.stores.find((s) => s.id === tenantId)
    const storeProducts = db.products.filter((p) => p.tenantId === tenantId)
    const storeOrders = db.orders.filter((o) => o.tenantId === tenantId)
    return json({
      sales: store?.gmv || 0,
      revenue: Math.round((store?.gmv || 0) * 0.18),
      orders: store?.ordersCount || storeOrders.length,
      products: storeProducts.length,
      publishedProducts: storeProducts.filter((p) => p.published).length,
      customers: store?.customersCount || 0,
      inventory: storeProducts.reduce((s, p) => s + p.inventory, 0),
      lowStock: storeProducts.filter((p) => p.inventory > 0 && p.inventory <= 5).length,
      outOfStock: storeProducts.filter((p) => p.inventory <= 0).length,
      wishlistAdds: 186,
      cartAdds: 240,
      conversion: 3.1,
      abandonment: 62,
      series: db.analytics.platform.series,
      topProducts: [...storeProducts].sort((a, b) => b.reviewCount - a.reviewCount).slice(0, 5).map((p) => ({ name: p.name, value: p.price })),
      recentOrders: [...storeOrders].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 6),
    })
  }],

  /* ---- customizer ---- */

  ['POST', '/customize/save', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.appearance', body?.tenantId)
    if (auth.error) return auth.error
    let store
    mutate((db) => {
      store = db.stores.find((s) => s.id === auth.tenantId)
      if (!store) return
      if (body.themeDraft) store.themeDraft = body.themeDraft
      if (body.homepageDraft) store.homepageDraft = body.homepageDraft
      if (body.navigationDraft) store.navigationDraft = body.navigationDraft
      if (body.branding) {
        store.branding = {
          ...store.branding,
          name: sanitizeText(body.branding.name ?? store.branding.name, 80),
          tagline: sanitizeText(body.branding.tagline ?? store.branding.tagline, 120),
          logo: body.branding.logo === undefined ? store.branding.logo : safeImageUrl(body.branding.logo) || null,
        }
        store.logoText = store.branding.name
      }
      store.draftUpdatedAt = new Date().toISOString()
    })
    if (!store) return notFound()
    return json({ ok: true, status: 'draft', store })
  }],

  ['POST', '/customize/publish', ({ body, headers }) => {
    const auth = requireStaff(headers, 'store.appearance', body?.tenantId)
    if (auth.error) return auth.error
    let store
    mutate((db) => {
      store = db.stores.find((s) => s.id === auth.tenantId)
      if (!store) return
      if (store.themeDraft) store.theme = JSON.parse(JSON.stringify(store.themeDraft))
      if (store.homepageDraft) store.homepage = JSON.parse(JSON.stringify(store.homepageDraft))
      if (store.navigationDraft) store.navigation = JSON.parse(JSON.stringify(store.navigationDraft))
      store.versions = [
        ...(store.versions || []),
        { id: uid('ver'), createdAt: new Date().toISOString(), label: sanitizeText(body?.label, 80) || 'Published' },
      ].slice(-20)
    })
    if (!store) return notFound()
    return json({ ok: true, status: 'published', store })
  }],

  /* ---- inventory ---- */

  ['GET', '/inventory', ({ searchParams, headers }) => {
    const auth = requireStaff(headers, 'store.inventory', searchParams.get('tenantId'))
    if (auth.error) return auth.error
    const status = searchParams.get('status')
    let items = getDb().products.filter((p) => p.tenantId === auth.tenantId)
    if (status === 'low') items = items.filter((p) => p.inventory > 0 && p.inventory <= 5)
    if (status === 'out') items = items.filter((p) => p.inventory <= 0)
    return json(
      items.map((p) => ({
        sku: p.sku,
        product: p.name,
        variant: p.variants[0]?.color || p.color,
        stock: p.inventory,
        reserved: p.reserved || 0,
        available: Math.max(0, p.inventory - (p.reserved || 0)),
        productId: p.id,
        category: p.fabric,
      })),
    )
  }],

  ['PATCH', '/inventory/:productId', ({ params, body, headers }) => {
    const existing = getDb().products.find((p) => p.id === params.productId)
    if (!existing) return notFound()
    const auth = requireStaff(headers, 'store.inventory', existing.tenantId)
    if (auth.error) return auth.error
    let product
    mutate((db) => {
      product = db.products.find((p) => p.id === params.productId)
      product.inventory = pick.number(body?.inventory, { max: 100000 })
    })
    return json({ ok: true, productId: product.id, inventory: product.inventory })
  }],
]

export async function mockRequest(method, path, { body, headers = {}, searchParams } = {}) {
  await delay(method === 'GET' ? 120 : 200)
  const [pathname, query = ''] = path.split('?')
  const paramsFromUrl = searchParams || new URLSearchParams(query)

  for (const [routeMethod, pattern, handler] of routes) {
    if (routeMethod !== method) continue
    const params = matchPath(pattern, pathname)
    if (!params) continue
    try {
      return handler({ params, body: body || {}, headers, searchParams: paramsFromUrl })
    } catch (error) {
      // Never surface internals to the client; log locally for the developer.
      console.error('[mock-api]', method, pathname, error)
      return json({ message: 'Something went wrong. Please try again.' }, 500)
    }
  }
  return notFound(`No route for ${method} ${pathname}`)
}
