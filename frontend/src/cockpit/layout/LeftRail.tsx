// LeftRail - Navigation par modes
import { useCockpit, type CockpitMode } from '../context/CockpitContext';
import { FileText, BookOpen, MessageSquare, Rss, BarChart2, Home } from 'lucide-react';

interface ModeConfig {
  id: CockpitMode;
  icon: typeof FileText;
  label: string;
}

const MODES: ModeConfig[] = [
  { id: 'flux', icon: FileText, label: 'Flux' },
  { id: 'production', icon: BookOpen, label: 'Contenu' },
  { id: 'assistant', icon: MessageSquare, label: 'Chat RAG' },
  { id: 'sources', icon: Rss, label: 'Sources' },
];

interface LeftRailProps {}

export function LeftRail({}: LeftRailProps) {
  const { activeMode, setActiveMode } = useCockpit();

  return (
    <div className="w-14 bg-zinc-950 border-r border-white/[0.06] flex flex-col items-center py-4 gap-1 shrink-0">
      {/* Home button */}
      <button
        onClick={() => setActiveMode('home')}
        className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 mb-2 ${
          activeMode === 'home'
            ? 'bg-sky-500/12 text-sky-400'
            : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]'
        }`}
        title="Accueil"
      >
        {activeMode === 'home' && (
          <div className="absolute -left-[1px] top-2.5 bottom-2.5 w-0.5 rounded-r-full bg-sky-500" />
        )}
        <Home className="w-[18px] h-[18px]" strokeWidth={activeMode === 'home' ? 2 : 1.5} />
        <div className="absolute left-12 px-2.5 py-1.5 bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 z-50 shadow-xl">
          Accueil
        </div>
      </button>

      {/* Séparateur */}
      <div className="w-6 h-px bg-white/[0.06] mb-1" />

      {/* Mode Icons */}
      {MODES.map((mode) => {
        const Icon = mode.icon;
        const isActive = activeMode === mode.id;
        return (
          <button
            key={mode.id}
            onClick={() => setActiveMode(mode.id)}
            className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
              isActive
                ? 'bg-sky-500/12 text-sky-400'
                : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]'
            }`}
            title={mode.label}
          >
            {isActive && (
              <div className="absolute -left-[1px] top-2.5 bottom-2.5 w-0.5 rounded-r-full bg-sky-500" />
            )}
            <Icon className="w-[18px] h-[18px]" strokeWidth={isActive ? 2 : 1.5} />
            <div className="absolute left-12 px-2.5 py-1.5 bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 z-50 shadow-xl">
              {mode.label}
            </div>
          </button>
        );
      })}

      <div className="flex-1" />

      {/* Dashboard button - always visible with violet accent */}
      <button
        onClick={() => setActiveMode('dashboard')}
        className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 mb-2 ${
          activeMode === 'dashboard'
            ? 'bg-violet-500/20 text-violet-300 shadow-lg shadow-violet-500/20'
            : 'bg-violet-500/10 text-violet-500 hover:bg-violet-500/20 hover:text-violet-300'
        }`}
        title="Tableau de bord analytique"
      >
        <div className="absolute -left-[1px] top-2.5 bottom-2.5 w-0.5 rounded-r-full bg-violet-500" />
        <BarChart2 className="w-[18px] h-[18px]" strokeWidth={activeMode === 'dashboard' ? 2 : 1.75} />
        <div className="absolute left-12 px-2.5 py-1.5 bg-zinc-800 border border-white/[0.08] text-zinc-200 text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity duration-150 z-50 shadow-xl">
          Tableau de bord
        </div>
      </button>
    </div>
  );
}

