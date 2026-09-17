const CLOUDINARY = /^https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\//i

/**
 * Inserts fetch-time Cloudinary transforms so browsers can lazy-decode a
 * smaller auto-format image instead of the original upload.
 */
export function lazyImageUrl(url, { width } = {}) {
  const src = String(url || '')
  if (!CLOUDINARY.test(src)) return src
  const prefix = src.match(CLOUDINARY)[0]
  const rest = src.slice(prefix.length).replace(/^(f_auto,q_auto(?:,[a-z0-9_,]+)?\/)/i, '')
  const transform = width
    ? `f_auto,q_auto,c_limit,w_${Math.max(32, Math.trunc(width))}`
    : 'f_auto,q_auto,c_limit,w_1600'
  return `${prefix}${transform}/${rest}`
}
