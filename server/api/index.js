import { buildApp } from '../src/app.js'

let appPromise

async function getApp() {
  if (!appPromise) {
    appPromise = buildApp()
      .then(async (app) => {
        await app.ready()
        return app
      })
      .catch((error) => {
        appPromise = null
        throw error
      })
  }
  return appPromise
}

export const maxDuration = 30

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
}

function rewriteUrl(req) {
  let url = typeof req.url === 'string' ? req.url : '/'
  const invoke = req.headers['x-invoke-path']
  if (typeof invoke === 'string' && invoke && invoke !== '/api') {
    const query = url.includes('?') ? url.slice(url.indexOf('?')) : ''
    url = `${invoke.startsWith('/') ? invoke : `/${invoke}`}${query}`
  }
  if (url === '/api' || url.startsWith('/api/') || url.startsWith('/api?')) {
    url = url.slice(4) || '/'
  }
  req.url = url
}

/**
 * Vercel Node serverless entry. Incoming paths are rewritten onto /api so
 * Fastify still sees /products, /health, /uploads, etc.
 */
export default async function handler(req, res) {
  const app = await getApp()
  rewriteUrl(req)
  app.server.emit('request', req, res)
}
