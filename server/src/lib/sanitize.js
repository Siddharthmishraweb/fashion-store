/*
 * Every value that arrives from a client passes through here before it reaches
 * SQL or a response body. Stored XSS is the main risk in a system where store
 * owners publish copy and image URLs that other people's browsers render, so
 * URLs are scheme-checked and text is stripped of control characters.
 */

const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|blob):/i
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g

export function text(value, maxLength = 200) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function multiline(value, maxLength = 4000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, maxLength)
}

/** Returns a safe href, or '' when the value could execute script. */
export function url(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  // Decode numeric entities first: `java&#115;cript:` must not slip through.
  const decoded = raw.replace(/&#x?([0-9a-f]+);?/gi, (_, code) =>
    String.fromCharCode(parseInt(code, /^x/i.test(code) ? 16 : 10)),
  )
  if (BLOCKED_SCHEMES.test(decoded.replace(/[\s\u0000]/g, ''))) return ''
  if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('?')) return raw.slice(0, 500)
  try {
    const parsed = new URL(raw)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return ''
    return parsed.toString().slice(0, 500)
  } catch {
    return ''
  }
}

/** Image sources must be absolute http(s) or a local asset path. */
export function imageUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('/')) return raw.slice(0, 500)
  const safe = url(raw)
  return /^https?:\/\//i.test(safe) ? safe : ''
}

export function number(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return min
  return Math.min(max, Math.max(min, Math.round(parsed * 100) / 100))
}

export function integer(value, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  return Math.trunc(number(value, { min, max }))
}

export function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1'
}

/** Accepts only YYYY-MM-DD, returns '' otherwise. */
export function dateOnly(value) {
  const raw = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return ''
  const parsed = new Date(`${raw}T00:00:00Z`)
  return Number.isNaN(parsed.getTime()) ? '' : raw
}

export function oneOf(value, allowed, fallback = allowed[0]) {
  return allowed.includes(value) ? value : fallback
}

export function stringArray(value, { max = 40, itemLength = 60 } = {}) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  for (const item of value) {
    const clean = text(item, itemLength)
    if (clean) seen.add(clean)
    if (seen.size >= max) break
  }
  return [...seen]
}

export function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80)
}

/* ------------------------------------------------------------- validators */

export const isEmail = (value) => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value ?? '').trim())
export const isPhone = (value) => /^[+]?[0-9\s-]{8,16}$/.test(String(value ?? '').trim())
export const isPin = (value) => /^[1-9][0-9]{5}$/.test(String(value ?? '').trim())
export const isSlug = (value) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value ?? '').trim())

export function passwordIssues(value) {
  const password = String(value ?? '')
  const issues = []
  if (password.length < 8) issues.push('at least 8 characters')
  if (password.length > 200) issues.push('fewer than 200 characters')
  if (!/[A-Z]/.test(password)) issues.push('an uppercase letter')
  if (!/[a-z]/.test(password)) issues.push('a lowercase letter')
  if (!/[0-9]/.test(password)) issues.push('a number')
  return issues
}

/** Mirrors the storefront rule: a banner is live only inside its date window. */
export function withinDateRange(start, end, now = new Date()) {
  const today = now.toISOString().slice(0, 10)
  if (start && today < start) return false
  if (end && today > end) return false
  return true
}
