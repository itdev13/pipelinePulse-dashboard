import { useEffect, useState, useRef } from 'react'
import { API_BASE_URL } from '../constants/api'

// Acquires the GHL user context inside the marketplace iframe via the official
// postMessage handshake, then decrypts it server-side (the backend holds the
// shared secret). Returns { locationId, companyId, userId, email, userName }.
//
// Ported from convoVault's proven implementation; trimmed to the Custom Pages
// (postMessage) path which is what PipelinePulse uses.
export function useGHLContext() {
  const [context, setContext] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const resolvedRef = useRef(false)

  useEffect(() => {
    if (resolvedRef.current) return
    let messageHandler
    let timeoutId

    const decryptUserData = async (encryptedData) => {
      const res = await fetch(`${API_BASE_URL}/auth/decrypt-user-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ encryptedData }),
      })
      if (!res.ok) throw new Error('Authentication failed')
      const data = await res.json()
      if (!data.success) throw new Error(data.error || 'Decryption failed')
      return data
    }

    const requestContext = () =>
      new Promise((resolve, reject) => {
        messageHandler = ({ data }) => {
          if (data?.message === 'REQUEST_USER_DATA_RESPONSE' && !resolvedRef.current) {
            clearTimeout(timeoutId)
            resolvedRef.current = true
            decryptUserData(data.payload).then(resolve).catch(reject)
          }
        }
        window.addEventListener('message', messageHandler)

        if (window.parent !== window) {
          window.parent.postMessage({ message: 'REQUEST_USER_DATA' }, '*')
        } else {
          reject(new Error('NOT_IN_IFRAME'))
          return
        }
        timeoutId = setTimeout(() => {
          if (!resolvedRef.current) reject(new Error('CONTEXT_TIMEOUT'))
        }, 5000)
      })

    requestContext()
      .then((userData) => {
        setContext({
          locationId: userData.activeLocation || userData.locationId,
          companyId: userData.companyId,
          userId: userData.userId,
          email: userData.email,
          userName: userData.userName,
          role: userData.role,
          type: userData.type || 'Location',
        })
        setLoading(false)
      })
      .catch((err) => {
        setError(err.message || 'Context initialization failed')
        setLoading(false)
      })

    return () => {
      if (messageHandler) window.removeEventListener('message', messageHandler)
      clearTimeout(timeoutId)
    }
  }, [])

  return { context, loading, error }
}
