import { buildApp } from './app.js'
import { config } from './config/env.js'
import { closeDatabase, pingDatabase } from './db/sql.js'
import { startCacheSubscriber, stopCacheSubscriber } from './lib/cache.js'
import { startSessionGuard, stopSessionGuard } from './lib/sessions.js'

const app = await buildApp()

try {
  // Fail fast: an instance that cannot reach Postgres should never start
  // accepting traffic and reporting healthy.
  await pingDatabase()
  await startSessionGuard(app.log)
  await startCacheSubscriber(app.log)

  await app.listen({ port: config.port, host: config.host })
  // Longer than the proxy idle timeout so a keep-alive connection is closed by
  // the proxy first, never mid-response by this process.
  app.server.keepAliveTimeout = 65_000
  app.server.headersTimeout = 66_000
  app.log.info(
    { env: config.env, pool: config.db.poolMax, cacheTtlMs: config.cache.ttlMs },
    'vastrika-api listening',
  )
} catch (error) {
  app.log.error({ err: error }, 'failed to start')
  await closeDatabase().catch(() => {})
  process.exit(1)
}

/*
 * Graceful shutdown. Fastify stops accepting connections and finishes in-flight
 * requests; only then are the NOTIFY subscriptions and the pool closed, so a
 * request that is mid-transaction is never cut off. A second signal, or a
 * ten-second overrun, forces the exit.
 */
let closing = false

async function shutdown(signal) {
  if (closing) {
    app.log.warn({ signal }, 'second signal received, exiting immediately')
    process.exit(1)
  }
  closing = true
  app.log.info({ signal }, 'shutting down')

  const force = setTimeout(() => {
    app.log.error('shutdown timed out, forcing exit')
    process.exit(1)
  }, 10_000)
  force.unref()

  try {
    await app.close()
    await stopCacheSubscriber()
    await stopSessionGuard()
    await closeDatabase()
    app.log.info('shutdown complete')
    process.exit(0)
  } catch (error) {
    app.log.error({ err: error }, 'error during shutdown')
    process.exit(1)
  }
}

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => shutdown(signal))
}

process.on('unhandledRejection', (reason) => {
  app.log.error({ err: reason }, 'unhandled rejection')
})
process.on('uncaughtException', (error) => {
  app.log.fatal({ err: error }, 'uncaught exception, exiting')
  process.exit(1)
})
