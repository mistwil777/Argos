// TopBar - Header slim 48px — redesigned (breadcrumb, workspace pill, no gradient)
import { useState } from 'react';
import { useGlobalStats, useWorkspaces } from '../../hooks/useApi';
import {
  Bell, PanelRightOpen, PanelRightClose, ChevronDown,
  Zap, FileText, BookOpen, MessageSquare, Rss, Loader2, BarChart2, Home, Terminal,
} from 'lucide-react';
import { UserMenu } from '../components/UserMenu';
import { WorkspaceModal } from '../components/WorkspaceModal';
import { useCockpit, type CockpitMode } from '../context/CockpitContext';

const MODE_META: Record<CockpitMode, { label: string; icon: React.ElementType }> = {
  home:       { label: 'Accueil',   icon: Home          },
  flux:       { label: 'Flux',      icon: FileText      },
  production: { label: 'Contenus',  icon: BookOpen      },
  assistant:  { label: 'Assistant', icon: MessageSquare },
  sources:    { label: 'Sources',   icon: Rss           },
  dashboard:  { label: 'Analyse',   icon: BarChart2     },
  devops:     { label: 'DevOps',    icon: Terminal      },
};

export function TopBar() {
  const { data: stats } = useGlobalStats();
  const {
    inspectorOpen, setInspectorOpen,
    selectedItemId, selectedDocId,
    activeWorkspaceId, activeMode, setActiveMode,
    activeGeneration, pendingGenerations,
  } = useCockpit();

  const { data: workspaces = [] } = useWorkspaces();
  const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);

  const totalQueued = pendingGenerations.length + (activeGeneration ? 1 : 0);
  const pendingCount = stats?.pending_items || 0;
  const costToday = stats?.cost_today ?? 0;
  const hasSelection = selectedItemId !== null || selectedDocId !== null;

  const activeWorkspace = workspaces.find((w: any) => w.id === activeWorkspaceId);
  const workspaceName  = activeWorkspace?.name  || 'Aucun espace';
  const workspaceColor = activeWorkspace?.color || '#52525b';

  const modeMeta = MODE_META[activeMode];
  const ModeIcon = modeMeta.icon;

  return (
    <>
      <div className="h-12 flex items-center gap-2.5 px-4 shrink-0 border-b border-white/[0.08] bg-zinc-900">

        {/* Brand */}
        <button
          onClick={() => setActiveMode('home')}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity shrink-0"
        >
          <div className="w-5 h-5 rounded-md bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center">
            <Zap className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
          </div>
          <span className="text-xs font-semibold text-zinc-300 tracking-tight">VeilleOps</span>
        </button>

        <span className="text-zinc-800 text-xs select-none">/</span>

        {/* Mode breadcrumb */}
        <div className="flex items-center gap-1.5 text-zinc-600">
          <ModeIcon className="w-3 h-3" strokeWidth={1.5} />
          <span className="text-xs">{modeMeta.label}</span>
        </div>

        {/* Generation badge */}
        {activeGeneration && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/20 text-sky-400 text-[11px]">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            <span>{activeGeneration.label}</span>
            {totalQueued > 1 && (
              <span className="text-sky-600">+{pendingGenerations.length}</span>
            )}
          </div>
        )}

        {/* Pending alert */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px]">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 cockpit-indicator-active" />
            {pendingCount} en attente
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Workspace selector */}
        <button
          onClick={() => setWorkspaceModalOpen(true)}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border transition-all duration-150 hover:brightness-110 text-xs"
          style={{
            borderColor: `${workspaceColor}40`,
            backgroundColor: `${workspaceColor}10`,
          }}
        >
          {activeWorkspace && (
            <div
              className="w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] font-bold text-white shrink-0"
              style={{ backgroundColor: workspaceColor }}
            >
              {workspaceName.charAt(0).toUpperCase()}
            </div>
          )}
          <span
            className="font-medium truncate max-w-[130px]"
            style={{ color: activeWorkspace ? workspaceColor : '#71717a' }}
          >
            {workspaceName}
          </span>
          <ChevronDown className="w-3 h-3 text-zinc-700 shrink-0" />
        </button>

        {/* Cost → dashboard */}
        <button
          onClick={() => setActiveMode('dashboard')}
          className="text-[11px] font-mono text-zinc-700 hover:text-emerald-400 transition-colors px-1.5 py-0.5 rounded hover:bg-emerald-500/8"
          title="Voir le tableau de bord"
        >
          ${costToday.toFixed(4)}
        </button>

        {/* Inspector toggle */}
        {hasSelection && (
          <button
            onClick={() => setInspectorOpen(!inspectorOpen)}
            className={`p-1.5 rounded-lg transition-all ${
              inspectorOpen
                ? 'bg-sky-500/12 text-sky-400'
                : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04]'
            }`}
            title={inspectorOpen ? "Fermer l'inspecteur" : "Ouvrir l'inspecteur"}
          >
            {inspectorOpen
              ? <PanelRightClose className="w-3.5 h-3.5" />
              : <PanelRightOpen  className="w-3.5 h-3.5" />}
          </button>
        )}

        {/* Bell */}
        <button className="relative p-1.5 text-zinc-700 hover:text-zinc-300 hover:bg-white/[0.04] rounded-lg transition-all">
          <Bell className="w-3.5 h-3.5" strokeWidth={1.5} />
          {pendingCount > 0 && (
            <span className="absolute top-1 right-1 w-1 h-1 bg-amber-400 rounded-full" />
          )}
        </button>

        <UserMenu />
      </div>

      <WorkspaceModal
        isOpen={workspaceModalOpen}
        onClose={() => setWorkspaceModalOpen(false)}
      />
    </>
  );
}
