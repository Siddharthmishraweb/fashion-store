import { getThemeById, THEMES } from '../../theme/themes.js'
import { CATALOG_BLUEPRINT, CATEGORY_TREE, LOOKS, PHOTOS } from '../mock/catalog.js'

const cache = new Map()
const PREFIX = 'preview:'

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

export function isPreviewTenantId(id) {
  return String(id || '').startsWith(PREFIX)
}

export function themePreviewPath(themeId, rest = '') {
  const base = `/preview/${encodeURIComponent(themeId)}`
  if (!rest) return base
  return `${base}${rest.startsWith('/') ? rest : `/${rest}`}`
}

export function openThemePreview(themeId) {
  window.open(themePreviewPath(themeId), '_blank', 'noopener,noreferrer')
}

export function buildPreviewStorefront(themeId) {
  const theme = THEMES.find((item) => item.id === themeId) || (themeId ? getThemeById(themeId) : null)
  if (!theme || theme.id !== themeId) return null
  if (cache.has(themeId)) return cache.get(themeId)
  const built = assemble(theme)
  cache.set(themeId, built)
  return built
}

function assemble(theme) {
  const themeId = theme.id
  const tenantId = `${PREFIX}${themeId}`
  const path = `/preview/${themeId}`
  const now = '2026-09-01T10:00:00.000Z'
  const house = theme.name

  const categories = CATEGORY_TREE.map((cat, i) => ({
    id: `cat_${tenantId}_${cat.slug}`,
    tenantId,
    slug: cat.slug,
    name: cat.name,
    parentId: null,
    published: true,
    order: i,
    image: LOOKS[i % LOOKS.length],
    children: (cat.children || []).map((child, j) => ({
      id: `cat_${tenantId}_${child.slug}`,
      tenantId,
      slug: child.slug,
      name: child.name,
      parentId: `cat_${tenantId}_${cat.slug}`,
      published: true,
      order: j,
      image: LOOKS[(i + j + 3) % LOOKS.length],
    })),
  }))

  const products = CATALOG_BLUEPRINT.map((item, i) => {
    const imgA = LOOKS[i % LOOKS.length]
    const imgB = LOOKS[(i + 4) % LOOKS.length]
    const id = `prd_${tenantId}_${i}`
    const subcategory = categories[0].children[i % categories[0].children.length]
    const inventory = 4 + ((i * 3) % 18)
    return {
      id,
      tenantId,
      slug: slugify(`${item.name}-${themeId}`),
      name: item.name,
      brand: house,
      sku: `PV-${1000 + i}`,
      description: `A ${item.fabric.toLowerCase()} ${item.weave.toLowerCase()} weave from ${item.region}, composed for ${item.occasion.toLowerCase()} hours. The ${item.pattern.toLowerCase()} sits lightly on the pallu, with a blouse piece included.`,
      categoryId: categories[0].id,
      subcategoryId: subcategory.id,
      categorySlug: i % 7 === 0 ? 'wedding' : item.occasion === 'Festive' ? 'festive' : 'sarees',
      price: item.price,
      mrp: item.mrp,
      gst: 5,
      images: [
        { src: imgA, alt: item.name },
        { src: imgB, alt: `${item.name} reverse` },
        { src: LOOKS[(i + 8) % LOOKS.length], alt: `${item.name} drape` },
      ],
      videos: [],
      fabric: item.fabric,
      color: item.color,
      colors: [item.color, 'Ivory', 'Maroon'].slice(0, 1 + (i % 3)),
      pattern: item.pattern,
      occasion: item.occasion,
      region: item.region,
      weave: item.weave,
      length: '5.5 m + 0.8 m blouse',
      blouse: 'Unstitched blouse piece included',
      tags: [item.fabric, item.region, item.occasion],
      badges: [item.badge, i < 3 ? 'new' : null].filter(Boolean),
      inventory,
      reserved: Math.min(2, inventory),
      dimensions: 'Saree 5.5m · Blouse 0.8m',
      care: 'Dry clean only. Store in muslin, away from moisture.',
      shipping: 'Dispatched in 2–4 days. Insured shipping across India.',
      returns: '7-day easy returns on unused product with tags intact.',
      rating: 4.2 + ((i % 7) * 0.1),
      reviewCount: 8 + i * 3,
      published: true,
      featured: i % 4 === 0,
      createdAt: now,
      taxInfo: 'Inclusive of GST. Shipping calculated at checkout.',
      craft: `${item.weave} weaving tradition of ${item.region}.`,
      details: [
        ['Fabric', item.fabric],
        ['Weave', item.weave],
        ['Region', item.region],
        ['Occasion', item.occasion],
        ['Pattern', item.pattern],
        ['Colour', item.color],
      ],
      variants: [
        {
          id: `${id}_v1`,
          sku: `PV-${1000 + i}-A`,
          color: item.color,
          size: 'Free size',
          design: item.pattern,
          fabric: item.fabric,
          price: item.price,
          inventory,
          availability: inventory > 0,
          images: [imgA],
        },
      ],
    }
  })

  const ids = products.map((p) => p.id)
  const collections = [
    { id: `col_${tenantId}_new`, tenantId, name: 'New Arrivals', type: 'manual', productIds: ids.slice(0, 8) },
    { id: `col_${tenantId}_trend`, tenantId, name: 'Trending', type: 'manual', productIds: ids.slice(4, 12) },
    { id: `col_${tenantId}_best`, tenantId, name: 'Best Sellers', type: 'manual', productIds: ids.filter((_, i) => i % 2 === 0).slice(0, 8) },
    { id: `col_${tenantId}_wed`, tenantId, name: 'Wedding Edit', type: 'dynamic', productIds: products.filter((p) => p.occasion === 'Wedding').map((p) => p.id) },
    { id: `col_${tenantId}_fest`, tenantId, name: 'Festive Edit', type: 'dynamic', productIds: products.filter((p) => p.occasion === 'Festive').map((p) => p.id) },
  ]

  const banners = [
    {
      id: `ban_${tenantId}_1`,
      tenantId,
      name: 'Homepage hero',
      heading: house,
      subtitle: theme.description,
      ctaText: 'Shop the collection',
      ctaUrl: `${path}/products`,
      desktopImage: PHOTOS.hero1,
      tabletImage: PHOTOS.hero1,
      mobileImage: PHOTOS.hero1m,
      overlay: 'center',
      align: 'center',
      theme: 'light',
      status: 'published',
      active: true,
      order: 0,
      startDate: '',
      endDate: '',
    },
    {
      id: `ban_${tenantId}_2`,
      tenantId,
      name: 'Wedding edit',
      heading: 'Wedding silks',
      subtitle: 'From ₹8,990',
      ctaText: 'Enter the edit',
      ctaUrl: `${path}/category/wedding`,
      desktopImage: PHOTOS.hero2,
      tabletImage: PHOTOS.hero2,
      mobileImage: PHOTOS.hero2m,
      overlay: 'left',
      align: 'left',
      theme: 'light',
      status: 'published',
      active: true,
      order: 1,
      startDate: '',
      endDate: '',
    },
    {
      id: `ban_${tenantId}_3`,
      tenantId,
      name: 'Handloom fortnight',
      heading: 'Handloom fortnight',
      subtitle: 'Meet the weaves',
      ctaText: 'Discover',
      ctaUrl: `${path}/category/sarees`,
      desktopImage: PHOTOS.hero3,
      tabletImage: PHOTOS.hero3,
      mobileImage: PHOTOS.hero3m,
      overlay: 'right',
      align: 'right',
      theme: 'light',
      status: 'published',
      active: true,
      order: 2,
      startDate: '',
      endDate: '',
    },
  ]

  const sarees = categories.find((c) => c.slug === 'sarees')
  const navigation = {
    items: [
      {
        id: 'nav_sarees',
        label: 'Sarees',
        href: `${path}/category/sarees`,
        mega: {
          columns: (sarees?.children || []).map((child) => ({
            title: child.name,
            href: `${path}/category/${child.slug}`,
            links: [
              { label: 'All ' + child.name, href: `${path}/category/${child.slug}` },
              { label: 'Wedding', href: `${path}/category/wedding` },
              { label: 'Festive', href: `${path}/category/festive` },
            ],
          })),
          featured: { title: 'Handloom edit', image: PHOTOS.weave, href: `${path}/category/sarees` },
          promo: { title: 'New in', image: PHOTOS.look1, href: `${path}/category/new-arrivals` },
        },
      },
      { id: 'nav_new', label: 'New Arrivals', href: `${path}/category/new-arrivals` },
      { id: 'nav_best', label: 'Best Sellers', href: `${path}/category/best-sellers` },
      { id: 'nav_wed', label: 'Wedding', href: `${path}/category/wedding` },
      { id: 'nav_fest', label: 'Festive', href: `${path}/category/festive` },
    ],
  }

  const homepage = themeId === 'six-yards'
    ? {
        version: 1,
        status: 'published',
        sections: [
          { id: 'sec_announce', type: 'announcement', enabled: true, config: { text: 'Search festive sarees · Complimentary blouse stitching on weaves above ₹9,999', link: `${path}/products` } },
          { id: 'sec_featured', type: 'product_grid', enabled: true, config: { title: '', collectionId: `col_${tenantId}_trend`, columnsDesktop: 2, columnsTablet: 2, columnsMobile: 2, showPrice: true, showWishlist: true } },
          { id: 'sec_looks', type: 'category_grid', enabled: true, config: { title: 'Shop By Look', style: 'looks' } },
          { id: 'sec_fav', type: 'product_slider', enabled: true, config: { title: 'Customer favourites', collectionId: `col_${tenantId}_best`, showPrice: true } },
          { id: 'sec_weave', type: 'shop_by_fabric', enabled: true, config: { title: 'Shop by weave' } },
          { id: 'sec_promo', type: 'collection_banner', enabled: true, config: { title: 'Wedding sarees', subtitle: 'Temple borders, zari pallus, and silks for the mandap.', image: PHOTOS.festive, ctaText: 'Shop wedding sarees', ctaUrl: `${path}/category/wedding` } },
          { id: 'sec_new', type: 'product_grid', enabled: true, config: { title: 'New in sarees', collectionId: `col_${tenantId}_new`, columnsDesktop: 4, columnsTablet: 3, columnsMobile: 2, showPrice: true } },
        ],
      }
    : {
        version: 1,
        status: 'published',
        sections: [
          { id: 'sec_announce', type: 'announcement', enabled: true, config: { text: 'Complimentary blouse stitching on weaves above ₹9,999 · Pan-India shipping', link: `${path}/products` } },
          { id: 'sec_hero', type: 'carousel', enabled: true, config: { variant: theme.bannerStyle === 'fullscreen' ? 'fullscreen' : 'editorial', autoplay: true, autoplaySpeed: 5200, showArrows: true, showDots: true, pauseOnHover: true, loop: true, transition: 'fade', bannerIds: banners.map((b) => b.id) } },
          { id: 'sec_cats', type: 'category_grid', enabled: true, config: { title: 'Shop by category', style: 'editorial' } },
          { id: 'sec_new', type: 'product_grid', enabled: true, config: { title: 'New arrivals', subtitle: 'Fresh from the loom', collectionId: `col_${tenantId}_new`, columnsDesktop: 4, columnsTablet: 3, columnsMobile: 2, showPrice: true, showWishlist: true } },
          { id: 'sec_split', type: 'split_editorial', enabled: true, config: { title: 'A season of celebration', body: `${house} presents weaves chosen for light, occasion, and the quiet ceremony of getting dressed.`, ctaText: 'Explore the edit', ctaUrl: `${path}/category/festive`, image: PHOTOS.editorial, imagePosition: 'right' } },
          { id: 'sec_trend', type: 'product_slider', enabled: true, config: { title: 'Trending sarees', collectionId: `col_${tenantId}_trend`, showPrice: true, showWishlist: true } },
          { id: 'sec_fabric', type: 'shop_by_fabric', enabled: true, config: { title: 'Shop by fabric' } },
          { id: 'sec_occ', type: 'shop_by_occasion', enabled: true, config: { title: 'Shop by occasion' } },
          { id: 'sec_promo', type: 'collection_banner', enabled: true, config: { title: 'Wedding Edit', subtitle: 'Silks for the aisle, the mandap, and the after-hours.', image: PHOTOS.festive, ctaText: 'Enter the collection', ctaUrl: `${path}/category/wedding` } },
          { id: 'sec_quotes', type: 'testimonials', enabled: true, config: { title: 'From the atelier floor' } },
        ],
      }

  const reviews = products.slice(0, 4).map((p, i) => ({
    id: `rev_${p.id}`,
    tenantId,
    productId: p.id,
    author: ['Ananya Rao', 'Meera Iyer', 'Zara Khan', 'Nisha Patel'][i],
    rating: 5 - (i % 2),
    title: 'Drapes like water',
    body: 'The weave is generous, the colour true to the atelier photographs, and finishing is precise.',
    images: i === 0 ? [p.images[0].src] : [],
    verified: true,
    createdAt: now,
  }))

  const questions = products.slice(0, 4).map((p) => ({
    id: `q_${p.id}`,
    tenantId,
    productId: p.id,
    question: 'Is the blouse piece included?',
    answer: 'Yes, an unstitched blouse piece of 0.8m is included.',
    createdAt: now,
  }))

  const settings = {
    currency: 'INR',
    locale: 'en',
    supportEmail: `hello@${slugify(house)}.example`,
    freeShippingFrom: 2999,
  }

  return {
    tenant: {
      id: tenantId,
      slug: themeId,
      basePath: path,
      isPreview: true,
      name: house,
      tagline: theme.description,
      domain: `${themeId}.preview.vastrika`,
      email: settings.supportEmail,
      phone: '+91 98765 00000',
      address: '12 Atelier Lane, Preview',
      city: 'Bengaluru',
      status: 'active',
      logoText: house,
      branding: { name: house, tagline: theme.description, logo: '' },
      social: { instagram: '@vastrika.preview' },
      settings,
    },
    theme,
    settings,
    navigation,
    homepage,
    banners,
    categories,
    collections,
    testimonials: [
      { author: 'Ananya Rao', role: 'Bengaluru', quote: 'The pallu falls with the kind of weight that photographs never quite capture.' },
      { author: 'Meera Iyer', role: 'Chennai', quote: 'Quiet luxury, considered service, and weaves I will keep for decades.' },
      { author: 'Zara Khan', role: 'Delhi', quote: 'A storefront that feels like a private atelier rather than a catalogue.' },
    ],
    instagram: [PHOTOS.insta1, PHOTOS.insta2, PHOTOS.insta3, PHOTOS.insta4, PHOTOS.insta5, PHOTOS.insta6],
    products,
    reviews,
    questions,
    popularSearches: ['Banarasi', 'Kanjivaram', 'Wedding silk', 'Organza', 'Handloom'],
  }
}

