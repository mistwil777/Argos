import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { statsApi, itemsApi, coursesApi, ragApi, hitlApi, workspacesApi, sourcesApi } from '../services/api';
import type { WorkspaceCreate, SourceCreate } from '../services/api';

// Stats hooks
export const useGlobalStats = () => {
  return useQuery({
    queryKey: ['stats', 'global'],
    queryFn: statsApi.getGlobal,
    refetchInterval: 30000, // Refetch every 30s
  });
};

export const useTimelineStats = (days: number = 7) => {
  return useQuery({
    queryKey: ['stats', 'timeline', days],
    queryFn: () => statsApi.getTimeline(days),
  });
};

export const useTopicsStats = (limit: number = 10) => {
  return useQuery({
    queryKey: ['stats', 'topics', limit],
    queryFn: () => statsApi.getTopics(limit),
  });
};

export const useCostsStats = (period: string = 'month') => {
  return useQuery({
    queryKey: ['stats', 'costs', period],
    queryFn: () => statsApi.getCosts(period),
  });
};

// Items hooks
export const useItems = (params?: any, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => itemsApi.list(params),
    enabled: options?.enabled ?? true,
  });
};

export const useItem = (id: number) => {
  return useQuery({
    queryKey: ['items', id],
    queryFn: () => itemsApi.get(id),
    enabled: !!id,
  });
};

export const useClassifyItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => itemsApi.classify(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useClassifyBatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (ids: number[]) => itemsApi.classifyBatch(ids),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useDeleteItem = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => itemsApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

export const useBatchAssignWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemIds, workspaceId }: { itemIds: number[]; workspaceId: number }) =>
      itemsApi.batchAssignWorkspace(itemIds, workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
    },
  });
};

// Courses hooks
export const useCourses = (params?: any, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['courses', params],
    queryFn: () => coursesApi.list(params),
    staleTime: 10000,
    enabled: options?.enabled ?? true,
  });
};

export const useCourse = (id: number | null) => {
  return useQuery({
    queryKey: ['courses', id],
    queryFn: () => coursesApi.get(id!),
    enabled: !!id,
  });
};

export const useCourseContent = (id: number) => {
  return useQuery({
    queryKey: ['courses', id, 'content'],
    queryFn: () => coursesApi.getContent(id),
    enabled: !!id,
  });
};

export const usePublishCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => coursesApi.publish(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useUpdateCourseStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) => 
      coursesApi.updateStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useGenerateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ itemId, durationMinutes, contentType }: { itemId: number; durationMinutes?: number; contentType?: string }) => 
      coursesApi.generate(itemId, durationMinutes, contentType),
    onSuccess: () => {
      // Only invalidate, let React Query handle refetching naturally
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useModifyCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, instruction }: { id: number; instruction: string }) => 
      coursesApi.modify(id, instruction),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['courses', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useDeleteCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => coursesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useValidateCourse = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => coursesApi.validate(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['courses', id] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useExportCourse = () => {
  return useMutation({
    mutationFn: async ({ id, format }: { id: number; format: 'markdown' | 'pdf' }) => {
      const blob = format === 'markdown' 
        ? await coursesApi.exportMarkdown(id)
        : await coursesApi.exportPDF(id);
      
      // Download file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `course_${id}.${format === 'markdown' ? 'md' : 'html'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });
};


// RAG hooks
export const useRAGAsk = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ query, useHybridSearch }: { query: string; useHybridSearch?: boolean }) => 
      ragApi.ask(query, useHybridSearch),
    onSuccess: () => {
      // Invalidate and refetch history immediately
      queryClient.invalidateQueries({ queryKey: ['rag', 'history'] });
      queryClient.refetchQueries({ queryKey: ['rag', 'history'] });
    },
  });
};

export const useRAGHistory = (limit: number = 50) => {
  return useQuery({
    queryKey: ['rag', 'history', limit],
    queryFn: () => ragApi.history(limit),
  });
};

export const useClearRAGHistory = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => ragApi.clearHistory(),
    onSuccess: () => {
      // Invalidate and refetch history to show empty state
      queryClient.invalidateQueries({ queryKey: ['rag', 'history'] });
      queryClient.refetchQueries({ queryKey: ['rag', 'history'] });
    },
  });
};

// HITL hooks
export const usePendingDecisions = () => {
  return useQuery({
    queryKey: ['hitl', 'pending'],
    queryFn: hitlApi.getPending,
    refetchInterval: 60000, // Refetch every minute
  });
};

export const useDecisionsHistory = (params?: any) => {
  return useQuery({
    queryKey: ['hitl', 'decisions', params],
    queryFn: () => hitlApi.getDecisions(params),
  });
};

export const useMakeDecision = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, decision }: { type: string; id: number; decision: string }) => 
      hitlApi.decide(type, id, decision),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hitl'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['courses'] });
    },
  });
};

export const useBotStatus = () => {
  return useQuery({
    queryKey: ['hitl', 'bot', 'status'],
    queryFn: hitlApi.botStatus,
    refetchInterval: 10000, // Refetch every 10s
  });
};

// Workspace hooks
export const useWorkspaces = () => {
  return useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  });
};

export const useCreateWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: WorkspaceCreate) => workspacesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
};

export const useDeleteWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => workspacesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });
};

// Sources hooks
export const useSources = (params?: { type?: string; category?: string; active?: boolean; workspace_id?: number }, options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ['sources', params],
    queryFn: () => sourcesApi.list(params),
    enabled: options?.enabled ?? true,
  });
};

export const useCreateSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: SourceCreate) => sourcesApi.create(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });
};

export const useToggleSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) => sourcesApi.toggle(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
    },
  });
};

export const useCollectSource = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => sourcesApi.collect(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

export const useCollectWorkspace = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspaceId: number) => sourcesApi.collectWorkspace(workspaceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};
