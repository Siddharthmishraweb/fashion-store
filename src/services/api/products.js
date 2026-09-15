import { del, get, patch, post } from './client.js'

function query(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    if (Array.isArray(value)) value.forEach((v) => v !== '' && search.append(key, v))
    else search.set(key, value)
  })
  return search.toString()
}

export const productsApi = {
  list: (params = {}) => get(`/products?${query(params)}`),
  facets: (tenantId) => get(`/products/facets?${query({ tenantId })}`),
  get: (id, tenantId) => get(`/products/${encodeURIComponent(id)}?${query({ tenantId })}`),
  search: (params = {}) => get(`/search?${query(params)}`),
  recommendations: (params = {}) => get(`/recommendations?${query(params)}`),
  create: (body) => post('/products', body),
  update: (id, body) => patch(`/products/${id}`, body),
  remove: (id) => del(`/products/${id}`),
  duplicate: (id) => post(`/products/${id}/duplicate`),
  bulk: (body) => post('/products/bulk', body),
}

export { query as buildQuery }
