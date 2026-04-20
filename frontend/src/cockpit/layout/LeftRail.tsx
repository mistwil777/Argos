// LeftRail - Dock de navigation — redesigned (icon + label, DESIGN_VARIANCE:8)
import { useCockpit, type CockpitMode } from '../context/CockpitContext';
import { FileText, BookOpen, MessageSquare, Rss, BarChart2, Home, Zap } from 'lucide-react';

interface NavItem {
  id: CockpitMode;
  icon: React.ElementType;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'home',       icon: Home,          label: 'Accueil'   },
  { id: 'sources',    icon: Rss,           label: 'Sources'   },
  { id: 'flux',       icon: FileText,      label: 'Flux'      },
  { id: 'production', icon: BookOpen,      label: 'Contenu'   },
  { id: 'assistant',  icon: MessageSquare, label: 'Assistant' },
  { id: 'dashboard',  icon: BarChart2,     label: 'Analyse'   },
];

export function LeftRail() {
  const { activeMode, setActiveMode } = useCockpit();

  return (
    <nav className="w-[72px] shrink-0 bg-zinc-950 border-r border-white/[0.05] flex flex-col items-center pt-3 pb-4">

      {/* App mark */}
      <button
        onClick={() => setActiveMode('home')}
        className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center mb-4 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30 transition-shadow shrink-0"
        title="VeilleOps"
      >
        <Zap className="w-4 h-4 text-white" strokeWidth={2.5} />
      </button>

      <div className="w-8 h-px bg-white/[0.05] mb-2 shrink-0" />

      {/* Nav items */}
      <div className="flex flex-col w-full gap-0.5 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeMode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActiveMode(item.id)}
              className={`
                relative flex flex-col items-center gap-1 w-full py-2.5 px-1
                transition-colors duration-150 group
                ${isActive ? 'text-sky-400' : 'text-zinc-600 hover:text-zinc-300'}
              `}
            >
              {/* Left active bar */}
              <div
                className={`
                  absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full
                  transition-all duration-200
                  ${isActive ? 'bg-sky-500 opacity-100' : 'opacity-0'}
                `}
              />

              {/* Icon container */}
              <div
                className={`
                  w-9 h-9 rounded-xl flex items-center justify-center
                  transition-all duration-150
                  ${isActive ? 'bg-sky-500/12' : 'group-hover:bg-white/[0.04]'}
                `}
              >
                <Icon
                  className="w-[17px] h-[17px]"
                  strokeWidth={isActive ? 2 : 1.5}
                />
              </div>

              {/* Label */}
              <span
                className={`
                  text-[9px] font-medium tracking-wide leading-none
                  transition-colors duration-150
                  ${isActive ? 'text-sky-400' : 'text-zinc-700 group-hover:text-zinc-500'}
                `}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
