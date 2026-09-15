import { env } from '../../config/env.js'
import { getToken, notifyAuthExpired } from '../session.js'

/*
 * The in-browser mock is loaded on demand. A static import would pull the whole
 * fixture catalogue into the production bundle even when VITE_USE_MOCK=false,
 * so it lives behind a dynamic import that Vite splits into its own chunk.
 */
let mockLoader = null

function loadMock() {
  if (!mockLoader) mockLoader = import('../mock/handler.js')
  return mockLoader
}

export class ApiError extends Error {
  constructor(message, status, payload) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.payload = payload
  }
}

function authHeaders({ tenantId } = {}) {
  const token = getToken()
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(tenantId ? { 'X-Tenant-Id': tenantId } : {}),
  }
}

const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/otp', '/auth/forgot']

function handleFailure(path, status, data) {
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p))
  if (status === 401 && !isPublic) notifyAuthExpired()
  throw new ApiError(data?.message || 'Request failed', status, data)
}

export async function api(path, { method = 'GET', body, tenantId, signal } = {}) {
  const headers = authHeaders({ tenantId })

  if (env.useMock || !env.apiUrl) {
    const { mockRequest } = await loadMock()
    const result = await mockRequest(method, path, {
      body,
      headers,
      searchParams: new URLSearchParams(path.split('?')[1] || ''),
    })
    if (!result.ok) handleFailure(path, result.status, result.data)
    return result.data
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), env.requestTimeoutMs)
  if (signal) signal.addEventListener('abort', () => controller.abort(), { once: true })

  try {
    const res = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers,
      credentials: 'same-origin',
      referrerPolicy: 'strict-origin-when-cross-origin',
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) handleFailure(path, res.status, data)
    return data
  } catch (error) {
    if (error instanceof ApiError) throw error
    if (error.name === 'AbortError') throw new ApiError('The request timed out. Please try again.', 408, null)
    throw new ApiError('Network unavailable. Check your connection and retry.', 0, null)
  } finally {
    clearTimeout(timer)
  }
}

export const get = (path, opts) => api(path, { ...opts, method: 'GET' })
export const post = (path, body, opts) => api(path, { ...opts, method: 'POST', body })
export const patch = (path, body, opts) => api(path, { ...opts, method: 'PATCH', body })
export const del = (path, opts) => api(path, { ...opts, method: 'DELETE' })
