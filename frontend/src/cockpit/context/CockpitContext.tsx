// Context global du cockpit - gère le mode actif, workspace, layout, etc.
import { createContext, useContext, useState } from 'react';
import type { ReactNode } from 'react';

export type CockpitMode = 'flux' | 'production' | 'assistant' | 'sources';
export type LayoutMode = 'focus' | 'split' | 'review';

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
  const [activeMode, setActiveMode] = useState<CockpitMode>('flux');
  const [layoutMode, setLayoutMode] = useState<LayoutMode>('focus');
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<number | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [selectedDocId, setSelectedDocId] = useState<number | null>(null);
  const [selectedSourceUrl, setSelectedSourceUrl] = useState<string | null>(null);

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
