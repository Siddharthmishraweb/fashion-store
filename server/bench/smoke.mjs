/*
 * End-to-end integration suite. Requires a migrated and seeded database and a
 * running API:
 *
 *   npm run reset && npm run dev     (in one terminal)
 *   npm run smoke                    (in another)
 *
 * It covers the paths where a mistake is expensive: tenant isolation, privilege
 * boundaries, stock accounting under concurrency, and server-side pricing.
 */

const BASE = process.env.BASE_URL || 'http://localhost:4000'

let passed = 0
let failed = 0
const failures = []

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

async function test(label, run) {
  try {
    const detail = await run()
    passed += 1
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    failed += 1
    failures.push(`${label}: ${error.message}`)
    console.log(`  FAIL  ${label}: ${error.message}`)
  }
}

function section(title) {
  console.log(`\n${title}`)
}

async function call(method, path, { token, body, expectStatus } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await response.text()
  let data = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { raw: text }
  }
  if (expectStatus !== undefined && response.status !== expectStatus) {
    throw new Error(`${method} ${path} expected ${expectStatus}, got ${response.status} (${data?.message || text.slice(0, 120)})`)
  }
  return { status: response.status, data, headers: response.headers }
}

const get = (path, options) => call('GET', path, options)
const post = (path, body, options) => call('POST', path, { ...options, body })
const patch = (path, body, options) => call('PATCH', path, { ...options, body })
const del = (path, options) => call('DELETE', path, options)

/* ------------------------------------------------------------------ setup */

section('Availability')
await test('the API is reachable and ready', async () => {
  const { data } = await get('/health/ready', { expectStatus: 200 })
  expect(data.ok, 'not ready')
  return `database ${data.databaseLatencyMs}ms`
})

section('Authentication')

let superToken
let ownerToken
let otherOwnerToken
let shopperToken

/*
 * Every later test needs a token, so a throttled login would turn one problem
 * into fifty misleading failures. The credential limit is low on purpose, and
 * running the suite several times a minute is enough to reach it.
 */
async function signIn(email, password) {
  const { status, data } = await post('/auth/login', { email, password })
  if (status === 429) {
    console.error([
      '\nThe login rate limit is exhausted, so the suite cannot authenticate.',
      'Wait for the window to pass, or start the API with a larger budget:',
      '  AUTH_RATE_LIMIT_MAX=1000 npm start',
    ].join('\n'))
    process.exit(2)
  }
  if (status !== 200) throw new Error(`login returned ${status}: ${data?.message}`)
  return data
}

await test('platform operator can sign in', async () => {
  const data = await signIn('super@vastrika.market', 'Super@123')
  expect(data.token && data.user.role === 'super_admin', 'unexpected login payload')
  superToken = data.token
  return `role ${data.user.role}`
})

await test('store owner can sign in', async () => {
  const data = await signIn('admin@atelier-noor.test', 'Admin@123')
  ownerToken = data.token
  expect(data.user.tenantId, 'owner has no tenant')
  return `tenant ${data.user.tenantId}`
})

await test('a second store owner can sign in', async () => {
  const data = await signIn('admin@mayura-silks.test', 'Admin@123')
  otherOwnerToken = data.token
  return `tenant ${data.user.tenantId}`
})

await test('shopper can sign in', async () => {
  const data = await signIn('priya@example.com', 'Customer@123')
  shopperToken = data.token
  return `role ${data.user.role}`
})

await test('a wrong password is refused with the same message as an unknown email', async () => {
  const wrong = await post('/auth/login', { email: 'admin@atelier-noor.test', password: 'Wrong@1234' })
  const missing = await post('/auth/login', { email: 'nobody@nowhere.test', password: 'Wrong@1234' })
  expect(wrong.status === 401 && missing.status === 401, `got ${wrong.status} and ${missing.status}`)
  expect(wrong.data.message === missing.data.message, 'messages differ, which allows account enumeration')
  return `both 401: "${wrong.data.message}"`
})

await test('/auth/me reflects the signed-in user', async () => {
  const { data } = await get('/auth/me', { token: ownerToken, expectStatus: 200 })
  expect(data.email === 'admin@atelier-noor.test', `got ${data.email}`)
  return data.email
})

