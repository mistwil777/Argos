// WorkspaceModal - Gestion et création des espaces de travail
import { useState } from 'react';
import { useWorkspaces, useCreateWorkspace, useDeleteWorkspace } from '../../hooks/useApi';
import { X, Plus, Trash2, Layers, Check } from 'lucide-react';
import { useCockpit } from '../context/CockpitContext';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const DOMAIN_OPTIONS = [
  { value: 'general', label: 'Général' },
  { value: 'tech', label: 'Technologie' },
  { value: 'legal', label: 'Juridique' },
  { value: 'finance', label: 'Finance' },
  { value: 'research', label: 'Recherche' },
];

const COLOR_OPTIONS = [
  '#0ea5e9', // sky
  '#8b5cf6', // violet
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#6366f1', // indigo
  '#14b8a6', // teal
];

export function WorkspaceModal({ isOpen, onClose }: WorkspaceModalProps) {
  const { activeWorkspaceId, setActiveWorkspaceId } = useCockpit();
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const createMutation = useCreateWorkspace();
  const deleteMutation = useDeleteWorkspace();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    domain: 'general',
    color: '#0ea5e9',
  });

  const handleCreate = () => {
    if (!form.name.trim()) return;
    createMutation.mutate(
      { name: form.name, description: form.description, domain: form.domain, color: form.color, icon: 'layers' },
      {
        onSuccess: (newWs: any) => {
          // Auto-select the newly created workspace
          if (newWs?.id) setActiveWorkspaceId(newWs.id);
          setForm({ name: '', description: '', domain: 'general', color: '#0ea5e9' });
          setShowCreate(false);
          onClose();
        },
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 w-full max-w-lg flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <Layers className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
            <h2 className="text-sm font-semibold text-zinc-200">Espaces de travail</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Workspace List */}
        <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="w-5 h-5 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
            </div>
          ) : workspaces.length === 0 && !showCreate ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Layers className="w-8 h-8 text-zinc-800" strokeWidth={1.5} />
              <p className="text-xs text-zinc-700">Aucun espace de travail</p>
              <button
                onClick={() => setShowCreate(true)}
                className="cockpit-btn cockpit-btn-primary"
              >
                <Plus className="w-4 h-4" />
                <span>Créer un espace</span>
              </button>
            </div>
          ) : (
            workspaces.map((ws) => {
              const isActive = activeWorkspaceId === ws.id;
              return (
                <div
                  key={ws.id}
                  onClick={() => { setActiveWorkspaceId(ws.id); onClose(); }}
                  className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-sky-500/8 border-sky-500/25'
                      : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06] hover:border-white/[0.1]'
                  }`}
                >
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${ws.color}20`, border: `1px solid ${ws.color}40` }}
                  >
                    <Layers className="w-4 h-4" style={{ color: ws.color }} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{ws.name}</p>
                    {ws.description && (
                      <p className="text-xs text-zinc-600 truncate mt-0.5">{ws.description}</p>
                    )}
                    {ws.domain && (
                      <span className="inline-block mt-1 px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[10px] text-zinc-600">
                        {ws.domain}
                      </span>
                    )}
                  </div>
                  {isActive && <Check className="w-4 h-4 text-sky-400 shrink-0" />}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteMutation.mutate(ws.id);
                    }}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-700 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })
          )}

          {/* Create Form */}
          {showCreate && (
            <div className="p-4 bg-white/[0.02] rounded-xl border border-white/[0.06] flex flex-col gap-3 mt-1">
              <h3 className="text-xs font-semibold text-zinc-400">Nouvel espace</h3>

              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Nom de l'espace *"
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              />

              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Description (optionnel)"
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              />

              <select
                value={form.domain}
                onChange={(e) => setForm({ ...form, domain: e.target.value })}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              >
                {DOMAIN_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value} className="bg-zinc-900">{label}</option>
                ))}
              </select>

              <div>
                <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Couleur</p>
                <div className="flex gap-2 flex-wrap">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setForm({ ...form, color })}
                      className={`w-6 h-6 rounded-full transition-transform ${form.color === color ? 'scale-125 ring-2 ring-white/30' : 'hover:scale-110'}`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 cockpit-btn"
                >
                  Annuler
                </button>
                <button
                  onClick={handleCreate}
                  disabled={!form.name.trim() || createMutation.isPending}
                  className="flex-1 cockpit-btn cockpit-btn-primary"
                >
                  {createMutation.isPending ? 'Création...' : 'Créer'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {!showCreate && workspaces.length > 0 && (
          <div className="px-4 pb-4 shrink-0">
            <button
              onClick={() => setShowCreate(true)}
              className="w-full cockpit-btn"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvel espace</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
