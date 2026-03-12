// WorkspaceModal - Gestion et création des espaces de travail
import { useState } from 'react';
import { useWorkspaces, useCreateWorkspace, useDeleteWorkspace, useCreateSource, useWorkspaceMembers, useAddMember, useRemoveMember } from '../../hooks/useApi';
import { X, Plus, Trash2, Layers, Check, Rss, Globe, ArrowRight, Loader2, Users, ChevronLeft } from 'lucide-react';
import { useCockpit } from '../context/CockpitContext';

interface WorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialCreate?: boolean;
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

interface SuggestedSource {
  name: string;
  url: string;
  type: 'rss' | 'website' | 'github';
  category: string;
  description: string;
}

const DOMAIN_SOURCES: Record<string, SuggestedSource[]> = {
  general: [
    { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', type: 'rss', category: 'Tech', description: 'Actualités tech et startups' },
    { name: 'Le Monde Numérique', url: 'https://www.lemonde.fr/pixels/rss_full.xml', type: 'rss', category: 'Actualités', description: 'Actualités numériques Le Monde' },
  ],
  tech: [
    { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', type: 'rss', category: 'Tech', description: 'Actualités tech et startups' },
    { name: 'InfoQ', url: 'https://feed.infoq.com/', type: 'rss', category: 'Tech', description: 'Architecture, DevOps, développement' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', category: 'Tech', description: 'Technologie grand public' },
    { name: 'GitHub Blog', url: 'https://github.blog/feed/', type: 'rss', category: 'Dev', description: 'Blog officiel GitHub' },
  ],
  research: [
    { name: 'Arxiv CS.AI', url: 'https://rss.arxiv.org/rss/cs.AI', type: 'rss', category: 'IA', description: 'Papiers de recherche en IA' },
    { name: 'Arxiv CS.LG', url: 'https://rss.arxiv.org/rss/cs.LG', type: 'rss', category: 'ML', description: 'Machine Learning - Arxiv' },
    { name: 'Papers With Code', url: 'https://paperswithcode.com/latest.xml', type: 'rss', category: 'ML', description: 'Nouveaux papiers avec code source' },
    { name: 'Distill.pub', url: 'https://distill.pub/rss.xml', type: 'rss', category: 'IA', description: 'Articles pédagogiques sur le ML' },
  ],
  legal: [
    { name: 'Légifrance', url: 'https://www.legifrance.gouv.fr/rss/listesJO.xml', type: 'rss', category: 'Droit', description: 'Journal officiel français' },
    { name: 'Dalloz Actualité', url: 'https://www.dalloz-actualite.fr/rss.xml', type: 'rss', category: 'Droit', description: 'Actualité juridique Dalloz' },
    { name: 'EUR-Lex', url: 'https://eur-lex.europa.eu/tools/rss/?type=recent&year=recent&lang=fr', type: 'rss', category: 'Droit UE', description: 'Droit de l\'Union européenne' },
  ],
  finance: [
    { name: 'Les Echos', url: 'https://www.lesechos.fr/rss/rss_une.xml', type: 'rss', category: 'Finance', description: 'Actualités économiques et financières' },
    { name: 'BFM Bourse', url: 'https://www.bfmtv.com/rss/bfm-bourse/', type: 'rss', category: 'Marchés', description: 'Marchés boursiers' },
    { name: 'Moneyvox', url: 'https://www.moneyvox.fr/rss/news.xml', type: 'rss', category: 'Finance perso', description: 'Finance personnelle' },
  ],
};

function getSuggestedSources(domain: string): SuggestedSource[] {
  return DOMAIN_SOURCES[domain] ?? DOMAIN_SOURCES['general'];
}

export function WorkspaceModal({ isOpen, onClose, initialCreate = false }: WorkspaceModalProps) {
  const { activeWorkspaceId, setActiveWorkspaceId } = useCockpit();
  const { data: workspaces = [], isLoading } = useWorkspaces();
  const createMutation = useCreateWorkspace();
  const deleteMutation = useDeleteWorkspace();
  const createSourceMutation = useCreateSource();

  const [showCreate, setShowCreate] = useState(initialCreate);
  // step 1 = fill workspace form; step 2 = pick suggested sources
  const [step, setStep] = useState<1 | 2>(1);
  const [newWorkspaceId, setNewWorkspaceId] = useState<number | null>(null);
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [customUrl, setCustomUrl] = useState('');
  const [sourcesCreating, setSourcesCreating] = useState(false);

  const [managingMembersWsId, setManagingMembersWsId] = useState<number | null>(null);
  const [newMemberForm, setNewMemberForm] = useState({ user_identifier: '', role: 'viewer' as 'viewer' | 'editor' | 'owner' | 'admin' });
  const { data: members = [], isLoading: membersLoading } = useWorkspaceMembers(managingMembersWsId);
  const addMemberMutation = useAddMember();
  const removeMemberMutation = useRemoveMember();

  const managingWorkspace = workspaces.find(w => w.id === managingMembersWsId);

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
          if (newWs?.id) {
            setActiveWorkspaceId(newWs.id);
            setNewWorkspaceId(newWs.id);
          }
          // Move to step 2 to suggest sources
          const suggestions = getSuggestedSources(form.domain);
          setSelectedSources(new Set(suggestions.map((_, i) => i)));
          setStep(2);
        },
      }
    );
  };

  const handleFinishSources = async () => {
    if (!newWorkspaceId) { onClose(); return; }
    const suggestions = getSuggestedSources(form.domain);
    const toCreate: SuggestedSource[] = [...selectedSources].map(i => suggestions[i]).filter(Boolean);
    if (customUrl.trim()) {
      toCreate.push({ name: customUrl.trim(), url: customUrl.trim(), type: 'website', category: form.domain, description: '' });
    }
    if (toCreate.length === 0) { resetAndClose(); return; }

    setSourcesCreating(true);
    for (const src of toCreate) {
      await createSourceMutation.mutateAsync({
        name: src.name,
        url: src.url,
        type: src.type,
        category: src.category,
        description: src.description,
        workspace_id: newWorkspaceId,
        active: true,
      }).catch(() => {/* ignore individual source errors */});
    }
    setSourcesCreating(false);
    resetAndClose();
  };

  const resetAndClose = () => {
    setForm({ name: '', description: '', domain: 'general', color: '#0ea5e9' });
    setShowCreate(false);
    setStep(1);
    setNewWorkspaceId(null);
    setSelectedSources(new Set());
    setCustomUrl('');
    setManagingMembersWsId(null);
    onClose();
  };

  const toggleSource = (i: number) => {
    setSelectedSources(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  if (!isOpen) return null;

  // ── Members panel ──────────────────────────────────────────────────────────
  if (managingMembersWsId !== null) {
    const handleAddMember = () => {
      if (!newMemberForm.user_identifier.trim()) return;
      addMemberMutation.mutate(
        { workspaceId: managingMembersWsId, payload: newMemberForm },
        { onSuccess: () => setNewMemberForm({ user_identifier: '', role: 'viewer' }) }
      );
    };

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 w-full max-w-lg flex flex-col max-h-[80vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5">
              <button
                onClick={() => setManagingMembersWsId(null)}
                className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-500 hover:text-zinc-300"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Users className="w-4 h-4 text-violet-400" strokeWidth={1.5} />
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Membres</h2>
                <p className="text-[10px] text-zinc-600">{managingWorkspace?.name}</p>
              </div>
            </div>
            <button onClick={resetAndClose} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Member list */}
          <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-2">
            {membersLoading ? (
              <div className="flex items-center justify-center py-6">
                <div className="w-5 h-5 rounded-full border-2 border-white/[0.06] border-t-violet-500 animate-spin" />
              </div>
            ) : members.length === 0 ? (
              <p className="text-center text-xs text-zinc-700 py-6">Aucun membre ajouté</p>
            ) : (
              members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 p-3 bg-white/[0.02] border border-white/[0.06] rounded-xl">
                  <div className="w-7 h-7 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                    <span className="text-[10px] font-semibold text-violet-400 uppercase">
                      {m.user_identifier.slice(0, 2)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-zinc-200 truncate">{m.user_identifier}</p>
                    <span className="text-[10px] text-zinc-600 capitalize">{m.role}</span>
                  </div>
                  <button
                    onClick={() => removeMemberMutation.mutate({ workspaceId: managingMembersWsId, userIdentifier: m.user_identifier })}
                    disabled={removeMemberMutation.isPending}
                    className="p-1.5 rounded-lg hover:bg-red-500/10 text-zinc-700 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Add member form */}
          <div className="px-4 pb-4 pt-3 border-t border-white/[0.06] shrink-0 flex flex-col gap-2.5">
            <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">Ajouter un membre</p>
            <div className="flex gap-2">
              <input
                type="email"
                value={newMemberForm.user_identifier}
                onChange={e => setNewMemberForm(f => ({ ...f, user_identifier: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleAddMember()}
                placeholder="Email ou identifiant…"
                className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              />
              <select
                value={newMemberForm.role}
                onChange={e => setNewMemberForm(f => ({ ...f, role: e.target.value as typeof f.role }))}
                className="px-2 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-zinc-300 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
              >
                <option value="viewer" className="bg-zinc-900">Lecture</option>
                <option value="editor" className="bg-zinc-900">Éditeur</option>
                <option value="admin" className="bg-zinc-900">Admin</option>
                <option value="owner" className="bg-zinc-900">Propriétaire</option>
              </select>
              <button
                onClick={handleAddMember}
                disabled={!newMemberForm.user_identifier.trim() || addMemberMutation.isPending}
                className="px-3 py-2 cockpit-btn cockpit-btn-primary shrink-0"
              >
                {addMemberMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: Source suggestions ──────────────────────────────────────────────
  if (step === 2) {
    const suggestions = getSuggestedSources(form.domain);
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
        <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 w-full max-w-lg flex flex-col max-h-[85vh]">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06] shrink-0">
            <div className="flex items-center gap-2.5">
              <Rss className="w-4 h-4 text-emerald-400" strokeWidth={1.5} />
              <div>
                <h2 className="text-sm font-semibold text-zinc-200">Ajouter des sources</h2>
                <p className="text-[10px] text-zinc-600">Sources suggérées pour « {form.name} »</p>
              </div>
            </div>
            <button onClick={resetAndClose} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Source list */}
          <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-2">
            {suggestions.map((src, i) => {
              const checked = selectedSources.has(i);
              return (
                <div
                  key={i}
                  onClick={() => toggleSource(i)}
                  className={`flex items-start gap-3 p-3 rounded-xl cursor-pointer border transition-all ${
                    checked
                      ? 'bg-sky-500/[0.06] border-sky-500/25'
                      : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSource(i)}
                    className="mt-0.5 w-3.5 h-3.5 accent-sky-500 cursor-pointer shrink-0"
                    onClick={e => e.stopPropagation()}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-zinc-200">{src.name}</span>
                      <span className="px-1.5 py-0.5 bg-white/[0.04] border border-white/[0.06] rounded text-[10px] text-zinc-600 uppercase tracking-wide">{src.type}</span>
                    </div>
                    {src.description && <p className="text-[10px] text-zinc-600 mt-0.5">{src.description}</p>}
                    <p className="text-[10px] text-zinc-700 font-mono truncate mt-0.5">{src.url}</p>
                  </div>
                </div>
              );
            })}

            {/* Custom URL */}
            <div className="mt-2 flex items-center gap-2">
              <Globe className="w-3.5 h-3.5 text-zinc-600 shrink-0" />
              <input
                type="url"
                value={customUrl}
                onChange={e => setCustomUrl(e.target.value)}
                placeholder="Ajouter une URL personnalisée (optionnel)…"
                className="flex-1 px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-xs text-zinc-300 placeholder-zinc-700 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="px-4 pb-4 pt-3 flex gap-2 shrink-0 border-t border-white/[0.06]">
            <button onClick={resetAndClose} className="flex-1 cockpit-btn">
              Passer
            </button>
            <button
              onClick={handleFinishSources}
              disabled={sourcesCreating}
              className="flex-1 cockpit-btn cockpit-btn-primary flex items-center justify-center gap-1.5"
            >
              {sourcesCreating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              {sourcesCreating ? 'Ajout en cours…' : `Ajouter ${selectedSources.size + (customUrl.trim() ? 1 : 0)} source${selectedSources.size + (customUrl.trim() ? 1 : 0) !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    );
  }

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
                      setManagingMembersWsId(ws.id);
                    }}
                    className="p-1.5 rounded-lg hover:bg-violet-500/10 text-zinc-700 hover:text-violet-400 transition-colors shrink-0"
                    title="Gérer les membres"
                  >
                    <Users className="w-3.5 h-3.5" />
                  </button>
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
                  className="flex-1 cockpit-btn cockpit-btn-primary flex items-center justify-center gap-1.5"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <ArrowRight className="w-3.5 h-3.5" />
                  )}
                  {createMutation.isPending ? 'Création…' : 'Créer & sources'}
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
