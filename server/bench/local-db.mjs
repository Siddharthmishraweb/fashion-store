/*
 * Starts a long-lived local PostgreSQL instance for development on a machine
 * with neither Postgres nor Docker installed:
 *
 *   npm run db            # keep this running
 *   npm run migrate && npm run seed && npm run dev
 *
 * The data directory lives in server/.localdb and survives restarts. Ctrl-C
 * shuts the cluster down cleanly.
 */

import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

const PORT = Number(process.env.EMBEDDED_PG_PORT || 54329)
const dataDir = resolve('.localdb')

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'postgres',
  port: PORT,
  persistent: true,
  // initdb otherwise inherits the host locale, which on Windows yields a
  // WIN1252 cluster that cannot store the rupee sign.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
  onLog: () => {},
})

if (!existsSync(dataDir)) {
  console.log(`initialising a cluster in ${dataDir}`)
  await postgres.initialise()
}

await postgres.start()
console.log(`postgres listening on port ${PORT}`)
console.log(`DATABASE_URL=postgres://postgres:postgres@localhost:${PORT}/postgres`)

let stopping = false
const shutdown = async () => {
  if (stopping) return
  stopping = true
  await postgres.stop().catch(() => {})
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
setInterval(() => {}, 1 << 30)
