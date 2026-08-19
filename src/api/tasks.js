import apiClient from './client'

export const tasksAPI = {
  list: (params = {}) => apiClient.get('/api/tasks', { params })
}
