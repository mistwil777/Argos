// BottomTray - Barre inférieure pour jobs, alertes, coûts
import { DollarSign, CheckCircle, XCircle, Activity } from 'lucide-react';
import { useGlobalStats } from '../../hooks/useApi';

export function BottomTray() {
  const { data: stats } = useGlobalStats();

  const sourcesTotal = 15; // TODO: get from API
  const sourcesError = 2;  // TODO: get from API
  const jobsActive = 0;    // TODO: get from API
  const costToday = stats?.cost_this_month || 0;

  return (
    <div className="h-12 bg-gray-900 text-white flex items-center justify-between px-6 border-t border-gray-800">
      {/* Left: System status */}
      <div className="flex items-center space-x-6">
        <button className="flex items-center space-x-2 hover:bg-gray-800 px-3 py-1.5 rounded-lg transition-colors group">
          <CheckCircle className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">Sources actives</span>
          <span className="text-xs bg-gray-800 group-hover:bg-gray-700 px-2 py-0.5 rounded-full font-bold">{sourcesTotal}</span>
        </button>
        
        {sourcesError > 0 && (
          <button className="flex items-center space-x-2 hover:bg-red-900/20 px-3 py-1.5 rounded-lg transition-colors group">
            <XCircle className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium">Sources en erreur</span>
            <span className="text-xs bg-red-900/40 group-hover:bg-red-900/60 px-2 py-0.5 rounded-full font-bold">{sourcesError}</span>
          </button>
        )}
        
        {jobsActive > 0 && (
          <button className="flex items-center space-x-2 hover:bg-blue-900/20 px-3 py-1.5 rounded-lg transition-colors group">
            <Activity className="w-4 h-4 text-blue-400 animate-pulse" />
            <span className="text-sm font-medium">Jobs actifs</span>
            <span className="text-xs bg-blue-900/40 group-hover:bg-blue-900/60 px-2 py-0.5 rounded-full font-bold">{jobsActive}</span>
          </button>
        )}
      </div>

      {/* Right: Cost */}
      <div className="flex items-center space-x-2 text-gray-400">
        <DollarSign className="w-4 h-4" />
        <span className="text-sm font-medium">${costToday.toFixed(2)}</span>
        <span className="text-xs">today</span>
      </div>
    </div>
  );


}
