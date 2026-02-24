import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { statsApi, itemsApi, coursesApi, ragApi, hitlApi } from '../services/api';

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
export const useItems = (params?: any) => {
  return useQuery({
    queryKey: ['items', params],
    queryFn: () => itemsApi.list(params),
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

// Courses hooks
export const useCourses = (params?: any) => {
  return useQuery({
    queryKey: ['courses', params],
    queryFn: () => coursesApi.list(params),
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
    mutationFn: ({ itemId, durationMinutes }: { itemId: number; durationMinutes?: number }) => 
      coursesApi.generate(itemId, durationMinutes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['courses'] });
      queryClient.invalidateQueries({ queryKey: ['items'] });
      queryClient.invalidateQueries({ queryKey: ['stats'] });
    },
  });
};

// RAG hooks
export const useRAGAsk = () => {
  return useMutation({
    mutationFn: ({ query, useHybridSearch }: { query: string; useHybridSearch?: boolean }) => 
      ragApi.ask(query, useHybridSearch),
  });
};

export const useRAGHistory = (limit: number = 50) => {
  return useQuery({
    queryKey: ['rag', 'history', limit],
    queryFn: () => ragApi.history(limit),
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
