import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { hasPermission } from '../config/constants.js'
import { authApi } from '../services/api/auth.js'
import { clearSession, getStoredUser, onAuthExpired, setSession, updateStoredUser } from '../services/session.js'
import {
  clearLoginFailures,
  loginLockRemainingMs,
  recordLoginFailure,
} from '../utils/security.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getStoredUser())
  const [expired, setExpired] = useState(false)

  const persist = useCallback((data) => {
    setSession({ token: data.token, expiresAt: data.expiresAt, user: data.user })
    setUser(data.user)
    setExpired(false)
    return data.user
  }, [])

  const logout = useCallback(async ({ silent = true } = {}) => {
    try {
      await authApi.logout()
    } catch {
      /* the session is going away locally either way */
    }
    clearSession()
    setUser(null)
    if (!silent) setExpired(true)
  }, [])

  // A 401 from any request means the token is gone; drop the local copy too.
  useEffect(() => onAuthExpired(() => {
    setUser(null)
    setExpired(true)
  }), [])

  // Re-validate on mount so a revoked or rotated session cannot linger in the UI.
  useEffect(() => {
    if (!user) return
    let active = true
    authApi
      .me()
      .then((fresh) => {
        if (!active) return
        setUser(fresh)
        updateStoredUser(fresh)
      })
      .catch(() => {
        if (!active) return
        clearSession()
        setUser(null)
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (payload) => {
    const identifier = String(payload.email || '').toLowerCase()
    const lockedFor = loginLockRemainingMs(identifier)
    if (lockedFor > 0) {
      throw new Error(`Too many attempts. Try again in ${Math.ceil(lockedFor / 60000)} minute(s).`)
    }
    try {
      const data = await authApi.login(payload)
      clearLoginFailures(identifier)
      return persist(data)
    } catch (error) {
      if (error.status === 401) {
        const left = recordLoginFailure(identifier)
        if (left <= 0) throw new Error('Too many failed attempts. This account is locked for 5 minutes.')
        if (left <= 2) throw new Error(`${error.message} ${left} attempt(s) left before a temporary lock.`)
      }
      throw error
    }
  }, [persist])

  const register = useCallback(async (payload) => persist(await authApi.register(payload)), [persist])
  const verifyOtp = useCallback(async (payload) => persist(await authApi.verifyOtp(payload)), [persist])

  const updateProfile = useCallback(async (payload) => {
    const fresh = await authApi.updateProfile(payload)
    setUser(fresh)
    updateStoredUser(fresh)
    return fresh
  }, [])

  const can = useCallback((permission) => Boolean(user) && hasPermission(user.role, permission), [user])

  const value = useMemo(
    () => ({
      user,
      expired,
      login,
      register,
      verifyOtp,
      logout,
      updateProfile,
      changePassword: authApi.changePassword,
      can,
      isAuthenticated: Boolean(user),
      isStaff: Boolean(user) && user.role !== 'customer',
    }),
    [user, expired, login, register, verifyOtp, logout, updateProfile, can],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
