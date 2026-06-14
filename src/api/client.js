import axios from 'axios'
import { API_BASE_URL } from '../constants/api'

// Axios instance with the session Bearer token attached automatically.
const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 60000,
})

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('sessionToken')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

apiClient.interceptors.response.use(
  (response) => response.data,
  (error) => {
    // On a session-expired 401 (not during initial verify), reload to
    // re-acquire the GHL context and mint a fresh token.
    const status = error.response?.status
    const code = error.response?.data?.code
    const url = error.config?.url || ''
    if (status === 401 && code === 'TOKEN_EXPIRED' && !url.includes('/auth/verify')) {
      localStorage.removeItem('sessionToken')
      window.location.reload()
      return
    }
    const message =
      error.response?.data?.error ||
      error.response?.data?.message ||
      (error.code === 'ECONNABORTED' ? 'Request timed out.' : error.message) ||
      'An unexpected error occurred'
    const enhanced = new Error(message)
    enhanced.status = status
    enhanced.code = code || error.code
    enhanced.data = error.response?.data
    return Promise.reject(enhanced)
  }
)

export default apiClient
