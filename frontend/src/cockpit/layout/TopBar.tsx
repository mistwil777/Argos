// TopBar - Barre supérieure avec stats, workspace selector, user
import { useGlobalStats } from '../../hooks/useApi';
import { Bell, DollarSign, Clock } from 'lucide-react';
import { UserMenu } from '../components/UserMenu';

export function TopBar() {
  const { data: stats } = useGlobalStats();
  // const { activeWorkspaceId } = useCockpit(); // TODO: implement workspace selector

  const pendingCount = stats?.pending_items || 0;
  const costToday = stats?.cost_this_month || 0;

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4">
      {/* Left: Stats rapides */}
      <div className="flex items-center space-x-4 text-sm">
        {pendingCount > 0 && (
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-orange-50 text-orange-700 rounded-lg">
            <Clock className="w-4 h-4" />
            <span className="font-medium">{pendingCount} pending</span>
          </div>
        )}

        <div className="flex items-center space-x-2 text-gray-600">
          <DollarSign className="w-4 h-4" />
          <span>${costToday.toFixed(2)} today</span>
        </div>
      </div>

      {/* Right: User section */}
      <div className="flex items-center space-x-3">
        {/* Workspace Selector - Disabled for now */}
        <div className="flex items-center space-x-2 px-3 py-1.5 bg-blue-950/30 rounded-lg border border-blue-700/30">
          <span className="text-sm font-medium text-blue-300">Général</span>
        </div>

        {/* Notifications */}
        <button className="p-2 hover:bg-blue-900/20 rounded-lg transition-colors relative">
          <Bell className="w-5 h-5 text-blue-300" />
          {pendingCount > 0 && (
            <div className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full cockpit-indicator-active"></div>
          )}
        </button>

        {/* User Menu */}
        <UserMenu />
      </div>
    </div>
  );
}
