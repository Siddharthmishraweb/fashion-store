import postgres from 'postgres'
import { config } from '../config/env.js'

const serverless = Boolean(process.env.VERCEL)
const needsSsl = /sslmode=require/i.test(config.db.url) || serverless

/*
 * A single pooled client for the process. postgres.js keeps prepared statements
 * per connection and pipelines queries on the same connection, which is where
 * most of the per-request latency saving comes from.
 */
export const sql = postgres(config.db.url, {
  max: serverless ? 1 : config.db.poolMax,
  idle_timeout: config.db.idleTimeout,
  connect_timeout: config.db.connectTimeout,
  // Neon/PgBouncer transaction pooling cannot reuse named prepared statements.
  prepare: !serverless && !/-pooler/i.test(config.db.url),
  ssl: needsSsl ? 'require' : false,
  // bigint columns (count(*), sums) arrive as JS numbers rather than strings.
  types: {
    bigint: {
      to: 20,
      from: [20],
      serialize: (value) => String(value),
      parse: (value) => Number(value),
    },
  },
  transform: { undefined: null },
  connection: {
    application_name: 'vastrika-api',
    client_encoding: 'UTF8',
    statement_timeout: '15000',
    idle_in_transaction_session_timeout: '10000',
  },
  onnotice: () => {},
})

/** Joins SQL fragments with AND, or returns TRUE when there is nothing to filter. */
export function and(fragments) {
  const parts = fragments.filter(Boolean)
  if (!parts.length) return sql`true`
  return parts.reduce((left, right) => sql`${left} and ${right}`)
}

export async function withTransaction(handler) {
  return sql.begin(handler)
}

export async function pingDatabase() {
  const [row] = await sql`select 1 as ok`
  return row?.ok === 1
}

export async function closeDatabase() {
  await sql.end({ timeout: 5 })
}
