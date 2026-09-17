import Fastify, { LogController } from 'fastify'
import cors from '@fastify/cors'
import etag from '@fastify/etag'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'

import { config } from './config/env.js'
import { errorHandler } from './lib/errors.js'

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
    bodyLimit: 9 * 1024 * 1024,
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

  // Compress and the event-loop probe are useful on a long-lived Node process.
  // On Vercel they make cold starts fail (FST_UNDER_PRESSURE) or burn the
  // budget before the first route is registered, so skip them there.
  if (!process.env.VERCEL) {
    const { constants: zlibConstants } = await import('node:zlib')
    const { default: compress } = await import('@fastify/compress')
    const { default: underPressure } = await import('@fastify/under-pressure')
    await app.register(compress, {
      global: true,
      encodings: ['br', 'gzip', 'deflate'],
      threshold: 1024,
      brotliOptions: {
        params: {
          [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
          [zlibConstants.BROTLI_PARAM_MODE]: zlibConstants.BROTLI_MODE_TEXT,
        },
      },
      zlibOptions: { level: 4 },
    })
    await app.register(underPressure, {
      maxEventLoopDelay: 1000,
      maxHeapUsedBytes: 0,
      maxRssBytes: 0,
      retryAfter: 5,
      message: 'The service is busy. Please retry shortly.',
    })
  }

  /* ------------------------------------------------------------- identity */
  const { default: authPlugin } = await import('./plugins/auth.js')
  await app.register(authPlugin)

  app.setErrorHandler(errorHandler)
  app.setNotFoundHandler((request, reply) => {
    reply.code(404).send({ message: `No route for ${request.method} ${request.url}` })
  })

  /* --------------------------------------------------------------- routes */
  // Static import() specifiers so Vercel file tracing still packs each file,
  // while Node only evaluates a module when this function reaches it.
  await app.register((await import('./routes/health.js')).default)
  await app.register((await import('./routes/auth.js')).default)
  await app.register((await import('./routes/stores.js')).default)
  await app.register((await import('./routes/products.js')).default)
  await app.register((await import('./routes/catalog.js')).default)
  await app.register((await import('./routes/orders.js')).default)
  await app.register((await import('./routes/people.js')).default)
  await app.register((await import('./routes/coupons.js')).default)
  await app.register((await import('./routes/engage.js')).default)
  await app.register((await import('./routes/analytics.js')).default)
  await app.register((await import('./routes/customize.js')).default)

  const [{ default: multipart }, { default: uploadRoutes }] = await Promise.all([
    import('@fastify/multipart'),
    import('./routes/uploads.js'),
  ])
  await app.register(async (scope) => {
    await scope.register(multipart, {
      limits: { fileSize: 8 * 1024 * 1024, files: 1 },
    })
    await scope.register(uploadRoutes)
  })

  return app
}
