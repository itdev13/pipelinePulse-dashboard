import apiClient from './client'

export const contactsAPI = {
  list: (params = {}) => apiClient.get('/api/contacts', { params }),
  get: (id) => apiClient.get(`/api/contacts/${encodeURIComponent(id)}`),
  update: (id, patch) =>
    apiClient.patch(`/api/contacts/${encodeURIComponent(id)}`, patch),
  setDnd: (id, channel, blocked) =>
    apiClient.put(`/api/contacts/${encodeURIComponent(id)}/dnd`, { channel, blocked }),

  // Tags have their own endpoints because they must be ADDITIVE. The general
  // update above replaces the whole tag array, so it refuses `tags` outright —
  // a partial list would silently delete the rest.
  addTags: (id, tags) =>
    apiClient.post(`/api/contacts/${encodeURIComponent(id)}/tags`, { tags }),
  removeTags: (id, tags) =>
    apiClient.delete(`/api/contacts/${encodeURIComponent(id)}/tags`, { data: { tags } }),

  // Every tag defined in the location — for autocomplete, so a rep picks an
  // existing tag rather than creating a near-duplicate.
  tagCatalogue: () => apiClient.get('/api/contacts/tags/catalogue')
}
