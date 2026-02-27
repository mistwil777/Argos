// BottomTray - Barre inférieure pour jobs, alertes, coûts
import { Loader2, AlertTriangle, DollarSign } from 'lucide-react';
import { useState } from 'react';

interface Job {
  id: string;
  type: 'classification' | 'generation' | 'rag';
  label: string;
  progress: number;
  total: number;
}

export function BottomTray() {
  // TODO: Récupérer les jobs actifs via un hook
  const [jobs] = useState<Job[]>([]);  // TODO: connect to real jobs API
  const [alerts] = useState<Array<{ id: string; message: string }>>([]); // TODO: connect to alerts

  const hasActiveJobs = jobs.length > 0;
  const hasAlerts = alerts.length > 0;

  // Si rien à afficher, barre compacte
  if (!hasActiveJobs && !hasAlerts) {
    return (
      <div className="h-10 bg-gray-900 text-gray-400 flex items-center justify-between px-4 text-xs">
        <div className="flex items-center space-x-4">
          <span>Ready</span>
        </div>
        <div className="flex items-center space-x-2">
          <DollarSign className="w-3 h-3" />
          <span>$0.42 today</span>
        </div>
      </div>
    );
  }

  // Barre étendue avec jobs/alertes
  return (
    <div className="bg-gray-900 text-white">
      {/* Jobs actifs */}
      {hasActiveJobs && (
        <div className="border-b border-gray-800">
          {jobs.map((job) => (
            <div key={job.id} className="px-4 py-2 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                <span className="text-sm">{job.label}</span>
                <span className="text-xs text-gray-400">
                  {job.progress}/{job.total}
                </span>
              </div>
              <div className="w-32 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 transition-all duration-300"
                  style={{ width: `${(job.progress / job.total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Alertes */}
      {hasAlerts && (
        <div className="border-b border-gray-800">
          {alerts.map((alert) => (
            <div key={alert.id} className="px-4 py-2 flex items-center space-x-3 bg-orange-900/20">
              <AlertTriangle className="w-4 h-4 text-orange-400" />
              <span className="text-sm">{alert.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
