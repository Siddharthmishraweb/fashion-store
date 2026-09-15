/*
 * Latency benchmark for the read paths a storefront actually hammers.
 *
 *   NODE_ENV=production RATE_LIMIT_MAX=1000000 npm start   (in one terminal)
 *   npm run bench                                          (in another)
 *
 * Each scenario is warmed first so the reported figures reflect a running
 * service with a populated cache rather than a cold start, then measured with
 * autocannon. The numbers that matter are p50 and p99, not the average.
 *
 * Requests ask for brotli because every real browser does, and the cached read
 * path answers them from precompressed bytes. Set BENCH_ENCODING=identity to
 * measure the uncompressed path instead.
 */

import autocannon from 'autocannon'

const BASE = process.env.BASE_URL || 'http://localhost:4000'
const DURATION = Number(process.env.BENCH_DURATION || 8)
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS || 50)
const ENCODING = process.env.BENCH_ENCODING || 'br, gzip'

async function resolveTenant() {
  const response = await fetch(`${BASE}/stores/resolve?slug=atelier-noor`)
  if (!response.ok) {
    throw new Error(`Cannot reach ${BASE} (status ${response.status}). Start the API and seed the database first.`)
  }
  const payload = await response.json()
  const products = await fetch(`${BASE}/products?tenantId=${payload.tenant.id}&limit=1`).then((r) => r.json())
  return { tenantId: payload.tenant.id, productSlug: products.items[0]?.slug }
}

const { tenantId, productSlug } = await resolveTenant()

const scenarios = [
  { name: 'GET /health', path: '/health' },
  { name: 'GET /stores (directory)', path: '/stores?limit=12' },
  { name: 'GET /stores/resolve (storefront boot)', path: '/stores/resolve?slug=atelier-noor' },
  { name: 'GET /products (catalogue page)', path: `/products?tenantId=${tenantId}&limit=24` },
  { name: 'GET /products (filtered + sorted)', path: `/products?tenantId=${tenantId}&fabric=Silk&sort=price_asc&limit=24` },
  { name: 'GET /products/facets', path: `/products/facets?tenantId=${tenantId}` },
  { name: 'GET /products/:slug (detail)', path: `/products/${productSlug}?tenantId=${tenantId}` },
  { name: 'GET /search?q=banar', path: `/search?tenantId=${tenantId}&q=banar` },
  { name: 'GET /categories', path: `/categories?tenantId=${tenantId}` },
  { name: 'GET /banners (live)', path: `/banners?tenantId=${tenantId}` },
]

function run(path) {
  return new Promise((resolve, reject) => {
    autocannon(
      {
        url: `${BASE}${path}`,
        connections: CONNECTIONS,
        duration: DURATION,
        headers: { accept: 'application/json', 'accept-encoding': ENCODING },
      },
      (error, result) => (error ? reject(error) : resolve(result)),
    )
  })
}

console.log(`\nTarget       ${BASE}`)
console.log(`Load         ${CONNECTIONS} connections for ${DURATION}s per scenario`)
console.log(`Encoding     ${ENCODING}\n`)

const header = ['Endpoint', 'req/s', 'p50', 'p90', 'p99', 'max', 'non-2xx']
const widths = [40, 9, 8, 8, 8, 8, 8]
const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('')

console.log(line(header))
console.log('-'.repeat(widths.reduce((a, b) => a + b, 0)))

const results = []

for (const scenario of scenarios) {
  // Warm the cache and let the JIT settle before measuring.
  await fetch(`${BASE}${scenario.path}`).catch(() => {})

  const result = await run(scenario.path)
  const failures = result.non2xx + result.errors + result.timeouts
  results.push({ name: scenario.name, result, failures })

  console.log(line([
    scenario.name.slice(0, widths[0] - 1),
    Math.round(result.requests.average),
    `${result.latency.p50}ms`,
    `${result.latency.p90}ms`,
    `${result.latency.p99}ms`,
    `${result.latency.max}ms`,
    failures,
  ]))
}

const worstP99 = Math.max(...results.map((entry) => entry.result.latency.p99))
const totalFailures = results.reduce((sum, entry) => sum + entry.failures, 0)

console.log(`\nWorst p99 across all read endpoints: ${worstP99}ms`)
console.log(`Failed responses: ${totalFailures}`)

if (totalFailures > 0) {
  console.log([
    '\nSome requests did not return 2xx, so these latencies are not meaningful.',
    'The usual cause is the rate limiter: a load test comes from one address.',
    'Restart the API with RATE_LIMIT_MAX=1000000 and measure again.',
  ].join('\n'))
  process.exit(1)
}
