import { createHmac, randomBytes, randomUUID, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { config } from '../config/env.js'

const scrypt = promisify(scryptCb)

/*
 * Password hashing uses scrypt from node:crypto: memory-hard, no native
 * dependency to compile, and tuned below to cost roughly 60-100ms per hash.
 * Stored format is self-describing so the parameters can be raised later
 * without invalidating existing credentials.
 */
const SCRYPT = { N: 16384, r: 8, p: 1, keylen: 64 }

export async function hashPassword(password) {
  const salt = randomBytes(16)
  const key = await scrypt(String(password), salt, SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, N, r, p, saltB64, keyB64] = parts
  let expected
  try {
    expected = Buffer.from(keyB64, 'base64url')
  } catch {
    return false
  }
  const actual = await scrypt(String(password), Buffer.from(saltB64, 'base64url'), expected.length, {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  })
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

/**
 * Burns roughly the same CPU as a real verification. Called when the email does
 * not exist so that response timing cannot be used to enumerate accounts.
 */
export async function fakeVerify() {
  await scrypt('timing-equaliser', randomBytes(16), SCRYPT.keylen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p })
  return false
}

/* -------------------------------------------------------------- session tokens */

/*
 * Tokens are stateless and signed: `base64url(claims).base64url(hmac)`. The
 * claims carry everything authorization needs, so a request costs one HMAC
 * (a few microseconds) instead of a database round-trip. Revocation is handled
 * by the session denylist in lib/sessions.js.
 */

function sign(input) {
  return createHmac('sha256', config.auth.secret).update(input).digest('base64url')
}

export function issueToken({ userId, role, tenantId, sessionId, expiresAt }) {
  const claims = { sid: sessionId, uid: userId, rol: role, tid: tenantId || null, exp: expiresAt }
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${body}.${sign(body)}`
}

export function readToken(token) {
  if (typeof token !== 'string') return null
  const dot = token.indexOf('.')
  if (dot < 1) return null
  const body = token.slice(0, dot)
  const signature = token.slice(dot + 1)

  const expected = Buffer.from(sign(body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null

  let claims
  try {
    claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (!claims || typeof claims.exp !== 'number' || claims.exp <= Date.now()) return null
  return claims
}

/* -------------------------------------------------------------------- ids */

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

/** Short, sortable-enough, collision-resistant public id with a type prefix. */
export function id(prefix) {
  const bytes = randomBytes(12)
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return `${prefix}_${out}`
}

export const uuid = () => randomUUID()
export const opaqueToken = () => randomBytes(32).toString('base64url')
export const numericOtp = () => String(100000 + (randomBytes(4).readUInt32BE(0) % 900000))