function catalogFor(tenantId) {
  if (!isPreviewTenantId(tenantId)) return null
  return buildPreviewStorefront(tenantId.slice(PREFIX.length))
}

const BROWSE_ALL = ['sarees', 'fabrics', 'regional', 'accessories', 'all', 'products']

function matchesCategory(product, slug, categories) {
  if (BROWSE_ALL.includes(slug)) return true
  if (slug === 'sale') return product.mrp > product.price
  if (slug === 'new-arrivals') return product.badges.includes('new')
  if (slug === 'best-sellers') return product.badges.includes('bestseller')
  if (product.categorySlug === slug) return true
  const category = categories.find((c) => c.slug === slug) || categories.flatMap((c) => c.children || []).find((c) => c.slug === slug)
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

function asList(value) {
  if (Array.isArray(value)) return value.filter(Boolean)
  if (value == null || value === '') return []
  return [value]
}

function filterProducts(pack, params) {
  let items = [...pack.products]
  const q = String(params.q || '').trim().toLowerCase()
  const category = params.category
  const min = Number(params.minPrice || 0)
  const max = Number(params.maxPrice || 0)
  const sort = params.sort || 'newest'

  if (q) {
    items = items.filter((p) =>
      [p.name, p.brand, p.fabric, p.region, p.occasion, p.weave, p.pattern].join(' ').toLowerCase().includes(q),
    )
  }
  if (category) items = items.filter((p) => matchesCategory(p, category, pack.categories))

  ;[
    ['fabric', (p, v) => p.fabric === v],
    ['color', (p, v) => p.color === v || p.colors.includes(v)],
    ['pattern', (p, v) => p.pattern === v],
    ['occasion', (p, v) => p.occasion === v],
    ['region', (p, v) => p.region === v],
    ['weave', (p, v) => p.weave === v],
    ['brand', (p, v) => p.brand === v],
  ].forEach(([key, predicate]) => {
    const values = asList(params[key])
    if (values.length) items = items.filter((p) => values.some((v) => predicate(p, v)))
  })

  if (params.availability === 'in_stock') items = items.filter((p) => p.inventory > 0)
  if (params.availability === 'out_of_stock') items = items.filter((p) => p.inventory <= 0)
  if (min > 0) items = items.filter((p) => p.price >= min)
  if (max > 0) items = items.filter((p) => p.price <= max)

  if (params.ids) {
    const wanted = String(params.ids).split(',').filter(Boolean)
    items = wanted.map((id) => items.find((p) => p.id === id)).filter(Boolean)
  }

  if (params.collection) {
    const col = pack.collections.find((c) => c.id === params.collection)
    items = col ? items.filter((p) => col.productIds.includes(p.id)) : []
  }

  if (sort === 'price_asc') items.sort((a, b) => a.price - b.price)
  else if (sort === 'price_desc') items.sort((a, b) => b.price - a.price)
  else if (sort === 'rating') items.sort((a, b) => b.rating - a.rating)
  else if (sort === 'name') items.sort((a, b) => a.name.localeCompare(b.name))
  else if (sort === 'discount') items.sort((a, b) => (b.mrp - b.price) / b.mrp - (a.mrp - a.price) / a.mrp)

  return items
}

function paginate(list, params) {
  const page = Math.max(1, Number(params.page || 1))
  const limit = Math.min(60, Math.max(1, Number(params.limit || 24)))
  const start = (page - 1) * limit
  return {
    items: list.slice(start, start + limit),
    page,
    limit,
    total: list.length,
    pages: Math.ceil(list.length / limit) || 1,
  }
}

export function previewList(params = {}) {
  const pack = catalogFor(params.tenantId)
  if (!pack) return { items: [], page: 1, limit: 12, total: 0, pages: 1 }
  return paginate(filterProducts(pack, params), params)
}

export function previewFacets(tenantId) {
  const pack = catalogFor(tenantId)
  const items = pack?.products || []
  const collect = (key) => [...new Set(items.map((p) => p[key]).filter(Boolean))].sort()
  return {
    fabric: collect('fabric'),
    color: [...new Set(items.flatMap((p) => p.colors || []))].sort(),
    pattern: collect('pattern'),
    occasion: collect('occasion'),
    region: collect('region'),
    weave: collect('weave'),
    brand: collect('brand'),
    priceRange: items.length ? [Math.min(...items.map((p) => p.price)), Math.max(...items.map((p) => p.price))] : [0, 0],
  }
}

export function previewGet(id, tenantId) {
  const pack = catalogFor(tenantId)
  if (!pack) return { product: null, related: [], similar: [], reviews: [], questions: [] }
  const product = pack.products.find((p) => p.id === id || p.slug === id)
  if (!product) {
    const error = new Error('That product is no longer available.')
    error.status = 404
    throw error
  }
  const siblings = pack.products.filter((p) => p.id !== product.id)
  return {
    product,
    related: siblings.filter((p) => p.occasion === product.occasion).slice(0, 8),
    similar: siblings.filter((p) => p.fabric === product.fabric).slice(0, 8),
    reviews: pack.reviews.filter((r) => r.productId === product.id),
    questions: pack.questions.filter((q) => q.productId === product.id),
  }
}

export function previewSearch(params = {}) {
  const pack = catalogFor(params.tenantId)
  if (!pack) return { products: [], categories: [], brands: [], popular: [] }
  const q = String(params.q || '').trim().toLowerCase()
  const products = q
    ? pack.products.filter((p) => `${p.name} ${p.fabric} ${p.weave} ${p.region}`.toLowerCase().includes(q)).slice(0, 6)
    : pack.products.slice(0, 6)
  const categories = pack.categories.filter((c) => !q || c.name.toLowerCase().includes(q)).slice(0, 5)
  const brands = [...new Set(pack.products.map((p) => p.brand))].filter((b) => !q || b.toLowerCase().includes(q)).slice(0, 5)
  return { products, categories, brands, popular: pack.popularSearches }
}

export function previewRecommendations(params = {}) {
  const pack = catalogFor(params.tenantId)
  if (!pack) return { items: [], source: 'preview' }
  let items = [...pack.products]
  if (params.type === 'trending') items = items.filter((p) => p.badges.includes('trending') || p.featured)
  if (params.type === 'fbt') items = items.slice(3, 7)
  return { items: items.slice(0, 8), source: 'preview' }
}

export function previewValidateCoupon({ code, subtotal }) {
  const c = String(code || '').trim().toUpperCase()
  if (c !== 'WELCOME10') {
    throw new Error('That code is not valid on this mock storefront. Try WELCOME10.')
  }
  if (Number(subtotal) < 4999) {
    throw new Error('WELCOME10 applies on orders above ₹4,999.')
  }
  return {
    coupon: { code: 'WELCOME10', type: 'percent', value: 10 },
    discount: Math.min(2000, Math.round(Number(subtotal) * 0.1)),
  }
}
