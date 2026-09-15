import { config } from '../config/env.js'
import { sql } from '../db/sql.js'
import { badRequest, tooMany, unauthorized } from '../lib/errors.js'
import { fakeVerify, hashPassword, id as newId, issueToken, numericOtp, verifyPassword } from '../lib/crypto.js'
import { revokeSessions, revokeUserSessions } from '../lib/sessions.js'
import { privateCache } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { ROLES } from '../domain/roles.js'

/*
 * Authentication. Three properties are deliberate:
 *
 * - Login answers identically whether the email exists or the password is
 *   wrong, and spends the same CPU either way, so neither the message nor the
 *   response time reveals whether an account exists.
 * - Failures are counted per email *and* per source address in the database, so
 *   the lock survives restarts and cannot be sidestepped by hitting a different
 *   instance behind the load balancer.
 * - Changing a password revokes every other session for that account.
 */

const publicUser = (row) => ({
  id: row.id,
  name: row.name,
  email: row.email,
  phone: row.phone,
  role: row.role,
  tenantId: row.tenant_id || row.tenantId || null,
  createdAt: row.created_at || row.createdAt,
})

async function lockRemainingMs(keys) {
  const rows = await sql`
    select max(locked_until) as locked_until from login_attempts
    where identifier = any(${keys}) and locked_until > now()
  `
  const until = rows[0]?.locked_until
  return until ? new Date(until).getTime() - Date.now() : 0
}

async function recordFailure(keys) {
  // A window that has gone quiet resets; otherwise the counter climbs and trips
  // the lock. One statement per key keeps this atomic under concurrency.
  for (const identifier of keys) {
    await sql`
      insert into login_attempts (identifier, attempts, first_at)
      values (${identifier}, 1, now())
      on conflict (identifier) do update set
        attempts = case
          when login_attempts.first_at < now() - ${`${config.auth.lockMs} milliseconds`}::interval then 1
          else login_attempts.attempts + 1
        end,
        first_at = case
          when login_attempts.first_at < now() - ${`${config.auth.lockMs} milliseconds`}::interval then now()
          else login_attempts.first_at
        end,
        locked_until = case
          when login_attempts.attempts + 1 >= ${config.auth.maxLoginAttempts}
            then now() + ${`${config.auth.lockMs} milliseconds`}::interval
          else null
        end
    `
  }
}

async function clearFailures(keys) {
  await sql`delete from login_attempts where identifier = any(${keys})`
}

async function startSession(user, request) {
  const sessionId = newId('ses')
  const expiresAt = Date.now() + config.auth.sessionTtlMs

  await sql`
    insert into sessions (id, user_id, expires_at, ip, user_agent)
    values (${sessionId}, ${user.id}, ${new Date(expiresAt)},
            ${request.ip || null}, ${clean.text(request.headers['user-agent'], 200) || null})
  `

  return {
    token: issueToken({
      userId: user.id,
      role: user.role,
      tenantId: user.tenant_id,
      sessionId,
      expiresAt,
    }),
    expiresAt,
    user: publicUser(user),
  }
}

/*
 * Per-route budget for the credential endpoints. It sits far below the global
 * one because these are the endpoints worth guessing against, and it is read
 * from configuration so a test harness can raise it without the production
 * default moving.
 */
const credentialLimit = (divisor = 1) => ({
  rateLimit: {
    max: Math.max(1, Math.floor(config.rateLimit.authMax / divisor)),
    timeWindow: config.rateLimit.authWindowMs,
  },
})

