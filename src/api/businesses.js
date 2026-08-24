import apiClient from './client'

// Businesses — the roll-up layer. A business sits above deals: one company,
// several contacts, several deals, and one conversation stream across all of
// them.
export const businessesAPI = {
  list: (params = {}) => apiClient.get('/api/businesses', { params }),
  get: (id) => apiClient.get(`/api/businesses/${encodeURIComponent(id)}`),
  // Paginated separately from get(): a business with two years of history has
  // thousands of messages and they must not all land in the detail response.
  conversations: (id, params = {}) =>
    apiClient.get(`/api/businesses/${encodeURIComponent(id)}/conversations`, { params })
}
