import { closeDatabase, sql } from './sql.js'
import { refreshAllStorefronts } from './storefront.js'
import { hashPassword } from '../lib/crypto.js'
import { getThemeById } from '../data/themes.js'
import {
  CATALOG_BLUEPRINT,
  CATEGORY_TREE,
  INSTAGRAM,
  LOOKS,
  PHOTOS,
  POPULAR_SEARCHES,
  STORE_BLUEPRINTS,
  TESTIMONIALS,
} from '../data/catalog.js'
import { productRow } from '../domain/product.js'
import { bannerRow } from '../domain/banner.js'

/*
 * Seeds a complete demo environment: eight storefronts, a catalogue per store,
 * banners, collections, staff accounts, and six months of daily rollups so the
 * dashboards have a chart to draw.
 *
 * Idempotent. Every insert is an upsert keyed on the natural identifier, so
 * running it twice leaves the same data rather than duplicating it.
 */

const DEMO_PASSWORDS = {
  super: 'Super@123',
  staff: 'Admin@123',
  customer: 'Customer@123',
}

const slugify = (value) =>
  String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

const clone = (value) => JSON.parse(JSON.stringify(value))

/*
 * postgres.js infers a JS array as a Postgres array, which is right for
 * text[] columns but wrong for a jsonb column that happens to hold an array.
 * Anything array-shaped heading for jsonb goes through here.
 */
const json = (value) => sql.json(value)

/* ----------------------------------------------------------- page defaults */

function defaultHomepage(store) {
  const fullscreen = store.themeId === 'contemporary-luxury' || store.themeId === 'festive-india'
  return {
    version: 1,
    status: 'published',
    sections: [
      { id: 'sec_announce', type: 'announcement', enabled: true, config: { text: store.announcement, link: `/store/${store.slug}/products` } },
      {
        id: 'sec_hero',
        type: 'carousel',
        enabled: true,
        config: {
          variant: fullscreen ? 'fullscreen' : 'editorial',
          autoplay: true,
          autoplaySpeed: 5200,
          showArrows: true,
          showDots: true,
          pauseOnHover: true,
          loop: true,
          transition: 'fade',
          bannerIds: [`ban_${store.id}_1`, `ban_${store.id}_2`, `ban_${store.id}_3`],
        },
      },
      { id: 'sec_cats', type: 'category_grid', enabled: true, config: { title: 'Shop by category', style: 'editorial' } },
      {
        id: 'sec_new',
        type: 'product_grid',
        enabled: true,
        config: {
          title: 'New arrivals',
          subtitle: 'Fresh from the loom',
          collectionId: `col_${store.id}_new`,
          columnsDesktop: 4,
          columnsTablet: 3,
          columnsMobile: 2,
          showPrice: true,
          showWishlist: true,
        },
      },
      {
        id: 'sec_split',
        type: 'split_editorial',
        enabled: true,
        config: {
          title: 'A season of celebration',
          body: `${store.name} presents weaves chosen for light, occasion, and the quiet ceremony of getting dressed.`,
          ctaText: 'Explore the edit',
          ctaUrl: `/store/${store.slug}/category/festive`,
          image: PHOTOS.editorial,
          imagePosition: 'right',
        },
      },
      { id: 'sec_trend', type: 'product_slider', enabled: true, config: { title: 'Trending sarees', collectionId: `col_${store.id}_trend`, showPrice: true, showWishlist: true } },
      { id: 'sec_fabric', type: 'shop_by_fabric', enabled: true, config: { title: 'Shop by fabric' } },
      { id: 'sec_occ', type: 'shop_by_occasion', enabled: true, config: { title: 'Shop by occasion' } },
      { id: 'sec_region', type: 'shop_by_region', enabled: true, config: { title: 'Shop by region' } },
      {
        id: 'sec_story',
        type: 'brand_story',
        enabled: true,
        config: {
          title: store.tagline,
          body: `${store.name} works with weavers, dyers, and embroiderers across India. Every storefront is independent — this one is simply more considered.`,
          image: PHOTOS.artisan,
        },
      },
      {
        id: 'sec_promo',
        type: 'collection_banner',
        enabled: true,
        config: {
          title: 'Wedding Edit',
          subtitle: 'Silks for the aisle, the mandap, and the after-hours.',
          image: PHOTOS.festive,
          ctaText: 'Enter the collection',
          ctaUrl: `/store/${store.slug}/category/wedding`,
        },
      },
      {
        id: 'sec_best',
        type: 'product_grid',
        enabled: true,
        config: {
          title: 'Best sellers',
          collectionId: `col_${store.id}_best`,
          columnsDesktop: 4,
          columnsTablet: 3,
          columnsMobile: 2,
          showPrice: true,
          showWishlist: true,
        },
      },
      { id: 'sec_reviews', type: 'testimonials', enabled: true, config: { title: 'From our atelier' } },
      { id: 'sec_ig', type: 'instagram', enabled: true, config: { title: `@${store.slug.replace(/-/g, '')}` } },
      { id: 'sec_news', type: 'newsletter', enabled: true, config: { title: 'Join the atelier', subtitle: 'New weaves, private previews, seasonal edits.' } },
    ],
  }
}

