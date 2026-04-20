// SourcesMode - Gestion des sources de données
import { useState, useEffect, useRef, useMemo } from 'react';
import { useSources, useCreateSource, useToggleSource, useCollectSource, useCollectWorkspace, useUpdateSource, useDeleteSource } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { CockpitHeader } from '../components/CockpitHeader';
import type { SourceCreate } from '../../services/api';
import {
  Rss, Github, Zap, Globe, Plus, ToggleLeft, ToggleRight,
  AlertCircle, X, Check, Loader2, RefreshCw, Pencil, Trash2, Save, ChevronRight,
} from 'lucide-react';

const TYPE_CONFIG = {
  rss:     { label: 'RSS',     icon: Rss,    color: 'text-orange-400',  bg: 'bg-orange-500/10 border-orange-500/20' },
  github:  { label: 'GitHub',  icon: Github, color: 'text-purple-400',  bg: 'bg-purple-500/10 border-purple-500/20' },
  api:     { label: 'API',     icon: Zap,    color: 'text-sky-400',     bg: 'bg-sky-500/10    border-sky-500/20'    },
  website: { label: 'Website', icon: Globe,  color: 'text-teal-400',    bg: 'bg-teal-500/10   border-teal-500/20'   },
} as const;

type SourceType = keyof typeof TYPE_CONFIG;

const EMPTY_FORM: SourceCreate = {
  name: '',
  url: '',
  type: 'rss',
  category: '',
  description: '',
  active: true,
};

