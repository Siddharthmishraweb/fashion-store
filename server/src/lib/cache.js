import { config } from '../config/env.js'
import { sql } from '../db/sql.js'

/*
 * Two-tier read cache.
 *
 * L1 is in this process: a Map with TTL and an insertion-ordered eviction, so a
 * hot storefront read costs a Map lookup instead of a query. Correctness across
 * multiple API instances comes from Postgres LISTEN/NOTIFY rather than Redis:
 * whoever performs a write publishes the affected tags on the `vk_cache`
 * channel, and every instance drops those tags from its own L1. That keeps the
 * fast path in-process while avoiding a second piece of infrastructure to run.
 */

const CHANNEL = 'vk_cache'

const store = new Map() // key -> { value, expires, tags }
const tagIndex = new Map() // tag -> Set(key)
let listening = null
let hits = 0
let misses = 0

function indexTags(key, tags) {
  for (const tag of tags) {
    let keys = tagIndex.get(tag)
    if (!keys) {
      keys = new Set()
      tagIndex.set(tag, keys)
    }
    keys.add(key)
  }
}

function forget(key) {
  const entry = store.get(key)
  if (!entry) return
  store.delete(key)
  for (const tag of entry.tags) {
    const keys = tagIndex.get(tag)
    if (!keys) continue
    keys.delete(key)
    if (!keys.size) tagIndex.delete(tag)
  }
}

function evictIfFull() {
  while (store.size > config.cache.maxEntries) {
    // Map preserves insertion order, so the first key is the oldest write.
    const oldest = store.keys().next()
    if (oldest.done) return
    forget(oldest.value)
  }
}

function dropTagsLocally(tags) {
  for (const tag of tags) {
    const keys = tagIndex.get(tag)
    if (!keys) continue
    for (const key of [...keys]) forget(key)
  }
}

/**
 * Serves `key` from L1 when warm, otherwise runs `producer` and stores the
 * result under the supplied invalidation tags.
 */
export async function cached(key, tags, producer, ttlMs = config.cache.ttlMs) {
  const entry = store.get(key)
  const now = Date.now()
  if (entry && entry.expires > now) {
    hits += 1
    return entry.value
  }
  if (entry) forget(key)

  misses += 1
  const value = await producer()
  store.set(key, { value, expires: now + ttlMs, tags })
  indexTags(key, tags)
  evictIfFull()
  return value
}

/** Drops the tags here and tells every other instance to do the same. */
export async function invalidate(...tags) {
  const flat = tags.flat().filter(Boolean)
  if (!flat.length) return
  dropTagsLocally(flat)
  try {
    await sql.notify(CHANNEL, JSON.stringify(flat))
  } catch (error) {
    // A failed NOTIFY must never fail the write that triggered it. The local
    // cache is already correct and remote copies expire within the TTL.
    if (process.env.NODE_ENV !== 'test') console.warn('[cache] notify failed:', error.message)
  }
}

export async function startCacheSubscriber(logger) {
  if (listening) return listening
  listening = sql
    .listen(CHANNEL, (payload) => {
      try {
        const tags = JSON.parse(payload)
        if (Array.isArray(tags)) dropTagsLocally(tags)
      } catch {
        // An unparseable payload means we cannot know what changed: clear all.
        clearCache()
      }
    })
    .then((subscription) => {
      logger?.info('cache invalidation subscriber attached')
      return subscription
    })
  return listening
}

export async function stopCacheSubscriber() {
  const subscription = await listening?.catch(() => null)
  await subscription?.unlisten?.().catch(() => {})
  listening = null
}

export function clearCache() {
  store.clear()
  tagIndex.clear()
}

export function cacheStats() {
  const total = hits + misses
  return {
    entries: store.size,
    tags: tagIndex.size,
    hits,
    misses,
    hitRate: total ? Number((hits / total).toFixed(4)) : 0,
  }
}

/* Tag builders. Keeping them in one place stops a write from invalidating the
 * wrong thing because two call sites spelled a tag differently. */
export const tags = {
  themes: () => 'themes',
  storeList: () => 'stores:list',
  store: (tenantId) => `store:${tenantId}`,
  products: (tenantId) => `products:${tenantId}`,
  product: (productId) => `product:${productId}`,
  categories: (tenantId) => `categories:${tenantId}`,
  collections: (tenantId) => `collections:${tenantId}`,
  banners: (tenantId) => `banners:${tenantId}`,
  reviews: (tenantId) => `reviews:${tenantId}`,
  /** Everything a storefront render touches. */
  storefront: (tenantId) => [
    `store:${tenantId}`,
    `products:${tenantId}`,
    `categories:${tenantId}`,
    `collections:${tenantId}`,
    `banners:${tenantId}`,
  ],
}
