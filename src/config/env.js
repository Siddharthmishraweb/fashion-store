export const env = {
  apiUrl: import.meta.env.VITE_API_URL || '',
  useMock: import.meta.env.VITE_USE_MOCK !== 'false',
  appName: import.meta.env.VITE_APP_NAME || 'Vastrika',
  appTagline: 'The house of houses',
  platformDomain: import.meta.env.VITE_PLATFORM_DOMAIN || 'vastrika',
  supportEmail: 'care@vastrika.market',
  currency: 'INR',
  locale: 'en-IN',
  requestTimeoutMs: 15000,
  sessionTtlMs: 8 * 60 * 60 * 1000,
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
