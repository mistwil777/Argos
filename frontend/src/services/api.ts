const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000'

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
  const resp = await fetch(`${BASE}/rpc`, {
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

  // Items
  getItems: (params: Record<string, any> = {}) => {
    const qs = new URLSearchParams(params as any).toString()
    return request<any>(`/api/v1/items?${qs}`)
  },

  // Sources
  getSources: () => request<any>('/api/v1/sources'),
  addSource: (body: any) => request<any>('/api/v1/sources', { method: 'POST', body: JSON.stringify(body) }),
  toggleSource: (id: number) => request<any>(`/api/v1/sources/${id}/toggle`, { method: 'PATCH' }),
  deleteSource: (id: number) => request<any>(`/api/v1/sources/${id}`, { method: 'DELETE' }),

  // Web tools (via MCP JSON-RPC)
  browse: (url: string, params?: any) => rpc('web.browse', { url, ...params }),
  search: (query: string, engine = 'duckduckgo', max_results = 10) =>
    rpc('web.search', { query, engine, max_results }),
  digest: (url: string, params?: any) => rpc('web.digest', { url, save_item: true, ...params }),
  watchUrl: (params: any) => rpc('web.watch', params),
  watchedPages: () => rpc('web.watched_pages', {}),

  // RAG
  ragQuery: (query: string, workspace_id?: number) =>
    request<any>('/api/v1/rag/ask', {
      method: 'POST',
      body: JSON.stringify({ query, user_identifier: 'frontend', workspace_id }),
    }),
  rebuildRagIndex: () => request<any>('/api/v1/rag/index-all-courses', { method: 'POST' }),
}
