import { performance } from 'node:perf_hooks'
import { sql } from '../db/sql.js'
import { cacheStats } from '../lib/cache.js'
import { encodedBodyStats } from '../lib/reply.js'
import { sessionStats } from '../lib/sessions.js'
import { config } from '../config/env.js'

/*
 * Two probes, because orchestrators need to tell them apart:
 *
 * - /health is a liveness check. It must not touch the database, so a brief
 *   database blip does not cause the container to be killed and restarted.
 * - /health/ready is a readiness check. It does query, because an instance that
 *   cannot reach Postgres should be taken out of the load balancer.
 */

const startedAt = Date.now()

export default async function healthRoutes(app) {
  app.get('/health', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    return { ok: true, service: 'vastrika-api', version: 1, uptimeSeconds: Math.round((Date.now() - startedAt) / 1000) }
  })

  app.get('/health/ready', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const began = performance.now()
    try {
      await sql`select 1`
    } catch (error) {
      request.log.error({ err: error }, 'readiness probe failed')
      return reply.code(503).send({ ok: false, database: 'unreachable' })
    }
    return {
      ok: true,
      database: 'ready',
      databaseLatencyMs: Number((performance.now() - began).toFixed(2)),
    }
  })

  /* Operational metrics. Exposed only to the platform operator. */
  app.get('/health/metrics', async (request, reply) => {
    app.requireSuperAdmin(request)
    reply.header('Cache-Control', 'no-store')

    const memory = process.memoryUsage()
    return {
      env: config.env,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      cache: cacheStats(),
      encodedBodies: encodedBodyStats(),
      sessions: sessionStats(),
      memory: {
        rssMb: Math.round(memory.rss / 1048576),
        heapUsedMb: Math.round(memory.heapUsed / 1048576),
      },
      pool: { max: config.db.poolMax },
    }
  })
}
