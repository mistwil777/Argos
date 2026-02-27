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
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <AlertCircle className="w-12 h-12 mb-3 text-gray-300" />
            <p>Aucun item trouvé</p>
          </div>
        ) : (
          items.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onClick={() => handleItemClick(item)}
            />
          ))
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
      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          {isPending && <div className="w-2 h-2 bg-orange-500 rounded-full" />}
          {isClassified && <div className="w-2 h-2 bg-green-500 rounded-full" />}
          <h3 className="font-medium text-gray-900 line-clamp-1">{item.title}</h3>
        </div>
        
        {item.importance && (
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
            item.importance === 'High' ? 'bg-red-100 text-red-700' :
            item.importance === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            {item.importance}
          </span>
        )}
      </div>

      <p className="text-sm text-gray-600 line-clamp-2 mb-3">{item.summary}</p>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div className="flex items-center space-x-3">
          {item.item_type && (
            <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded font-medium">
              {item.item_type}
            </span>
          )}
          {item.source_type && (
            <span>{item.source_type}</span>
          )}
        </div>
        <span>{new Date(item.created_at).toLocaleDateString('fr-FR')}</span>
      </div>
    </div>
  );
}