function defaultNavigation(store, sareeChildren) {
  return {
    items: [
      {
        id: 'nav_sarees',
        label: 'Sarees',
        href: `/store/${store.slug}/category/sarees`,
        mega: {
          columns: sareeChildren.map((child) => ({
            title: child.name,
            href: `/store/${store.slug}/category/${child.slug}`,
            links: [
              { label: `All ${child.name}`, href: `/store/${store.slug}/category/${child.slug}` },
              { label: 'Wedding', href: `/store/${store.slug}/category/wedding` },
              { label: 'Festive', href: `/store/${store.slug}/category/festive` },
            ],
          })),
          featured: { title: 'Handloom edit', image: PHOTOS.weave, href: `/store/${store.slug}/category/sarees` },
          promo: { title: 'New in', image: PHOTOS.look1, href: `/store/${store.slug}/category/new-arrivals` },
        },
      },
      { id: 'nav_new', label: 'New Arrivals', href: `/store/${store.slug}/category/new-arrivals` },
      { id: 'nav_best', label: 'Best Sellers', href: `/store/${store.slug}/category/best-sellers` },
      { id: 'nav_wed', label: 'Wedding', href: `/store/${store.slug}/category/wedding` },
      { id: 'nav_fest', label: 'Festive', href: `/store/${store.slug}/category/festive` },
      { id: 'nav_col', label: 'Collections', href: `/store/${store.slug}/products` },
      { id: 'nav_fab', label: 'Fabrics', href: `/store/${store.slug}/category/fabrics` },
      { id: 'nav_reg', label: 'Regional', href: `/store/${store.slug}/category/regional` },
      { id: 'nav_acc', label: 'Accessories', href: `/store/${store.slug}/category/accessories` },
      { id: 'nav_sale', label: 'Sale', href: `/store/${store.slug}/category/sale` },
    ],
  }
}

/* ------------------------------------------------------------ builders */

