// HomeMode - Page d'accueil principale
import { useState } from 'react';
import { useWorkspaces } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { Plus, ArrowRight, Zap } from 'lucide-react';
import { WorkspaceModal } from '../components/WorkspaceModal';

export function HomeMode() {
  const { setActiveWorkspaceId, setActiveMode } = useCockpit();
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const [modalOpen, setModalOpen] = useState(false);

  function enterWorkspace(id: number) {
    setActiveWorkspaceId(id);
    setActiveMode('flux');
  }

  return (
    <div className="h-full overflow-y-auto bg-zinc-950 flex flex-col">

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center pt-20 pb-14 px-8">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-2xl shadow-sky-500/25 mb-6">
          <Zap className="w-7 h-7 text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-bold text-zinc-100 tracking-tight mb-3">VeilleOps</h1>
        <p className="text-zinc-400 text-base text-center max-w-lg leading-relaxed">
          Surveillez, classifiez et transformez vos sources d'information en contenus structurés grâce à l'IA.
        </p>
        <p className="text-zinc-600 text-sm text-center max-w-md mt-1.5">
          Sélectionnez un espace de travail pour commencer, ou créez-en un nouveau.
        </p>
      </div>

      {/* ── Workspaces ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col items-center px-8 pb-16">
        <div className="w-full max-w-2xl">

          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mb-4">
            Espaces de travail
          </h2>

          <div className="flex flex-col gap-2">

            {/* ── Créer un nouvel espace ── */}
            <button
              onClick={() => setModalOpen(true)}
              className="group flex items-center gap-4 px-5 py-4 rounded-xl border border-dashed border-white/[0.10] bg-transparent hover:bg-white/[0.03] hover:border-white/[0.20] transition-all duration-200"
            >
              <div className="w-10 h-10 rounded-lg border border-dashed border-zinc-700 flex items-center justify-center group-hover:border-zinc-500 transition-colors">
                <Plus className="w-4 h-4 text-zinc-600 group-hover:text-zinc-400 transition-colors" strokeWidth={2} />
              </div>
              <span className="text-sm text-zinc-600 group-hover:text-zinc-400 transition-colors font-medium">
                Nouvel espace de travail
              </span>
            </button>

            {/* ── Séparateur ── */}
            {workspaces.length > 0 && (
              <div className="flex items-center gap-3 my-2">
                <div className="flex-1 h-px bg-white/[0.06]" />
                <span className="text-xs text-zinc-700">
                  {workspaces.length} espace{workspaces.length > 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-px bg-white/[0.06]" />
              </div>
            )}

            {/* ── Chargement ── */}
            {isLoading && (
              <div className="text-center py-8 text-zinc-600 text-sm">Chargement...</div>
            )}

            {/* ── Espaces existants ── */}
            {workspaces.map(ws => (
              <button
                key={ws.id}
                onClick={() => enterWorkspace(ws.id)}
                className="group flex items-center gap-4 px-5 py-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05] hover:border-white/[0.12] transition-all duration-200 text-left"
              >
                {/* Icône colorée */}
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shrink-0"
                  style={{ backgroundColor: `${ws.color}22`, color: ws.color }}
                >
                  {ws.name.charAt(0).toUpperCase()}
                </div>

                {/* Infos */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">
                      {ws.name}
                    </span>
                    {ws.domain && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-500 font-medium uppercase tracking-wide">
                        {ws.domain}
                      </span>
                    )}
                  </div>
                  {ws.description && (
                    <p className="text-xs text-zinc-600 mt-0.5 truncate">{ws.description}</p>
                  )}
                </div>

                {/* Flèche */}
                <ArrowRight
                  className="w-4 h-4 text-zinc-700 group-hover:text-zinc-400 group-hover:translate-x-0.5 transition-all shrink-0"
                />
              </button>
            ))}

          </div>
        </div>
      </div>

      <WorkspaceModal isOpen={modalOpen} onClose={() => setModalOpen(false)} initialCreate />
    </div>
  );
}
