import { getThemeById } from '../../theme/themes.js'
import { demoHash, makeSalt } from '../../utils/security.js'
import { CATALOG_BLUEPRINT, CATEGORY_TREE, LOOKS, PHOTOS, STORE_BLUEPRINTS } from './catalog.js'

function withCredentials(user) {
  const { password, ...rest } = user
  const passwordSalt = makeSalt()
  return { ...rest, passwordSalt, passwordHash: demoHash(password, passwordSalt) }
}

function slugify(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function defaultHomepage(store) {
  return {
    version: 1,
    status: 'published',
    sections: [
      {
        id: 'sec_announce',
        type: 'announcement',
        enabled: true,
        config: { text: store.announcement, link: '/store/' + store.slug + '/products' },
      },
      {
        id: 'sec_hero',
        type: 'carousel',
        enabled: true,
        config: {
          variant: store.themeId === 'contemporary-luxury' || store.themeId === 'festive-india' ? 'fullscreen' : 'editorial',
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
      {
        id: 'sec_cats',
        type: 'category_grid',
        enabled: true,
        config: { title: 'Shop by category', style: 'editorial' },
      },
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
      {
        id: 'sec_trend',
        type: 'product_slider',
        enabled: true,
        config: { title: 'Trending sarees', collectionId: `col_${store.id}_trend`, showPrice: true, showWishlist: true },
      },
      {
        id: 'sec_fabric',
        type: 'shop_by_fabric',
        enabled: true,
        config: { title: 'Shop by fabric' },
      },
      {
        id: 'sec_occ',
        type: 'shop_by_occasion',
        enabled: true,
        config: { title: 'Shop by occasion' },
      },
      {
        id: 'sec_region',
        type: 'shop_by_region',
        enabled: true,
        config: { title: 'Shop by region' },
      },
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
      {
        id: 'sec_reviews',
        type: 'testimonials',
        enabled: true,
        config: { title: 'From our atelier' },
      },
      {
        id: 'sec_ig',
        type: 'instagram',
        enabled: true,
        config: { title: '@' + store.slug.replace(/-/g, '') },
      },
      {
        id: 'sec_news',
        type: 'newsletter',
        enabled: true,
        config: { title: 'Join the atelier', subtitle: 'New weaves, private previews, seasonal edits.' },
      },
    ],
  }
}

function defaultNavigation(store, categories) {
  const sarees = categories.find((c) => c.slug === 'sarees')
  return {
    items: [
      {
        id: 'nav_sarees',
        label: 'Sarees',
        href: `/store/${store.slug}/category/sarees`,
        mega: {
          columns: (sarees?.children || []).map((child) => ({
            title: child.name,
            href: `/store/${store.slug}/category/${child.slug}`,
            links: [
              { label: 'All ' + child.name, href: `/store/${store.slug}/category/${child.slug}` },
              { label: 'Wedding', href: `/store/${store.slug}/category/wedding` },
              { label: 'Festive', href: `/store/${store.slug}/category/festive` },
            ],
          })),
          featured: {
            title: 'Handloom edit',
            image: PHOTOS.weave,
            href: `/store/${store.slug}/category/sarees`,
          },
          promo: {
            title: 'New in',
            image: PHOTOS.look1,
            href: `/store/${store.slug}/category/new-arrivals`,
          },
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

export function createSeed() {
  const now = '2026-09-01T10:00:00.000Z'
  const stores = []
  const products = []
  const categories = []
  const collections = []
  const banners = []
  const reviews = []
  const orders = []
  const customers = []
  const coupons = []
  const notifications = []
  const questions = []

  STORE_BLUEPRINTS.forEach((bp, storeIndex) => {
    const theme = getThemeById(bp.themeId)
    const storeCategories = CATEGORY_TREE.map((cat, i) => ({
      id: `cat_${bp.id}_${cat.slug}`,
      tenantId: bp.id,
      slug: cat.slug,
      name: cat.name,
      parentId: null,
      published: true,
      order: i,
      image: LOOKS[i % LOOKS.length],
      children: cat.children.map((child, j) => ({
        id: `cat_${bp.id}_${child.slug}`,
        tenantId: bp.id,
        slug: child.slug,
        name: child.name,
        parentId: `cat_${bp.id}_${cat.slug}`,
        published: true,
        order: j,
        image: LOOKS[(i + j + 3) % LOOKS.length],
      })),
    }))
    categories.push(...storeCategories)

    const storeProducts = CATALOG_BLUEPRINT.map((item, i) => {
      const imgA = LOOKS[(i + storeIndex) % LOOKS.length]
      const imgB = LOOKS[(i + storeIndex + 4) % LOOKS.length]
      const id = `prd_${bp.id}_${i}`
      const slug = slugify(`${item.name}-${bp.slug}`)
      const subcategory = storeCategories[0].children[i % storeCategories[0].children.length]
      const inventory = 4 + ((i * 3 + storeIndex) % 18)
      return {
        id,
        tenantId: bp.id,
        slug,
        name: item.name,
        brand: bp.name,
        sku: `${bp.slug.slice(0, 3).toUpperCase()}-${1000 + i}`,
        description: `A ${item.fabric.toLowerCase()} ${item.weave.toLowerCase()} weave from ${item.region}, composed for ${item.occasion.toLowerCase()} hours. The ${item.pattern.toLowerCase()} sits lightly on the pallu, with a blouse piece included.`,
        categoryId: storeCategories[0].id,
        subcategoryId: subcategory.id,
        categorySlug: i % 7 === 0 ? 'wedding' : item.occasion === 'Festive' ? 'festive' : 'sarees',
        price: item.price + storeIndex * 120,
        mrp: item.mrp + storeIndex * 120,
        gst: 5,
        images: [
          { src: imgA, alt: item.name },
          { src: imgB, alt: `${item.name} reverse` },
          { src: LOOKS[(i + 8) % LOOKS.length], alt: `${item.name} drape` },
        ],
        videos: i === 1 ? [{ src: '', poster: imgA, title: 'Drape film' }] : [],
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
            sku: `${bp.slug.slice(0, 3).toUpperCase()}-${1000 + i}-A`,
            color: item.color,
            size: 'Free size',
            design: item.pattern,
            fabric: item.fabric,
            price: item.price + storeIndex * 120,
            inventory,
            availability: inventory > 0,
            images: [imgA],
          },
        ],
      }
    })
    products.push(...storeProducts)

    const ids = storeProducts.map((p) => p.id)
    collections.push(
      { id: `col_${bp.id}_new`, tenantId: bp.id, name: 'New Arrivals', type: 'manual', productIds: ids.slice(0, 8) },
      { id: `col_${bp.id}_trend`, tenantId: bp.id, name: 'Trending', type: 'manual', productIds: ids.slice(4, 12) },
      { id: `col_${bp.id}_best`, tenantId: bp.id, name: 'Best Sellers', type: 'manual', productIds: ids.filter((_, i) => i % 2 === 0).slice(0, 8) },
      { id: `col_${bp.id}_wed`, tenantId: bp.id, name: 'Wedding Edit', type: 'dynamic', rules: { occasion: 'Wedding' }, productIds: storeProducts.filter((p) => p.occasion === 'Wedding').map((p) => p.id) },
      { id: `col_${bp.id}_fest`, tenantId: bp.id, name: 'Festive Edit', type: 'dynamic', rules: { occasion: 'Festive' }, productIds: storeProducts.filter((p) => p.occasion === 'Festive').map((p) => p.id) },
      { id: `col_${bp.id}_hand`, tenantId: bp.id, name: 'Handloom Collection', type: 'manual', productIds: ids.slice(0, 6) },
    )

    banners.push(
      {
        id: `ban_${bp.id}_1`,
        tenantId: bp.id,
        name: 'Homepage hero',
        heading: `${bp.name}`,
        subtitle: bp.tagline,
        ctaText: 'Shop the collection',
        ctaUrl: `/store/${bp.slug}/products`,
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
        updatedAt: now,
      },
      {
        id: `ban_${bp.id}_2`,
        tenantId: bp.id,
        name: 'Wedding edit',
        heading: 'Wedding silks',
        subtitle: 'From ₹8,990',
        ctaText: 'Enter the edit',
        ctaUrl: `/store/${bp.slug}/category/wedding`,
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
        updatedAt: now,
      },
      {
        id: `ban_${bp.id}_3`,
        tenantId: bp.id,
        name: 'Handloom fortnight',
        heading: 'Handloom fortnight',
        subtitle: 'Meet the weaves',
        ctaText: 'Discover',
        ctaUrl: `/store/${bp.slug}/category/sarees`,
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
        updatedAt: now,
      },
      {
        id: `ban_${bp.id}_4`,
        tenantId: bp.id,
        name: 'Festive teaser (draft)',
        heading: 'The festive edit',
        subtitle: 'Arriving this season',
        ctaText: 'Preview',
        ctaUrl: `/store/${bp.slug}/category/festive`,
        desktopImage: PHOTOS.festive,
        tabletImage: PHOTOS.festive,
        mobileImage: PHOTOS.festive,
        overlay: 'center',
        align: 'center',
        theme: 'light',
        status: 'draft',
        active: false,
        order: 3,
        startDate: '',
        endDate: '',
        updatedAt: now,
      },
    )

    const homepage = defaultHomepage(bp)
    const navigation = defaultNavigation(bp, storeCategories)

    stores.push({
      ...bp,
      logoText: bp.name,
      logo: null,
      favicon: null,
      status: 'active',
      subscription: storeIndex % 3 === 0 ? 'enterprise' : 'growth',
      address: `${12 + storeIndex} Atelier Lane, ${bp.city}`,
      social: { instagram: '@' + bp.slug.replace(/-/g, ''), facebook: bp.slug },
      theme: clone(theme),
      settings: {
        currency: 'INR',
        locale: 'en',
        supportEmail: bp.email,
        supportPhone: bp.phone,
      },
      branding: { name: bp.name, tagline: bp.tagline, logo: null, favicon: null },
      homepage,
      homepageDraft: clone(homepage),
      navigation,
      navigationDraft: clone(navigation),
      themeDraft: clone(theme),
      versions: [{ id: 'v1', createdAt: now, label: 'Initial publish' }],
      createdAt: now,
      gmv: 1800000 + storeIndex * 240000,
      ordersCount: 120 + storeIndex * 18,
      productsCount: storeProducts.length,
      customersCount: 80 + storeIndex * 12,
      coverImage: [PHOTOS.hero1, PHOTOS.hero2, PHOTOS.hero3, PHOTOS.editorial, PHOTOS.artisan, PHOTOS.festive, PHOTOS.look1, PHOTOS.look4][storeIndex],
    })

    storeProducts.slice(0, 4).forEach((p, i) => {
      reviews.push({
        id: `rev_${p.id}`,
        tenantId: bp.id,
        productId: p.id,
        author: ['Ananya Rao', 'Meera Iyer', 'Zara Khan', 'Nisha Patel'][i],
        rating: 5 - (i % 2),
        title: 'Drapes like water',
        body: 'The weave is generous, the colour true to the atelier photographs, and finishing is precise.',
        images: i === 0 ? [p.images[0].src] : [],
        verified: true,
        createdAt: now,
      })
      questions.push({
        id: `q_${p.id}`,
        tenantId: bp.id,
        productId: p.id,
        question: 'Is the blouse piece included?',
        answer: 'Yes, an unstitched blouse piece of 0.8m is included.',
        createdAt: now,
      })
    })

    coupons.push({
      id: `cpn_${bp.id}_welcome`,
      tenantId: bp.id,
      code: 'WELCOME10',
      type: 'percent',
      value: 10,
      minOrder: 4999,
      maxDiscount: 2000,
      firstOrder: true,
      usageLimit: 1000,
      used: 42 + storeIndex,
      expiresAt: '2026-12-31',
      productIds: [],
      categoryIds: [],
    })

    customers.push({
      id: `cus_${bp.id}_1`,
      tenantId: bp.id,
      name: 'Priya Sharma',
      email: 'priya@example.com',
      phone: '+91 90000 11111',
      lifetimeValue: 24990,
      ordersCount: 2,
      createdAt: now,
      addresses: [
        {
          id: `addr_${bp.id}_1`,
          name: 'Priya Sharma',
          phone: '+91 90000 11111',
          address: '14, Lavender Lane',
          apartment: 'Apt 3B',
          city: 'Bengaluru',
          state: 'Karnataka',
          pin: '560001',
          isDefault: true,
        },
      ],
    })

    orders.push({
      id: `ord_${bp.id}_1001`,
      number: `SH${1001 + storeIndex}`,
      tenantId: bp.id,
      customerId: `cus_${bp.id}_1`,
      customerName: 'Priya Sharma',
      status: storeIndex % 2 === 0 ? 'shipped' : 'confirmed',
      paymentStatus: 'paid',
      paymentMethod: 'upi',
      items: [
        {
          productId: storeProducts[0].id,
          name: storeProducts[0].name,
          image: storeProducts[0].images[0].src,
          price: storeProducts[0].price,
          qty: 1,
        },
      ],
      address: customers[customers.length - 1].addresses[0],
      totals: {
        subtotal: storeProducts[0].price,
        shipping: 0,
        tax: Math.round(storeProducts[0].price * 0.05),
        discount: 0,
        total: storeProducts[0].price,
      },
      timeline: [
        { status: 'placed', at: now },
        { status: 'confirmed', at: now },
        { status: storeIndex % 2 === 0 ? 'shipped' : 'packed', at: now },
      ],
      tracking: storeIndex % 2 === 0 ? { carrier: 'Delhivery', code: 'DLV' + (88000 + storeIndex) } : null,
      createdAt: now,
    })

    notifications.push(
      { id: `ntf_${bp.id}_1`, tenantId: bp.id, audience: 'admin', type: 'order', title: 'New order', body: `Order SH${1001 + storeIndex} placed`, read: false, createdAt: now },
      { id: `ntf_${bp.id}_2`, tenantId: bp.id, audience: 'customer', type: 'offer', title: 'Wedding edit is live', body: 'Private preview for members.', read: false, createdAt: now },
    )
  })

  const rawUsers = [
    { id: 'usr_super', name: 'Platform Owner', email: 'super@vastrika.market', password: 'Super@123', role: 'super_admin', tenantId: null, phone: '+91 99999 00000' },
    { id: 'usr_customer', name: 'Priya Sharma', email: 'priya@example.com', password: 'Customer@123', role: 'customer', tenantId: stores[0].id, phone: '+91 90000 11111' },
  ]

  stores.forEach((store, i) => {
    rawUsers.push({
      id: `usr_${store.id}_owner`,
      name: `${store.name} Owner`,
      email: `admin@${store.slug}.test`,
      password: 'Admin@123',
      role: 'store_owner',
      tenantId: store.id,
      phone: store.phone,
    })
    if (i === 0) {
      rawUsers.push(
        {
          id: `usr_${store.id}_inv`,
          name: 'Inventory Lead',
          email: `stock@${store.slug}.test`,
          password: 'Admin@123',
          role: 'inventory_manager',
          tenantId: store.id,
          phone: store.phone,
        },
        {
          id: `usr_${store.id}_content`,
          name: 'Content Editor',
          email: `content@${store.slug}.test`,
          password: 'Admin@123',
          role: 'content_manager',
          tenantId: store.id,
          phone: store.phone,
        },
      )
    }
  })

  const users = rawUsers.map(withCredentials)

  const testimonials = [
    { author: 'Ananya Rao', role: 'Bengaluru', quote: 'The pallu falls with the kind of weight that photographs never quite capture.' },
    { author: 'Meera Iyer', role: 'Chennai', quote: 'Quiet luxury, considered service, and weaves I will keep for decades.' },
    { author: 'Zara Khan', role: 'Delhi', quote: 'A storefront that feels like a private atelier rather than a catalogue.' },
  ]

  const analytics = {
    platform: {
      gmv: stores.reduce((s, x) => s + x.gmv, 0),
      revenue: 4200000,
      orders: stores.reduce((s, x) => s + x.ordersCount, 0),
      stores: stores.length,
      activeStores: stores.filter((s) => s.status === 'active').length,
      products: products.length,
      customers: 1240,
      conversion: 2.8,
      series: [
        { label: 'Mar', gmv: 1.1, orders: 220 },
        { label: 'Apr', gmv: 1.4, orders: 260 },
        { label: 'May', gmv: 1.8, orders: 310 },
        { label: 'Jun', gmv: 2.1, orders: 340 },
        { label: 'Jul', gmv: 2.4, orders: 390 },
        { label: 'Aug', gmv: 2.9, orders: 430 },
        { label: 'Sep', gmv: 3.2, orders: 470 },
      ],
    },
  }

  return {
    sessions: [],
    stores,
    products,
    categories,
    collections,
    banners,
    reviews,
    orders,
    customers,
    coupons,
    users,
    notifications,
    questions,
    testimonials,
    analytics,
    instagram: [PHOTOS.insta1, PHOTOS.insta2, PHOTOS.insta3, PHOTOS.insta4, PHOTOS.insta5, PHOTOS.insta6],
    popularSearches: ['Banarasi', 'Kanjivaram', 'Wedding silk', 'Organza', 'Handloom'],
  }
}
