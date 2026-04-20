// HomeMode - Split Screen asymétrique — redesigned v2 (gradient bg, full-height)
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
      className="ws-card ws-card-enter group w-full flex items-center gap-4 p-4 rounded-xl border border-white/[0.10] bg-zinc-800/50 hover:border-white/[0.18] text-left transition-colors duration-150"
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
          <p className="text-sm font-semibold text-zinc-100 group-hover:text-white transition-colors truncate">
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
          <p className="text-xs text-zinc-500 mt-0.5 truncate">{ws.description}</p>
        )}
      </div>

        <ArrowRight
        className="w-3.5 h-3.5 text-zinc-600 group-hover:text-zinc-300 group-hover:translate-x-0.5 transition-all shrink-0"
      />
    </button>
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
      className="h-full overflow-hidden relative"
      style={{ display: 'grid', gridTemplateColumns: '44% 56%' }}
    >
      {/* ── Decorative gradient blobs ────────────────────────────────────── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* Top-left sky glow */}
        <div
          className="absolute -top-60 -left-40 w-[900px] h-[750px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.14) 0%, transparent 65%)' }}
        />
        {/* Bottom-right indigo glow */}
        <div
          className="absolute -bottom-60 right-0 w-[1000px] h-[800px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.11) 0%, transparent 65%)' }}
        />
        {/* Center emerald whisper */}
        <div
          className="absolute top-1/4 right-1/3 w-[600px] h-[500px] rounded-full"
          style={{ background: 'radial-gradient(circle, rgba(16,185,129,0.07) 0%, transparent 65%)' }}
        />
      </div>

      {/* ── LEFT: Brand panel ─────────────────────────────────────────────── */}
<div className="relative border-r border-white/[0.08] flex flex-col justify-between pl-20 pr-12 py-12 overflow-y-auto">

        <div className="flex flex-col gap-10">
          {/* Logo + brand */}
          <div>
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-sky-700 flex items-center justify-center shadow-2xl shadow-sky-500/30 mb-8">
              <Zap className="w-7 h-7 text-white" strokeWidth={2.5} />
            </div>
            <h1 className="text-[3.5rem] font-bold tracking-tight leading-[1.05] text-zinc-100 mb-2">
              Veille<span className="text-sky-500">Ops</span>
            </h1>
            <p className="text-base font-semibold text-zinc-400 tracking-tight mb-5">
              Votre radar IA pour ne rien manquer
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed max-w-[320px]">
              VeilleOps surveille le web à votre place, trie les contenus
              importants par l'IA, et les transforme en synthèses et cours
              prêts à l'emploi.
            </p>
          </div>

          {/* Pipeline stages */}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-4">Pipeline</p>
            <div className="flex flex-col gap-3">
              {STAGES.map((s, i) => (
                <div key={s.label} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold"
                    style={{
                      backgroundColor: `${s.color}18`,
                      color: s.color,
                      border: `1px solid ${s.color}30`,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-200">{s.label}</span>
                      <div
                        className="h-px flex-1 rounded"
                        style={{ background: `linear-gradient(90deg, ${s.color}30, transparent)` }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Live stats strip */}
        {stats ? (
          <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/[0.10]">
            {[
              { value: (stats.total_items ?? 0).toLocaleString('fr-FR'), label: 'Items', color: '#0ea5e9' },
              { value: stats.classified_items ?? 0, label: 'Classifiés', color: '#6366f1' },
              { value: stats.published_courses ?? 0, label: 'Publiés', color: '#10b981' },
            ].map(({ value, label, color }) => (
              <div
                key={label}
                className="rounded-xl px-4 py-3"
                style={{ background: `${color}12`, border: `1px solid ${color}28` }}
              >
                <span className="text-2xl font-bold font-mono tracking-tight tabular-nums leading-none block" style={{ color }}>
                  {value}
                </span>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider mt-1.5 block">{label}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4 pt-8 border-t border-white/[0.10]">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl p-4 space-y-2 shimmer-box h-[72px]" />
            ))}
          </div>
        )}
      </div>

      {/* ── RIGHT: Workspace panel ─────────────────────────────────────────── */}
      <div className="relative flex flex-col overflow-hidden">

        {/* Right header */}
        <div className="flex items-end justify-between px-12 pt-12 pb-7 shrink-0 border-b border-white/[0.04]">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-600 mb-1">
              Espaces de travail
            </p>
            <h2 className="text-2xl font-bold text-zinc-100 tracking-tight">
              {workspaces.length > 0
                ? `${workspaces.length} espace${workspaces.length > 1 ? 's' : ''} configuré${workspaces.length > 1 ? 's' : ''}`
                : 'Démarrer'}
            </h2>
          </div>
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/15 transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" strokeWidth={2} />
            Nouveau
          </button>
        </div>

        {/* Card list */}
        <div className="flex-1 overflow-y-auto px-12 py-6 space-y-2.5">

          {isLoading && (
            <>{[1, 2, 3].map(i => <div key={i} className="h-[72px] rounded-xl shimmer-box" />)}</>
          )}

          {!isLoading && workspaces.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-5 py-20">
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: 'radial-gradient(circle, rgba(14,165,233,0.08) 0%, transparent 70%)', border: '1px dashed rgba(14,165,233,0.25)' }}
              >
                <Layers className="w-7 h-7 text-zinc-600" strokeWidth={1} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-zinc-400">Aucun espace de travail</p>
                <p className="text-xs text-zinc-600 mt-1.5 max-w-[240px]">
                  Créez votre premier espace pour lancer la collecte de veille IA.
                </p>
              </div>
              <button
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-sm font-medium hover:bg-sky-500/15 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" strokeWidth={2} />
                Créer un espace
              </button>
            </div>
          )}

          {workspaces.map((ws: any, i: number) => (
            <WorkspaceCard key={ws.id} ws={ws} index={i} onClick={() => enterWorkspace(ws.id)} />
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

