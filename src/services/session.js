import { STORAGE_KEYS } from '../config/env.js'

/**
 * Credentials live in sessionStorage so a stolen device or a leftover tab
 * cannot replay them after the browser session ends. The cart and wishlist
 * stay in localStorage because they hold no identity.
 */
const AUTH_EXPIRED_EVENT = 'vk:auth-expired'

function read(key) {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function getSession() {
  const session = read(STORAGE_KEYS.token)
  if (!session?.token) return null
  if (session.expiresAt && Date.now() > session.expiresAt) {
    clearSession()
    return null
  }
  return session
}

export function getToken() {
  return getSession()?.token || null
}

export function getStoredUser() {
  return getSession() ? read(STORAGE_KEYS.user) : null
}

export function setSession({ token, expiresAt, user }) {
  sessionStorage.setItem(STORAGE_KEYS.token, JSON.stringify({ token, expiresAt }))
  sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
}

export function updateStoredUser(user) {
  if (getSession()) sessionStorage.setItem(STORAGE_KEYS.user, JSON.stringify(user))
}

export function clearSession() {
  sessionStorage.removeItem(STORAGE_KEYS.token)
  sessionStorage.removeItem(STORAGE_KEYS.user)
}

export function notifyAuthExpired() {
  clearSession()
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
}

export function onAuthExpired(handler) {
  window.addEventListener(AUTH_EXPIRED_EVENT, handler)
  return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler)
}
