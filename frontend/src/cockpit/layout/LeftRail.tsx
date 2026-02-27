// LeftRail - Navigation par modes (icônes + tooltips)
import { useCockpit, type CockpitMode } from '../context/CockpitContext';
import { FileText, BookOpen, MessageSquare, Shield, Command } from 'lucide-react';

interface ModeConfig {
  id: CockpitMode;
  icon: typeof FileText;
  label: string;
  badge?: number;
}

const MODES: ModeConfig[] = [
  { id: 'flux', icon: FileText, label: 'Flux' },
  { id: 'production', icon: BookOpen, label: 'Production' },
  { id: 'assistant', icon: MessageSquare, label: 'Assistant' },
  { id: 'controle', icon: Shield, label: 'Contrôle' },
];

interface LeftRailProps {
  onOpenCommandPalette: () => void;
}

export function LeftRail({ onOpenCommandPalette }: LeftRailProps) {
  const { activeMode, setActiveMode } = useCockpit();

  return (
    <div className="w-16 bg-gray-900 flex flex-col items-center py-4 space-y-2">
      {/* Logo */}
      <div className="mb-6">
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
          VO
        </div>
      </div>

      {/* Mode Icons */}
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = activeMode === mode.id;

        return (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className={`
              group relative w-12 h-12 rounded-xl flex items-center justify-center
              transition-all duration-200
              ${isActive
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/50'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }
            `}
            title={mode.label}
          >
            <Icon className="w-5 h-5" />
            
            {/* Tooltip */}
            <div className="absolute left-16 px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              {mode.label}
              <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-gray-800 rotate-45"></div>
            </div>

            {/* Badge pour notifications */}
            {mode.badge && (
              <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {mode.badge}
              </div>
            )}
          </button>
        );
      })}

      {/* Spacer */}
      <div className="flex-1" />

      {/* Command Palette trigger - HIGHLY VISIBLE */}
      <button
        onClick={onOpenCommandPalette}
        className="relative w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-600/30 to-purple-600/30 border-2 border-blue-500/50 hover:border-blue-400 transition-all hover:scale-110 group shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
        title="Command Palette (⌘K)"
      >
        <Command className="w-6 h-6 text-blue-300 group-hover:text-blue-100 transition-colors drop-shadow-lg" />
        
        {/* Pulse animation ring */}
        <div className="absolute inset-0 rounded-xl border-2 border-blue-400 animate-ping opacity-20" />
        
        {/* Tooltip */}
        <div className="absolute left-16 px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50 font-semibold shadow-xl">
          ⌘K
          <div className="absolute left-0 top-1/2 -translate-x-1 -translate-y-1/2 w-2 h-2 bg-blue-600 rotate-45"></div>
        </div>
      </button>
    </div>
  );
}
