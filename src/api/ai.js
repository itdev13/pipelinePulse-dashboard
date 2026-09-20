import apiClient from './client'

// Deal Hub AI. Contract mirrors pipelinePulse/server/src/routes/ai.js.
export const aiAPI = {
  status: () => apiClient.get('/api/ai/status'),
  // `images` are a question aid, not evidence — the server states that boundary
  // to the model, and validate.js still requires a message quote for every
  // claim. Each is { mediaType, data } with data as bare base64.
  ask: (dealId, {
    question, history = [], channels = null, images = [], conversationId = null
  }) =>
    apiClient.post(`/api/ai/deals/${encodeURIComponent(dealId)}/ask`, {
      question,
      history,
      channels,
      images,
      conversationId
    }),
  // Portfolio — one question across every deal in the sub-account. Same
  // `images` contract as `ask` above.
  // `signal` lets the Co-Pilot's stop button abandon the request client-side
  // — the server keeps working (there's no cheap way to cancel an in-flight
  // Claude tool-call loop from here), but the rep gets their composer back
  // immediately instead of waiting out a question they no longer want
  // answered.
  askPortfolio: ({ question, history = [], images = [], conversationId = null, signal }) =>
    apiClient.post('/api/ai/portfolio/ask', { question, history, images, conversationId }, { signal }),
  portfolioHistory: () => apiClient.get('/api/ai/portfolio/ask/history'),
  // `reasons` are chip ids from the negative-feedback modal (see
  // NEGATIVE_FEEDBACK_CHIPS in CopilotTab.jsx) — matching GHL's own
  // NegativeFeedbackModal.vue set, validated server-side against the same
  // list. `reason` is that modal's free-text "Share details" field.
  rateRun: (runId, { rating, reasons = [], reason }) =>
    apiClient.post(`/api/ai/runs/${encodeURIComponent(runId)}/rating`, { rating, reasons, reason }),
  deleteConversation: (conversationId) =>
    apiClient.delete(`/api/ai/conversations/${encodeURIComponent(conversationId)}`),
  renameConversation: (conversationId, title) =>
    apiClient.patch(`/api/ai/conversations/${encodeURIComponent(conversationId)}`, { title }),
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
    ),
  // Co-Pilot "Personalization" — facts a rep has asked it to remember
  // across every future chat. Explicit save + bulk import only; see
  // server/migrations/075_ai_memories.sql for why there's no automatic
  // mid-chat extraction.
  listMemories: () => apiClient.get('/api/ai/memory'),
  createMemory: (content) => apiClient.post('/api/ai/memory', { content }),
  importMemories: (memories) => apiClient.post('/api/ai/memory/import', { memories }),
  deleteMemory: (memoryId) => apiClient.delete(`/api/ai/memory/${encodeURIComponent(memoryId)}`),
  deleteAllMemories: () => apiClient.delete('/api/ai/memory'),
  // Proposed CRM writes — create contact / attach contact / change owner /
  // change status. A propose tool only ever inserts a pending row server-
  // side (server/migrations/077_ai_actions.sql); these are the only calls
  // that turn one into a real GHL write. `edits` carries just the fields a
  // rep changed in the ActionCard, merged server-side over what the model
  // proposed.
  getAction: (actionId) => apiClient.get(`/api/ai/actions/${encodeURIComponent(actionId)}`),
  confirmAction: (actionId, edits) =>
    apiClient.post(`/api/ai/actions/${encodeURIComponent(actionId)}/confirm`, { edits }),
  rejectAction: (actionId) =>
    apiClient.post(`/api/ai/actions/${encodeURIComponent(actionId)}/reject`)
}
