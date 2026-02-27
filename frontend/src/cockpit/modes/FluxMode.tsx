// FluxMode - Mode Items (collecte, triage, classification)
import { useState } from 'react';
import { useItems } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { Clock, AlertCircle, CheckCircle, Sparkles } from 'lucide-react';
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
          <button className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center space-x-2">
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
      className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 flex-1 mr-2">
          {isPending && (
            <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
          )}
          {isClassified && (
            <div className="w-2 h-2 bg-green-500 rounded-full" />
          )}
          <h3 className="font-semibold text-gray-900 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {item.title}
          </h3>
        </div>
        
        {item.importance && (
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold flex-shrink-0 ${
            item.importance === 'High' ? 'bg-red-100 text-red-700' :
            item.importance === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-600'
          }`}>
            {item.importance}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 line-clamp-3 mb-4 leading-relaxed">
        {item.summary}
      </p>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center space-x-2">
          {item.item_type && (
            <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full font-medium">
              {item.item_type}
            </span>
          )}
          {item.source_type && (
            <span className="text-gray-500">{item.source_type}</span>
          )}
        </div>
        <span className="text-gray-400">
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
              className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded"
            >
              {topic}
            </span>
          ))}
          {item.topics.length > 3 && (
            <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded">
              +{item.topics.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
