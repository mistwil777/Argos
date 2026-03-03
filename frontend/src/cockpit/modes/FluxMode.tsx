// FluxMode - Mode Items (collecte, triage, classification)
import { useState } from 'react';
import { useItems, useClassifyBatch, useDeleteItem, useBatchAssignWorkspace, useWorkspaces } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { AlertCircle, Sparkles, FileText, Trash2, FolderInput, CheckSquare, ExternalLink } from 'lucide-react';
import { CockpitHeader } from '../components/CockpitHeader';
import type { Item } from '../../types';

function sourceDomain(url?: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return null; }
}

const IMPORTANCE_FR: Record<string, string> = {
  High: 'Élevé',
  Medium: 'Moyen',
  Low: 'Faible',
  Critical: 'Critique',
};

const ITEM_TYPE_FR: Record<string, string> = {
  innovation: 'Innovation',
  tutorial: 'Tutoriel',
  tool: 'Outil',
  research: 'Recherche',
  comparison: 'Comparaison',
  news: 'Actualité',
  release: 'Release',
  article: 'Article',
};

export function FluxMode() {
  const { setSelectedItemId, setInspectorOpen, activeWorkspaceId, setActiveMode, setSelectedSourceUrl } = useCockpit();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'classified'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [showWorkspacePicker, setShowWorkspacePicker] = useState(false);

  const { data: itemsData, isLoading } = useItems({
    status: statusFilter === 'all' ? undefined : statusFilter,
    workspace_id: activeWorkspaceId ?? undefined,
  });
  const { data: allItemsData } = useItems({ workspace_id: activeWorkspaceId ?? undefined });
  const { data: workspaces = [] } = useWorkspaces();

  const classifyBatch = useClassifyBatch();
  const deleteItem = useDeleteItem();
  const assignWorkspace = useBatchAssignWorkspace();

  const items = itemsData?.items || [];
  const allItems = allItemsData?.items || [];

  const allChecked = items.length > 0 && selectedIds.size === items.length;
  const someChecked = selectedIds.size > 0;

  const toggleOne = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) setSelectedIds(new Set());
    else setSelectedIds(new Set(items.map(i => i.id)));
  };

  const handleItemClick = (item: Item) => {
    setSelectedItemId(item.id);
    setInspectorOpen(true);
  };

  const handleBatchClassify = () => {
    classifyBatch.mutate([...selectedIds], { onSuccess: () => setSelectedIds(new Set()) });
  };

  const handleBatchDelete = () => {
    [...selectedIds].forEach(id => deleteItem.mutate(id));
    setSelectedIds(new Set());
  };

  const handleAssignWorkspace = (workspaceId: number) => {
    assignWorkspace.mutate(
      { itemIds: [...selectedIds], workspaceId },
      { onSuccess: () => { setSelectedIds(new Set()); setShowWorkspacePicker(false); } }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <CockpitHeader
        title="Flux d'items"
        subtitle="Classez et organisez vos sources d'information"
        icon={<FileText className="w-5 h-5 text-zinc-400" />}
      />

      {/* Filters + select-all bar */}
      <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-2">
        {/* Select-all checkbox */}
        <label className="flex items-center gap-2 cursor-pointer select-none mr-1">
          <input
            type="checkbox"
            checked={allChecked}
            onChange={toggleAll}
            className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
          />
        </label>

        {([
          { key: 'all', label: 'Tout' },
          { key: 'pending', label: `En attente\u00a0(${allItems.filter(i => i.classification_status === 'pending').length})` },
          { key: 'classified', label: `Classifiés\u00a0(${allItems.filter(i => i.classification_status === 'classified').length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              statusFilter === key
                ? 'bg-white/[0.08] text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}

        <div className="flex-1" />

        {/* Batch action toolbar */}
        {someChecked ? (
          <div className="flex items-center gap-1.5 relative">
            <span className="text-xs text-zinc-500 mr-1">
              {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
            </span>
            <button
              onClick={handleBatchClassify}
              disabled={classifyBatch.isPending}
              title="Classifier la sélection"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-sky-500/10 text-sky-400 border border-sky-500/20 hover:bg-sky-500/15 transition-all disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              Classifier
            </button>
            <div className="relative">
              <button
                onClick={() => setShowWorkspacePicker(v => !v)}
                title="Déplacer vers un espace"
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-violet-500/10 text-violet-400 border border-violet-500/20 hover:bg-violet-500/15 transition-all"
              >
                <FolderInput className="w-3.5 h-3.5" />
                Espace
              </button>
              {showWorkspacePicker && (
                <div className="absolute right-0 top-9 z-50 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl py-1 min-w-[180px]">
                  {workspaces.map(ws => (
                    <button
                      key={ws.id}
                      onClick={() => handleAssignWorkspace(ws.id)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.05] transition-colors"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: ws.color }}
                      />
                      {ws.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={handleBatchDelete}
              title="Supprimer la sélection"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-500/8 text-red-400 border border-red-500/15 hover:bg-red-500/12 transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          statusFilter === 'pending' && items.length > 0 && (
            <button
              onClick={() => { setSelectedIds(new Set(items.map(i => i.id))); }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] transition-all border border-transparent"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              Tout sélectionner
            </button>
          )
        )}
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto scrollable p-5" onClick={() => setShowWorkspacePicker(false)}>
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <AlertCircle className="w-10 h-10 text-zinc-800" strokeWidth={1.5} />
            <p className="text-sm text-zinc-700">Aucun item trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                onSelect={(e) => toggleOne(item.id, e)}
                onClick={() => handleItemClick(item)}
                onSourceClick={(url, _e) => {
                  setSelectedSourceUrl(url);
                  setActiveMode('sources');
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ItemCard
interface ItemCardProps {
  item: Item;
  selected: boolean;
  onSelect: (e: React.MouseEvent) => void;
  onClick: () => void;
  onSourceClick: (sourceUrl: string, e: React.MouseEvent) => void;
}

function ItemCard({ item, selected, onSelect, onClick, onSourceClick }: ItemCardProps) {
  const isPending = item.classification_status === 'pending';
  const domain = sourceDomain(item.source_url);

  return (
    <div
      onClick={onClick}
      className={`cockpit-card rounded-xl p-4 cursor-pointer group flex flex-col gap-3 transition-all ${
        selected ? 'ring-1 ring-sky-500/40 bg-sky-500/[0.04]' : ''
      }`}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Checkbox */}
          <span onClick={onSelect} className="shrink-0">
            <input
              type="checkbox"
              checked={selected}
              onChange={() => {}}
              className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
            />
          </span>
          {isPending && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 cockpit-indicator-active shrink-0" />}
          {!isPending && <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
          <h3 className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors line-clamp-2 leading-snug">
            {item.title}
          </h3>
        </div>
        {item.importance && (
          <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border ${
            item.importance === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
            item.importance === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            'bg-white/[0.05] text-zinc-500 border-white/[0.08]'
          }`}>
            {IMPORTANCE_FR[item.importance] || item.importance}
          </span>
        )}
      </div>

      {/* Summary */}
      <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
        {item.summary}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto">
        <div className="flex items-center gap-2">
          {item.item_type && (
            <span className="px-2 py-0.5 bg-white/[0.04] text-zinc-500 rounded border border-white/[0.06] text-xs">
              {ITEM_TYPE_FR[item.item_type] || item.item_type}
            </span>
          )}
          {domain && (
            <button
              onClick={(e) => { e.stopPropagation(); item.source_url && onSourceClick(item.source_url, e); }}
              className="flex items-center gap-1 px-2 py-0.5 bg-emerald-500/8 text-emerald-500/70 rounded border border-emerald-500/15 text-xs hover:bg-emerald-500/15 hover:text-emerald-400 transition-all"
              title="Voir la source"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              {domain}
            </button>
          )}
        </div>
        <span className="text-xs text-zinc-700 font-mono">
          {new Date(item.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
        </span>
      </div>

      {item.topics && item.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {item.topics.slice(0, 3).map((topic: string, idx: number) => (
            <span key={idx} className="text-xs px-2 py-0.5 bg-sky-500/8 text-sky-500/70 rounded border border-sky-500/15">
              {topic}
            </span>
          ))}
          {item.topics.length > 3 && (
            <span className="text-xs px-2 py-0.5 text-zinc-700">+{item.topics.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}

