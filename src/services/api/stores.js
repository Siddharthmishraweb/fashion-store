import { get, patch, post } from './client.js'
import { buildQuery } from './products.js'

export const storesApi = {
  list: (params = {}) => get(`/stores?${buildQuery(params)}`),
  resolve: ({ slug, domain }) => get(`/stores/resolve?${buildQuery({ slug, domain })}`),
  get: (id) => get(`/stores/${encodeURIComponent(id)}`),
  create: (body) => post('/stores', body),
  update: (id, body) => patch(`/stores/${id}`, body),
}
