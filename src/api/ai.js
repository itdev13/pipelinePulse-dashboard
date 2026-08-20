import apiClient from './client'

// Deal Hub AI. Contract mirrors pipelinePulse/server/src/routes/ai.js.
export const aiAPI = {
  status: () => apiClient.get('/api/ai/status'),
  ask: (dealId, { question, history = [] }) =>
    apiClient.post(`/api/ai/deals/${encodeURIComponent(dealId)}/ask`, {
      question,
      history
    }),
  feedback: (runId, payload) =>
    apiClient.post(`/api/ai/runs/${encodeURIComponent(runId)}/feedback`, payload)
}
