import { vault } from './vault.js'

function readFlag(value, fallback) {
  if (value === undefined || value === '') return Boolean(fallback)
  return /^(true|1|yes)$/i.test(String(value).trim())
}

/** Vite base, without a trailing slash (`''` locally, `'/fashion-store'` on Pages). */
const basePath = String(import.meta.env.BASE_URL || '/').replace(/\/$/, '')

export const env = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  useMock: readFlag(import.meta.env.VITE_USE_MOCK, vault.USE_MOCK),
  appName: import.meta.env.VITE_APP_NAME || 'Vastrika',
  appTagline: 'The house of houses',
  platformDomain: import.meta.env.VITE_PLATFORM_DOMAIN || 'vastrika',
  supportEmail: 'care@vastrika.market',
  currency: 'INR',
  locale: 'en-IN',
  requestTimeoutMs: 15000,
  sessionTtlMs: 8 * 60 * 60 * 1000,
  /** Router basename. Empty string means the app is served from `/`. */
  basePath,
  /** Always ends with a slash; use for `window.location` jumps. */
  homePath: `${basePath}/`,
  cloudinaryCloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || '',
  cloudinaryUploadPreset: import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || '',
}

/** Absolute URL for the running app, including the GitHub Pages project path. */
export function publicUrl(path = '/') {
  const suffix = path.startsWith('/') ? path : `/${path}`
  const origin = typeof window === 'undefined' ? '' : window.location.origin
  return `${origin}${env.basePath}${suffix}`
}

/** Slug used by the standalone /login and /admin entry points. */
export const DEFAULT_STORE_SLUG = 'atelier-noor'

export const STORAGE_KEYS = {
  token: 'vk.token',
  user: 'vk.user',
  cart: 'vk.cart',
  wishlist: 'vk.wishlist',
  recentSearch: 'vk.recentSearch',
  recentlyViewed: 'vk.recentlyViewed',
  locale: 'vk.locale',
  draftPrefix: 'vk.draft.',
  themeVersions: 'vk.themeVersions',
  compare: 'vk.compare',
}