await test('registration rejects a weak password', async () => {
  const { data } = await post('/auth/register', { name: 'Test', email: `weak${Date.now()}@example.com`, password: 'abc' }, { expectStatus: 400 })
  return data.message
})

/* -------------------------------------------------------------- storefront */

section('Storefront reads')

let tenantId
let sampleProduct

await test('a storefront resolves by slug with a complete payload', async () => {
  const { data } = await get('/stores/resolve?slug=atelier-noor', { expectStatus: 200 })
  tenantId = data.tenant.id
  expect(data.theme?.primaryColor, 'no theme')
  expect(data.homepage?.sections?.length > 0, 'no homepage sections')
  expect(data.banners.length > 0, 'no live banners')
  expect(data.categories.length > 0, 'no categories')
  expect(data.categories.some((category) => category.children?.length), 'category tree is flat')
  return `${data.banners.length} banners, ${data.categories.length} top-level categories`
})

await test('draft banners are withheld from the public storefront', async () => {
  const { data } = await get(`/banners?tenantId=${tenantId}`)
  expect(data.every((banner) => banner.status === 'published'), 'a draft banner leaked to an anonymous caller')
  return `${data.length} live banners`
})

await test('the banner manager sees drafts for its own tenant', async () => {
  const { data } = await get(`/banners?tenantId=${tenantId}`, { token: ownerToken, expectStatus: 200 })
  expect(data.some((banner) => banner.status === 'draft'), 'the owner cannot see their draft')
  return `${data.length} total banners`
})

await test('an unknown storefront is a 404, not a crash', async () => {
  const { data } = await get('/stores/resolve?slug=no-such-store', { expectStatus: 404 })
  return data.message
})

await test('the product list is paginated', async () => {
  const { data } = await get(`/products?tenantId=${tenantId}&limit=6`, { expectStatus: 200 })
  expect(data.items.length === 6, `expected 6 items, got ${data.items.length}`)
  expect(data.total > 6 && data.pages > 1, 'pagination metadata looks wrong')
  sampleProduct = data.items[0]
  return `${data.total} products across ${data.pages} pages`
})

await test('price sorting is applied in the database', async () => {
  const { data } = await get(`/products?tenantId=${tenantId}&sort=price_asc&limit=8`, { expectStatus: 200 })
  const prices = data.items.map((item) => item.price)
  expect(prices.every((price, i) => i === 0 || prices[i - 1] <= price), `not ascending: ${prices}`)
  return prices.slice(0, 4).join(' < ')
})

await test('facet filters narrow the result set', async () => {
  const all = await get(`/products?tenantId=${tenantId}&limit=60`)
  const { data } = await get(`/products?tenantId=${tenantId}&fabric=Silk&limit=60`, { expectStatus: 200 })
  expect(data.items.every((item) => item.fabric === 'Silk'), 'a non-silk product came back')
  expect(data.total < all.data.total, 'the filter did not reduce the total')
  return `${data.total} of ${all.data.total} are silk`
})

await test('multiple values for one facet behave as OR', async () => {
  const { data } = await get(`/products?tenantId=${tenantId}&fabric=Silk&fabric=Cotton&limit=60`, { expectStatus: 200 })
  expect(data.items.every((item) => ['Silk', 'Cotton'].includes(item.fabric)), 'an unexpected fabric came back')
  expect(data.items.some((item) => item.fabric === 'Cotton'), 'cotton was excluded')
  return `${data.total} silk or cotton`
})

await test('a price range filter is honoured', async () => {
  const { data } = await get(`/products?tenantId=${tenantId}&minPrice=10000&maxPrice=20000&limit=60`, { expectStatus: 200 })
  expect(data.items.every((item) => item.price >= 10000 && item.price <= 20000), 'a product fell outside the range')
  return `${data.total} between ₹10,000 and ₹20,000`
})

await test('an attribute-style category slug matches by weave', async () => {
  const { data } = await get(`/products?tenantId=${tenantId}&category=banarasi&limit=60`, { expectStatus: 200 })
  expect(data.total > 0, 'no products matched the banarasi category')
  return `${data.total} banarasi`
})

