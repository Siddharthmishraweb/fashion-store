const BLOCKED_SCHEMES = /^(javascript|data|vbscript|file|blob):/i
const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g

export function sanitizeText(value, maxLength = 500) {
  return String(value ?? '')
    .replace(CONTROL_CHARS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeMultiline(value, maxLength = 4000) {
  return String(value ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, maxLength)
}

/** Returns a render-safe href, or '' when the value is unsafe. */
export function safeUrl(value, { allowExternal = true } = {}) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  const decoded = raw.replace(/&#(\d+);?/g, (_, code) => String.fromCharCode(Number(code)))
  if (BLOCKED_SCHEMES.test(decoded.replace(/\s/g, ''))) return ''
  if (raw.startsWith('/') || raw.startsWith('#') || raw.startsWith('?')) return raw
  if (!allowExternal) return ''
  try {
    const url = new URL(raw, window.location.origin)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

/** Only absolute https/http images or local assets are allowed as image sources. */
export function safeImageUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return ''
  if (raw.startsWith('/')) return raw
  const url = safeUrl(raw)
  return /^https?:\/\//i.test(url) ? url : ''
}

export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(value ?? '').trim())
}

export function isPhone(value) {
  return /^[+]?[0-9\s-]{8,16}$/.test(String(value ?? '').trim())
}

export function isPin(value) {
  return /^[1-9][0-9]{5}$/.test(String(value ?? '').trim())
}

export function isSlug(value) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(value ?? '').trim())
}

export function passwordIssues(value) {
  const password = String(value ?? '')
  const issues = []
  if (password.length < 8) issues.push('at least 8 characters')
  if (!/[A-Z]/.test(password)) issues.push('an uppercase letter')
  if (!/[a-z]/.test(password)) issues.push('a lowercase letter')
  if (!/[0-9]/.test(password)) issues.push('a number')
  return issues
}

/**
 * Stand-in for the server-side bcrypt/argon2 hash. The mock API runs in the
 * browser and must stay synchronous, so credentials are salted and digested
 * rather than stored in the clear. Real deployments hash on the Node service.
 */
export function demoHash(password, salt) {
  const input = `${salt}::${password}::${salt}`
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < input.length; i += 1) {
    const code = input.charCodeAt(i)
    h1 = Math.imul(h1 ^ code, 0x01000193) >>> 0
    h2 = Math.imul(h2 + code + i, 0x85ebca6b) >>> 0
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`
}

export function makeSalt() {
  const bytes = new Uint8Array(12)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function makeToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

export function constantTimeEqual(a, b) {
  const left = String(a ?? '')
  const right = String(b ?? '')
  if (left.length !== right.length) return false
  let diff = 0
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i)
  }
  return diff === 0
}

const ATTEMPT_KEY = 'vk.loginAttempts'
const MAX_ATTEMPTS = 5
const LOCK_WINDOW_MS = 5 * 60 * 1000

function readAttempts() {
  try {
    return JSON.parse(sessionStorage.getItem(ATTEMPT_KEY) || '{}')
  } catch {
    return {}
  }
}

function writeAttempts(value) {
  sessionStorage.setItem(ATTEMPT_KEY, JSON.stringify(value))
}

export function loginLockRemainingMs(identifier) {
  const record = readAttempts()[String(identifier).toLowerCase()]
  if (!record || record.count < MAX_ATTEMPTS) return 0
  const remaining = record.firstAt + LOCK_WINDOW_MS - Date.now()
  return remaining > 0 ? remaining : 0
}

export function recordLoginFailure(identifier) {
  const key = String(identifier).toLowerCase()
  const attempts = readAttempts()
  const record = attempts[key]
  if (!record || Date.now() - record.firstAt > LOCK_WINDOW_MS) {
    attempts[key] = { count: 1, firstAt: Date.now() }
  } else {
    attempts[key] = { count: record.count + 1, firstAt: record.firstAt }
  }
  writeAttempts(attempts)
  return MAX_ATTEMPTS - attempts[key].count
}

export function clearLoginFailures(identifier) {
  const attempts = readAttempts()
  delete attempts[String(identifier).toLowerCase()]
  writeAttempts(attempts)
}

export const SECURITY = { MAX_ATTEMPTS, LOCK_WINDOW_MS }
