import apiClient from './client'

const enc = encodeURIComponent

export const tasksAPI = {
  list: (params = {}) => apiClient.get('/api/tasks', { params }),

  // Writes go to GoHighLevel, not to our database — see the server's
  // ghlTaskWrite.js. Each returns the task GHL echoed back, so the caller can
  // apply what GHL actually stored rather than what it hoped it would.

  // A task needs a contact: GHL stores tasks against the contact, so a deal
  // alone isn't enough to create one.
  create: ({ contactId, title, body, dueDate, assignedTo }) =>
    apiClient.post('/api/tasks', { contactId, title, body, dueDate, assignedTo }),

  // Send only what changed.
  update: (id, patch) => apiClient.patch(`/api/tasks/${enc(id)}`, patch),

  // Its own endpoint rather than update({ completed }) — the narrowest request
  // for ticking a checkbox, so it can't disturb a title or due date.
  setCompleted: (id, completed) =>
    apiClient.put(`/api/tasks/${enc(id)}/completed`, { completed }),

  remove: (id) => apiClient.delete(`/api/tasks/${enc(id)}`)
}