function buildProduct(blueprint, { store, index, storeIndex, categoryId, subcategoryId }) {
  const productId = `prd_${store.id}_${index}`
  const imageA = LOOKS[(index + storeIndex) % LOOKS.length]
  const imageB = LOOKS[(index + storeIndex + 4) % LOOKS.length]
  const inventory = 4 + ((index * 3 + storeIndex) % 18)
  const price = blueprint.price + storeIndex * 120
  const sku = `${store.slug.slice(0, 3).toUpperCase()}-${1000 + index}`

  return {
    id: productId,
    tenantId: store.id,
    slug: slugify(`${blueprint.name}-${store.slug}`),
    name: blueprint.name,
    brand: store.name,
    sku,
    description:
      `A ${blueprint.fabric.toLowerCase()} ${blueprint.weave.toLowerCase()} weave from ${blueprint.region}, ` +
      `composed for ${blueprint.occasion.toLowerCase()} hours. The ${blueprint.pattern.toLowerCase()} sits lightly ` +
      'on the pallu, with a blouse piece included.',
    categoryId,
    subcategoryId,
    categorySlug: index % 7 === 0 ? 'wedding' : blueprint.occasion === 'Festive' ? 'festive' : 'sarees',
    price,
    mrp: blueprint.mrp + storeIndex * 120,
    gst: 5,
    images: [
      { src: imageA, alt: blueprint.name },
      { src: imageB, alt: `${blueprint.name} reverse` },
      { src: LOOKS[(index + 8) % LOOKS.length], alt: `${blueprint.name} drape` },
    ],
    videos: [],
    fabric: blueprint.fabric,
    color: blueprint.color,
    colors: [blueprint.color, 'Ivory', 'Maroon'].slice(0, 1 + (index % 3)),
    pattern: blueprint.pattern,
    occasion: blueprint.occasion,
    region: blueprint.region,
    weave: blueprint.weave,
    length: '5.5 m + 0.8 m blouse',
    blouse: 'Unstitched blouse piece included',
    tags: [blueprint.fabric, blueprint.region, blueprint.occasion],
    badges: [blueprint.badge, index < 3 ? 'new' : null].filter(Boolean),
    inventory,
    reserved: Math.min(2, inventory),
    dimensions: 'Saree 5.5m · Blouse 0.8m',
    care: 'Dry clean only. Store in muslin, away from moisture.',
    shipping: 'Dispatched in 2–4 days. Insured shipping across India.',
    returns: '7-day easy returns on unused product with tags intact.',
    rating: Number((4.2 + (index % 7) * 0.1).toFixed(1)),
    reviewCount: 8 + index * 3,
    published: true,
    featured: index % 4 === 0,
    soldCount: 6 + index * 3 + storeIndex,
    taxInfo: 'Inclusive of GST. Shipping calculated at checkout.',
    craft: `${blueprint.weave} weaving tradition of ${blueprint.region}.`,
    details: [
      ['Fabric', blueprint.fabric],
      ['Weave', blueprint.weave],
      ['Region', blueprint.region],
      ['Occasion', blueprint.occasion],
      ['Pattern', blueprint.pattern],
      ['Colour', blueprint.color],
    ],
    variants: [
      {
        id: `${productId}_v1`,
        sku: `${sku}-A`,
        color: blueprint.color,
        size: 'Free size',
        design: blueprint.pattern,
        fabric: blueprint.fabric,
        price,
        inventory,
        availability: inventory > 0,
        images: [imageA],
      },
    ],
    createdAt: new Date(Date.UTC(2026, 8, 1, 10, 0, 0)).toISOString(),
    updatedAt: new Date(Date.UTC(2026, 8, 1, 10, 0, 0)).toISOString(),
  }
}

function buildBanners(store) {
  const shared = { tenantId: store.id, theme: 'light', startDate: '', endDate: '', updatedAt: new Date().toISOString() }
  return [
    {
      ...shared,
      id: `ban_${store.id}_1`,
      name: 'Homepage hero',
      heading: store.name,
      subtitle: store.tagline,
      ctaText: 'Shop the collection',
      ctaUrl: `/store/${store.slug}/products`,
      desktopImage: PHOTOS.hero1,
      tabletImage: PHOTOS.hero1,
      mobileImage: PHOTOS.hero1m,
      overlay: 'center',
      align: 'center',
      status: 'published',
      active: true,
      order: 0,
    },
    {
      ...shared,
      id: `ban_${store.id}_2`,
      name: 'Wedding edit',
      heading: 'Wedding silks',
      subtitle: 'From ₹8,990',
      ctaText: 'Enter the edit',
      ctaUrl: `/store/${store.slug}/category/wedding`,
      desktopImage: PHOTOS.hero2,
      tabletImage: PHOTOS.hero2,
      mobileImage: PHOTOS.hero2m,
      overlay: 'left',
      align: 'left',
      status: 'published',
      active: true,
      order: 1,
    },
    {
      ...shared,
      id: `ban_${store.id}_3`,
      name: 'Handloom fortnight',
      heading: 'Handloom fortnight',
      subtitle: 'Meet the weaves',
      ctaText: 'Discover',
      ctaUrl: `/store/${store.slug}/category/sarees`,
      desktopImage: PHOTOS.hero3,
      tabletImage: PHOTOS.hero3,
      mobileImage: PHOTOS.hero3m,
      overlay: 'right',
      align: 'right',
      status: 'published',
      active: true,
      order: 2,
    },
    {
      ...shared,
      id: `ban_${store.id}_4`,
      name: 'Festive teaser (draft)',
      heading: 'The festive edit',
      subtitle: 'Arriving this season',
      ctaText: 'Preview',
      ctaUrl: `/store/${store.slug}/category/festive`,
      desktopImage: PHOTOS.festive,
      tabletImage: PHOTOS.festive,
      mobileImage: PHOTOS.festive,
      overlay: 'center',
      align: 'center',
      status: 'draft',
      active: false,
      order: 3,
    },
  ]
}

