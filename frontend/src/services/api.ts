// Use relative URLs so Vite proxy handles routing — no hardcoded host
const BASE = import.meta.env.VITE_API_URL || ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }))
    throw new Error(err.detail || `HTTP ${resp.status}`)
  }
  return resp.json()
}

async function rpc(method: string, params: Record<string, any> = {}) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  const resp = await fetch(`/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  })
  const data = await resp.json()
  if (data.error) throw new Error(data.error.message || 'RPC error')
  return data.result
}

export const api = {
  // Health
  healthCheck: () => request<any>('/health'),

  // Stats
  getStats: () => request<any>('/api/v1/stats/global'),
  getRecentActivity: (limit = 20) => request<any[]>(`/api/v1/recent-activity?limit=${limit}`),

  // Items
  getItems: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as any).toString()
    return request<any>(`/api/v1/items?${qs}`)
  },

  // Sources
  getSources: () => request<any>('/api/v1/sources'),
  addSource: (body: any) => request<any>('/api/v1/sources', { method: 'POST', body: JSON.stringify(body) }),
  toggleSource: (id: number, active: boolean) => request<any>(`/api/v1/sources/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteSource: (id: number) => request<any>(`/api/v1/sources/${id}`, { method: 'DELETE' }),

  // Web tools (via MCP JSON-RPC)
  browse: (url: string, params?: any) => rpc('web.browse', { url, ...params }),
  digest: (url: string, params?: any) => rpc('web.digest', { url, save_item: true, ...params }),
  watchUrl: (params: any) => rpc('web.watch', params),
  watchedPages: () => rpc('web.watched_pages', {}),

  // Briefing quotidien
  generateBriefing: (hours = 24, force = false) =>
    request<any>('/api/v1/briefing/generate', { method: 'POST', body: JSON.stringify({ hours, force }) }),
  getTodayBriefing: () => request<any>('/api/v1/briefing/today'),
  listBriefings: (limit = 30) => request<any[]>(`/api/v1/briefing/list?limit=${limit}`),
  getBriefing: (id: number) => request<any>(`/api/v1/briefing/${id}`),

  // Veille à la demande
  veilleOnDemand: (subject: string, max_results = 5, sources = ['hn', 'devto', 'arxiv']) =>
    request<any>('/api/v1/veille/on-demand', { method: 'POST', body: JSON.stringify({ subject, max_results, sources }) }),

  // Tendances
  getTrends: (window = 7, limit = 30) =>
    request<any>(`/api/v1/stats/trends?window=${window}&limit=${limit}`),

  // Stats détaillés
  getToolsList: () => request<any>('/api/v1/stats/tools'),
  getCostsDetail: () => request<any>('/api/v1/stats/costs/detail'),
  getCosts: (period = 'month') => request<any>(`/api/v1/stats/costs?period=${period}`),
  getRagQueries: (limit = 20) => request<any[]>(`/api/v1/stats/rag-queries?limit=${limit}`),
  getBrowseHistory: (limit = 20) => request<any[]>(`/api/v1/web/browse/history?limit=${limit}`),

  // HITL / LLM filter
  getItemRawContent: (item_id: number, translate = false) =>
    request<any>(`/api/v1/items/${item_id}/raw-content?translate=${translate}`),
  previewPdfUrl: (url: string) =>
    request<any>('/api/v1/items/preview-pdf-url', { method: 'POST', body: JSON.stringify({ url }) }),
  ingestPdfUrl: (url: string) =>
    request<any>('/api/v1/items/ingest-pdf-url', { method: 'POST', body: JSON.stringify({ url }) }),
  uploadDocument: (file: File) => {
    const form = new FormData(); form.append('file', file)
    return fetch('/api/v1/items/upload-document', { method: 'POST', body: form })
      .then(r => r.ok ? r.json() : r.json().then((e: any) => Promise.reject(new Error(e.detail || 'Upload failed'))))
  },
  lookupUrl: (url: string) =>
    request<any>(`/api/v1/items/lookup?url=${encodeURIComponent(url)}`),
  addManualUrl: (url: string, workspace_id?: number) =>
    request<any>('/api/v1/items', {
      method: 'POST',
      body: JSON.stringify({ url, title: url, source_type: 'browse', source_url: url, workspace_id }),
    }),
  llmFilter: (item_ids: number[], prompt: string) =>
    request<any[]>('/api/v1/items/llm-filter', { method: 'POST', body: JSON.stringify({ item_ids, prompt }) }),
  ingestPreview: (item_id: number) =>
    request<any>(`/api/v1/items/${item_id}/ingest-preview`, { method: 'POST' }),
  ingestConfirm: (item_id: number, markdown: string, summary: string, json?: any) =>
    request<any>(`/api/v1/items/${item_id}/ingest-confirm`, { method: 'POST', body: JSON.stringify({ markdown, summary, json }) }),
  updateSummary: (item_id: number, summary: string) =>
    request<any>(`/api/v1/items/${item_id}/summary`, { method: 'PATCH', body: JSON.stringify({ summary }) }),

  // Documents / Bibliothèque
  generateDocument: (doc_type: string, title: string, prompt: string, item_ids: number[]) =>
    request<any>('/api/v1/documents/generate', { method: 'POST', body: JSON.stringify({ doc_type, title, prompt, item_ids }) }),
  saveDocument: (data: any) =>
    request<any>('/api/v1/documents', { method: 'POST', body: JSON.stringify(data) }),
  getDocuments: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as any).toString()
    return request<any>(`/api/v1/documents?${qs}`)
  },
  searchDocuments: (q: string, semantic = false, doc_type?: string) => {
    const p: any = { q, semantic }
    if (doc_type && doc_type !== 'all') p.doc_type = doc_type
    const qs = new URLSearchParams(p).toString()
    return request<any>(`/api/v1/documents/search?${qs}`)
  },
  getDocument: (id: number) => request<any>(`/api/v1/documents/${id}`),
  updateDocument: (id: number, data: any) =>
    request<any>(`/api/v1/documents/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  aiEditDocument: (id: number, instruction: string, current_content: string) =>
    request<any>(`/api/v1/documents/${id}/ai-edit`, { method: 'POST', body: JSON.stringify({ instruction, current_content }) }),
  deleteDocument: (id: number) => request<any>(`/api/v1/documents/${id}`, { method: 'DELETE' }),
  deleteDocuments: (ids: number[]) => request<any>('/api/v1/documents', { method: 'DELETE', body: JSON.stringify({ ids }) }),
  indexDocument: (id: number) => request<any>(`/api/v1/documents/${id}/index`, { method: 'POST' }),

  // RAG
  ragQuery: (query: string, workspace_id?: number) =>
    request<any>('/api/v1/rag/ask', {
      method: 'POST',
      body: JSON.stringify({ query, user_identifier: 'frontend', workspace_id }),
    }),
  rebuildRagIndex: () => request<any>('/api/v1/rag/index-all-items', { method: 'POST' }),
}
