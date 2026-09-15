import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { applyTheme, getThemeById } from '../theme/themes.js'
import { storesApi } from '../services/api/stores.js'
import { getHostTenantHint } from '../utils/index.js'

const empty = {
  loading: true,
  error: null,
  tenant: null,
  theme: null,
  settings: null,
  navigation: null,
  homepage: null,
  banners: [],
  categories: [],
  collections: [],
  testimonials: [],
  instagram: [],
}

const TenantContext = createContext(null)

export function TenantProvider({ slug, previewConfig, children }) {
  const [state, setState] = useState(() => (
    previewConfig ? { ...empty, ...previewConfig, loading: false } : empty
  ))
  const [searchParams] = useSearchParams()
  const previewThemeId = searchParams.get('previewTheme')

  const load = useCallback(async () => {
    if (previewConfig) {
      setState({ ...empty, ...previewConfig, loading: false, error: null })
      applyTheme(previewConfig.theme)
      return
    }
    setState((s) => ({ ...s, loading: true, error: null }))
    try {
      const domain = getHostTenantHint()
      const data = await storesApi.resolve({ slug, domain: slug ? undefined : domain })
      setState({ ...empty, ...data, loading: false, error: null })
      applyTheme(data.theme)
    } catch (error) {
      setState((s) => ({ ...s, loading: false, error: error.message || 'Unable to load store' }))
    }
  }, [slug, previewConfig])

  useEffect(() => {
    load()
  }, [load])

  // `?previewTheme=` lets the platform team audition a theme on a real
  // storefront without saving anything to the tenant record.
  const theme = useMemo(() => {
    if (!previewThemeId) return state.theme
    return getThemeById(previewThemeId) || state.theme
  }, [previewThemeId, state.theme])

  useEffect(() => {
    if (theme) applyTheme(theme)
  }, [theme])

  const value = useMemo(
    () => ({ ...state, theme, previewing: Boolean(previewThemeId), reload: load, slug }),
    [state, theme, previewThemeId, load, slug],
  )
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
}

export function useTenant() {
  return useContext(TenantContext)
}
