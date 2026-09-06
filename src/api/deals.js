import apiClient from './client'

// Endpoints backing the Deal Hub view.
// Contract mirrors the shapes returned by pipelinePulse/server/src/routes/deals.js.
export const dealsAPI = {

  // Upload files to a FILE_UPLOAD custom field.
  //
  // multipart, so no JSON Content-Type — axios sets the boundary itself when
  // handed a FormData, and setting it manually omits that boundary and the
  // request is unparseable at the other end.
  uploadCustomFieldFiles: (id, fieldKey, files) => {
    const form = new FormData()
    for (const f of files) form.append('files', f)
    return apiClient.post(
      `/api/deals/${encodeURIComponent(id)}/custom-fields/${encodeURIComponent(fieldKey)}/files`,
      form
    )
  },
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

  // Every pipeline with its stages nested. One request rather than a stages
  // call per pipeline: the expanding row needs the target pipeline's stages the
  // moment a rep picks it, and a location has single-digit pipelines.
  // Location-wide; fetch once per session.
  pipelines: () => apiClient.get('/api/deals/pipelines'),

  // Active CRM users, for the Owner and Followers pickers. Both take a GHL user
  // id. Location-wide; fetch once per session.
  users: () => apiClient.get('/api/deals/users'),

  create: (fields) => apiClient.post('/api/deals', fields),
  remove: (id) => apiClient.delete(`/api/deals/${encodeURIComponent(id)}`),

  // People on the deal. `relationId`, not contactId, on remove: an
  // opportunity↔contact relation is a real row with its own id, which is why
  // opportunity_contacts is keyed on it.
  addContact: (id, contactId) =>
    apiClient.post(`/api/deals/${encodeURIComponent(id)}/contacts`, { contactId }),
  // Change which contact the deal belongs to. A dedicated endpoint because
  // contactId is undocumented on GHL's opportunity PUT — see the route.
  setPrimaryContact: (id, contactId) =>
    apiClient.put(
      `/api/deals/${encodeURIComponent(id)}/primary-contact`, { contactId }
    ),
  removeContact: (id, relationId) =>
    apiClient.delete(
      `/api/deals/${encodeURIComponent(id)}/contacts/${encodeURIComponent(relationId)}`
    ),

  // Additive both ways, like contact tags.
  addFollowers: (id, followers) =>
    apiClient.post(`/api/deals/${encodeURIComponent(id)}/followers`, { followers }),
  removeFollowers: (id, followers) =>
    apiClient.delete(`/api/deals/${encodeURIComponent(id)}/followers`, { data: { followers } })
}
