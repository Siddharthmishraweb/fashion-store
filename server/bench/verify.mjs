/*
 * Boot check that needs no database.
 *
 * postgres.js connects lazily, so the whole application can be constructed and
 * exercised through fastify.inject() as long as the routes under test do not
 * query. That is enough to catch import errors, plugin ordering mistakes, route
 * collisions, and a broken error handler before anything is deployed.
 */

process.env.DATABASE_URL ||= 'postgres://vastrika:vastrika@localhost:5432/vastrika'
process.env.AUTH_SECRET ||= 'verification-only-secret-that-is-long-enough-to-pass'
process.env.LOG_LEVEL ||= 'silent'
process.env.NODE_ENV ||= 'development'

const { buildApp } = await import('../src/app.js')

const app = await buildApp()
await app.ready()

let failures = 0

async function check(label, run) {
  try {
    const detail = await run()
    console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ''}`)
  } catch (error) {
    failures += 1
    console.log(`  FAIL  ${label}: ${error.message}`)
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message)
}

console.log('\nRoute table')
const routes = app.printRoutes({ commonPrefix: false })
const registered = routes.split('\n').filter((line) => /\(/.test(line)).length
console.log(`  ${registered} route entries registered`)

console.log('\nChecks')

await check('GET /health returns 200 without touching the database', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' })
  expect(response.statusCode === 200, `expected 200, got ${response.statusCode}`)
  expect(response.json().ok === true, 'expected ok:true')
  return `${response.statusCode}`
})

await check('GET /themes serves all eight presets', async () => {
  const response = await app.inject({ method: 'GET', url: '/themes' })
  expect(response.statusCode === 200, `expected 200, got ${response.statusCode}`)
  const themes = response.json()
  expect(Array.isArray(themes) && themes.length === 8, `expected 8 themes, got ${themes.length}`)
  expect(themes.every((theme) => theme.id && theme.primaryColor), 'a theme is missing id or colors')
  return `${themes.length} themes, cache-control "${response.headers['cache-control']}"`
})

await check('unknown route returns a JSON 404', async () => {
  const response = await app.inject({ method: 'GET', url: '/does-not-exist' })
  expect(response.statusCode === 404, `expected 404, got ${response.statusCode}`)
  expect(typeof response.json().message === 'string', 'expected a message field')
  return response.json().message
})

await check('protected route rejects an anonymous caller with 401', async () => {
  const response = await app.inject({ method: 'GET', url: '/auth/me' })
  expect(response.statusCode === 401, `expected 401, got ${response.statusCode}`)
  return response.json().message
})

await check('a forged bearer token is rejected', async () => {
  const response = await app.inject({
    method: 'GET',
    url: '/auth/me',
    headers: { authorization: 'Bearer eyJzaWQiOiJhIn0.not-a-real-signature' },
  })
  expect(response.statusCode === 401, `expected 401, got ${response.statusCode}`)
  return 'signature verification held'
})

await check('super-admin route rejects an anonymous caller', async () => {
  const response = await app.inject({ method: 'GET', url: '/analytics/platform' })
  expect(response.statusCode === 401, `expected 401, got ${response.statusCode}`)
  return response.json().message
})

await check('schema validation rejects a malformed login body', async () => {
  const response = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'nope' } })
  expect(response.statusCode === 400, `expected 400, got ${response.statusCode}`)
  return response.json().message
})

await check('missing tenantId is a 400, not a 500', async () => {
  const response = await app.inject({ method: 'GET', url: '/products' })
  expect(response.statusCode === 400, `expected 400, got ${response.statusCode}`)
  return response.json().message
})

await check('CORS rejects an unlisted origin', async () => {
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/themes',
    headers: { origin: 'https://evil.example', 'access-control-request-method': 'GET' },
  })
  expect(!response.headers['access-control-allow-origin'], 'an unlisted origin was allowed')
  return 'no access-control-allow-origin header'
})

await check('CORS allows the configured dev origin', async () => {
  const response = await app.inject({
    method: 'OPTIONS',
    url: '/themes',
    headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'GET' },
  })
  expect(
    response.headers['access-control-allow-origin'] === 'http://localhost:5173',
    `unexpected header: ${response.headers['access-control-allow-origin']}`,
  )
  return response.headers['access-control-allow-origin']
})

await check('security headers are present', async () => {
  const response = await app.inject({ method: 'GET', url: '/health' })
  expect(response.headers['x-content-type-options'] === 'nosniff', 'missing nosniff')
  expect(response.headers['content-security-policy'], 'missing CSP')
  return 'helmet active'
})

await check('ETag is issued so repeat reads can 304', async () => {
  const first = await app.inject({ method: 'GET', url: '/themes' })
  expect(first.headers.etag, 'no ETag on the first response')
  const second = await app.inject({
    method: 'GET',
    url: '/themes',
    headers: { 'if-none-match': first.headers.etag },
  })
  expect(second.statusCode === 304, `expected 304 on revalidation, got ${second.statusCode}`)
  return `${first.headers.etag} then 304`
})

/* ---------------------------------------------- pure unit-level assertions */

const clean = await import('../src/lib/sanitize.js')
const { issueToken, readToken, hashPassword, verifyPassword } = await import('../src/lib/crypto.js')

console.log('\nSanitizer and token checks')

await check('javascript: URLs are stripped, including entity-encoded forms', async () => {
  const hostile = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\u0000script:alert(1)',
    'java&#115;cript:alert(1)',
    'data:text/html;base64,PHNjcmlwdD4=',
    'vbscript:msgbox(1)',
  ]
  for (const value of hostile) {
    expect(clean.url(value) === '', `not blocked: ${JSON.stringify(value)} -> ${clean.url(value)}`)
  }
  return `${hostile.length} payloads blocked`
})

await check('legitimate URLs survive sanitizing', async () => {
  expect(clean.url('https://example.com/a?b=1') === 'https://example.com/a?b=1', 'https rejected')
  expect(clean.url('/store/atelier-noor/products') === '/store/atelier-noor/products', 'relative path rejected')
  expect(clean.imageUrl('/assets/hero.png') === '/assets/hero.png', 'local asset rejected')
  return 'https, relative, and local asset paths allowed'
})

await check('control characters are removed from text', async () => {
  expect(clean.text('a\u0000b\u200Bc') === 'abc', `got ${JSON.stringify(clean.text('a\u0000b\u200Bc'))}`)
  expect(clean.text('  spaced   out  ') === 'spaced out', 'whitespace not collapsed')
  return 'nulls, zero-width, and runs of whitespace handled'
})

await check('a valid token round-trips and a tampered one does not', async () => {
  const expiresAt = Date.now() + 60000
  const token = issueToken({ userId: 'usr_1', role: 'store_owner', tenantId: 'store_1', sessionId: 'ses_1', expiresAt })
  const claims = readToken(token)
  expect(claims?.uid === 'usr_1' && claims.rol === 'store_owner', 'claims did not survive the round trip')

  const [body] = token.split('.')
  const forged = `${Buffer.from(JSON.stringify({ sid: 'ses_1', uid: 'usr_1', rol: 'super_admin', exp: expiresAt })).toString('base64url')}.${token.split('.')[1]}`
  expect(readToken(forged) === null, 'a re-signed privilege escalation was accepted')
  expect(readToken(`${body}.deadbeef`) === null, 'a bad signature was accepted')
  return 'signature binds the role claim'
})

await check('an expired token is refused', async () => {
  const token = issueToken({ userId: 'u', role: 'customer', tenantId: null, sessionId: 's', expiresAt: Date.now() - 1 })
  expect(readToken(token) === null, 'expired token accepted')
  return 'exp enforced'
})

await check('password hashing verifies correctly and rejects a wrong password', async () => {
  const began = Date.now()
  const stored = await hashPassword('Admin@123')
  expect(stored.startsWith('scrypt$'), `unexpected format: ${stored.slice(0, 12)}`)
  expect(await verifyPassword('Admin@123', stored), 'correct password rejected')
  expect(!(await verifyPassword('Admin@124', stored)), 'wrong password accepted')
  expect(!(await verifyPassword('Admin@123', 'garbage')), 'a malformed hash was accepted')
  return `${Date.now() - began}ms for hash + 3 verifications`
})

await check('password policy catches weak input', async () => {
  expect(clean.passwordIssues('short').length > 0, 'short password accepted')
  expect(clean.passwordIssues('alllowercase1').length > 0, 'missing uppercase accepted')
  expect(clean.passwordIssues('Admin@123').length === 0, `strong password rejected: ${clean.passwordIssues('Admin@123')}`)
  return 'length, case, and digit rules enforced'
})

await app.close()

console.log(failures ? `\n${failures} check(s) failed\n` : '\nAll checks passed\n')
process.exit(failures ? 1 : 0)
