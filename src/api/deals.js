import apiClient from './client'

// Read-only endpoints backing the Deal Hub view.
// Contract mirrors the shapes returned by pipelinePulse/server/src/routes/deals.js.
export const dealsAPI = {
  get: (id) => apiClient.get(`/api/deals/${encodeURIComponent(id)}`),
  timeline: (id) => apiClient.get(`/api/deals/${encodeURIComponent(id)}/timeline`),
  reassignmentTargets: (id) =>
    apiClient.get(`/api/deals/${encodeURIComponent(id)}/reassignment-targets`)
}
