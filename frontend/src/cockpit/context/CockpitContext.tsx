// Context global du cockpit - gère le mode actif, workspace, layout, etc.
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type CockpitMode = 'flux' | 'production' | 'assistant' | 'sources';
export type LayoutMode = 'focus' | 'split' | 'review';

// Helpers for localStorage persistence
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
