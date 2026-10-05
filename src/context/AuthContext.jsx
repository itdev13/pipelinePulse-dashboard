import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useGHLContext } from '../hooks/useGHLContext'
import { authAPI } from '../api/auth'
import { setCurrency } from '../utils/format'

const AuthContext = createContext(null)

export const useAuth = () => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export const AuthProvider = ({ children }) => {
  const { context: ghlContext, loading: ghlLoading, error: ghlError } = useGHLContext()
  const [session, setSession] = useState(null)
  const [location, setLocation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const attempts = useRef(0)
  const MAX = 3

  useEffect(() => {
    if (ghlContext && !session && attempts.current < MAX) {
      authenticate(ghlContext)
    } else if (attempts.current >= MAX && !session) {
      setLoading(false)
      setError((e) => e || 'Maximum authentication attempts reached. Please refresh.')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghlContext])

  const authenticate = async (ctx) => {
    attempts.current += 1
    try {
      setLoading(true)
      const res = await authAPI.verify({
        locationId: ctx.locationId,
        companyId: ctx.companyId,
        userId: ctx.userId,
      })
      localStorage.setItem('sessionToken', res.sessionToken)
      // The authoritative sub-account for this session, written where
      // non-React code can read it. useTabState needs it to decide whether a
      // persisted snapshot belongs to the location now on screen; it used to
      // infer this by scanning for a `pp.position.*` key, which returns the
      // FIRST one found — so after visiting two sub-accounts it would answer
      // with whichever happened to be first, and one location's chat history
      // stayed on screen under another's name.
      localStorage.setItem('pp.activeLocation', res.location.id)
      setSession({ token: res.sessionToken, user: res.user, locationId: res.location.id })
      setLocation(res.location)
      // Apply the sub-account's currency to all money formatters.
      if (res.location?.currency) setCurrency(res.location.currency)
      setError(null)
      setLoading(false)
    } catch (err) {
      setError(err.message || 'Authentication failed')
      setLoading(false)
      attempts.current = MAX // stop retry storm
    }
  }

  const logout = () => {
    localStorage.removeItem('sessionToken')
    // Cleared with the session, so the next sign-in cannot be compared against
    // the previous one's sub-account and judged a match.
    localStorage.removeItem('pp.activeLocation')
    localStorage.removeItem('pp.tabstate')
    setSession(null)
    setLocation(null)
  }

  const value = {
    ghlContext,
    session,
    location,
    loading: ghlLoading || loading,
    error: ghlError || error,
    isAuthenticated: !!session,
    logout,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
