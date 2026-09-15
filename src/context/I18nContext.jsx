import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { translate } from '../i18n/dictionaries.js'
import { STORAGE_KEYS } from '../config/env.js'
import { readStorage, writeStorage } from '../utils/index.js'
import { loadFont } from '../theme/themes.js'

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [locale, setLocale] = useState(() => readStorage(STORAGE_KEYS.locale, 'en'))
  useEffect(() => {
    const html = document.documentElement
    html.lang = locale === 'hi' ? 'hi' : 'en'
    if (locale === 'hi') loadFont('devanagari')
  }, [locale])
  const value = useMemo(() => {
    const t = (key, vars) => translate(locale, key, vars)
    return {
      locale,
      t,
      setLocale: (next) => {
        setLocale(next)
        writeStorage(STORAGE_KEYS.locale, next)
      },
    }
  }, [locale])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}
