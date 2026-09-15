/*
 * Boots a throwaway PostgreSQL instance, migrates, seeds, starts the API, runs
 * the integration suite against it, and tears everything down.
 *
 *   npm run verify:full
 *
 * This exists so the SQL can be exercised on a machine with no Postgres and no
 * Docker installed. It is a development convenience only; a real deployment
 * points DATABASE_URL at a managed instance.
 */

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import EmbeddedPostgres from 'embedded-postgres'

/** Asks the OS for a free port so a long-running `npm run db` cannot collide. */
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address()
      probe.close(() => resolve(port))
    })
  })
}

const PORT = Number(process.env.EMBEDDED_PG_PORT) || (await freePort())
const API_PORT = Number(process.env.EMBEDDED_API_PORT) || (await freePort())
const DATABASE_URL = `postgres://postgres:postgres@localhost:${PORT}/postgres`

const dataDir = await mkdtemp(join(tmpdir(), 'vastrika-pg-'))
let postgres
let api

function step(message) {
  console.log(`\n=== ${message}`)
}

/** Runs a node script with the throwaway database wired in. */
function runScript(scriptPath, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: 'inherit',
      env: {
        ...process.env,
        DATABASE_URL,
        AUTH_SECRET: 'embedded-verification-secret-long-enough-for-production-check',
        NODE_ENV: 'development',
        LOG_LEVEL: 'warn',
        PORT: String(API_PORT),
        ...extraEnv,
      },
    })
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${scriptPath} exited with ${code}`))))
    child.on('error', reject)
  })
}

async function waitForApi(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://localhost:${API_PORT}/health/ready`)
      if (response.ok) return
    } catch {
      /* not up yet */
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('the API did not become ready in time')
}

async function cleanup() {
  if (api && !api.killed) api.kill()
  if (postgres) await postgres.stop().catch(() => {})
  await rm(dataDir, { recursive: true, force: true }).catch(() => {})
}

process.on('SIGINT', async () => {
  await cleanup()
  process.exit(130)
})

try {
  step(`Starting PostgreSQL on port ${PORT}`)
  postgres = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: 'postgres',
    port: PORT,
    persistent: false,
    // initdb otherwise picks up the host locale, which on Windows means a
    // WIN1252 cluster that cannot store the rupee sign or any other non-Latin1
    // character the catalog uses.
    initdbFlags: ['--encoding=UTF8', '--locale=C'],
    onLog: () => {},
  })
  await postgres.initialise()
  await postgres.start()
  console.log('postgres ready')

  step('Applying schema')
  await runScript('src/db/migrate.js')

  step('Seeding demo data')
  await runScript('src/db/seed.js')

  step(`Starting the API on port ${API_PORT}`)
  api = spawn(process.execPath, ['src/index.js'], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: {
      ...process.env,
      DATABASE_URL,
      AUTH_SECRET: 'embedded-verification-secret-long-enough-for-production-check',
      NODE_ENV: 'development',
      LOG_LEVEL: 'warn',
      PORT: String(API_PORT),
      CORS_ORIGINS: 'http://localhost:5173,http://localhost:5174',
      // The suite signs in several accounts and drives everything from one
      // address, so the production credential budget would throttle it.
      AUTH_RATE_LIMIT_MAX: '1000',
    },
  })
  await waitForApi()
  console.log('api ready')

  step('Running the integration suite')
  await runScript('bench/smoke.mjs', { BASE_URL: `http://localhost:${API_PORT}` })

  step('Done')
  await cleanup()
  process.exit(0)
} catch (error) {
  // embedded-postgres rejects with a plain string on some failures.
  console.error(`\nverification failed: ${error?.message || error || 'unknown error'}`)
  await cleanup()
  process.exit(1)
}
