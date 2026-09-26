import apiClient from './client'
import { API_BASE_URL } from '../constants/api'

// Control panel — v5. One markdown file of business context, plus the
// read-only qualification headings.
export const controlAPI = {
  get: () => apiClient.get('/api/control'),
  saveBusinessContext: (content, filename) =>
    apiClient.put('/api/control/business-context', { content, filename }),

  // AI skills — a saved database view the AI can query as a tool.
  //
  // No SQL crosses this boundary in either direction. A skill carries a view
  // NAME and which of its columns may be filtered on; the server builds the
  // query. See the server's skillValidator.js for why, and for the
  // security_invoker check that stops a view bypassing row-level security.
  listSkills: () => apiClient.get('/api/control/skills'),
  createSkill: (skill) => apiClient.post('/api/control/skills', skill),
  updateSkill: (id, patch) => apiClient.put(`/api/control/skills/${encodeURIComponent(id)}`, patch),
  deleteSkill: (id) => apiClient.delete(`/api/control/skills/${encodeURIComponent(id)}`),
  // The view's real columns, so the form offers them instead of asking
  // someone to remember a name — which is where typos come from.
  describeView: (name) =>
    apiClient.get(`/api/control/skills/views/${encodeURIComponent(name)}`),

  // Download can't go through the axios client: it returns a file, and the
  // session token lives in localStorage rather than a cookie, so a plain
  // window.open would arrive unauthenticated. Fetch it with the header, then
  // hand the browser a blob.
  downloadBusinessContext: async () => {
    const token = localStorage.getItem('sessionToken')
    const res = await fetch(`${API_BASE_URL}/api/control/business-context/download`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
    if (!res.ok) throw new Error('Could not download the file')
    const blob = await res.blob()
    const name =
      (res.headers.get('content-disposition') || '').match(/filename="([^"]+)"/)?.[1]
      || 'business-context.md'
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    // Revoke on the next tick — revoking synchronously can cancel the download
    // in some browsers before it starts.
    window.setTimeout(() => URL.revokeObjectURL(url), 0)
  }
}
