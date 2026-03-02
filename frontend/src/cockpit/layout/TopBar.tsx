// TopBar - Barre supérieure
import { useGlobalStats } from '../../hooks/useApi';
import { Bell, DollarSign, PanelRightOpen, PanelRightClose } from 'lucide-react';
import { UserMenu } from '../components/UserMenu';
import { useCockpit } from '../context/CockpitContext';

export function TopBar() {
  const { data: stats } = useGlobalStats();
  const { inspectorOpen, setInspectorOpen, selectedItemId, selectedDocId } = useCockpit();

  const pendingCount = stats?.pending_items || 0;
  const costToday = stats?.cost_this_month || 0;
  const hasSelection = selectedItemId !== null || selectedDocId !== null;

  return (
    <div className="h-12 bg-zinc-950 border-b border-white/[0.06] flex items-center justify-between px-4 shrink-0">
      {/* Left: Quick stats */}
      <div className="flex items-center gap-3">
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
        <div className="px-2.5 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-xs font-medium text-zinc-500">
          Général
        </div>

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
  );
}

