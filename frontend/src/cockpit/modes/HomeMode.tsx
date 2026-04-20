// HomeMode - Split Screen asymétrique — redesigned (DESIGN_VARIANCE:8)
// LEFT 42%: Brand + pipeline teaser + live stats
// RIGHT 58%: Workspace cards avec spotlight effect + stagger entrance
import { useRef, useState } from 'react';
import { useWorkspaces, useGlobalStats } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { Plus, ArrowRight, Zap, Layers } from 'lucide-react';
import { WorkspaceModal } from '../components/WorkspaceModal';

// ── Spotlight workspace card ───────────────────────────────────────────────────
function WorkspaceCard({ ws, index, onClick }: {
  ws: any; index: number; onClick: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);

  const onMouseMove = (e: React.MouseEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    ref.current?.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
    ref.current?.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
  };

  return (
    <button
      ref={ref}
      onMouseMove={onMouseMove}
      onClick={onClick}
      className="ws-card ws-card-enter group w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.06] bg-zinc-900/40 hover:border-white/[0.12] text-left transition-colors duration-150"
      style={{ '--i': index } as React.CSSProperties}
    >
      {/* Avatar */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 transition-transform duration-200 group-hover:scale-105"
        style={{
          backgroundColor: `${ws.color ?? '#0ea5e9'}1a`,
          color: ws.color ?? '#0ea5e9',
          border: `1px solid ${ws.color ?? '#0ea5e9'}30`,
        }}
      >
        {ws.name?.charAt(0)?.toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 text-left">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors truncate">
            {ws.name}
          </p>
          {ws.domain && (
            <span
              className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
              style={{
                backgroundColor: `${ws.color ?? '#0ea5e9'}15`,
                color: ws.color ?? '#0ea5e9',
              }}
            >
              {ws.domain}
            </span>
          )}
        </div>
        {ws.description && (
          <p className="text-xs text-zinc-600 mt-0.5 truncate">{ws.description}</p>
        )}
      </div>

      <ArrowRight
        className="w-3.5 h-3.5 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all shrink-0"
      />
    </button>
  );
}

// ── Stat block ─────────────────────────────────────────────────────────────────
function StatBlock({ value, label, color }: {
  value: string | number; label: string; color: string;
}) {
  return (
    <div className="flex flex-col">
      <span
        className="text-3xl font-bold font-mono tracking-tight tabular-nums leading-none"
        style={{ color }}
      >
        {value}
      </span>
      <span className="text-[10px] text-zinc-600 uppercase tracking-wider mt-1.5">
        {label}
      </span>
    </div>
  );
}

// ── Pipeline stage decorative ──────────────────────────────────────────────────
const STAGES = [
  { label: 'Collecte',   color: '#0ea5e9' },
  { label: 'Tri IA',     color: '#6366f1' },
  { label: 'Génération', color: '#10b981' },
  { label: 'Validation', color: '#f59e0b' },
  { label: 'Publication',color: '#0ea5e9' },
];

// ── HomeMode ───────────────────────────────────────────────────────────────────
export function HomeMode() {
  const { setActiveWorkspaceId, setActiveMode } = useCockpit();
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const { data: stats } = useGlobalStats();
  const [modalOpen, setModalOpen] = useState(false);

  function enterWorkspace(id: number) {
    setActiveWorkspaceId(id);
    setActiveMode('flux');
  }

  return (
    <div
      className="h-full overflow-hidden"
      style={{ display: 'grid', gridTemplateColumns: '42% 58%' }}
    >

      {/* ── LEFT: Brand panel ─────────────────────────────────────────────── */}
      <div className="border-r border-white/[0.05] flex flex-col justify-between p-10 overflow-y-auto">

        <div>
          {/* Logo */}
          <div className="flex items-center gap-3 mb-10">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-2xl shadow-sky-500/25">
              <Zap className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
          </div>

          {/* Headline — left aligned, NOT centered */}
          <h1 className="text-[3.25rem] font-bold tracking-tight leading-[1.07] text-zinc-100 mb-1">
            Veille<span className="text-sky-500">Ops</span>
          </h1>
          <p className="text-base font-semibold text-zinc-400 tracking-tight mb-6">
            Technologique · Pilotée par l'IA
          </p>

          <p className="text-sm text-zinc-500 leading-relaxed max-w-[300px] mb-10">
            Pipeline IA end-to-end : collecte des sources, classification
            automatique et génération de contenus structurés.
          </p>

          {/* Pipeline stages — decorative */}
          <div className="flex items-center flex-wrap gap-0 mb-10">
            {STAGES.map((s, i) => (
              <div key={s.label} className="flex items-center">
                <div className="flex flex-col items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: s.color, boxShadow: `0 0 6px ${s.color}50` }}
                  />
                  <span className="text-[9px] text-zinc-700 whitespace-nowrap">{s.label}</span>
                </div>
                {i < STAGES.length - 1 && (
                  <div
                    className="w-6 h-px mb-4 mx-0.5"
                    style={{
                      background: `linear-gradient(90deg, ${s.color}35, ${STAGES[i + 1].color}35)`,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Live stats strip — bottom of left panel */}
        {stats ? (
          <div className="grid grid-cols-3 divide-x divide-white/[0.06] pt-6 border-t border-white/[0.06]">
            <StatBlock
              value={(stats.total_items ?? 0).toLocaleString('fr-FR')}
              label="Items"
              color="#0ea5e9"
            />
            <div className="pl-4">
              <StatBlock
                value={stats.classified_items ?? 0}
                label="Classifiés"
                color="#6366f1"
              />
            </div>
            <div className="pl-4">
              <StatBlock
                value={stats.published_courses ?? 0}
                label="Publiés"
                color="#10b981"
              />
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-3 divide-x divide-white/[0.06] pt-6 border-t border-white/[0.06] gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-8 rounded shimmer-box w-16" />
                <div className="h-2.5 rounded shimmer-box w-10" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT: Workspace panel ─────────────────────────────────────────── */}
      <div className="flex flex-col overflow-hidden">

        {/* Right header */}
        <div className="flex items-center justify-between px-10 pt-10 pb-6 shrink-0 border-b border-white/[0.04]">
          <div>
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest">
              Espaces de travail
            </h2>
            {workspaces.length > 0 && (
              <p className="text-[11px] text-zinc-700 mt-0.5">
                {workspaces.length} espace{workspaces.length > 1 ? 's' : ''} configuré
                {workspaces.length > 1 ? 's' : ''}
              </p>
            )}
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-medium hover:bg-sky-500/15 transition-colors"
          >
            <Plus className="w-3 h-3" strokeWidth={2} />
            Nouveau
          </button>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto px-10 py-6 space-y-2">

          {/* Skeletons while loading */}
          {isLoading && (
            <>
              {[1, 2, 3].map(i => (
                <div key={i} className="h-[70px] rounded-xl shimmer-box" />
              ))}
            </>
          )}

          {/* Empty state */}
          {!isLoading && workspaces.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 py-16">
              <div className="w-14 h-14 rounded-2xl border border-dashed border-white/[0.10] flex items-center justify-center">
                <Layers className="w-6 h-6 text-zinc-700" strokeWidth={1} />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-zinc-500">Aucun espace de travail</p>
                <p className="text-xs text-zinc-700 mt-1 max-w-[220px]">
                  Créez votre premier espace pour lancer la collecte de veille.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/15 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                Créer un espace
              </button>
            </div>
          )}

          {/* Workspace cards */}
          {workspaces.map((ws: any, i: number) => (
            <WorkspaceCard
              key={ws.id}
              ws={ws}
              index={i}
              onClick={() => enterWorkspace(ws.id)}
            />
          ))}
        </div>
      </div>

      <WorkspaceModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialCreate
      />
    </div>
  );
}