/** Upserts rows in one statement per table rather than one per row. */
async function upsert(table, rows, conflictTarget) {
  if (!rows.length) return
  const columns = Object.keys(rows[0])
  // Column names come from the fixtures in this file, never from input, so the
  // set clause is assembled as literal text: postgres.js reads a tagged
  // template as a fragment and would otherwise treat it as a value builder.
  const assignments = columns
    .filter((column) => !conflictTarget.includes(column) && column !== 'created_at')
    .map((column) => `"${column}" = excluded."${column}"`)
    .join(', ')

  const conflict = sql.unsafe(conflictTarget.map((column) => `"${column}"`).join(', '))

  if (!assignments) {
    await sql`
      insert into ${sql(table)} ${sql(rows, ...columns)}
      on conflict (${conflict}) do nothing
    `
    return
  }

  await sql`
    insert into ${sql(table)} ${sql(rows, ...columns)}
    on conflict (${conflict}) do update set ${sql.unsafe(assignments)}
  `
}

async function main() {
  const began = Date.now()

  const storeRows = []
  const categoryRows = []
  const productRows = []
  const collectionRows = []
  const bannerRows = []
  const couponRows = []
  const customerRows = []
  const orderRows = []
  const reviewRows = []
  const questionRows = []
  const notificationRows = []
  const statRows = []
  const userSpecs = []

  const seededAt = new Date(Date.UTC(2026, 8, 1, 10, 0, 0))

  STORE_BLUEPRINTS.forEach((blueprint, storeIndex) => {
    const theme = getThemeById(blueprint.themeId)

    /* ------------------------------------------------------- categories */
    const parents = []
    CATEGORY_TREE.forEach((category, i) => {
      const parentId = `cat_${blueprint.id}_${category.slug}`
      parents.push({ id: parentId, slug: category.slug, name: category.name, children: category.children })
      categoryRows.push({
        id: parentId,
        tenant_id: blueprint.id,
        parent_id: null,
        slug: category.slug,
        name: category.name,
        image: LOOKS[i % LOOKS.length],
        published: true,
        sort_order: i,
      })
      category.children.forEach((child, j) => {
        categoryRows.push({
          id: `cat_${blueprint.id}_${child.slug}`,
          tenant_id: blueprint.id,
          parent_id: parentId,
          slug: child.slug,
          name: child.name,
          image: LOOKS[(i + j + 3) % LOOKS.length],
          published: true,
          sort_order: j,
        })
      })
    })

    const sareeParent = parents[0]
    const sareeChildren = sareeParent.children

    /* --------------------------------------------------------- products */
    const products = CATALOG_BLUEPRINT.map((blueprintItem, index) =>
      buildProduct(blueprintItem, {
        store: blueprint,
        index,
        storeIndex,
        categoryId: sareeParent.id,
        subcategoryId: `cat_${blueprint.id}_${sareeChildren[index % sareeChildren.length].slug}`,
      }),
    )
    productRows.push(...products.map((dto) => ({ ...productRow(dto), sold_count: dto.soldCount || 0 })))

    /* ------------------------------------------------------ collections */
    const ids = products.map((product) => product.id)
    collectionRows.push(
      { id: `col_${blueprint.id}_new`, tenant_id: blueprint.id, name: 'New Arrivals', type: 'manual', product_ids: ids.slice(0, 8), rules: {} },
      { id: `col_${blueprint.id}_trend`, tenant_id: blueprint.id, name: 'Trending', type: 'manual', product_ids: ids.slice(4, 12), rules: {} },
      { id: `col_${blueprint.id}_best`, tenant_id: blueprint.id, name: 'Best Sellers', type: 'manual', product_ids: ids.filter((_, i) => i % 2 === 0).slice(0, 8), rules: {} },
      { id: `col_${blueprint.id}_wed`, tenant_id: blueprint.id, name: 'Wedding Edit', type: 'dynamic', product_ids: products.filter((p) => p.occasion === 'Wedding').map((p) => p.id), rules: { occasion: 'Wedding' } },
      { id: `col_${blueprint.id}_fest`, tenant_id: blueprint.id, name: 'Festive Edit', type: 'dynamic', product_ids: products.filter((p) => p.occasion === 'Festive').map((p) => p.id), rules: { occasion: 'Festive' } },
      { id: `col_${blueprint.id}_hand`, tenant_id: blueprint.id, name: 'Handloom Collection', type: 'manual', product_ids: ids.slice(0, 6), rules: {} },
    )

    /* ---------------------------------------------------------- banners */
    bannerRows.push(...buildBanners(blueprint).map((dto) => bannerRow(dto)))

    /* ------------------------------------------------------------ store */
    const homepage = defaultHomepage(blueprint)
    const navigation = defaultNavigation(blueprint, sareeChildren)
    const gmv = 1800000 + storeIndex * 240000

    storeRows.push({
      id: blueprint.id,
      slug: blueprint.slug,
      domain: blueprint.domain,
      name: blueprint.name,
      tagline: blueprint.tagline,
      email: blueprint.email,
      phone: blueprint.phone,
      city: blueprint.city,
      address: `${12 + storeIndex} Atelier Lane, ${blueprint.city}`,
      announcement: blueprint.announcement,
      status: 'active',
      subscription: storeIndex % 3 === 0 ? 'enterprise' : 'growth',
      theme_id: blueprint.themeId,
      theme: clone(theme),
      theme_draft: clone(theme),
      homepage,
      homepage_draft: clone({ ...homepage, status: 'draft' }),
      navigation,
      navigation_draft: clone(navigation),
      branding: { name: blueprint.name, tagline: blueprint.tagline, logo: null, favicon: null },
      settings: { currency: 'INR', locale: 'en', supportEmail: blueprint.email, supportPhone: blueprint.phone },
      social: { instagram: `@${blueprint.slug.replace(/-/g, '')}`, facebook: blueprint.slug },
      versions: json([{ id: 'v1', createdAt: seededAt.toISOString(), label: 'Initial publish' }]),
      logo_text: blueprint.name,
      logo: null,
      favicon: null,
      cover_image: [PHOTOS.hero1, PHOTOS.hero2, PHOTOS.hero3, PHOTOS.editorial, PHOTOS.artisan, PHOTOS.festive, PHOTOS.look1, PHOTOS.look4][storeIndex],
      gmv,
      orders_count: 120 + storeIndex * 18,
      products_count: products.length,
      customers_count: 80 + storeIndex * 12,
      created_at: seededAt,
    })

    /* -------------------------------------------- customer and one order */
    const customerId = `cus_${blueprint.id}_1`
    const address = {
      id: `addr_${blueprint.id}_1`,
      name: 'Priya Sharma',
      phone: '+91 90000 11111',
      address: '14, Lavender Lane',
      apartment: 'Apt 3B',
      city: 'Bengaluru',
      state: 'Karnataka',
      pin: '560001',
      isDefault: true,
    }

    customerRows.push({
      id: customerId,
      tenant_id: blueprint.id,
      user_id: null,
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+91 90000 11111',
      lifetime_value: 24990,
      orders_count: 2,
      addresses: json([address]),
      created_at: seededAt,
    })

    const first = products[0]
    orderRows.push({
      id: `ord_${blueprint.id}_1001`,
      number: `VK${9001 + storeIndex}`,
      tenant_id: blueprint.id,
      customer_id: customerId,
      user_id: null,
      customer_name: 'Priya Sharma',
      customer_email: 'priya@example.com',
      status: storeIndex % 2 === 0 ? 'shipped' : 'confirmed',
      payment_status: 'paid',
      payment_method: 'upi',
      items: json([{ productId: first.id, name: first.name, image: first.images[0].src, price: first.price, qty: 1 }]),
      address,
      totals: { subtotal: first.price, shipping: 0, tax: Math.round(first.price * 0.05), discount: 0, total: first.price },
      timeline: json([
        { status: 'placed', at: seededAt.toISOString() },
        { status: 'confirmed', at: seededAt.toISOString() },
        { status: storeIndex % 2 === 0 ? 'shipped' : 'packed', at: seededAt.toISOString() },
      ]),
      tracking: storeIndex % 2 === 0 ? { carrier: 'Delhivery', code: `DLV${88000 + storeIndex}` } : null,
      note: '',
      total: first.price,
      created_at: seededAt,
    })

    /* --------------------------------------------- reviews and questions */
    products.slice(0, 4).forEach((product, i) => {
      reviewRows.push({
        id: `rev_${product.id}`,
        tenant_id: blueprint.id,
        product_id: product.id,
        user_id: null,
        author: ['Ananya Rao', 'Meera Iyer', 'Zara Khan', 'Nisha Patel'][i],
        rating: 5 - (i % 2),
        title: 'Drapes like water',
        body: 'The weave is generous, the colour true to the atelier photographs, and finishing is precise.',
        images: json(i === 0 ? [product.images[0].src] : []),
        verified: true,
        created_at: seededAt,
      })
      questionRows.push({
        id: `q_${product.id}`,
        tenant_id: blueprint.id,
        product_id: product.id,
        question: 'Is the blouse piece included?',
        answer: 'Yes, an unstitched blouse piece of 0.8m is included.',
        created_at: seededAt,
      })
    })

    /* ----------------------------------------------- coupon, alerts, stats */
    couponRows.push({
      id: `cpn_${blueprint.id}_welcome`,
      tenant_id: blueprint.id,
      code: 'WELCOME10',
      type: 'percent',
      value: 10,
      min_order: 4999,
      max_discount: 2000,
      first_order: true,
      usage_limit: 1000,
      used: 42 + storeIndex,
      expires_at: '2026-12-31',
      product_ids: [],
      category_ids: [],
    })

    notificationRows.push(
      { id: `ntf_${blueprint.id}_1`, tenant_id: blueprint.id, audience: 'admin', type: 'order', title: 'New order', body: `Order VK${9001 + storeIndex} placed`, read: false, created_at: seededAt },
      { id: `ntf_${blueprint.id}_2`, tenant_id: blueprint.id, audience: 'customer', type: 'offer', title: 'Wedding edit is live', body: 'Private preview for members.', read: false, created_at: seededAt },
    )

    // Six months of daily rollups: enough for the dashboard's monthly chart.
    for (let dayOffset = 0; dayOffset < 182; dayOffset += 1) {
      const day = new Date(seededAt)
      day.setUTCDate(day.getUTCDate() - dayOffset)
      const orders = 1 + ((dayOffset + storeIndex) % 5)
      statRows.push({
        tenant_id: blueprint.id,
        day: day.toISOString().slice(0, 10),
        orders,
        gmv: orders * (6000 + ((dayOffset * 37 + storeIndex * 91) % 9000)),
      })
    }

    /* ------------------------------------------------------------- staff */
    userSpecs.push({
      id: `usr_${blueprint.id}_owner`,
      name: `${blueprint.name} Owner`,
      email: `admin@${blueprint.slug}.test`,
      password: DEMO_PASSWORDS.staff,
      role: 'store_owner',
      tenant_id: blueprint.id,
      phone: blueprint.phone,
    })

    if (storeIndex === 0) {
      userSpecs.push(
        { id: `usr_${blueprint.id}_inv`, name: 'Inventory Lead', email: `stock@${blueprint.slug}.test`, password: DEMO_PASSWORDS.staff, role: 'inventory_manager', tenant_id: blueprint.id, phone: blueprint.phone },
        { id: `usr_${blueprint.id}_content`, name: 'Content Editor', email: `content@${blueprint.slug}.test`, password: DEMO_PASSWORDS.staff, role: 'content_manager', tenant_id: blueprint.id, phone: blueprint.phone },
      )
    }
  })

  userSpecs.unshift(
    { id: 'usr_super', name: 'Platform Owner', email: 'super@vastrika.market', password: DEMO_PASSWORDS.super, role: 'super_admin', tenant_id: null, phone: '+91 99999 00000' },
    { id: 'usr_customer', name: 'Priya Sharma', email: 'priya@example.com', password: DEMO_PASSWORDS.customer, role: 'customer', tenant_id: STORE_BLUEPRINTS[0].id, phone: '+91 90000 11111' },
  )

  // Hashing is deliberately slow, so do the whole set concurrently.
  const userRows = await Promise.all(
    userSpecs.map(async ({ password, ...user }) => ({ ...user, password_hash: await hashPassword(password) })),
  )

  /* --------------------------------------------------------------- write */
  // Order matters: foreign keys point back up this list.
  await upsert('stores', storeRows, ['id'])
  await upsert('users', userRows, ['id'])
  await upsert('categories', categoryRows, ['id'])
  await upsert('collections', collectionRows, ['id'])
  await upsert('products', productRows, ['id'])
  await upsert('banners', bannerRows, ['id'])
  await upsert('customers', customerRows, ['id'])
  await upsert('orders', orderRows, ['id'])
  await upsert('reviews', reviewRows, ['id'])
  await upsert('questions', questionRows, ['id'])
  await upsert('coupons', couponRows, ['id'])
  await upsert('notifications', notificationRows, ['id'])

  // daily_stats is large; chunk it so no single statement gets unwieldy.
  for (let offset = 0; offset < statRows.length; offset += 500) {
    await upsert('daily_stats', statRows.slice(offset, offset + 500), ['tenant_id', 'day'])
  }

  await upsert('platform_content', [
    { key: 'testimonials', value: json(TESTIMONIALS) },
    { key: 'instagram', value: json(INSTAGRAM) },
    { key: 'popularSearches', value: json(POPULAR_SEARCHES) },
  ], ['key'])

  // Link the demo shopper to the customer records sharing their email.
  await sql`
    update customers set user_id = u.id
    from users u where u.email = customers.email and customers.user_id is null
  `
  await sql`
    update orders set user_id = c.user_id
    from customers c where c.id = orders.customer_id and orders.user_id is null
  `

  // Give the planner fresh statistics before the first real query arrives.
  await sql`analyze`
  await refreshAllStorefronts()

  console.log([
    `seeded in ${Date.now() - began}ms`,
    `  stores        ${storeRows.length}`,
    `  users         ${userRows.length}`,
    `  categories    ${categoryRows.length}`,
    `  products      ${productRows.length}`,
    `  banners       ${bannerRows.length}`,
    `  collections   ${collectionRows.length}`,
    `  orders        ${orderRows.length}`,
    `  daily_stats   ${statRows.length}`,
    '',
    'Demo accounts:',
    `  platform  super@vastrika.market / ${DEMO_PASSWORDS.super}`,
    `  store     admin@atelier-noor.test / ${DEMO_PASSWORDS.staff}`,
    `  shopper   priya@example.com / ${DEMO_PASSWORDS.customer}`,
  ].join('\n'))
}

main()
  .catch((error) => {
    console.error('seed failed:', error)
    process.exitCode = 1
  })
  .finally(() => closeDatabase())
