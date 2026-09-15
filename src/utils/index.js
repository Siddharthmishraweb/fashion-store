import { env } from '../config/env.js'

export function formatCurrency(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0)
}

export function formatPercent(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`
}

export function discountPercent(price, mrp) {
  if (!mrp || mrp <= price) return 0
  return Math.round(((mrp - price) / mrp) * 100)
}

export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export function cx(...parts) {
  return parts.filter(Boolean).join(' ')
}

export function debounce(fn, wait = 280) {
  let timer
  const wrapped = (...args) => {
    clearTimeout(timer)
    timer = setTimeout(() => fn(...args), wait)
  }
  wrapped.cancel = () => clearTimeout(timer)
  return wrapped
}

export function uid(prefix = 'id') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

export function readStorage(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeStorage(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

function isPlatformHost(host) {
  return (
    !host ||
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.endsWith('.local') ||
    host.endsWith('.github.io') ||
    host.includes(env.platformDomain)
  )
}

export function getHostTenantHint() {
  const host = window.location.hostname
  return isPlatformHost(host) ? null : host
}

export function resolveTenantKey({ pathname, hostname }) {
  const relative = env.basePath && pathname.startsWith(env.basePath)
    ? pathname.slice(env.basePath.length) || '/'
    : pathname
  const match = relative.match(/^\/store\/([^/]+)/)
  if (match) return { type: 'slug', value: match[1] }
  if (!isPlatformHost(hostname)) return { type: 'domain', value: hostname }
  return { type: 'platform' }
}

export function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n))
}

export function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return `${days}d ago`
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

export function formatDate(value, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('en-IN', options).format(date)
}

export function withinDateRange(startDate, endDate, at = new Date()) {
  const now = at instanceof Date ? at.getTime() : new Date(at).getTime()
  if (startDate) {
    const start = new Date(startDate).getTime()
    if (!Number.isNaN(start) && now < start) return false
  }
  if (endDate) {
    const end = new Date(endDate).getTime()
    if (!Number.isNaN(end) && now > end + 86399999) return false
  }
  return true
}

export function toCsv(rows, columns) {
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const header = columns.map((c) => escape(c.label)).join(',')
  const body = rows.map((row) => columns.map((c) => escape(typeof c.value === 'function' ? c.value(row) : row[c.key])).join(','))
  return [header, ...body].join('\n')
}

export function downloadFile(filename, content, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
