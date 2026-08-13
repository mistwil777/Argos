// Use relative URLs so Vite proxy handles routing — no hardcoded host
const BASE = import.meta.env.VITE_API_URL || ''

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('argos_token')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const resp = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
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
  // Auth
  register: (email: string, password: string, full_name?: string) =>
    request<any>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password, full_name }) }),
  login: (email: string, password: string) =>
    request<any>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me: () => request<any>('/auth/me'),
  updateMe: (data: any) => request<any>('/auth/me', { method: 'PUT', body: JSON.stringify(data) }),

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
  runPipelineSource: (id: number) => request<any>(`/api/v1/sources/${id}/pipeline`, { method: 'POST' }),
  toggleSource: (id: number, active: boolean) => request<any>(`/api/v1/sources/${id}/toggle`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deleteSource: (id: number) => request<any>(`/api/v1/sources/${id}`, { method: 'DELETE' }),

  // Web tools (via MCP JSON-RPC)
  browse: (url: string, params?: any) => rpc('web.browse', { url, ...params }),
  digest: (url: string, params?: any) => rpc('web.digest', { url, save_item: true, ...params }),
  watchUrl: (params: any) => rpc('web.watch', params),
  watchedPages: () => rpc('web.watched_pages', {}),

  // Briefing quotidien
  generateBriefing: (hours = 24, force = false, sujetId?: number) =>
    request<any>('/api/v1/briefing/generate', { method: 'POST', body: JSON.stringify({ hours, force, sujet_id: sujetId }) }),
  getTodayBriefing: (sujetId?: number) => request<any>(`/api/v1/briefing/today${sujetId != null ? `?sujet_id=${sujetId}` : ''}`),
  listBriefings: (limit = 30) => request<any[]>(`/api/v1/briefing/list?limit=${limit}`),
  getBriefing: (id: number) => request<any>(`/api/v1/briefing/${id}`),
  deleteBriefing: (id: number) => request<any>(`/api/v1/briefing/${id}`, { method: 'DELETE' }),
  deleteAllBriefings: () => request<any>('/api/v1/briefing', { method: 'DELETE' }),

  // Veille à la demande
  veilleOnDemand: (subject: string, max_results = 5, sources = ['hn', 'devto', 'arxiv']) =>
    request<any>('/api/v1/veille/on-demand', { method: 'POST', body: JSON.stringify({ subject, max_results, sources }) }),

  // Discovery : découverte de sources candidates puis confirmation
  veilleDiscover: (description: string, workspace_id?: number) =>
    request<any>('/api/v1/veille/create', { method: 'POST', body: JSON.stringify({ description, workspace_id, auto_create: false }) }),
  veilleConfirm: (sources: any[], workspace_id?: number) =>
    request<any>('/api/v1/veille/confirm', { method: 'POST', body: JSON.stringify({ sources, workspace_id }) }),

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
  getItemContent: (item_id: number) =>
    request<any>(`/api/v1/items/${item_id}/content`),
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
  saveItem: (item_id: number) =>
    request<any>(`/api/v1/items/${item_id}/save`, { method: 'POST' }),
  ignoreItem: (item_id: number) =>
    request<any>(`/api/v1/items/${item_id}/ignore`, { method: 'POST' }),
  ingestItemRag: (item_id: number) =>
    request<any>(`/api/v1/items/${item_id}/ingest-rag`, { method: 'POST' }),
  translateItem: (item_id: number, language: string) =>
    request<any>(`/api/v1/items/${item_id}/translate`, { method: 'POST', body: JSON.stringify({ language }) }),
  batchSaveItems: (item_ids: number[]) =>
    request<any>('/api/v1/items/batch/save', { method: 'POST', body: JSON.stringify({ item_ids }) }),
  batchIgnoreItems: (item_ids: number[]) =>
    request<any>('/api/v1/items/batch/ignore', { method: 'POST', body: JSON.stringify({ item_ids }) }),
  batchIngestRag: (item_ids: number[]) =>
    request<any>('/api/v1/items/batch/ingest-rag', { method: 'POST', body: JSON.stringify({ item_ids }) }),

  // Documents / Bibliothèque
  generateDocument: (doc_type: string, title: string, prompt: string, item_ids: number[], sujet_id?: number | null) =>
    request<any>('/api/v1/documents/generate', { method: 'POST', body: JSON.stringify({ doc_type, title, prompt, item_ids, sujet_id }) }),
  saveDocument: (data: any) =>
    request<any>('/api/v1/documents', { method: 'POST', body: JSON.stringify(data) }),
  getDocuments: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as any).toString()
    return request<any>(`/api/v1/documents?${qs}`)
  },
  searchDocuments: (q: string, semantic = false, doc_type?: string, sujet_id?: number) => {
    const p: any = { q, semantic }
    if (doc_type && doc_type !== 'all') p.doc_type = doc_type
    if (sujet_id != null) p.sujet_id = sujet_id
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

  // Dossiers & Sujets
  getWorkspaces: () => request<any>('/api/v1/workspaces-list'),
  createWorkspace: (data: any) => request<any>('/api/v1/workspaces-list', { method: 'POST', body: JSON.stringify(data) }),
  getWorkspaceMembers: (id: number) => request<any>(`/workspaces/${id}/members`),
  addWorkspaceMember: (id: number, user_identifier: string, role: string) =>
    request<any>(`/workspaces/${id}/members`, { method: 'POST', body: JSON.stringify({ user_identifier, role }) }),
  removeWorkspaceMember: (id: number, user_identifier: string) =>
    request<any>(`/workspaces/${id}/members/${encodeURIComponent(user_identifier)}`, { method: 'DELETE' }),
  getSujets: (workspace_id?: number) => {
    const qs = workspace_id !== undefined ? `?workspace_id=${workspace_id}` : ''
    return request<any>(`/api/v1/sujets${qs}`)
  },
  createSujet: (data: any) => request<any>('/api/v1/sujets', { method: 'POST', body: JSON.stringify(data) }),
  getSujet: (id: number) => request<any>(`/api/v1/sujets/${id}`),
  updateSujet: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteSujet: (id: number) => request<any>(`/api/v1/sujets/${id}`, { method: 'DELETE' }),
  deleteWorkspace: (id: number) => request<any>(`/api/v1/workspaces-list/${id}`, { method: 'DELETE' }),
  updateWorkspace: (id: number, data: any) => request<any>(`/api/v1/workspaces-list/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateKnowledgeProfile: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}/knowledge-profile`, { method: 'PATCH', body: JSON.stringify(data) }),
  suggestKnowledgeProfile: (id: number) => request<any>(`/api/v1/sujets/${id}/suggest-profile`, { method: 'POST' }),
  generateQuestionnaire: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}/generate-questionnaire`, { method: 'POST', body: JSON.stringify(data) }),
  recommendAnswer: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}/recommend-answer`, { method: 'POST', body: JSON.stringify(data) }),
  generateFilterConfig: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}/generate-filter`, { method: 'POST', body: JSON.stringify(data) }),
  nextQuestion: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}/next-question`, { method: 'POST', body: JSON.stringify(data) }),
  generateSummary: (id: number, data: any) => request<any>(`/api/v1/sujets/${id}/generate-summary`, { method: 'POST', body: JSON.stringify(data) }),
  decomposeNeeds: (description: string) => request<any>('/api/v1/decompose-needs', { method: 'POST', body: JSON.stringify({ description }) }),
  assignSourceSujet: (source_id: number, sujet_id: number | null) => request<any>(`/api/v1/sources/${source_id}/sujet`, { method: 'PATCH', body: JSON.stringify({ sujet_id }) }),

  // RAG Hygiene alerts
  getHygieneAlerts: (status = 'pending', limit = 20) =>
    request<any>(`/api/v1/hygiene/alerts?status=${status}&limit=${limit}`),
  resolveHygieneAlert: (id: number, status: 'ignored' | 'archived' | 'confirmed') =>
    request<any>(`/api/v1/hygiene/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),

  // RAG
  ragQuery: (query: string, workspace_id?: number) =>
    request<any>('/api/v1/rag/ask', {
      method: 'POST',
      body: JSON.stringify({ query, user_identifier: 'frontend', workspace_id }),
    }),
  rebuildRagIndex: () => request<any>('/api/v1/rag/index-all-items', { method: 'POST' }),
  rebuildRag: () => request<any>('/api/v1/rag/rebuild', { method: 'POST' }),

  // Projets
  listProjects: () => request<any[]>('/api/v1/projects'),
  createProject: (data: any) => request<any>('/api/v1/projects', { method: 'POST', body: JSON.stringify(data) }),
  getProject: (id: number) => request<any>(`/api/v1/projects/${id}`),
  updateProject: (id: number, data: any) => request<any>(`/api/v1/projects/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteProject: (id: number) => request<any>(`/api/v1/projects/${id}`, { method: 'DELETE' }),
  listProjectMembers: (id: number) => request<any[]>(`/api/v1/projects/${id}/members`),
  inviteProjectMember: (id: number, data: any) => request<any>(`/api/v1/projects/${id}/members`, { method: 'POST', body: JSON.stringify(data) }),
  listSourceProposals: (id: number, status?: string) =>
    request<any[]>(`/api/v1/projects/${id}/source-proposals${status ? `?status=${status}` : ''}`),
  proposeSource: (id: number, data: any) =>
    request<any>(`/api/v1/projects/${id}/source-proposals`, { method: 'POST', body: JSON.stringify(data) }),
  reviewProposal: (projectId: number, proposalId: number, data: any) =>
    request<any>(`/api/v1/projects/${projectId}/source-proposals/${proposalId}/review`, { method: 'PATCH', body: JSON.stringify(data) }),
  analyzeCdc: (id: number, cdc_text: string) =>
    request<any>(`/api/v1/projects/${id}/calibration/analyze`, { method: 'POST', body: JSON.stringify({ cdc_text }) }),
  projectCalibrationQuestion: (id: number, data: any) =>
    request<any>(`/api/v1/projects/${id}/calibration/question`, { method: 'POST', body: JSON.stringify(data) }),
  finalizeProjectCalibration: (id: number, data: any) =>
    request<any>(`/api/v1/projects/${id}/calibration/finalize`, { method: 'POST', body: JSON.stringify(data) }),

  // Knowledge Graph
  getKgNodes: () => request<any>('/api/v1/kg/nodes'),
  getKgEdges: () => request<any>('/api/v1/kg/edges'),
  updateKgNode: (id: number, data: any) => request<any>(`/api/v1/kg/nodes/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  rebuildKg: () => request<any>('/api/v1/kg/rebuild', { method: 'POST' }),
}
