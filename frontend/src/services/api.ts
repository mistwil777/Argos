import axios from 'axios';
import type { Item, Course, RAGResult, Stats, Decision, TopicStat, TimelineData, CostData } from '../types';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Stats API
export const statsApi = {
  getGlobal: async (): Promise<Stats> => {
    const { data } = await apiClient.get('/api/v1/stats/global');
    return data;
  },
  
  getTimeline: async (days: number = 7): Promise<TimelineData[]> => {
    const { data } = await apiClient.get(`/api/v1/stats/timeline?days=${days}`);
    return data;
  },
  
  getTopics: async (limit: number = 10): Promise<TopicStat[]> => {
    const { data } = await apiClient.get(`/api/v1/stats/topics?limit=${limit}`);
    return data;
  },
  
  getCosts: async (period: string = 'month'): Promise<CostData[]> => {
    const { data } = await apiClient.get(`/api/v1/stats/costs?period=${period}`);
    return data;
  },
};

// Items API
export const itemsApi = {
  list: async (params?: { page?: number; limit?: number; status?: string; source?: string }): Promise<{ items: Item[]; total: number }> => {
    const { data } = await apiClient.get('/api/v1/items', { params });
    return data;
  },
  
  get: async (id: number): Promise<Item> => {
    const { data } = await apiClient.get(`/api/v1/items/${id}`);
    return data;
  },
  
  classify: async (id: number): Promise<Item> => {
    const { data } = await apiClient.post(`/api/v1/items/${id}/classify`);
    return data;
  },
  
  classifyBatch: async (ids: number[]): Promise<any> => {
    const { data } = await apiClient.post('/api/v1/items/batch/classify', { item_ids: ids });
    return data;
  },
  
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/v1/items/${id}`);
  },
};

// Courses API
export const coursesApi = {
  list: async (params?: { page?: number; limit?: number; status?: string; topic?: string }): Promise<{ courses: Course[]; total: number }> => {
    const { data } = await apiClient.get('/api/v1/courses', { params });
    return data;
  },
  
  get: async (id: number): Promise<Course> => {
    const { data } = await apiClient.get(`/api/v1/courses/${id}`);
    return data;
  },
  
  getContent: async (id: number): Promise<any> => {
    const { data } = await apiClient.get(`/api/v1/courses/${id}/content`);
    return data;
  },
  
  publish: async (id: number): Promise<Course> => {
    const { data } = await apiClient.post(`/api/v1/courses/${id}/publish`);
    return data;
  },
  
  regenerate: async (id: number): Promise<Course> => {
    const { data } = await apiClient.post(`/api/v1/courses/${id}/regenerate`);
    return data;
  },
  
  updateStatus: async (id: number, status: string): Promise<Course> => {
    const { data } = await apiClient.patch(`/api/v1/courses/${id}/status`, { status });
    return data;
  },
  
  generate: async (itemId: number, durationMinutes: number = 180): Promise<{ 
    course_id: number; 
    status: string; 
    tokens_used: number; 
    cost: number; 
    content_length: number;
    rag_enabled?: boolean;
    rag_sources_count?: number;
    updated?: boolean;
  }> => {
    const { data } = await apiClient.post('/api/v1/courses/generate', { 
      item_id: itemId,
      duration_minutes: durationMinutes
    });
    return data;
  },
  
  modify: async (id: number, instruction: string): Promise<{ message: string; tokens_used: number; cost: number }> => {
    const { data } = await apiClient.post(`/api/v1/courses/${id}/modify`, { instruction });
    return data;
  },
  
  delete: async (id: number): Promise<{ message: string }> => {
    const { data } = await apiClient.delete(`/api/v1/courses/${id}`);
    return data;
  },
  
  validate: async (id: number): Promise<{ message: string; status: string }> => {
    const { data } = await apiClient.patch(`/api/v1/courses/${id}/validate`);
    return data;
  },
  
  exportMarkdown: async (id: number): Promise<Blob> => {
    const response = await apiClient.get(`/api/v1/courses/${id}/export/markdown`, {
      responseType: 'blob'
    });
    return response.data;
  },
  
  exportPDF: async (id: number): Promise<Blob> => {
    const response = await apiClient.get(`/api/v1/courses/${id}/export/pdf`, {
      responseType: 'blob'
    });
    return response.data;
  },
};

// RAG API
export const ragApi = {
  ask: async (query: string, useHybridSearch: boolean = true): Promise<RAGResult> => {
    const { data } = await apiClient.post('/api/v1/rag/ask', { 
      query,
      use_hybrid_search: useHybridSearch 
    });
    return data;
  },
  
  search: async (query: string, limit: number = 5): Promise<any> => {
    const { data } = await apiClient.post('/api/v1/rag/search', { query, limit });
    return data;
  },
  
  feedback: async (queryId: string, positive: boolean): Promise<void> => {
    await apiClient.post('/api/v1/rag/feedback', { query_id: queryId, positive });
  },
  
  history: async (limit: number = 50): Promise<any[]> => {
    const { data } = await apiClient.get(`/api/v1/rag/history?limit=${limit}`);
    return data;
  },

  clearHistory: async (): Promise<{ message: string; deleted: number }> => {
    const { data } = await apiClient.delete('/api/v1/rag/history');
    return data;
  },
};

// Workspaces API (no /api/v1 prefix)
export interface WorkspaceResponse {
  id: number;
  name: string;
  slug: string;
  description?: string;
  domain?: string;
  icon: string;
  color: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  stats?: Record<string, unknown>;
}

export interface WorkspaceCreate {
  name: string;
  description?: string;
  domain?: string;
  icon?: string;
  color?: string;
}

export const workspacesApi = {
  list: async (): Promise<WorkspaceResponse[]> => {
    const { data } = await apiClient.get('/workspaces');
    return data;
  },
  create: async (payload: WorkspaceCreate): Promise<WorkspaceResponse> => {
    const { data } = await apiClient.post('/workspaces', payload);
    return data;
  },
  update: async (id: number, payload: Partial<WorkspaceCreate>): Promise<WorkspaceResponse> => {
    const { data } = await apiClient.patch(`/workspaces/${id}`, payload);
    return data;
  },
  delete: async (id: number): Promise<void> => {
    await apiClient.delete(`/workspaces/${id}`);
  },
};

// HITL API
export const hitlApi = {
  getPending: async (): Promise<{ items: Item[]; courses: Course[] }> => {
    const { data } = await apiClient.get('/api/v1/hitl/pending');
    return data;
  },
  
  getDecisions: async (params?: { page?: number; limit?: number }): Promise<{ decisions: Decision[]; total: number }> => {
    const { data } = await apiClient.get('/api/v1/hitl/decisions', { params });
    return data;
  },
  
  decide: async (_type: string, id: number, decision: string): Promise<void> => {
    await apiClient.post('/api/v1/hitl/decide', { item_id: id, decision });
  },
  
  botStatus: async (): Promise<{ running: boolean; mode?: string }> => {
    const { data } = await apiClient.get('/api/v1/hitl/bot/status');
    return data;
  },
  
  startBot: async (): Promise<void> => {
    await apiClient.post('/api/v1/hitl/bot/start');
  },
  
  stopBot: async (): Promise<void> => {
    await apiClient.post('/api/v1/hitl/bot/stop');
  },
};

export default apiClient;
