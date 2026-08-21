import apiClient from './client'

export const contactsAPI = {
  list: (params = {}) => apiClient.get('/api/contacts', { params }),
  get: (id) => apiClient.get(`/api/contacts/${encodeURIComponent(id)}`),
  update: (id, patch) =>
    apiClient.patch(`/api/contacts/${encodeURIComponent(id)}`, patch),
  setDnd: (id, channel, blocked) =>
    apiClient.put(`/api/contacts/${encodeURIComponent(id)}/dnd`, { channel, blocked })
}
