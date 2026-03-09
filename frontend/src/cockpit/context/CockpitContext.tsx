// Context global du cockpit - gère le mode actif, workspace, layout, etc.
import { createContext, useContext, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { coursesApi } from '../../services/api';

export type CockpitMode = 'flux' | 'production' | 'assistant' | 'sources';
export type LayoutMode = 'focus' | 'split' | 'review';

// ── Generation queue ──────────────────────────────────────────────────────
export interface GenerationTask {
  id: string;          // unique id for dedup (itemId + contentType)
  itemId: number;
  contentType: string;
  durationMinutes: number;
  label: string;       // human-readable label for the UI
}

// ── Helpers for localStorage persistence ──────────────────────────────────
const LS_WORKSPACE = 'cockpit_workspace';
const LS_MODE = 'cockpit_mode';

function loadWorkspaceId(): number | null {
  try {
    const v = localStorage.getItem(LS_WORKSPACE);
    return v ? parseInt(v, 10) : null;
  } catch { return null; }
}
function loadMode(): CockpitMode {
  try {
    const v = localStorage.getItem(LS_MODE) as CockpitMode;
    return ['flux', 'production', 'assistant', 'sources'].includes(v) ? v : 'flux';
  } catch { return 'flux'; }
}

interface CockpitState {
  // Mode actif
  activeMode: CockpitMode;
  setActiveMode: (mode: CockpitMode) => void;
  
  // Layout
  layoutMode: LayoutMode;
  setLayoutMode: (layout: LayoutMode) => void;
  
  // Workspace actif
  activeWorkspaceId: number | null;
  setActiveWorkspaceId: (id: number | null) => void;
  
  // Inspector
  inspectorOpen: boolean;
  setInspectorOpen: (open: boolean) => void;
  
  // Sélection active
  selectedItemId: number | null;
  setSelectedItemId: (id: number | null) => void;
  
  selectedDocId: number | null;
  setSelectedDocId: (id: number | null) => void;

  // Navigation source
  selectedSourceUrl: string | null;
  setSelectedSourceUrl: (url: string | null) => void;

  // Generation queue (persists across mode changes)
  enqueueGenerations: (tasks: GenerationTask[]) => void;
  activeGeneration: GenerationTask | null;
  pendingGenerations: GenerationTask[];
}

const CockpitContext = createContext<CockpitState | null>(null);

export function CockpitProvider({ children }: { children: ReactNode }) {
  const [activeMode, _setActiveMode] = useState<CockpitMode>(loadMode);
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('focus');
  const [activeWorkspaceId, _setActiveWorkspaceId] = useState<number | null>(loadWorkspaceId);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string | null>(null);

  const queryClient = useQueryClient();

  // ── Generation queue ────────────────────────────────────────────────────
  // The queue is stored in a ref so the async processor always reads the
  // latest values without needing to close over stale state.
  const queueRef = useRef<GenerationTask[]>([]);
  const processingRef = useRef(false);
  const [pendingGenerations, setPendingGenerations] = useState<GenerationTask[]>([]);
  const [activeGeneration, setActiveGeneration] = useState<GenerationTask | null>(null);

  const startProcessing = async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const task = queueRef.current[0];
      setActiveGeneration(task);
      try {
        await coursesApi.generate(task.itemId, task.durationMinutes, task.contentType);
        queryClient.invalidateQueries({ queryKey: ['courses'] });
        queryClient.invalidateQueries({ queryKey: ['stats'] });
      } catch {
        // Swallow error — continue with next task
      }
      queueRef.current = queueRef.current.filter(t => t.id !== task.id);
      setPendingGenerations([...queueRef.current]);
    }

    setActiveGeneration(null);
    processingRef.current = false;
  };

  const enqueueGenerations = (tasks: GenerationTask[]) => {
    const existingIds = new Set([
      ...queueRef.current.map(t => t.id),
      ...(activeGeneration ? [activeGeneration.id] : []),
    ]);
    const fresh = tasks.filter(t => !existingIds.has(t.id));
    if (fresh.length === 0) return;
    queueRef.current = [...queueRef.current, ...fresh];
    setPendingGenerations([...queueRef.current]);
    startProcessing();
  };

  // Persisted setters
  const setActiveMode = (mode: CockpitMode) => {
    _setActiveMode(mode);
    try { localStorage.setItem(LS_MODE, mode); } catch { /* ignore */ }
  };
  const setActiveWorkspaceId = (id: number | null) => {
    _setActiveWorkspaceId(id);
    try {
      if (id !== null) localStorage.setItem(LS_WORKSPACE, String(id));
      else localStorage.removeItem(LS_WORKSPACE);
    } catch { /* ignore */ }
  };

  const value: CockpitState = {
    activeMode,
    setActiveMode,
    layoutMode,
    setLayoutMode,
    activeWorkspaceId,
    setActiveWorkspaceId,
    inspectorOpen,
    setInspectorOpen,
    selectedItemId,
    setSelectedItemId,
    selectedDocId,
    setSelectedDocId,
    selectedSourceUrl,
    setSelectedSourceUrl,
    enqueueGenerations,
    activeGeneration,
    pendingGenerations,
  };

  return (
    <CockpitContext.Provider value={value}>
      {children}
    </CockpitContext.Provider>
  );
}

export function useCockpit() {
  const context = useContext(CockpitContext);
  if (!context) {
    throw new Error('useCockpit must be used within CockpitProvider');
  }
  return context;
}
