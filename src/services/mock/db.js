import { createSeed } from './seed.js'

const KEY = 'vk.mock.db.v1'

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    /* ignore */
  }
  const seed = createSeed()
  persist(seed)
  return seed
}

function persist(db) {
  localStorage.setItem(KEY, JSON.stringify(db))
}

let db = load()

export function getDb() {
  return db
}

export function mutate(recipe) {
  recipe(db)
  persist(db)
  return db
}

export function resetDb() {
  db = createSeed()
  persist(db)
  return db
}

export function delay(ms = 180) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
