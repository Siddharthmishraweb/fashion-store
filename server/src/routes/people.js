import { sql } from '../db/sql.js'
import { badRequest, forbidden, notFound } from '../lib/errors.js'
import { hashPassword, id as newId } from '../lib/crypto.js'
import { revokeUserSessions } from '../lib/sessions.js'
import { pageOf, privateCache, readPaging, sendRaw } from '../lib/reply.js'
import * as clean from '../lib/sanitize.js'
import { ASSIGNABLE_ROLES, ROLES, STAFF_ROLES } from '../domain/roles.js'

/* Customers, store staff, and the platform-wide user directory. */

const customerPayload = sql`
  jsonb_build_object(
    'id', id, 'tenantId', tenant_id, 'name', name, 'email', email, 'phone', phone,
    'lifetimeValue', lifetime_value, 'ordersCount', orders_count,
    'addresses', addresses, 'createdAt', created_at
  )::text as payload
`

export default async function peopleRoutes(app) {
  /* ---------------------------------------------------------- customers */
  app.get('/customers', async (request, reply) => {
    const { tenantId } = app.requireTenant(request, 'store.customers', clean.text(request.query.tenantId, 60))
    const { page, limit, offset } = readPaging(request.query)
    const q = clean.text(request.query.q, 60)

    const rows = await sql`
      select ${customerPayload}, count(*) over() as total
      from customers
      where tenant_id = ${tenantId}
        ${q ? sql`and (name ilike ${`%${q}%`} or email ilike ${`%${q}%`})` : sql``}
      order by created_at desc
      limit ${limit} offset ${offset}
    `

    privateCache(reply)
    return sendRaw(reply, pageOf(rows, { page, limit }))
  })

  app.get('/customers/:id', async (request, reply) => {
    const [customer] = await sql`
      select id, tenant_id, ${customerPayload} from customers where id = ${request.params.id} limit 1
    `
    if (!customer) throw notFound()
    app.requireTenant(request, 'store.customers', customer.tenant_id)

    const [orders] = await sql`
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', id, 'number', number, 'status', status, 'paymentStatus', payment_status,
        'totals', totals, 'items', items, 'createdAt', created_at
      ) order by created_at desc), '[]')::text as payload
      from orders where customer_id = ${request.params.id}
    `

    privateCache(reply)
    // Splice the order history into the customer document without re-encoding.
    return sendRaw(reply, `${customer.payload.slice(0, -1)},"orders":${orders.payload}}`)
  })

  /* -------------------------------------------------------------- staff */
  app.get('/staff', async (request, reply) => {
    const { tenantId } = app.requireTenant(request, 'store.users', clean.text(request.query.tenantId, 60))

    privateCache(reply)
    return sql`
      select id, name, email, phone, role, tenant_id as "tenantId", created_at as "createdAt"
      from users
      where tenant_id = ${tenantId} and role = any(${STAFF_ROLES}::text[])
      order by case role when 'store_owner' then 0 else 1 end, name
    `
  })

  app.post('/staff', async (request, reply) => {
    const body = request.body || {}
    const { tenantId } = app.requireTenant(request, 'store.users', clean.text(body.tenantId, 60))

    const name = clean.text(body.name, 80)
    const email = clean.text(body.email, 160).toLowerCase()
    const role = clean.text(body.role, 40)
    if (!name) throw badRequest('Enter the team member’s name.')
    if (!clean.isEmail(email)) throw badRequest('That email address looks incorrect.')
    if (!ASSIGNABLE_ROLES.includes(role)) throw badRequest('Choose one of the available staff roles.')

    const password = String(body.password ?? '')
    const issues = clean.passwordIssues(password)
    if (issues.length) throw badRequest(`Password needs ${issues.join(', ')}.`)

    const [created] = await sql`
      insert into users (id, name, email, phone, password_hash, role, tenant_id)
      values (${newId('usr')}, ${name}, ${email}, ${clean.text(body.phone, 20)},
              ${await hashPassword(password)}, ${role}, ${tenantId})
      on conflict (email) do nothing
      returning id, name, email, phone, role, tenant_id as "tenantId", created_at as "createdAt"
    `
    if (!created) throw badRequest('An account with this email already exists.')

    privateCache(reply)
    reply.code(201)
    return created
  })

  app.patch('/staff/:id', async (request, reply) => {
    const body = request.body || {}
    const [target] = await sql`select id, tenant_id, role from users where id = ${request.params.id} limit 1`
    if (!target) throw notFound()
    app.requireTenant(request, 'store.users', target.tenant_id)

    // Owner and platform accounts are out of reach of a store's own team page,
    // otherwise a store admin could demote the owner and take over the tenant.
    if (target.role === ROLES.STORE_OWNER || target.role === ROLES.SUPER_ADMIN) {
      throw forbidden('Owner accounts can only be changed by the platform operator.')
    }
    const role = clean.text(body.role, 40)
    if (!ASSIGNABLE_ROLES.includes(role)) throw badRequest('Choose one of the available staff roles.')

    const [updated] = await sql`
      update users set role = ${role}, updated_at = now()
      where id = ${request.params.id}
      returning id, name, email, phone, role, tenant_id as "tenantId", created_at as "createdAt"
    `
    // The new role is baked into issued tokens, so those have to go.
    await revokeUserSessions(request.params.id)

    privateCache(reply)
    return updated
  })

  app.delete('/staff/:id', async (request) => {
    const [target] = await sql`select id, tenant_id, role from users where id = ${request.params.id} limit 1`
    if (!target) throw notFound()
    app.requireTenant(request, 'store.users', target.tenant_id)
    if (target.role === ROLES.STORE_OWNER || target.role === ROLES.SUPER_ADMIN) {
      throw forbidden('Owner accounts can only be changed by the platform operator.')
    }

    await revokeUserSessions(request.params.id)
    await sql`delete from users where id = ${request.params.id}`
    return { ok: true }
  })

  /* ------------------------------------------------- platform directory */
  app.get('/users', async (request, reply) => {
    app.requireSuperAdmin(request)
    const { page, limit, offset } = readPaging(request.query)
    const role = clean.text(request.query.role, 40)
    const q = clean.text(request.query.q, 60)

    const rows = await sql`
      select
        jsonb_build_object(
          'id', u.id, 'name', u.name, 'email', u.email, 'phone', u.phone, 'role', u.role,
          'tenantId', u.tenant_id, 'storeName', coalesce(s.name, '—'), 'createdAt', u.created_at
        )::text as payload,
        count(*) over() as total
      from users u
      left join stores s on s.id = u.tenant_id
      where (${role === 'staff'
        ? sql`u.role <> 'customer'`
        : role
          ? sql`u.role = ${role}`
          : sql`true`})
        and (${q ? sql`(u.name ilike ${`%${q}%`} or u.email ilike ${`%${q}%`})` : sql`true`})
      order by u.created_at desc
      limit ${limit} offset ${offset}
    `

    privateCache(reply)
    return sendRaw(reply, pageOf(rows, { page, limit }))
  })
}