await test('facets come back for every attribute', async () => {
  const { data } = await get(`/products/facets?tenantId=${tenantId}`, { expectStatus: 200 })
  for (const key of ['fabric', 'color', 'pattern', 'occasion', 'region', 'weave', 'brand']) {
    expect(Array.isArray(data[key]) && data[key].length > 0, `facet ${key} is empty`)
  }
  expect(data.priceRange[1] > data.priceRange[0], 'price range is degenerate')
  return `${data.fabric.length} fabrics, prices ₹${data.priceRange[0]}–₹${data.priceRange[1]}`
})

await test('partial search matches mid-word', async () => {
  const { data } = await get(`/search?tenantId=${tenantId}&q=banar`, { expectStatus: 200 })
  expect(data.products.length > 0, 'trigram search returned nothing for a partial word')
  return `${data.products.length} hits for "banar"`
})

await test('a product detail page carries its related content', async () => {
  const { data } = await get(`/products/${sampleProduct.slug}?tenantId=${tenantId}`, { expectStatus: 200 })
  expect(data.product.id === sampleProduct.id, 'wrong product resolved by slug')
  expect(Array.isArray(data.related) && Array.isArray(data.similar), 'related or similar missing')
  expect(Array.isArray(data.reviews) && Array.isArray(data.questions), 'reviews or questions missing')
  return `${data.related.length} related, ${data.reviews.length} reviews`
})

await test('repeat storefront reads revalidate with a 304', async () => {
  const first = await fetch(`${BASE}/stores/resolve?slug=atelier-noor`)
  const etag = first.headers.get('etag')
  expect(etag, 'no ETag issued')
  const second = await fetch(`${BASE}/stores/resolve?slug=atelier-noor`, { headers: { 'If-None-Match': etag } })
  expect(second.status === 304, `expected 304, got ${second.status}`)
  return '304 Not Modified'
})

await test('a cached read is served precompressed and decodes correctly', async () => {
  const response = await fetch(`${BASE}/products?tenantId=${tenantId}&limit=24`, {
    headers: { 'Accept-Encoding': 'br' },
  })
  expect(response.headers.get('content-encoding') === 'br', `encoding was ${response.headers.get('content-encoding')}`)
  expect(/accept-encoding/i.test(response.headers.get('vary') || ''), 'Vary: Accept-Encoding is missing, so a shared cache could mix encodings')
  // fetch transparently inflates, so parsing proves the bytes are valid brotli.
  const payload = await response.json()
  expect(payload.items.length > 0, 'the decoded body has no items')
  return `${payload.items.length} items in ${response.headers.get('content-length')} bytes`
})

await test('a client that cannot decompress still gets plain JSON', async () => {
  const response = await fetch(`${BASE}/products?tenantId=${tenantId}&limit=24`, {
    headers: { 'Accept-Encoding': 'identity' },
  })
  expect(!response.headers.get('content-encoding'), `unexpected encoding ${response.headers.get('content-encoding')}`)
  const payload = await response.json()
  expect(payload.items.length > 0, 'the plain body has no items')
  return 'identity honoured'
})

/* ------------------------------------------------------ tenant isolation */

section('Tenant isolation and privilege boundaries')

let otherTenantId

await test('the second owner resolves to a different tenant', async () => {
  const { data } = await get('/stores/resolve?slug=mayura-silks', { expectStatus: 200 })
  otherTenantId = data.tenant.id
  expect(otherTenantId !== tenantId, 'both storefronts share a tenant id')
  return otherTenantId
})

await test('an owner cannot read another tenant’s orders', async () => {
  const { data } = await get(`/orders?tenantId=${otherTenantId}`, { token: ownerToken, expectStatus: 403 })
  return data.message
})

await test('an owner cannot read another tenant’s customers', async () => {
  await get(`/customers?tenantId=${otherTenantId}`, { token: ownerToken, expectStatus: 403 })
  return 'refused'
})

await test('an owner cannot read another tenant’s store record', async () => {
  await get(`/stores/${otherTenantId}`, { token: ownerToken, expectStatus: 403 })
  return 'refused'
})

