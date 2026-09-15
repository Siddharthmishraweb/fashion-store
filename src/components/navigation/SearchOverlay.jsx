import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { productsApi } from '../../services/api/products.js'
import { useDebounced } from '../../hooks/index.js'
import { STORAGE_KEYS } from '../../config/env.js'
import { formatCurrency, readStorage, writeStorage } from '../../utils/index.js'
import { sanitizeText } from '../../utils/security.js'
import { useI18n } from '../../context/I18nContext.jsx'
import { useTenant } from '../../context/TenantContext.jsx'
import { Button, OptimizedImage } from '../common/index.jsx'

export function SearchOverlay({ base, onClose }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { tenant } = useTenant()
  const [q, setQ] = useState('')
  const debounced = useDebounced(q, 280)
  const [data, setData] = useState({ products: [], categories: [], brands: [], popular: [] })
  const [recent, setRecent] = useState(() => readStorage(STORAGE_KEYS.recentSearch, []))
  const inputRef = useRef(null)

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    inputRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
    }
  }, [onClose])

  useEffect(() => {
    let active = true
    productsApi
      .search({ tenantId: tenant.id, q: debounced })
      .then((result) => {
        if (active) setData(result)
      })
      .catch(() => {
        if (active) setData({ products: [], categories: [], brands: [], popular: [] })
      })
    return () => {
      active = false
    }
  }, [debounced, tenant.id])

  const go = (term) => {
    const clean = sanitizeText(term, 80)
    if (!clean) return
    const next = [clean, ...recent.filter((x) => x !== clean)].slice(0, 6)
    setRecent(next)
    writeStorage(STORAGE_KEYS.recentSearch, next)
    onClose()
    navigate(`${base}/search?q=${encodeURIComponent(clean)}`)
  }

  return (
    <div className="search-overlay" role="dialog" aria-modal="true" aria-label="Search">
      <button type="button" className="search-shade" aria-label="Close search" onClick={onClose} />
      <div className="search-box">
        <form
          className="search-row"
          onSubmit={(e) => {
            e.preventDefault()
            go(q)
          }}
        >
          <input
            ref={inputRef}
            className="input"
            type="search"
            placeholder={t('search.placeholder')}
            aria-label={t('search.placeholder')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Button type="submit">Search</Button>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </form>

        <div className="suggest">
          <div>
            {recent.length ? (
              <>
                <p className="caption">{t('search.recent')}</p>
                <div className="term-list">
                  {recent.map((term) => (
                    <button type="button" key={term} className="chip" onClick={() => go(term)}>{term}</button>
                  ))}
                </div>
              </>
            ) : null}

            {data.popular?.length ? (
              <>
                <p className="caption">{t('search.popular')}</p>
                <div className="term-list">
                  {data.popular.map((term) => (
                    <button type="button" key={term} className="chip" onClick={() => go(term)}>{term}</button>
                  ))}
                </div>
              </>
            ) : null}

            {data.categories?.length ? (
              <>
                <p className="caption">{t('search.categories')}</p>
                <div className="term-list">
                  {data.categories.map((c) => (
                    <Link key={c.id} className="chip" to={`${base}/category/${c.slug}`} onClick={onClose}>{c.name}</Link>
                  ))}
                </div>
              </>
            ) : null}
          </div>

          <div>
            <p className="caption">{t('search.products')}</p>
            {data.products?.length ? (
              <ul className="search-results">
                {data.products.map((p) => (
                  <li key={p.id}>
                    <Link to={`${base}/product/${p.slug}`} onClick={onClose}>
                      <OptimizedImage src={p.images?.[0]?.src} alt="" sizes="56px" />
                      <span>
                        {p.name}
                        <small className="muted">{p.fabric} · {p.weave}</small>
                      </span>
                      <b>{formatCurrency(p.price)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">{debounced ? 'No matches yet — try a fabric or weave.' : 'Start typing to see weaves.'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
