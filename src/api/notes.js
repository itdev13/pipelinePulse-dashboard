import apiClient from './client'

export const notesAPI = {
  list: (params = {}) => apiClient.get('/api/notes', { params })
}