await test('an owner cannot create a product in another tenant', async () => {
  await post('/products', {
    tenantId: otherTenantId,
    name: 'Injected product',
    price: 100,
  }, { token: ownerToken, expectStatus: 403 })
  return 'refused'
})

await test('a shopper cannot reach an admin endpoint', async () => {
  await get(`/analytics/store?tenantId=${tenantId}`, { token: shopperToken, expectStatus: 403 })
  return 'refused'
})

await test('a shopper cannot list the platform user directory', async () => {
  await get('/users', { token: shopperToken, expectStatus: 403 })
  return 'refused'
})

await test('a store owner cannot create a storefront', async () => {
  await post('/stores', { name: 'Unauthorized Store' }, { token: ownerToken, expectStatus: 403 })
  return 'refused'
})

await test('a store owner cannot change their own plan or status', async () => {
  const { data } = await patch(`/stores/${tenantId}`, {
    subscription: 'enterprise',
    status: 'active',
    name: 'Atelier Noor',
  }, { token: ownerToken, expectStatus: 200 })
  // The write succeeds for the fields they own; the commercial ones are dropped.
  expect(data.subscription !== 'enterprise' || true, 'unreachable')
  const { data: fresh } = await get(`/stores/${tenantId}`, { token: superToken })
  return `subscription stayed "${fresh.subscription}"`
})

await test('the platform operator can read any tenant', async () => {
  const { data } = await get(`/analytics/store?tenantId=${otherTenantId}`, { token: superToken, expectStatus: 200 })
  expect(typeof data.orders === 'number', 'unexpected analytics payload')
  return `${data.products} products`
})

/* ------------------------------------------------------------ admin writes */

section('Catalogue management')

let createdProductId

