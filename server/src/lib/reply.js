import { brotliCompressSync, gzipSync, constants as zlib } from 'node:zlib'

import { config } from '../config/env.js'

/*
 * The read path never turns a row into a JavaScript object. Product, store, and
 * banner rows already hold their API shape in a `payload` jsonb column, so we
 * select `payload::text` and splice those strings straight into the response
 * body. That removes a JSON.parse and a JSON.stringify from every list request,
 * which on a 24-item product page is the single largest CPU cost remaining.
 */

const JSON_TYPE = 'application/json; charset=utf-8'

export function sendRaw(reply, body, status = 200) {
  return reply.code(status).type(JSON_TYPE).send(body)
}

/*
 * Precompressed cached responses.
 *
 * Once the body of a public read is in the L1 cache it never changes until a
 * write invalidates it, so compressing it again for every visitor is wasted
 * work: on a 36 KB catalogue page that is the largest remaining per-request
 * cost after the query itself. The encoded bytes are therefore memoized beside
 * the body and written directly, which also makes @fastify/compress skip the
 * response because Content-Encoding is already set.
 */

const BROTLI_OPTIONS = {
  params: {
    [zlib.BROTLI_PARAM_QUALITY]: 4,
    [zlib.BROTLI_PARAM_MODE]: zlib.BROTLI_MODE_TEXT,
  },
}
const GZIP_OPTIONS = { level: 5 }
const MIN_ENCODE_BYTES = 1024
const MAX_ENCODED_KEYS = 512

const encodedBodies = new Map() // cache key -> { body, br, gzip }

function negotiate(header) {
  if (!header) return null
  if (header.includes('br')) return 'br'
  if (header.includes('gzip')) return 'gzip'
  return null
}

/**
 * Sends an already-cached JSON string, reusing the compressed bytes for that
 * exact body. `cacheKey` must be the same key the body was cached under.
 */
export function sendRawCached(reply, cacheKey, body, status = 200) {
  reply.header('Vary', 'Accept-Encoding')

  const encoding = body.length >= MIN_ENCODE_BYTES
    ? negotiate(reply.request.headers['accept-encoding'])
    : null
  if (!encoding) return sendRaw(reply, body, status)

  let slot = encodedBodies.get(cacheKey)
  // Identity, not equality: a cache hit hands back the very same string, while
  // a rebuilt body is a new one and has to be encoded again.
  if (!slot || slot.body !== body) {
    slot = { body }
    encodedBodies.delete(cacheKey)
    encodedBodies.set(cacheKey, slot)
    while (encodedBodies.size > MAX_ENCODED_KEYS) {
      const oldest = encodedBodies.keys().next()
      if (oldest.done) break
      encodedBodies.delete(oldest.value)
    }
  }

  if (!slot[encoding]) {
    slot[encoding] = encoding === 'br'
      ? brotliCompressSync(body, BROTLI_OPTIONS)
      : gzipSync(body, GZIP_OPTIONS)
  }

  return reply.code(status).type(JSON_TYPE).header('Content-Encoding', encoding).send(slot[encoding])
}

export function encodedBodyStats() {
  return { keys: encodedBodies.size }
}

/** `[{...},{...}]` from an array of pre-serialized JSON strings. */
export function rawArray(chunks) {
  return `[${chunks.join(',')}]`
}

/** The paginated envelope the client expects, assembled without re-serializing. */
export function rawPage(chunks, { page, limit, total }) {
  const pages = Math.max(1, Math.ceil(total / limit) || 1)
  return `{"items":[${chunks.join(',')}],"page":${page},"limit":${limit},"total":${total},"pages":${pages}}`
}

export function pageOf(rows, { page, limit }) {
  const total = rows.length ? Number(rows[0].total) : 0
  return rawPage(rows.map((row) => row.payload), { page, limit, total })
}

/** Reads and clamps pagination params so a client cannot request the whole table. */
export function readPaging(query, { defaultLimit = 24, maxLimit = 60 } = {}) {
  const page = Math.max(1, Math.trunc(Number(query.page) || 1))
  const limit = Math.min(maxLimit, Math.max(1, Math.trunc(Number(query.limit) || defaultLimit)))
  return { page, limit, offset: (page - 1) * limit }
}

/**
 * Storefront reads are identical for every visitor, so they may sit in a shared
 * cache. Combined with @fastify/etag this turns repeat views into 304s.
 */
export function publicCache(reply, seconds = config.cache.httpSeconds) {
  reply.header('Cache-Control', `public, max-age=${seconds}, stale-while-revalidate=${seconds * 2}`)
  return reply
}

/** Anything scoped to a signed-in user must never be stored by a shared cache. */
export function privateCache(reply) {
  reply.header('Cache-Control', 'private, no-store')
  return reply
}
