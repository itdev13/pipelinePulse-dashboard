import apiClient from './client'

// Serialize the shared dashboard filters into a query string.
//   filters = { from?: ISO, to?: ISO, pipelineId?: string }
function qs(filters = {}) {
  const p = new URLSearchParams()
  if (filters.from) p.set('from', filters.from)
  if (filters.to) p.set('to', filters.to)
  if (filters.pipelineId) p.set('pipelineId', filters.pipelineId)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const metricsAPI = {
  funnel: (f) => apiClient.get(`/api/metrics/funnel${qs(f)}`),
  velocity: (f) => apiClient.get(`/api/metrics/velocity${qs(f)}`),
  stalled: (f, days = 7) => {
    const p = new URLSearchParams(qs(f).replace(/^\?/, ''))
    p.set('days', String(days))
    return apiClient.get(`/api/metrics/stalled?${p.toString()}`)
  },
  winRate: (f) => apiClient.get(`/api/metrics/win-rate${qs(f)}`),
  revenue: (f) => apiClient.get(`/api/metrics/revenue${qs(f)}`),
  managers: (f) => apiClient.get(`/api/metrics/managers${qs(f)}`),
  messagesDelivery: (f) => apiClient.get(`/api/metrics/messages/delivery${qs(f)}`),
  messagesVolume: (f) => apiClient.get(`/api/metrics/messages/volume${qs(f)}`),
  pipelines: () => apiClient.get('/api/metrics/pipelines'),
  opportunityTimeline: (id) => apiClient.get(`/api/metrics/opportunity/${encodeURIComponent(id)}/timeline`),
  opportunityMessages: (id) => apiClient.get(`/api/metrics/opportunity/${encodeURIComponent(id)}/messages`),
  // Raw records behind a chart. params merges shared filters + extras
  // (stage, channel, direction, status, firstStage, owner).
  recordsMessages: (params = {}) => {
    const p = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v != null && v !== '' && p.set(k, v))
    return apiClient.get(`/api/metrics/records/messages?${p.toString()}`)
  },
  recordsOpportunities: (params = {}) => {
    const p = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => v != null && v !== '' && p.set(k, v))
    return apiClient.get(`/api/metrics/records/opportunities?${p.toString()}`)
  },
}