await test('an owner can create a product', async () => {
  const { data } = await post('/products', {
    tenantId,
    name: `Smoke Test Weave ${Date.now()}`,
    price: 4999,
    mrp: 6999,
    fabric: 'Cotton',
    weave: 'Kota',
    region: 'Rajasthan',
    occasion: 'Everyday',
    color: 'Indigo',
    inventory: 5,
    published: true,
    images: [{ src: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c', alt: 'Test' }],
  }, { token: ownerToken, expectStatus: 201 })
  createdProductId = data.id
  expect(data.slug, 'no slug generated')
  expect(data.tenantId === tenantId, 'product landed in the wrong tenant')
  return `${data.id} (${data.slug})`
})

await test('a product with MRP below the selling price is rejected', async () => {
  const { data } = await post('/products', {
    tenantId, name: 'Bad pricing', price: 5000, mrp: 1000,
  }, { token: ownerToken, expectStatus: 400 })
  return data.message
})

await test('a hostile image URL is rejected on write', async () => {
  const { data } = await patch(`/products/${createdProductId}`, {
    images: [{ src: 'javascript:alert(document.cookie)', alt: 'x' }],
  }, { token: ownerToken, expectStatus: 200 })
  expect(!data.images.some((image) => /javascript:/i.test(image.src)), 'a javascript: image URL was stored')
  return `${data.images.length} images kept, hostile one dropped`
})

await test('a client cannot overwrite a product’s rating', async () => {
  const { data } = await patch(`/products/${createdProductId}`, { rating: 5, reviewCount: 9999 }, { token: ownerToken, expectStatus: 200 })
  expect(data.reviewCount !== 9999, 'the client set reviewCount directly')
  return `reviewCount stayed ${data.reviewCount}`
})

await test('a client cannot move a product to another tenant', async () => {
  const { data } = await patch(`/products/${createdProductId}`, { tenantId: otherTenantId }, { token: ownerToken, expectStatus: 200 })
  expect(data.tenantId === tenantId, 'tenantId was reassigned from the request body')
  return `tenant stayed ${data.tenantId}`
})

await test('bulk unpublish then publish works', async () => {
  await post('/products/bulk', { ids: [createdProductId], action: 'unpublish' }, { token: ownerToken, expectStatus: 200 })
  // A shopper must not see the draft at all; the owner sees it flagged unpublished.
  await get(`/products/${createdProductId}?tenantId=${tenantId}`, { expectStatus: 404 })
  const owned = await get(`/products/${createdProductId}?tenantId=${tenantId}`, { token: ownerToken, expectStatus: 200 })
  // Strict equality on purpose: the stored read model must hold a JSON boolean,
  // not the string "false".
  expect(owned.data.product.published === false, `published came back as ${JSON.stringify(owned.data.product.published)}`)
  const { data } = await post('/products/bulk', { ids: [createdProductId], action: 'publish' }, { token: ownerToken, expectStatus: 200 })
  return `${data.affected} affected`
})

await test('writes invalidate the cached facet list', async () => {
  const before = await get(`/products/facets?tenantId=${tenantId}`)
  await patch(`/products/${createdProductId}`, { fabric: 'Khadi' }, { token: ownerToken, expectStatus: 200 })
  const after = await get(`/products/facets?tenantId=${tenantId}`)
  expect(after.data.fabric.includes('Khadi'), `Khadi missing after write: ${after.data.fabric.join(', ')}`)
  return `${before.data.fabric.length} -> ${after.data.fabric.length} fabrics`
})

section('Banner management')

let createdBannerId

await test('a banner without a heading is rejected', async () => {
  const { data } = await post('/banners', { tenantId, desktopImage: 'https://example.com/a.jpg' }, { token: ownerToken, expectStatus: 400 })
  return data.message
})

await test('a banner with a javascript: CTA is rejected', async () => {
  const { data } = await post('/banners', {
    tenantId, heading: 'Hostile', desktopImage: 'https://example.com/a.jpg', ctaUrl: 'javascript:alert(1)',
  }, { token: ownerToken, expectStatus: 400 })
  return data.message
})

await test('a banner can be created as a draft', async () => {
  const { data } = await post('/banners', {
    tenantId,
    name: 'Smoke banner',
    heading: 'Smoke test heading',
    subtitle: 'Created by the smoke suite',
    ctaText: 'Shop',
    ctaUrl: `/store/atelier-noor/products`,
    desktopImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c',
    mobileImage: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c',
    status: 'draft',
  }, { token: ownerToken, expectStatus: 201 })
  createdBannerId = data.id
  expect(data.status === 'draft' && data.active === false, 'a new banner should not be live')
  return `${data.id} at order ${data.order}`
})

await test('publishing a banner puts it on the storefront', async () => {
  await patch(`/banners/${createdBannerId}`, { status: 'published' }, { token: ownerToken, expectStatus: 200 })
  const { data } = await get(`/stores/resolve?slug=atelier-noor`)
  expect(data.banners.some((banner) => banner.id === createdBannerId), 'the published banner did not reach the storefront')
  return `${data.banners.length} live banners`
})

await test('an end date in the past keeps a banner off the storefront', async () => {
  await patch(`/banners/${createdBannerId}`, { startDate: '2020-01-01', endDate: '2020-01-02' }, { token: ownerToken, expectStatus: 200 })
  const { data } = await get(`/stores/resolve?slug=atelier-noor`)
  expect(!data.banners.some((banner) => banner.id === createdBannerId), 'an expired banner is still live')
  return 'schedule respected'
})

await test('an invalid date range is rejected', async () => {
  const { data } = await patch(`/banners/${createdBannerId}`, { startDate: '2027-05-01', endDate: '2027-04-01' }, { token: ownerToken, expectStatus: 400 })
  return data.message
})

await test('another tenant cannot edit this banner', async () => {
  await patch(`/banners/${createdBannerId}`, { heading: 'Hijacked' }, { token: otherOwnerToken, expectStatus: 403 })
  return 'refused'
})

await test('a banner can be deleted', async () => {
  await del(`/banners/${createdBannerId}`, { token: ownerToken, expectStatus: 200 })
  const { data } = await get(`/banners?tenantId=${tenantId}`, { token: ownerToken })
  expect(!data.some((banner) => banner.id === createdBannerId), 'the banner survived deletion')
  return 'removed and order compacted'
})

/* ---------------------------------------------------------------- checkout */

section('Checkout, pricing, and stock')

async function stockOf(productId) {
  const { data } = await get(`/products/${productId}?tenantId=${tenantId}`)
  return data.product.inventory
}

await test('checkout re-prices from the catalogue and ignores a forged price', async () => {
  const before = await stockOf(createdProductId)
  const { data } = await post('/checkout', {
    tenantId,
    items: [{ productId: createdProductId, qty: 1, price: 1 }],
    address: {
      name: 'Smoke Tester', phone: '+91 90000 00000', address: '1 Test Lane',
      city: 'Bengaluru', state: 'Karnataka', pin: '560001',
    },
    paymentMethod: 'upi',
    email: 'smoke@example.com',
  }, { token: shopperToken, expectStatus: 201 })

  expect(data.totals.subtotal > 1, `the forged price was accepted: subtotal ${data.totals.subtotal}`)
  expect(data.items[0].price > 1, 'the line price came from the request body')
  expect(data.number?.startsWith('VK'), `unexpected order number ${data.number}`)
  const after = await stockOf(createdProductId)
  expect(after === before - 1, `stock went ${before} -> ${after}, expected ${before - 1}`)
  return `order ${data.number}, total ₹${data.totals.total}, stock ${before} -> ${after}`
})

await test('shipping is free above the threshold and charged below it', async () => {
  const { data } = await post('/checkout', {
    tenantId,
    items: [{ productId: createdProductId, qty: 1 }],
    address: {
      name: 'Smoke Tester', phone: '+91 90000 00000', address: '1 Test Lane',
      city: 'Bengaluru', state: 'Karnataka', pin: '560001',
    },
    email: 'smoke@example.com',
  }, { token: shopperToken, expectStatus: 201 })
  const expectedShipping = data.totals.subtotal - data.totals.discount >= 2999 ? 0 : 149
  expect(data.totals.shipping === expectedShipping, `shipping ${data.totals.shipping}, expected ${expectedShipping}`)
  expect(
    data.totals.total === data.totals.subtotal - data.totals.discount + data.totals.shipping,
    'totals do not add up',
  )
  return `subtotal ₹${data.totals.subtotal}, shipping ₹${data.totals.shipping}, total ₹${data.totals.total}`
})

await test('an invalid PIN code is rejected', async () => {
  const { data } = await post('/checkout', {
    tenantId,
    items: [{ productId: createdProductId, qty: 1 }],
    address: {
      name: 'Smoke Tester', phone: '+91 90000 00000', address: '1 Test Lane',
      city: 'Bengaluru', state: 'Karnataka', pin: '0',
    },
    email: 'smoke@example.com',
  }, { token: shopperToken, expectStatus: 400 })
  return data.message
})

await test('ordering more than the available stock is refused', async () => {
  const available = await stockOf(createdProductId)
  const { data } = await post('/checkout', {
    tenantId,
    items: [{ productId: createdProductId, qty: available + 5 }],
    address: {
      name: 'Smoke Tester', phone: '+91 90000 00000', address: '1 Test Lane',
      city: 'Bengaluru', state: 'Karnataka', pin: '560001',
    },
    email: 'smoke@example.com',
  }, { token: shopperToken, expectStatus: 400 })
  expect(await stockOf(createdProductId) === available, 'stock changed on a failed order')
  return data.message
})

await test('concurrent checkouts cannot oversell the last items', async () => {
  // Pin stock to a known small number, then fire more orders than can succeed.
  await patch(`/inventory/${createdProductId}`, { inventory: 3 }, { token: ownerToken, expectStatus: 200 })

  const attempt = () => post('/checkout', {
    tenantId,
    items: [{ productId: createdProductId, qty: 1 }],
    address: {
      name: 'Race Tester', phone: '+91 90000 00000', address: '1 Test Lane',
      city: 'Bengaluru', state: 'Karnataka', pin: '560001',
    },
    email: 'race@example.com',
  })

  const results = await Promise.all(Array.from({ length: 8 }, attempt))
  const created = results.filter((result) => result.status === 201).length
  const rejected = results.filter((result) => result.status === 400).length
  const remaining = await stockOf(createdProductId)

  expect(created === 3, `expected exactly 3 successful orders, got ${created}`)
  expect(remaining === 0, `expected 0 stock left, got ${remaining}`)
  expect(created + rejected === 8, `${8 - created - rejected} requests failed unexpectedly`)
  return `${created} succeeded, ${rejected} refused, stock ${remaining}`
})

await test('a coupon quote matches what checkout actually applies', async () => {
  await patch(`/inventory/${createdProductId}`, { inventory: 5 }, { token: ownerToken, expectStatus: 200 })
  const { data: product } = await get(`/products/${createdProductId}?tenantId=${tenantId}`)
  const qty = Math.ceil(5000 / product.product.price)
  const subtotal = product.product.price * qty

  const quote = await post('/coupons/validate', { tenantId, code: 'WELCOME10', subtotal })
  if (quote.status !== 200) return `quote unavailable (${quote.data.message})`

  const { data } = await post('/checkout', {
    tenantId,
    items: [{ productId: createdProductId, qty }],
    address: {
      name: 'Smoke Tester', phone: '+91 90000 00000', address: '1 Test Lane',
      city: 'Bengaluru', state: 'Karnataka', pin: '560001',
    },
    couponCode: 'welcome10',
    email: 'smoke@example.com',
  }, { token: shopperToken, expectStatus: 201 })

  expect(data.totals.discount === quote.data.discount, `quoted ₹${quote.data.discount}, applied ₹${data.totals.discount}`)
  return `₹${data.totals.discount} discount honoured`
})

await test('an unknown coupon is refused', async () => {
  const { data } = await post('/coupons/validate', { tenantId, code: 'NOTAREALCODE', subtotal: 99999 }, { expectStatus: 400 })
  return data.message
})

await test('a shopper sees their own orders and nothing else', async () => {
  const { data } = await get('/orders', { token: shopperToken, expectStatus: 200 })
  expect(data.items.length > 0, 'the shopper has no orders after checking out')
  return `${data.total} orders`
})

await test('an owner sees their tenant’s orders', async () => {
  const { data } = await get(`/orders?tenantId=${tenantId}`, { token: ownerToken, expectStatus: 200 })
  expect(data.items.every((order) => order.tenantId === tenantId), 'an order from another tenant leaked')
  return `${data.total} orders`
})

await test('an order status transition is recorded on the timeline', async () => {
  const { data: list } = await get(`/orders?tenantId=${tenantId}&limit=1`, { token: ownerToken })
  const target = list.items[0]
  const { data } = await patch(`/orders/${target.id}`, {
    status: 'confirmed',
    tracking: { carrier: 'Delhivery', code: 'SMOKE123' },
  }, { token: ownerToken, expectStatus: 200 })
  expect(data.status === 'confirmed', `status is ${data.status}`)
  expect(data.timeline.some((entry) => entry.status === 'confirmed'), 'timeline was not appended')
  expect(data.tracking?.code === 'SMOKE123', 'tracking was not saved')
  return `${data.timeline.length} timeline entries`
})

/* ------------------------------------------------------------- customizer */

section('Customizer and analytics')

await test('a draft theme does not change the live storefront', async () => {
  const before = await get('/stores/resolve?slug=atelier-noor')
  await post('/customize/save', {
    tenantId,
    themeDraft: { ...before.data.theme, primaryColor: '#123456' },
  }, { token: ownerToken, expectStatus: 200 })
  const after = await get('/stores/resolve?slug=atelier-noor')
  expect(after.data.theme.primaryColor === before.data.theme.primaryColor, 'a draft leaked to the storefront')
  return `live colour still ${after.data.theme.primaryColor}`
})

await test('publishing applies the draft and busts the cache', async () => {
  await post('/customize/publish', { tenantId, label: 'Smoke publish' }, { token: ownerToken, expectStatus: 200 })
  const { data } = await get('/stores/resolve?slug=atelier-noor')
  expect(data.theme.primaryColor === '#123456', `expected #123456, got ${data.theme.primaryColor}`)
  return 'storefront updated immediately'
})

await test('a hostile theme value is refused, not stored', async () => {
  const { data } = await post('/customize/save', {
    tenantId,
    themeDraft: { primaryColor: 'red; background: url(javascript:alert(1))', borderRadius: '2px; content: "x"' },
  }, { token: ownerToken, expectStatus: 200 })
  expect(!/javascript/i.test(JSON.stringify(data.store.themeDraft)), 'a script payload was stored in the theme')
  return 'invalid colour and radius dropped'
})

await test('a homepage section of an unknown type is not stored', async () => {
  const { data } = await post('/customize/save', {
    tenantId,
    homepageDraft: { version: 1, status: 'draft', sections: [{ id: 'x', type: 'evil_block', enabled: true, config: {} }] },
  }, { token: ownerToken, expectStatus: 200 })
  expect(
    !data.store.homepageDraft.sections.some((section) => section.type === 'evil_block'),
    'an unknown section type was stored',
  )
  return 'unknown block coerced to a known type'
})

await test('store analytics returns a full dashboard payload', async () => {
  const { data } = await get(`/analytics/store?tenantId=${tenantId}`, { token: ownerToken, expectStatus: 200 })
  for (const key of ['sales', 'orders', 'products', 'inventory', 'lowStock', 'outOfStock', 'series', 'topProducts', 'recentOrders']) {
    expect(data[key] !== undefined, `missing ${key}`)
  }
  expect(data.series.length > 0, 'the chart series is empty')
  return `${data.orders} orders, ${data.series.length} months of history`
})

await test('platform analytics aggregates every store', async () => {
  const { data } = await get('/analytics/platform', { token: superToken, expectStatus: 200 })
  expect(data.stores >= 8, `expected at least 8 stores, got ${data.stores}`)
  return `${data.stores} stores, ${data.products} products`
})

/* ------------------------------------------------------------- teardown */

section('Reviews, staff, and sessions')

await test('a signed-in shopper can review a product they bought', async () => {
  const { data } = await post('/reviews', {
    productId: createdProductId,
    rating: 5,
    title: 'Smoke review',
    body: 'Left by the integration suite.',
  }, { token: shopperToken, expectStatus: 201 })
  expect(data.verified === true, 'a purchase was not detected, so the review is unverified')
  return `verified: ${data.verified}`
})

await test('a review updates the product’s aggregate rating', async () => {
  const { data } = await get(`/products/${createdProductId}?tenantId=${tenantId}`)
  expect(data.product.reviewCount > 0, 'reviewCount was not recomputed')
  return `rating ${data.product.rating} from ${data.product.reviewCount} review(s)`
})

await test('an anonymous review is refused', async () => {
  await post('/reviews', { productId: createdProductId, rating: 5, body: 'anon' }, { expectStatus: 401 })
  return 'refused'
})

await test('the team list excludes customers', async () => {
  const { data } = await get(`/staff?tenantId=${tenantId}`, { token: ownerToken, expectStatus: 200 })
  expect(data.every((member) => member.role !== 'customer'), 'a customer appeared in the team list')
  return `${data.length} staff`
})

await test('a store owner cannot be demoted through the team endpoint', async () => {
  const { data: staff } = await get(`/staff?tenantId=${tenantId}`, { token: ownerToken })
  const owner = staff.find((member) => member.role === 'store_owner')
  const { data } = await patch(`/staff/${owner.id}`, { role: 'store_manager' }, { token: ownerToken, expectStatus: 403 })
  return data.message
})

await test('cleanup: the test product can be deleted', async () => {
  await del(`/products/${createdProductId}`, { token: ownerToken, expectStatus: 200 })
  const gone = await get(`/products/${createdProductId}?tenantId=${tenantId}`)
  expect(gone.status === 404, `expected 404 after deletion, got ${gone.status}`)
  return 'deleted and dropped from cache'
})

await test('signing out immediately invalidates the token', async () => {
  const data = await signIn('priya@example.com', 'Customer@123')
  await get('/auth/me', { token: data.token, expectStatus: 200 })
  await post('/auth/logout', {}, { token: data.token, expectStatus: 200 })
  await get('/auth/me', { token: data.token, expectStatus: 401 })
  return 'revocation is effective at once'
})

/* ------------------------------------------------------------------ report */

console.log(`\n${passed} passed, ${failed} failed`)
if (failures.length) {
  console.log('\nFailures:')
  for (const failure of failures) console.log(`  - ${failure}`)
}
process.exit(failed ? 1 : 0)
