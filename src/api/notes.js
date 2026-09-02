import apiClient from './client'

const enc = encodeURIComponent

export const notesAPI = {
  list: (params = {}) => apiClient.get('/api/notes', { params }),

  // Writes go to GoHighLevel, not to our database — see the server's
  // ghlNoteWrite.js. Each returns the note GHL echoed back.

  // A note needs a contact: GHL stores notes against the contact, so a deal
  // alone isn't enough to create one.
  //
  // opportunityId / businessId are ASSOCIATIONS, applied by the server after
  // the note exists (the relations endpoint is keyed on the note id). A failure
  // to link comes back as `relationError` with the note still created — the
  // note is the thing that matters and the link is recoverable.
  create: ({ contactId, body, title, color, pinned, opportunityId, businessId }) =>
    apiClient.post('/api/notes', {
      contactId, body, title, color, pinned, opportunityId, businessId
    }),

  // Send only what changed.
  update: (id, patch) => apiClient.patch(`/api/notes/${enc(id)}`, patch),

  // Link or unlink the deal and the company a note belongs to.
  //
  // Its own endpoint, not part of update(): different GHL endpoint, and the
  // note patch rejects unknown fields.
  //
  // NOTE THE CAP OF ONE on the deal link — attaching a deal to a note that
  // already has a different one REPLACES it silently. That is intended (a note
  // is about one deal) but it is a removal the caller did not ask for.
  setRelations: (id, { opportunityId, businessId } = {}) =>
    apiClient.put(`/api/notes/${enc(id)}/relations`, { opportunityId, businessId }),
  removeRelations: (id, { opportunityId, businessId } = {}) =>
    apiClient.put(`/api/notes/${enc(id)}/relations`, {
      opportunityId, businessId, remove: true
    }),

  // GHL's restore endpoint is not available over OAuth, so this is final as far
  // as the app is concerned — our row keeps the text, soft-deleted.
  remove: (id) => apiClient.delete(`/api/notes/${enc(id)}`)
}
