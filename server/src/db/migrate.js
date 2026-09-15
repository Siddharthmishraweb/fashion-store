import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closeDatabase, sql } from './sql.js'

const here = dirname(fileURLToPath(import.meta.url))

const TABLES = [
  'daily_stats',
  'platform_content',
  'newsletter_subscribers',
  'waitlist',
  'notifications',
  'questions',
  'reviews',
  'coupons',
  'orders',
  'customers',
  'banners',
  'products',
  'collections',
  'categories',
  'login_attempts',
  'revoked_sessions',
  'sessions',
  'users',
  'stores',
]

async function drop() {
  // Dependency order matters less with CASCADE, but the explicit list keeps the
  // command from touching anything that is not ours.
  for (const table of TABLES) {
    await sql`drop table if exists ${sql(table)} cascade`
  }
  await sql`drop sequence if exists order_number_seq`
  console.log(`dropped ${TABLES.length} tables`)
}

async function main() {
  const shouldDrop = process.argv.includes('--drop')
  if (shouldDrop) await drop()

  const schema = await readFile(join(here, 'schema.sql'), 'utf8')
  await sql.unsafe(schema)
  console.log('schema applied')

  const [{ count }] = await sql`
    select count(*)::int as count from information_schema.tables
    where table_schema = 'public'
  `
  console.log(`public schema now has ${count} tables`)
}

main()
  .catch((error) => {
    console.error('migration failed:', error.message)
    process.exitCode = 1
  })
  .finally(() => closeDatabase())
