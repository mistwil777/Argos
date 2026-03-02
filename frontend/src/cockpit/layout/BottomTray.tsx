// BottomTray - Barre de statut système
import { CheckCircle, XCircle, Activity, DollarSign } from 'lucide-react';
import { useGlobalStats } from '../../hooks/useApi';

export function BottomTray() {
  const { data: stats } = useGlobalStats();

  const sourcesTotal = 15;
  const sourcesError = 2;
  const jobsActive = 0;
  const costToday = stats?.cost_this_month || 0;

  return (
    <div className="h-9 bg-zinc-950 border-t border-white/[0.06] flex items-center justify-between px-5 shrink-0">
      <div className="flex items-center gap-5">
        <span className="flex items-center gap-1.5 text-xs text-zinc-700">
          <CheckCircle className="w-3 h-3 text-emerald-600" />
          <span className="font-mono">{sourcesTotal}</span>
          <span>sources</span>
        </span>

        {sourcesError > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-red-600/70">
            <XCircle className="w-3 h-3" />
            <span className="font-mono">{sourcesError}</span>
            <span>erreurs</span>
          </span>
        )}

        {jobsActive > 0 && (
          <span className="flex items-center gap-1.5 text-xs text-sky-600/70">
            <Activity className="w-3 h-3 animate-pulse" />
            <span className="font-mono">{jobsActive}</span>
            <span>jobs</span>
          </span>
        )}
      </div>

      <span className="flex items-center gap-0.5 text-xs text-zinc-800 font-mono">
        <DollarSign className="w-3 h-3" />
        {costToday.toFixed(4)}
      </span>
    </div>
  );
}

