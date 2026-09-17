import { Link, useParams } from 'react-router-dom'
import { Seo } from '../components/common/index.jsx'
import { env } from '../config/env.js'

export function NotFound({ scope = 'platform' }) {
  const { slug, themeId } = useParams()
  const previewHome = `/preview/${themeId || ''}`
  const storeHome = `/store/${slug || ''}`
  const home = scope === 'preview' && themeId ? previewHome : scope === 'store' && slug ? storeHome : themeId ? previewHome : slug ? storeHome : '/'
  return (
    <>
      <Seo title={`Page not found — ${env.appName}`} description="The page you were looking for has moved or no longer exists." noindex />
      <div className="notfound">
        <p className="caption">Error 404</p>
        <h1>This page has moved on</h1>
        <p className="muted">
          The link may be out of date, or the piece you were looking for has sold out. Everything else is still here.
        </p>
        <div className="notfound-actions">
          <Link className="btn" to={home}>{scope === 'store' || scope === 'preview' || slug || themeId ? 'Back to the storefront' : 'Back to the marketplace'}</Link>
          {home !== '/' ? <Link className="btn btn-ghost" to={`${home}/products`}>Browse all sarees</Link> : null}
        </div>
      </div>
    </>
  )
}

export default NotFound
