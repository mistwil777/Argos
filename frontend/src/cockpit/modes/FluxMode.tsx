// FluxMode - Mode Items (collecte, triage, classification)
import { useState } from 'react';
import { useItems } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { AlertCircle, Sparkles, FileText } from 'lucide-react';
import { CockpitHeader } from '../components/CockpitHeader';
import type { Item } from '../../types';

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
  const { setSelectedItemId, setInspectorOpen } = useCockpit();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'classified'>('all');
  
  const { data: itemsData, isLoading } = useItems({ 
    status: statusFilter === 'all' ? undefined : statusFilter 
  });
  // Separate query without filter for accurate tab counts
  const { data: allItemsData } = useItems();

  const items = itemsData?.items || [];
  const allItems = allItemsData?.items || [];

  const handleItemClick = (item: Item) => {
    setSelectedItemId(item.id);
    setInspectorOpen(true);
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
      {/* Header */}
      <CockpitHeader 
        title="Flux d'items"
        subtitle="Classez et organisez vos sources d'information"
        icon={<FileText className="w-5 h-5 text-zinc-400" />}
      />
      
      {/* Filters Bar */}
      <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-2">
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
        {statusFilter === 'pending' && items.length > 0 && (
          <button className="cockpit-btn cockpit-btn-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Classifier tout</span>
          </button>
        )}
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto scrollable p-5">
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
                onClick={() => handleItemClick(item)}
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
  onClick: () => void;
}

function ItemCard({ item, onClick }: ItemCardProps) {
  const isPending = item.classification_status === 'pending';

  return (
    <div
      onClick={onClick}
      className="cockpit-card rounded-xl p-4 cursor-pointer group flex flex-col gap-3"
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
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