export default async function authRoutes(app) {
  /* ------------------------------------------------------------------ login */
  app.post('/auth/login', {
    config: credentialLimit(),
    schema: {
      body: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', maxLength: 160 },
          password: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const email = clean.text(request.body.email, 160).toLowerCase()
    const password = String(request.body.password ?? '')
    if (!clean.isEmail(email) || !password) throw badRequest('Enter a valid email and password.')

    const keys = [`email:${email}`, `ip:${request.ip}`]
    const locked = await lockRemainingMs(keys)
    if (locked > 0) {
      throw tooMany(`Too many attempts. Try again in ${Math.ceil(locked / 60000)} minute(s).`)
    }

    const [user] = await sql`
      select id, name, email, phone, role, tenant_id, password_hash, created_at
      from users where lower(email) = ${email} limit 1
    `

    // No short-circuit: a missing user still pays for a hash comparison.
    const ok = user ? await verifyPassword(password, user.password_hash) : await fakeVerify()
    if (!ok) {
      await recordFailure(keys)
      throw unauthorized('Email or password is incorrect.')
    }

    await clearFailures(keys)
    privateCache(reply)
    return startSession(user, request)
  })

  /* --------------------------------------------------------------- register */
  app.post('/auth/register', {
    config: credentialLimit(2),
    schema: {
      body: {
        type: 'object',
        required: ['name', 'email', 'password'],
        properties: {
          name: { type: 'string', maxLength: 80 },
          email: { type: 'string', maxLength: 160 },
          password: { type: 'string', maxLength: 200 },
          phone: { type: 'string', maxLength: 20 },
          tenantId: { type: 'string', maxLength: 60 },
        },
      },
    },
  }, async (request, reply) => {
    const name = clean.text(request.body.name, 80)
    const email = clean.text(request.body.email, 160).toLowerCase()
    const phone = clean.text(request.body.phone, 20)
    const password = String(request.body.password ?? '')

    if (!name) throw badRequest('Please tell us your name.')
    if (!clean.isEmail(email)) throw badRequest('That email address looks incorrect.')
    if (phone && !clean.isPhone(phone)) throw badRequest('That phone number looks incorrect.')
    const issues = clean.passwordIssues(password)
    if (issues.length) throw badRequest(`Password needs ${issues.join(', ')}.`)

    const tenantId = clean.text(request.body.tenantId, 60) || null
    // A self-registration is always a customer. Staff are created by the store.
    const [created] = await sql`
      insert into users (id, name, email, phone, password_hash, role, tenant_id)
      values (${newId('usr')}, ${name}, ${email}, ${phone},
              ${await hashPassword(password)}, ${ROLES.CUSTOMER},
              ${tenantId ? sql`(select id from stores where id = ${tenantId})` : null})
      on conflict (email) do nothing
      returning id, name, email, phone, role, tenant_id, created_at
    `
    if (!created) throw badRequest('An account with this email already exists.')

    privateCache(reply)
    reply.code(201)
    return startSession(created, request)
  })

  /* -------------------------------------------------------------------- otp */
  app.post('/auth/otp/request', {
    config: credentialLimit(2),
  }, async (request) => {
    const phone = clean.text(request.body?.phone, 20)
    const email = clean.text(request.body?.email, 160).toLowerCase()
    if (!phone && !email) throw badRequest('Enter a phone number or email.')
    if (phone && !clean.isPhone(phone)) throw badRequest('That phone number looks incorrect.')
    if (email && !clean.isEmail(email)) throw badRequest('That email address looks incorrect.')

    const code = config.isProd ? numericOtp() : '123456'
    // Delivery belongs to an SMS/email provider. Until one is wired up the code
    // is logged server-side and never returned in the response body.
    request.log.info({ to: phone || email, code }, 'otp issued')
    return { sent: true, to: phone || email, expiresIn: 300 }
  })

  app.post('/auth/otp/verify', {
    config: credentialLimit(),
  }, async (request, reply) => {
    const phone = clean.text(request.body?.phone, 20)
    const email = clean.text(request.body?.email, 160).toLowerCase()
    const otp = String(request.body?.otp ?? '')
    if (!/^\d{6}$/.test(otp)) throw badRequest('Enter the 6-digit code.')

    if (config.isProd) {
      // Verification requires the provider integration; refuse rather than
      // accept a fixed code in production.
      throw badRequest('OTP sign-in is not available yet. Please use your password.')
    }
    if (otp !== '123456') throw badRequest('That code is incorrect or has expired.')

    const [existing] = await sql`
      select id, name, email, phone, role, tenant_id, password_hash, created_at from users
      where (${phone ? sql`phone = ${phone}` : sql`false`})
         or (${email ? sql`lower(email) = ${email}` : sql`false`})
      limit 1
    `

    let user = existing
    if (!user) {
      const placeholder = email || `${phone.replace(/\D/g, '')}@otp.local`
      const [created] = await sql`
        insert into users (id, name, email, phone, password_hash, role, tenant_id)
        values (${newId('usr')}, 'Guest', ${placeholder}, ${phone},
                ${await hashPassword(newId('tmp'))}, ${ROLES.CUSTOMER}, null)
        returning id, name, email, phone, role, tenant_id, created_at
      `
      user = created
    }

    privateCache(reply)
    return startSession(user, request)
  })

  /* ----------------------------------------------------------------- forgot */
  app.post('/auth/forgot', {
    config: credentialLimit(2),
  }, async (request) => {
    const email = clean.text(request.body?.email, 160)
    if (!clean.isEmail(email)) throw badRequest('That email address looks incorrect.')
    // Identical answer whether or not the account exists.
    request.log.info({ email }, 'password reset requested')
    return { sent: true }
  })

  /* ----------------------------------------------------------------- logout */
  app.post('/auth/logout', async (request, reply) => {
    const auth = request.auth
    if (auth) {
      await revokeSessions([{ sid: auth.sessionId, exp: auth.expiresAt }])
      await sql`delete from sessions where id = ${auth.sessionId}`
    }
    privateCache(reply)
    return { ok: true }
  })

  /* --------------------------------------------------------------------- me */
  app.get('/auth/me', async (request, reply) => {
    const auth = app.requireUser(request)
    const [user] = await sql`
      select id, name, email, phone, role, tenant_id, created_at
      from users where id = ${auth.userId} limit 1
    `
    if (!user) throw unauthorized()
    privateCache(reply)
    return publicUser(user)
  })

  app.patch('/auth/me', {
    schema: {
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', maxLength: 80 },
          phone: { type: 'string', maxLength: 20 },
        },
      },
    },
  }, async (request, reply) => {
    const auth = app.requireUser(request)
    const body = request.body || {}
    const name = body.name === undefined ? null : clean.text(body.name, 80)
    const phone = body.phone === undefined ? null : clean.text(body.phone, 20)
    if (phone && !clean.isPhone(phone)) throw badRequest('That phone number looks incorrect.')

    const [user] = await sql`
      update users set
        name = coalesce(${name || null}, name),
        phone = coalesce(${phone}, phone),
        updated_at = now()
      where id = ${auth.userId}
      returning id, name, email, phone, role, tenant_id, created_at
    `
    if (!user) throw unauthorized()
    privateCache(reply)
    return publicUser(user)
  })

  /* --------------------------------------------------------- password change */
  app.post('/auth/password', {
    config: credentialLimit(2),
    schema: {
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword'],
        properties: {
          currentPassword: { type: 'string', maxLength: 200 },
          newPassword: { type: 'string', maxLength: 200 },
        },
      },
    },
  }, async (request, reply) => {
    const auth = app.requireUser(request)
    const [user] = await sql`select id, password_hash from users where id = ${auth.userId} limit 1`
    if (!user) throw unauthorized()

    if (!(await verifyPassword(request.body.currentPassword, user.password_hash))) {
      throw badRequest('Your current password is incorrect.')
    }
    const issues = clean.passwordIssues(request.body.newPassword)
    if (issues.length) throw badRequest(`Password needs ${issues.join(', ')}.`)

    await sql`
      update users set password_hash = ${await hashPassword(request.body.newPassword)}, updated_at = now()
      where id = ${auth.userId}
    `
    // The session doing the change survives; every other one is cut.
    await revokeUserSessions(auth.userId, { except: auth.sessionId })

    privateCache(reply)
    return { ok: true }
  })
}
