import apiClient from './client'

const enc = encodeURIComponent

export const notesAPI = {
  list: (params = {}) => apiClient.get('/api/notes', { params }),

  // Writes go to GoHighLevel, not to our database — see the server's
  // ghlNoteWrite.js. Each returns the note GHL echoed back.

  // A note needs a contact: GHL stores notes against the contact, so a deal
  // alone isn't enough to create one.
  create: ({ contactId, body, title, color, pinned }) =>
    apiClient.post('/api/notes', { contactId, body, title, color, pinned }),

  // Send only what changed.
  update: (id, patch) => apiClient.patch(`/api/notes/${enc(id)}`, patch),

  // GHL's restore endpoint is not available over OAuth, so this is final as far
  // as the app is concerned — our row keeps the text, soft-deleted.
  remove: (id) => apiClient.delete(`/api/notes/${enc(id)}`)
}
