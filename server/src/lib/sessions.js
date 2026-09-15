import { sql } from '../db/sql.js'

/*
 * Session tokens are stateless, so signing out has to be explicit: a revoked
 * session id goes into this denylist, which every instance keeps in memory and
 * refreshes through Postgres NOTIFY. Entries are dropped once the token would
 * have expired anyway, so the set stays small regardless of uptime.
 */

const CHANNEL = 'vk_sessions'
const revoked = new Map() // sessionId -> expiry (ms)
let listening = null
let sweeper = null

export function isRevoked(sessionId) {
  const expiry = revoked.get(sessionId)
  if (expiry === undefined) return false
  if (expiry <= Date.now()) {
    revoked.delete(sessionId)
    return false
  }
  return true
}

function remember(entries) {
  for (const { sid, exp } of entries) {
    if (sid && exp > Date.now()) revoked.set(sid, exp)
  }
}

/** Marks sessions dead here, in the database, and on every other instance. */
export async function revokeSessions(entries) {
  const live = entries.filter((entry) => entry.sid && entry.exp > Date.now())
  if (!live.length) return
  remember(live)

  await sql`
    insert into revoked_sessions ${sql(
      live.map(({ sid, exp }) => ({ session_id: sid, expires_at: new Date(exp) })),
      'session_id',
      'expires_at',
    )}
    on conflict (session_id) do nothing
  `
  await sql.notify(CHANNEL, JSON.stringify(live)).catch(() => {})
}

export async function revokeUserSessions(userId, { except } = {}) {
  const rows = await sql`
    select id, expires_at from sessions
    where user_id = ${userId} and expires_at > now()
      ${except ? sql`and id <> ${except}` : sql``}
  `
  if (!rows.length) return
  await revokeSessions(rows.map((row) => ({ sid: row.id, exp: new Date(row.expires_at).getTime() })))
  await sql`delete from sessions where user_id = ${userId} ${except ? sql`and id <> ${except}` : sql``}`
}

/** Rebuilds the denylist after a restart and subscribes to peer revocations. */
export async function startSessionGuard(logger) {
  const rows = await sql`select session_id, expires_at from revoked_sessions where expires_at > now()`
  remember(rows.map((row) => ({ sid: row.session_id, exp: new Date(row.expires_at).getTime() })))
  logger?.info({ revoked: revoked.size }, 'session denylist loaded')

  listening = sql.listen(CHANNEL, (payload) => {
    try {
      const entries = JSON.parse(payload)
      if (Array.isArray(entries)) remember(entries)
    } catch {
      /* ignore malformed payloads */
    }
  })
  await listening

  // Housekeeping: expired rows serve no purpose once the token itself is dead.
  sweeper = setInterval(() => {
    const now = Date.now()
    for (const [sid, exp] of revoked) if (exp <= now) revoked.delete(sid)
    sql`delete from revoked_sessions where expires_at < now()`.catch(() => {})
    sql`delete from sessions where expires_at < now()`.catch(() => {})
  }, 10 * 60 * 1000)
  sweeper.unref?.()
}

export async function stopSessionGuard() {
  if (sweeper) clearInterval(sweeper)
  const subscription = await listening?.catch(() => null)
  await subscription?.unlisten?.().catch(() => {})
  listening = null
}

export function sessionStats() {
  return { revoked: revoked.size }
}
