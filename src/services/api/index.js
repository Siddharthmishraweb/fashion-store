import { buildQuery, productsApi } from './products.js'
import { del, get, patch, post } from './client.js'

export { productsApi }

export const categoriesApi = {
  list: (tenantId) => get(`/categories?${buildQuery({ tenantId })}`),
  create: (body) => post('/categories', body),
  update: (id, body) => patch(`/categories/${id}`, body),
  remove: (id) => del(`/categories/${id}`),
}

export const collectionsApi = {
  list: (tenantId) => get(`/collections?${buildQuery({ tenantId })}`),
  create: (body) => post('/collections', body),
  update: (id, body) => patch(`/collections/${id}`, body),
}

export const bannersApi = {
  list: (tenantId) => get(`/banners?${buildQuery({ tenantId })}`),
  create: (body) => post('/banners', body),
  update: (id, body) => patch(`/banners/${id}`, body),
  remove: (id) => del(`/banners/${id}`),
  reorder: (tenantId, ids) => post('/banners/reorder', { tenantId, ids }),
}

export const ordersApi = {
  list: (params = {}) => get(`/orders?${buildQuery(params)}`),
  get: (id) => get(`/orders/${encodeURIComponent(id)}`),
  update: (id, body) => patch(`/orders/${id}`, body),
  checkout: (body) => post('/checkout', body),
}

export const customersApi = {
  list: (params = {}) => get(`/customers?${buildQuery(params)}`),
  get: (id) => get(`/customers/${id}`),
}

export const staffApi = {
  list: (tenantId) => get(`/staff?${buildQuery({ tenantId })}`),
  updateRole: (id, role) => patch(`/staff/${id}`, { role }),
}

export const usersApi = {
  list: (params = {}) => get(`/users?${buildQuery(params)}`),
}

export const couponsApi = {
  list: (tenantId) => get(`/coupons?${buildQuery({ tenantId })}`),
  create: (body) => post('/coupons', body),
  remove: (id) => del(`/coupons/${id}`),
  validate: (body) => post('/coupons/validate', body),
}

export const reviewsApi = {
  list: (params = {}) => get(`/reviews?${buildQuery(params)}`),
  create: (body) => post('/reviews', body),
}

export const themesApi = {
  list: () => get('/themes'),
}

export const customizeApi = {
  save: (body) => post('/customize/save', body),
  publish: (body) => post('/customize/publish', body),
}

export const analyticsApi = {
  platform: () => get('/analytics/platform'),
  store: (tenantId) => get(`/analytics/store?${buildQuery({ tenantId })}`),
}

export const inventoryApi = {
  list: (params = {}) => get(`/inventory?${buildQuery(params)}`),
  update: (productId, inventory) => patch(`/inventory/${productId}`, { inventory }),
}

export const notificationsApi = {
  list: (params = {}) => get(`/notifications?${buildQuery(params)}`),
  markAllRead: (tenantId) => post('/notifications/read', { tenantId }),
}

export const engageApi = {
  waitlist: (body) => post('/waitlist', body),
  newsletter: (body) => post('/newsletter', body),
}
