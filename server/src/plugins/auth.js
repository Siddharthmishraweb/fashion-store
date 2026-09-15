import fp from 'fastify-plugin'
import { readToken } from '../lib/crypto.js'
import { isRevoked } from '../lib/sessions.js'
import { forbidden, unauthorized } from '../lib/errors.js'
import { hasPermission, ROLES } from '../domain/roles.js'

/*
 * Authentication runs on every request but touches neither the database nor the
 * cache: the bearer token is verified with one HMAC and the claims inside it
 * (user id, role, tenant) are all authorization needs. The only shared state is
 * the in-memory revocation set, so a signed-out token stops working immediately
 * across every instance.
 */

async function authPlugin(app) {
  app.decorateRequest('auth', null)

  app.addHook('onRequest', async (request) => {
    const header = request.headers.authorization
    if (!header || !header.startsWith('Bearer ')) return

    const claims = readToken(header.slice(7))
    if (!claims || isRevoked(claims.sid)) return

    request.auth = {
      sessionId: claims.sid,
      userId: claims.uid,
      role: claims.rol,
      tenantId: claims.tid || null,
      expiresAt: claims.exp,
      isSuper: claims.rol === ROLES.SUPER_ADMIN,
      isCustomer: claims.rol === ROLES.CUSTOMER,
    }
  })

  /** Any signed-in user. */
  app.decorate('requireUser', function requireUser(request) {
    if (!request.auth) throw unauthorized()
    return request.auth
  })

  app.decorate('requireSuperAdmin', function requireSuperAdmin(request) {
    const auth = this.requireUser(request)
    if (!auth.isSuper) throw forbidden('Only the platform operator can perform this action.')
    return auth
  })

  /**
   * Resolves which tenant a staff request may act on.
   *
   * A platform operator may target any tenant and must name one explicitly.
   * Everyone else is pinned to their own tenant: asking for a different one is a
   * 403 rather than a silent redirect to their own data, so a probe cannot be
   * mistaken for a successful read.
   */
  app.decorate('requireStaff', function requireStaff(request, permission, requestedTenantId) {
    const auth = this.requireUser(request)

    if (auth.isSuper) {
      return { auth, tenantId: requestedTenantId || null }
    }
    if (!hasPermission(auth.role, permission)) throw forbidden()
    if (!auth.tenantId) throw forbidden()
    if (requestedTenantId && requestedTenantId !== auth.tenantId) {
      throw forbidden('That storefront is not yours.')
    }
    return { auth, tenantId: auth.tenantId }
  })

  /** Same as requireStaff but insists on a concrete tenant id. */
  app.decorate('requireTenant', function requireTenant(request, permission, requestedTenantId) {
    const result = this.requireStaff(request, permission, requestedTenantId)
    if (!result.tenantId) throw forbidden('Choose a storefront first.')
    return result
  })

  /** True when the caller may read a record belonging to `tenantId`. */
  app.decorate('ownsTenant', function ownsTenant(request, tenantId) {
    const auth = request.auth
    if (!auth) return false
    return auth.isSuper || (Boolean(tenantId) && auth.tenantId === tenantId)
  })
}

export default fp(authPlugin, { name: 'auth' })