// ─── AddSourcePanel ────────────────────────────────────────────────────────────
function AddSourcePanel({
  workspaceId,
  onDone,
}: {
  workspaceId: number | null;
  onDone: () => void;
}) {
  const [form, setForm] = useState<SourceCreate>({ ...EMPTY_FORM });
  const createMutation = useCreateSource();

  const set = (k: keyof SourceCreate, v: string | boolean) =>
    setForm((f) => ({ ...f, [k]: v }));

  const isValid = form.name.trim() && form.url.trim() && form.category.trim();

  const handleSubmit = () => {
    if (!isValid) return;
    const payload: SourceCreate = { ...form, workspace_id: workspaceId ?? undefined };
    createMutation.mutate(payload, { onSuccess: onDone });
  };

  const Cfg = TYPE_CONFIG[form.type as SourceType];

  return (
    <div className="p-5 border-b border-white/[0.06] bg-white/[0.02]">
      <div className="flex items-center gap-2 mb-4">
        <Plus className="w-4 h-4 text-sky-400" strokeWidth={1.5} />
        <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
          Nouvelle source
        </span>
        <div className="flex-1" />
        <button
          onClick={onDone}
          className="p-1 rounded-lg text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Name */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">
            Nom *
          </label>
          <input
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            placeholder="ex: TechCrunch RSS"
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>

        {/* URL */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">
            URL *
          </label>
          <input
            value={form.url}
            onChange={(e) => set('url', e.target.value)}
            placeholder={form.type === 'website' ? 'https://example.com/docs/' : 'https://...'}
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
          {form.type === 'website' && (
            <div className="mt-1.5 flex flex-col gap-0.5">
              <p className="text-[10px] text-teal-500/70 flex items-center gap-1">
                <span className="font-mono bg-teal-500/10 border border-teal-500/20 px-1 rounded">URL/</span>
                Termine par <code className="font-mono">/</code> → crawl toutes les sous-pages
              </p>
              <p className="text-[10px] text-zinc-600 flex items-center gap-1">
                <span className="font-mono bg-white/[0.04] border border-white/[0.06] px-1 rounded">URL</span>
                Sans <code className="font-mono">/</code> → scrape uniquement cette page
              </p>
            </div>
          )}
        </div>

        {/* Type */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">
            Type *
          </label>
          <div className="flex gap-2">
            {(Object.keys(TYPE_CONFIG) as SourceType[]).map((t) => {
              const C = TYPE_CONFIG[t];
              const Icon = C.icon;
              const active = form.type === t;
              return (
                <button
                  key={t}
                  onClick={() => set('type', t)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${
                    active ? `${C.bg} ${C.color}` : 'bg-zinc-900 border-white/[0.06] text-zinc-600 hover:text-zinc-400'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" strokeWidth={1.5} />
                  {C.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Category */}
        <div>
          <label className="block text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">
            Catégorie *
          </label>
          <input
            value={form.category}
            onChange={(e) => set('category', e.target.value)}
            placeholder="ex: IA, DevOps, Sécurité…"
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>

        {/* Description */}
        <div className="md:col-span-2">
          <label className="block text-[10px] font-medium text-zinc-600 uppercase tracking-wider mb-1">
            Description
          </label>
          <input
            value={form.description || ''}
            onChange={(e) => set('description', e.target.value)}
            placeholder="Description optionnelle…"
            className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-3 py-2 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50 transition-colors"
          />
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <div className="flex items-center gap-2 text-xs text-zinc-600">
          <Cfg.icon className={`w-3.5 h-3.5 ${Cfg.color}`} strokeWidth={1.5} />
          <span>Type sélectionné : <span className={Cfg.color}>{Cfg.label}</span></span>
        </div>
        <button
          onClick={handleSubmit}
          disabled={!isValid || createMutation.isPending}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-sky-500 text-white disabled:opacity-40 hover:bg-sky-400 transition-all"
        >
          {createMutation.isPending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Check className="w-3.5 h-3.5" />
          )}
          Ajouter
        </button>
      </div>

      {createMutation.isError && (
        <p className="mt-3 text-xs text-red-400 flex items-center gap-1.5">
          <AlertCircle className="w-3.5 h-3.5" />
          Erreur lors de la création. Vérifiez les champs.
        </p>
      )}
    </div>
  );
}

// ─── SourceCard ─────────────────────────────────────────────────────────────────
function SourceCard({ source, highlighted }: { source: any; highlighted?: boolean }) {
  const toggleMutation = useToggleSource();
  const collectMutation = useCollectSource();
  const updateMutation = useUpdateSource();
  const deleteMutation = useDeleteSource();
  const Cfg = TYPE_CONFIG[(source.type as SourceType) ?? 'api'];
  const Icon = Cfg.icon;
  const cardRef = useRef<HTMLDivElement>(null);

  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editForm, setEditForm] = useState({
    name: source.name,
    url: source.url,
    category: source.category || '',
    description: source.description || '',
    type: source.type,
  });

  // Auto-scroll when highlighted on mount
  useEffect(() => {
    if (highlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlighted]);

  const handleSave = () => {
    updateMutation.mutate(
      { id: source.id, payload: editForm },
      { onSuccess: () => setEditing(false) }
    );
  };

  const handleDelete = () => {
    deleteMutation.mutate(source.id);
  };

  return (
    <div
      ref={cardRef}
      className={`rounded-xl border transition-all ${
        highlighted
          ? 'bg-emerald-500/[0.06] border-emerald-500/40 ring-1 ring-emerald-500/30'
          : source.active
          ? 'bg-white/[0.02] border-white/[0.06]'
          : 'bg-white/[0.01] border-white/[0.03] opacity-50'
      }`}
    >
      {/* Main row */}
      <div className="flex items-start gap-4 p-4">
        {/* Type badge */}
        <div className={`mt-0.5 shrink-0 flex items-center justify-center w-8 h-8 rounded-lg border ${Cfg.bg}`}>
          <Icon className={`w-4 h-4 ${Cfg.color}`} strokeWidth={1.5} />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="text-sm font-medium text-zinc-200 truncate">{source.name}</span>
            <span className={`shrink-0 px-1.5 py-0.5 rounded-md text-[10px] font-medium border ${Cfg.bg} ${Cfg.color}`}>
              {Cfg.label}
            </span>
            {source.category && (
              <span className="shrink-0 px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-900 border border-white/[0.06] text-zinc-500">
                {source.category}
              </span>
            )}
          </div>
          <p className="text-[11px] text-zinc-600 break-all leading-relaxed">{source.url}</p>
          {source.description && (
            <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">{source.description}</p>
          )}
          {/* Collect result feedback */}
          {collectMutation.isSuccess && (
            <p className="text-[10px] text-emerald-500 mt-1">
              +{(collectMutation.data as any)?.inserted ?? 0} nouveau(x) · {(collectMutation.data as any)?.duplicates ?? 0} doublon(s)
            </p>
          )}
          {collectMutation.isError && (
            <p className="text-[10px] text-red-400 mt-1">Erreur de collecte</p>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1.5 mt-0.5">
          {/* Collect */}
          <button
            onClick={() => collectMutation.mutate(source.id)}
            disabled={collectMutation.isPending || !source.active}
            title="Collecter maintenant"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/20 disabled:opacity-40 transition-all"
          >
            {collectMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Collecter
          </button>

          {/* Edit */}
          <button
            onClick={() => { setEditing(v => !v); setConfirmDelete(false); }}
            title="Modifier"
            className={`p-1.5 rounded-lg transition-colors ${
              editing ? 'bg-amber-500/15 text-amber-400' : 'text-zinc-600 hover:text-zinc-200 hover:bg-white/[0.06]'
            }`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>

          {/* Delete */}
          <button
            onClick={() => { setConfirmDelete(v => !v); setEditing(false); }}
            title="Supprimer"
            className={`p-1.5 rounded-lg transition-colors ${
              confirmDelete ? 'bg-red-500/15 text-red-400' : 'text-zinc-600 hover:text-red-400 hover:bg-red-500/[0.08]'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Toggle */}
          <button
            onClick={() => toggleMutation.mutate({ id: source.id, active: !source.active })}
            disabled={toggleMutation.isPending}
            title={source.active ? 'Désactiver' : 'Activer'}
            className="text-zinc-600 hover:text-zinc-300 transition-colors"
          >
            {source.active ? <ToggleRight className="w-5 h-5 text-sky-500" /> : <ToggleLeft className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Delete confirm bar */}
      {confirmDelete && (
        <div className="px-4 pb-3 flex items-center gap-3">
          <p className="text-xs text-red-400 flex-1">Supprimer définitivement « {source.name} » ?</p>
          <button
            onClick={handleDelete}
            disabled={deleteMutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/15 text-red-400 border border-red-500/25 hover:bg-red-500/25 transition-all disabled:opacity-50"
          >
            {deleteMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
            Confirmer
          </button>
          <button onClick={() => setConfirmDelete(false)} className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all">
            Annuler
          </button>
        </div>
      )}

      {/* Inline edit form */}
      {editing && (
        <div className="px-4 pb-4 border-t border-white/[0.06] pt-3 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Nom</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50"
              />
            </div>
            <div>
              <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Catégorie</label>
              <input
                value={editForm.category}
                onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))}
                className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50"
              />
            </div>
          </div>
          <div>
            <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">URL</label>
            <input
              value={editForm.url}
              onChange={e => setEditForm(f => ({ ...f, url: e.target.value }))}
              className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Description</label>
            <input
              value={editForm.description}
              onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Optionnelle…"
              className="w-full bg-zinc-900 border border-white/[0.08] rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-sky-500/50"
            />
          </div>
          <div>
            <label className="block text-[10px] text-zinc-600 uppercase tracking-wider mb-1">Type</label>
            <div className="flex gap-1.5">
              {(Object.keys(TYPE_CONFIG) as SourceType[]).map(t => {
                const C = TYPE_CONFIG[t];
                const CI = C.icon;
                const active = editForm.type === t;
                return (
                  <button
                    key={t}
                    onClick={() => setEditForm(f => ({ ...f, type: t }))}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium border transition-all ${
                      active ? `${C.bg} ${C.color}` : 'bg-zinc-900 border-white/[0.06] text-zinc-600 hover:text-zinc-400'
                    }`}
                  >
                    <CI className="w-3 h-3" strokeWidth={1.5} />
                    {C.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button
              onClick={handleSave}
              disabled={updateMutation.isPending || !editForm.name.trim() || !editForm.url.trim()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white hover:bg-sky-400 disabled:opacity-40 transition-all"
            >
              {updateMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              Enregistrer
            </button>
            <button onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all">
              Annuler
            </button>
            {updateMutation.isError && <span className="text-[10px] text-red-400">Erreur — réessayez</span>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SourceGroup ─────────────────────────────────────────────────────────────
function domainOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

function SourceGroup({
  domain, sources, selectedSourceUrl, collapsed, onToggle,
}: {
  domain: string; sources: any[]; selectedSourceUrl: string | null;
  collapsed: boolean; onToggle: () => void;
}) {
  const activeCt = sources.filter((s) => s.active).length;
  const hasHighlighted = !!selectedSourceUrl && sources.some((s) => s.url === selectedSourceUrl);
  const isOpen = hasHighlighted || !collapsed;

  // Count sources by type for the header badges
  const typeCounts = sources.reduce((acc, s) => {
    const t = s.type as SourceType;
    acc[t] = (acc[t] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className={`rounded-xl border transition-all ${
      hasHighlighted ? 'border-emerald-500/30 bg-emerald-500/[0.02]' : 'border-white/[0.06] bg-white/[0.01]'
    }`}>
      {/* Group header — clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.02] transition-colors rounded-xl"
      >
        <ChevronRight
          className={`w-3.5 h-3.5 text-zinc-600 shrink-0 transition-transform duration-200 ${
            isOpen ? 'rotate-90' : ''
          }`}
        />
        <Globe className="w-4 h-4 text-teal-400 shrink-0" strokeWidth={1.5} />
        <span className="text-sm font-semibold text-zinc-300 flex-1 text-left">{domain}</span>
        {/* Per-type badges */}
        <div className="flex items-center gap-1.5">
          {(Object.entries(typeCounts) as [SourceType, number][]).map(([t, ct]) => {
            const C = TYPE_CONFIG[t];
            if (!C) return null;
            const Icon = C.icon;
            return (
              <span key={t} className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium ${C.bg} ${C.color}`}>
                <Icon className="w-2.5 h-2.5" strokeWidth={1.5} />{ct}
              </span>
            );
          })}
        </div>
        <span className="text-[10px] text-zinc-600 font-mono tabular-nums ml-1">
          {activeCt} / {sources.length} actives
        </span>
      </button>

      {/* Expanded source cards */}
      {isOpen && (
        <div className="px-3 pb-3 flex flex-col gap-2">
          {sources.map((s) => (
            <SourceCard
              key={s.id}
              source={s}
              highlighted={!!selectedSourceUrl && s.url === selectedSourceUrl}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── SourcesMode ────────────────────────────────────────────────────────────────
export function SourcesMode() {
  const { activeWorkspaceId, selectedSourceUrl, setSelectedSourceUrl } = useCockpit();
  const [showAdd, setShowAdd] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | SourceType>('all');
  const [activeFilter, setActiveFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [expandedDomains, setExpandedDomains] = useState<Set<string>>(new Set());
  const collectWorkspaceMutation = useCollectWorkspace();

  // Clear selected source URL when leaving this mode or on unmount
  useEffect(() => {
    return () => setSelectedSourceUrl(null);
  }, []);

  // When navigating to a specific source, switch filter to 'all' to ensure it's visible
  useEffect(() => {
    if (selectedSourceUrl) {
      setTypeFilter('all');
      setActiveFilter('all');
    }
  }, [selectedSourceUrl]);

  const wsReady = activeWorkspaceId !== null;

  // Only fetch when a workspace is selected — never show cross-workspace data
  const { data, isLoading } = useSources(
    { workspace_id: activeWorkspaceId ?? undefined, type: typeFilter === 'all' ? undefined : typeFilter },
    { enabled: wsReady }
  );

  // Stable sort by id (never reorders on toggle)
  const allSources: any[] = [...(data?.sources || [])].sort((a, b) => a.id - b.id);

  // Client-side active filter
  const sources = allSources.filter(s => {
    if (activeFilter === 'active') return s.active;
    if (activeFilter === 'inactive') return !s.active;
    return true;
  });

  const activeSources = allSources.filter((s: any) => s.active);

  // Group visible sources by domain
  const sourcesByDomain = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const s of sources) {
      const d = domainOf(s.url);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(s);
    }
    return map;
  }, [sources]);

  const toggleDomain = (domain: string) =>
    setExpandedDomains((prev) => {
      const next = new Set(prev);
      next.has(domain) ? next.delete(domain) : next.add(domain);
      return next;
    });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <CockpitHeader
        title="Sources de données"
        subtitle={`${activeSources.length} actives · ${allSources.length} au total`}
        icon={<Rss className="w-5 h-5 text-zinc-400" strokeWidth={1.5} />}
      />

      {/* Filters + Add button */}
      <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-2">
        {/* Type filter */}
        {([
          { key: 'all', label: 'Toutes' },
          { key: 'rss', label: 'RSS' },
          { key: 'github', label: 'GitHub' },
          { key: 'api', label: 'API' },
          { key: 'website', label: 'Website' },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTypeFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              typeFilter === key
                ? 'bg-white/[0.08] text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}

        {/* Separator */}
        <div className="w-px h-4 bg-white/[0.08] mx-1" />

        {/* Active status filter */}
        {([
          { key: 'all', label: 'Tous' },
          { key: 'active', label: `Actives\u00a0(${activeSources.length})` },
          { key: 'inactive', label: `Inactives\u00a0(${allSources.length - activeSources.length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              activeFilter === key
                ? key === 'active'
                  ? 'bg-emerald-500/12 text-emerald-400'
                  : key === 'inactive'
                  ? 'bg-zinc-800 text-zinc-500'
                  : 'bg-white/[0.08] text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="flex-1" />
        {/* Tout collecter */}
        {activeWorkspaceId && activeSources.length > 0 && (
          <button
            onClick={() => collectWorkspaceMutation.mutate(activeWorkspaceId)}
            disabled={collectWorkspaceMutation.isPending}
            title="Collecter toutes les sources actives"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/[0.08] border border-transparent hover:border-emerald-500/20 transition-all disabled:opacity-40"
          >
            {collectWorkspaceMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <RefreshCw className="w-3.5 h-3.5" />
            )}
            {collectWorkspaceMutation.isPending ? 'Collecte…' : 'Tout collecter'}
          </button>
        )}
        <button
          onClick={() => setShowAdd((v) => !v)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
            showAdd
              ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05] border-transparent'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
      </div>

      {/* Add panel */}
      {showAdd && (
        <AddSourcePanel
          workspaceId={activeWorkspaceId}
          onDone={() => setShowAdd(false)}
        />
      )}

      {/* Sources list */}
      <div className="flex-1 overflow-y-auto scrollable p-5">
        {sources.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <Rss className="w-10 h-10 text-zinc-800" strokeWidth={1.5} />
            <p className="text-sm text-zinc-700">
              {allSources.length === 0 ? 'Aucune source configurée' : 'Aucune source dans cette catégorie'}
            </p>
            {allSources.length === 0 && (
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/15 transition-all"
              >
                <Plus className="w-3.5 h-3.5" />
                Ajouter une première source
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {[...sourcesByDomain.entries()].map(([domain, domainSources]) => (
              <SourceGroup
                key={domain}
                domain={domain}
                sources={domainSources}
                selectedSourceUrl={selectedSourceUrl}
                collapsed={!expandedDomains.has(domain)}
                onToggle={() => toggleDomain(domain)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
