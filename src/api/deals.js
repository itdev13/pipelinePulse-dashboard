import apiClient from './client'

// Endpoints backing the Deal Hub view.
// Contract mirrors the shapes returned by pipelinePulse/server/src/routes/deals.js.
export const dealsAPI = {
  list: (params = {}) => apiClient.get('/api/deals', { params }),
  get: (id) => apiClient.get(`/api/deals/${encodeURIComponent(id)}`),
  timeline: (id) => apiClient.get(`/api/deals/${encodeURIComponent(id)}/timeline`),
  stages: (id) => apiClient.get(`/api/deals/${encodeURIComponent(id)}/stages`),
  reassignmentTargets: (id) =>
    apiClient.get(`/api/deals/${encodeURIComponent(id)}/reassignment-targets`),

  // Writes go to GoHighLevel — see the server's ghlOpportunityWrite.js. They
  // need the opportunities.write scope, separate from the readonly the sync
  // uses.
  //
  // Nothing is written locally: opportunities have full webhook coverage, and
  // stage_history (every "days in stage" figure) is maintained only by that
  // path. So a change appears here once the webhook lands, not instantly.

  // Send only what changed. STATUS IS NOT ACCEPTED here — use setStatus, the
  // only route that can record a lost reason.
  update: (id, patch) =>
    apiClient.patch(`/api/deals/${encodeURIComponent(id)}`, patch),

  // Its own endpoint because a lost reason can only be attached here; the
  // general update silently drops it.
  setStatus: (id, status, lostReasonId) =>
    apiClient.put(`/api/deals/${encodeURIComponent(id)}/status`, { status, lostReasonId }),

  // The location's lost reasons, for the picker shown when marking a deal lost.
  lostReasons: () => apiClient.get('/api/deals/lost-reasons'),

  // Picklist choices for the opportunity custom fields shown as chips on the
  // deal card. Location-wide; fetch once per session.
  customFieldOptions: () => apiClient.get('/api/deals/custom-field-options'),

  create: (fields) => apiClient.post('/api/deals', fields),
  remove: (id) => apiClient.delete(`/api/deals/${encodeURIComponent(id)}`),

  // Additive both ways, like contact tags.
  addFollowers: (id, followers) =>
    apiClient.post(`/api/deals/${encodeURIComponent(id)}/followers`, { followers }),
  removeFollowers: (id, followers) =>
    apiClient.delete(`/api/deals/${encodeURIComponent(id)}/followers`, { data: { followers } })
}
