import { useCallback, useEffect, useRef, useState } from 'react'
import { STORAGE_KEYS } from '../config/env.js'
import { readStorage, writeStorage } from '../utils/index.js'

export function useAsync(fn, deps = [], { enabled = true } = {}) {
  const [state, setState] = useState({ data: null, loading: Boolean(enabled), error: null })
  const [nonce, setNonce] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null })
      return undefined
    }
    let active = true
    setState((s) => ({ ...s, loading: s.data == null, error: null }))
    Promise.resolve()
      .then(() => fnRef.current())
      .then((data) => {
        if (active) setState({ data, loading: false, error: null })
      })
      .catch((error) => {
        if (active) {
          setState((s) => ({
            data: s.data,
            loading: false,
            error: error.payload?.message || error.message || 'Something went wrong',
          }))
        }
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])
  return { ...state, refetch }
}

export function useMedia(query) {
  const [match, setMatch] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia(query).matches))
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (event) => setMatch(event.matches)
    setMatch(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return match
}

export function useDebounced(value, wait = 280) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), wait)
    return () => clearTimeout(id)
  }, [value, wait])
  return debounced
}

export function useRecentlyViewed(tenantId) {
  const key = `${STORAGE_KEYS.recentlyViewed}.${tenantId || 'platform'}`
  const [items, setItems] = useState(() => readStorage(key, []))

  useEffect(() => {
    setItems(readStorage(key, []))
  }, [key])

  const push = useCallback((product) => {
    if (!product?.id) return
    const entry = {
      id: product.id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      mrp: product.mrp,
      image: product.images?.[0]?.src || product.image || '',
    }
    const next = [entry, ...readStorage(key, []).filter((p) => p.id !== entry.id)].slice(0, 12)
    writeStorage(key, next)
    setItems(next)
  }, [key])

  return { items, push }
}

export function useLockBody(locked) {
  useEffect(() => {
    if (!locked) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [locked])
}

/** True once the element is near the viewport — used to defer below-fold work. */
export function useInView(options = {}) {
  const ref = useRef(null)
  const [inView, setInView] = useState(false)
  const rootMargin = options.rootMargin || '240px'

  useEffect(() => {
    const el = ref.current
    if (!el || inView) return undefined
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return undefined
    }
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setInView(true)
        io.disconnect()
      }
    }, { rootMargin, threshold: 0.01 })
    io.observe(el)
    return () => io.disconnect()
  }, [inView, rootMargin])

  return [ref, inView]
}

/** Runs a submit handler with loading + error state, so forms never double-fire. */
export function useSubmit(handler) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  const submit = useCallback(async (...args) => {
    setError('')
    setPending(true)
    try {
      return await handlerRef.current(...args)
    } catch (err) {
      setError(err.payload?.message || err.message || 'Something went wrong')
      return undefined
    } finally {
      setPending(false)
    }
  }, [])

  return { submit, pending, error, setError }
}
