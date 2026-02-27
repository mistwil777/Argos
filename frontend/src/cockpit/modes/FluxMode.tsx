// FluxMode - Mode Items (collecte, triage, classification)
import { useState } from 'react';
import { useItems } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { Clock, AlertCircle, CheckCircle, Sparkles, FileText } from 'lucide-react';
import { CockpitHeader } from '../components/CockpitHeader';
import type { Item } from '../../types';

export function FluxMode() {
  const { setInspectorOpen, setSelectedItemId } = useCockpit();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'classified'>('all');
  
  const { data: itemsData, isLoading } = useItems({ 
    status: statusFilter === 'all' ? undefined : statusFilter 
  });

  const items = itemsData?.items || [];

  const handleItemClick = (item: Item) => {
    setSelectedItemId(item.id);
    setInspectorOpen(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <CockpitHeader 
        title="Flux d'items"
        subtitle="Classez et organisez vos sources d'information"
        icon={<FileText className="w-8 h-8 text-blue-300" />}
      />
      
      {/* Filters Bar */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 space-x-3">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            statusFilter === 'all'
              ? 'bg-gray-900 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          Tout
        </button>
        <button
          onClick={() => setStatusFilter('pending')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            statusFilter === 'pending'
              ? 'bg-orange-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Pending ({items.filter(i => i.classification_status === 'pending').length})</span>
        </button>
        <button
          onClick={() => setStatusFilter('classified')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            statusFilter === 'classified'
              ? 'bg-green-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Classified ({items.filter(i => i.classification_status === 'classified').length})</span>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Actions rapides */}
        {statusFilter === 'pending' && items.length > 0 && (
          <button className="cockpit-btn cockpit-btn-primary cockpit-btn-sm">
            <Sparkles className="w-4 h-4" />
            <span>Classifier tout</span>
          </button>
        )}
      </div>

      {/* Items List */}
      <div className="flex-1 overflow-y-auto p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <AlertCircle className="w-12 h-12 mb-3 text-gray-300" />
            <p>Aucun item trouvé</p>
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

// ItemCard - Carte compacte pour un item
interface ItemCardProps {
  item: Item;
  onClick: () => void;
}

function ItemCard({ item, onClick }: ItemCardProps) {
  const isPending = item.classification_status === 'pending';
  const isClassified = item.classification_status === 'classified';

  return (
    <div
      onClick={onClick}
      className="cockpit-card rounded-xl p-5 hover:scale-[1.02] transition-all cursor-pointer group shadow-lg"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 flex-1 mr-2">
          {isPending && (
            <div className="w-2 h-2 bg-orange-500 rounded-full cockpit-indicator-active" />
          )}
          {isClassified && (
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          )}
          <h3 className="font-semibold text-gray-100 line-clamp-2 group-hover:text-blue-300 transition-colors">
            {item.title}
          </h3>
        </div>
        
        {item.importance && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 border ${
            item.importance === 'High' ? 'bg-red-900/40 text-red-300 border-red-600/40' :
            item.importance === 'Medium' ? 'bg-yellow-900/40 text-yellow-300 border-yellow-600/40' :
            'bg-gray-800/40 text-gray-400 border-gray-600/40'
          }`}>
            {item.importance}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-400 line-clamp-3 mb-4 leading-relaxed">
        {item.summary}
      </p>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          {item.item_type && (
            <span className="px-2.5 py-1 bg-blue-900/40 text-blue-300 rounded-full font-medium border border-blue-600/30">
              {item.item_type}
            </span>
          )}
          {item.source_type && (
            <span className="text-gray-500">{item.source_type}</span>
          )}
        </div>
        <span className="text-gray-500">
          {new Date(item.created_at).toLocaleDateString('fr-FR', { 
            day: 'numeric', 
            month: 'short' 
          })}
        </span>
      </div>

      {item.topics && item.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {item.topics.slice(0, 3).map((topic: string, idx: number) => (
            <span
              key={idx}
              className="text-xs px-2 py-0.5 bg-gray-800/50 text-gray-400 rounded border border-gray-700/30"
            >
              {topic}
            </span>
          ))}
          {item.topics.length > 3 && (
            <span className="text-xs px-2 py-0.5 bg-gray-800/50 text-gray-500 rounded border border-gray-700/30">
              +{item.topics.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
