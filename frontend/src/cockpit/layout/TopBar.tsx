// TopBar - Barre supérieure
import { useState } from 'react';
import { useGlobalStats, useWorkspaces } from '../../hooks/useApi';
import { Bell, DollarSign, PanelRightOpen, PanelRightClose, ChevronDown, Zap, FileText, BookOpen, MessageSquare, Shield, Rss } from 'lucide-react';
import { UserMenu } from '../components/UserMenu';
import { WorkspaceModal } from '../components/WorkspaceModal';
import { useCockpit, type CockpitMode } from '../context/CockpitContext';

const MODE_META: Record<CockpitMode, { label: string; icon: React.ElementType; color: string }> = {
  flux:       { label: 'Flux',       icon: FileText,      color: 'text-zinc-400' },
  production: { label: 'Contenus',   icon: BookOpen,      color: 'text-indigo-400' },
  assistant:  { label: 'Chat RAG',   icon: MessageSquare, color: 'text-sky-400' },
  controle:   { label: 'Contrôle',   icon: Shield,        color: 'text-amber-400' },
  sources:    { label: 'Sources',    icon: Rss,           color: 'text-emerald-400' },
};

export function TopBar() {
  const { data: stats } = useGlobalStats();
  const { inspectorOpen, setInspectorOpen, selectedItemId, selectedDocId, activeWorkspaceId, activeMode } = useCockpit();
  const { data: workspaces = [] } = useWorkspaces();
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);

  const pendingCount = stats?.pending_items || 0;
  const costToday = stats?.cost_this_month || 0;
  const hasSelection = selectedItemId !== null || selectedDocId !== null;
  const activeWorkspace = workspaces.find(w => w.id === activeWorkspaceId);
  const workspaceName = activeWorkspace?.name || 'Général';
  const workspaceColor = activeWorkspace?.color || '#71717a';
  const modeMeta = MODE_META[activeMode];
  const ModeIcon = modeMeta.icon;

  return (
    <>
      <div className="h-13 bg-zinc-950 border-b border-white/[0.06] flex items-center justify-between px-4 shrink-0" style={{ height: '52px' }}>
        {/* Left: Brand + mode */}
        <div className="flex items-center gap-3">
          {/* App logo */}
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
              <Zap className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-bold text-zinc-100 tracking-tight select-none">Veille IA</span>
          </div>

          {/* Separator */}
          <div className="w-px h-4 bg-white/[0.08]" />

          {/* Current mode pill */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/[0.04] border border-white/[0.06] ${modeMeta.color}`}>
            <ModeIcon className="w-3.5 h-3.5" strokeWidth={1.75} />
            <span className="text-xs font-medium">{modeMeta.label}</span>
          </div>

          {/* Alerts */}
          {pendingCount > 0 && (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 cockpit-indicator-active" />
              {pendingCount} en attente
            </span>
          )}
          <span className="flex items-center gap-1.5 text-zinc-700 text-xs font-mono">
            <DollarSign className="w-3 h-3" />
            {costToday.toFixed(4)}
          </span>
        </div>

        {/* Right */}
        <div className="flex items-center gap-1.5">
          {/* Workspace Selector - prominent */}
          <button
            onClick={() => setWorkspaceModalOpen(true)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl border-2 transition-all hover:brightness-110"
            style={{
              borderColor: `${workspaceColor}60`,
              backgroundColor: `${workspaceColor}18`,
            }}
          >
            <div
              className="w-5 h-5 rounded-lg flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: workspaceColor }}
            >
              {workspaceName.charAt(0).toUpperCase()}
            </div>
            <span className="text-sm font-semibold max-w-[150px] truncate" style={{ color: workspaceColor }}>
              {workspaceName}
            </span>
            <ChevronDown className="w-3.5 h-3.5 shrink-0" style={{ color: `${workspaceColor}90` }} />
          </button>

          {hasSelection && (
            <button
              onClick={() => setInspectorOpen(!inspectorOpen)}
              className={`p-2 rounded-lg transition-all duration-200 ${
                inspectorOpen
                  ? 'bg-sky-500/12 text-sky-400'
                  : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]'
              }`}
              title={inspectorOpen ? "Fermer l'inspecteur" : "Ouvrir l'inspecteur"}
            >
              {inspectorOpen
                ? <PanelRightClose className="w-4 h-4" />
                : <PanelRightOpen className="w-4 h-4" />}
            </button>
          )}

          <button className="p-2 text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] rounded-lg transition-all duration-200 relative">
            <Bell className="w-4 h-4" strokeWidth={1.5} />
            {pendingCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-1 h-1 bg-amber-400 rounded-full" />
            )}
          </button>

          <UserMenu />
        </div>
      </div>

      <WorkspaceModal isOpen={workspaceModalOpen} onClose={() => setWorkspaceModalOpen(false)} />
    </>
  );
}
