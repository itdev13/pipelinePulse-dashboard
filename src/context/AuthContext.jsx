import React, { createContext, useContext, useState, useEffect, useRef } from 'react'
import { useGHLContext } from '../hooks/useGHLContext'
import { authAPI } from '../api/auth'

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
      setSession({ token: res.sessionToken, user: res.user, locationId: res.location.id })
      setLocation(res.location)
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
