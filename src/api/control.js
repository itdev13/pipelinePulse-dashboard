import apiClient from './client'

// Control centre — per-location AI configuration.
// Contract mirrors pipelinePulse/server/src/routes/control.js.
export const controlAPI = {
  get: () => apiClient.get('/api/control'),
  saveMeddic: (meddic) => apiClient.put('/api/control/meddic', { meddic }),
  saveBusinessInfo: (businessInfo) =>
    apiClient.put('/api/control/business-info', { businessInfo }),
  addToneSample: (sample) => apiClient.post('/api/control/tone-samples', sample),
  deleteToneSample: (id) =>
    apiClient.delete(`/api/control/tone-samples/${encodeURIComponent(id)}`),
  saveProducts: (products) => apiClient.put('/api/control/products', { products })
}
