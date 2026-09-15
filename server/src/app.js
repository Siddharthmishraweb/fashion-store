import { constants as zlibConstants } from 'node:zlib'

import Fastify, { LogController } from 'fastify'
import compress from '@fastify/compress'
import cors from '@fastify/cors'
import etag from '@fastify/etag'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import underPressure from '@fastify/under-pressure'

import { config } from './config/env.js'
import { errorHandler } from './lib/errors.js'
import authPlugin from './plugins/auth.js'

import analyticsRoutes from './routes/analytics.js'
import authRoutes from './routes/auth.js'
import catalogRoutes from './routes/catalog.js'
import couponRoutes from './routes/coupons.js'
import customizeRoutes from './routes/customize.js'
import engageRoutes from './routes/engage.js'
import healthRoutes from './routes/health.js'
import orderRoutes from './routes/orders.js'
import peopleRoutes from './routes/people.js'
import productRoutes from './routes/products.js'
import storeRoutes from './routes/stores.js'

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      // Never log credentials or bearer tokens, even at debug level.
      redact: ['req.headers.authorization', 'req.headers.cookie', 'body.password', 'body.newPassword', 'body.currentPassword'],
      transport: config.isProd ? undefined : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
    // Per-request access logs are useful in development and pure overhead in
    // production, where the proxy in front already records them.
    logController: new LogController({ disableRequestLogging: config.isProd }),
    // Trust the first proxy hop so rate limiting and audit logs see the real
    // client address behind a load balancer.
    trustProxy: true,
    bodyLimit: 512 * 1024,
    // Query strings carry repeated facet params (?fabric=A&fabric=B); the
    // default parser already produces arrays for those, which is what the
    // catalogue filters expect.
    requestIdHeader: 'x-request-id',
  })

  // Browsers and fetch wrappers routinely attach a JSON content type to DELETE
  // and POST calls that carry no body. Treating that as an empty object is
  // friendlier than the default 400 and costs nothing.
  app.addContentTypeParser('application/json', { parseAs: 'string', bodyLimit: 512 * 1024 }, (request, body, done) => {
    if (!body || !body.trim()) return done(null, {})
    try {
      done(null, JSON.parse(body))
    } catch {
      done(Object.assign(new Error('Malformed JSON body'), { statusCode: 400 }))
    }
  })

  /* -------------------------------------------------------------- security */
  await app.register(helmet, {
    // The API returns JSON only; a restrictive CSP costs nothing here.
    contentSecurityPolicy: { directives: { 'default-src': ["'none'"], 'frame-ancestors': ["'none'"] } },
    crossOriginResourcePolicy: { policy: 'same-site' },
    referrerPolicy: { policy: 'no-referrer' },
  })

  await app.register(cors, {
    origin(origin, callback) {
      // Same-origin and server-to-server calls arrive without an Origin header.
      if (!origin) return callback(null, true)
      callback(null, config.corsOrigins.includes(origin))
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-Tenant-Id', 'If-None-Match'],
    exposedHeaders: ['ETag'],
    maxAge: 86400,
  })

  await app.register(rateLimit, {
    global: true,
    max: config.rateLimit.max,
    timeWindow: config.rateLimit.windowMs,
    // Authenticated callers are limited per session, anonymous ones per address.
    keyGenerator: (request) => request.auth?.userId || request.ip,
    continueExceeding: false,
    addHeadersOnExceeding: { 'x-ratelimit-remaining': true },
    allowList: (request) => request.url.startsWith('/health'),
  })

  /* ---------------------------------------------------------- performance */
  // 304s for repeat storefront reads. Weak etags are enough and cheaper.
  await app.register(etag, { weak: true })

  await app.register(compress, {
    global: true,
    encodings: ['br', 'gzip', 'deflate'],
    // Compressing a small payload costs more CPU than it saves bandwidth.
    threshold: 1024,
    // Brotli defaults to quality 11, which is tuned for static assets built
    // once and served forever. For a response generated per request it is the
    // single most expensive thing the process does: quality 4 compresses JSON
    // within a few percent of 11 at a small fraction of the CPU.
    brotliOptions: {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
        [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
      },
    },
    zlibOptions: { level: 4 },
  })

  // Shed load rather than queue it: under sustained pressure a 503 is a better
  // answer than a request that times out after ten seconds.
  await app.register(underPressure, {
    maxEventLoopDelay: 1000,
    maxHeapUsedBytes: 0,
    maxRssBytes: 0,
    retryAfter: 5,
    message: 'The service is busy. Please retry shortly.',
  })

  /* ------------------------------------------------------------- identity */
  await app.register(authPlugin)

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ message: `No route for ${request.method} ${request.url}` })
  })

  /* --------------------------------------------------------------- routes */
  await app.register(healthRoutes)
  await app.register(authRoutes)
  await app.register(storeRoutes)
  await app.register(productRoutes)
  await app.register(catalogRoutes)
  await app.register(orderRoutes)
  await app.register(peopleRoutes)
  await app.register(couponRoutes)
  await app.register(engageRoutes)
  await app.register(analyticsRoutes)
  await app.register(customizeRoutes)

  return app
}
