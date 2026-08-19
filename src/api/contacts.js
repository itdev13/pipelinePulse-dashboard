import apiClient from './client'

export const contactsAPI = {
  list: (params = {}) => apiClient.get('/api/contacts', { params }),
  get: (id) => apiClient.get(`/api/contacts/${encodeURIComponent(id)}`)
}
