import apiClient from './client'

// Deal Hub AI. Contract mirrors pipelinePulse/server/src/routes/ai.js.
export const aiAPI = {
  status: () => apiClient.get('/api/ai/status'),
  ask: (dealId, { question, history = [], channels = null }) =>
    apiClient.post(`/api/ai/deals/${encodeURIComponent(dealId)}/ask`, {
      question,
      history,
      channels
    }),
  runMessages: (runId) =>
    apiClient.get(`/api/ai/runs/${encodeURIComponent(runId)}/messages`),
  feedback: (runId, payload) =>
    apiClient.post(`/api/ai/runs/${encodeURIComponent(runId)}/feedback`, payload),
  askHistory: (dealId) =>
    apiClient.get(`/api/ai/deals/${encodeURIComponent(dealId)}/ask/history`),
  // Batch: the timeline ticks several boxes before asking, so changes are
  // flushed together instead of one request per click.
  setInclusions: (dealId, changes) =>
    apiClient.put(`/api/ai/deals/${encodeURIComponent(dealId)}/inclusions`, { changes }),
  setInclusion: (dealId, messageId, included, reason) =>
    apiClient.put(
      `/api/ai/deals/${encodeURIComponent(dealId)}/messages/${encodeURIComponent(messageId)}/inclusion`,
      { included, reason }
    )
}
