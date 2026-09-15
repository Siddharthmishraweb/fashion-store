/*
 * Configuration is read once at boot and validated hard. A process that starts
 * with a weak secret or a missing database URL is worse than one that refuses
 * to start, so anything unsafe throws here rather than at the first request.
 */

const isProd = (process.env.NODE_ENV || 'development') === 'production'

function required(name) {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable ${name}`)
  return value
}

function int(name, fallback) {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new Error(`${name} must be a number, received "${raw}"`)
  return Math.trunc(value)
}

function list(name, fallback = []) {
  const raw = process.env[name]
  if (!raw) return fallback
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

const authSecret = process.env.AUTH_SECRET || ''
if (isProd && authSecret.length < 48) {
  throw new Error('AUTH_SECRET must be at least 48 characters in production')
}
if (isProd && /change-me/i.test(authSecret)) {
  throw new Error('AUTH_SECRET is still the example value; generate a real secret')
}

export const config = {
  isProd,
  env: process.env.NODE_ENV || 'development',
  port: int('PORT', 4000),
  host: process.env.HOST || '0.0.0.0',
  logLevel: process.env.LOG_LEVEL || (isProd ? 'info' : 'debug'),
  corsOrigins: list('CORS_ORIGINS', ['http://localhost:5173', 'http://localhost:5174']),

  db: {
    url: required('DATABASE_URL'),
    poolMax: int('PG_POOL_MAX', 16),
    idleTimeout: int('PG_IDLE_TIMEOUT', 30),
    connectTimeout: int('PG_CONNECT_TIMEOUT', 10),
  },

  auth: {
    secret: authSecret || 'development-only-secret-do-not-use-in-production',
    sessionTtlMs: int('SESSION_TTL_HOURS', 8) * 60 * 60 * 1000,
    maxLoginAttempts: int('LOGIN_MAX_ATTEMPTS', 5),
    lockMs: int('LOGIN_LOCK_MINUTES', 5) * 60 * 1000,
  },

  cache: {
    ttlMs: int('CACHE_TTL_SECONDS', 30) * 1000,
    maxEntries: int('CACHE_MAX_ENTRIES', 5000),
    httpSeconds: int('HTTP_CACHE_SECONDS', 15),
  },

  // A single storefront page issues several calls, so the per-caller budget is
  // generous by design; the credential routes get their own much tighter one.
  // Both are configurable because a load test drives everything from a single
  // address and would otherwise measure the rate limiter.
  rateLimit: {
    max: int('RATE_LIMIT_MAX', 600),
    windowMs: int('RATE_LIMIT_WINDOW_SECONDS', 60) * 1000,
    authMax: int('AUTH_RATE_LIMIT_MAX', 10),
    authWindowMs: int('AUTH_RATE_LIMIT_WINDOW_SECONDS', 60) * 1000,
  },

  // Money and tax rules live server-side; the client never decides these.
  commerce: {
    currency: 'INR',
    freeShippingThreshold: 2999,
    shippingFee: 149,
    gstRate: 0.05,
    maxQtyPerLine: 10,
  },
}
