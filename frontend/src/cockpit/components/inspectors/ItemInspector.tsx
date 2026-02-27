// ItemInspector - Panneau de détails pour un item sélectionné
import { useItem, useClassifyItem, useDeleteItem, useGenerateCourse } from '../../../hooks/useApi';
import { Sparkles, XCircle, FileText, Calendar, Link as LinkIcon, TrendingUp, BookOpen } from 'lucide-react';

interface ItemInspectorProps {
  itemId: number;
}

export function ItemInspector({ itemId }: ItemInspectorProps) {
  const { data: item, isLoading, isError, error } = useItem(itemId);
  const classifyMutation = useClassifyItem();
  const deleteMutation = useDeleteItem();
  const generateMutation = useGenerateCourse();

  if (isLoading) {
    return (
      <div className="p-4 text-gray-500 text-sm flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="p-4 text-red-500 text-sm">
        <p className="font-medium mb-2">Erreur de chargement</p>
        <p className="text-xs text-gray-500">{error?.message || 'Item introuvable'}</p>
      </div>
    );
  }

  const isPending = item.classification_status === 'pending';
  const isClassified = item.classification_status === 'classified';

  const handleClassify = () => {
    classifyMutation.mutate(item.id);
  };

  const handleDelete = () => {
    deleteMutation.mutate(item.id);
  };

  const handleGenerate = () => {
    generateMutation.mutate({ itemId: item.id, durationMinutes: 60 });
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-b from-[#0f1420]/80 to-[#1a1e2e]/80 backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-blue-900/30">
        <div className="flex items-start space-x-2 mb-2">
          {isPending && <div className="w-2 h-2 bg-orange-500 rounded-full mt-2 cockpit-indicator-active" />}
          {isClassified && <div className="w-2 h-2 bg-green-500 rounded-full mt-2" />}
          <h2 className="text-lg font-semibold text-gray-100 flex-1">{item.title}</h2>
        </div>
        
        {item.importance && (
          <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
            item.importance === 'High' ? 'bg-red-100 text-red-700' :
            item.importance === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
            'bg-gray-100 text-gray-700'
          }`}>
            Importance: {item.importance}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Résumé */}
        <div>
          <h3 className="text-xs font-semibold text-blue-400 uppercase mb-2">Résumé</h3>
          <p className="text-sm text-gray-200 leading-relaxed">{item.summary}</p>
        </div>

        {/* Métadonnées */}
        <div>
          <h3 className="text-xs font-semibold text-blue-400 uppercase mb-2">Métadonnées</h3>
          <div className="space-y-2 text-sm">
            {item.item_type && (
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-gray-400">Type:</span>
                <span className="font-medium text-gray-100">{item.item_type}</span>
              </div>
            )}
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-blue-400" />
              <span className="text-gray-400">Date:</span>
              <span className="font-medium text-gray-100">
                {new Date(item.created_at).toLocaleDateString('fr-FR')}
              </span>
            </div>
            {item.source_type && (
              <div className="flex items-center space-x-2">
                <LinkIcon className="w-4 h-4 text-blue-400" />
                <span className="text-gray-400">Source:</span>
                <span className="font-medium text-gray-100">{item.source_type}</span>
              </div>
            )}
            {item.confidence_score !== undefined && (
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-gray-400">Confiance:</span>
                <span className="font-medium text-gray-100">
                  {(item.confidence_score * 100).toFixed(0)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Topics */}
        {item.topics && item.topics.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-blue-400 uppercase mb-2">Topics</h3>
            <div className="flex flex-wrap gap-2">
              {item.topics.map((topic: string, idx: number) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-blue-900/40 text-blue-200 border border-blue-700/40 rounded-full text-xs font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Subject */}
        {item.subject && (
          <div>
            <h3 className="text-xs font-semibold text-blue-400 uppercase mb-2">Sujet</h3>
            <p className="text-sm text-gray-200">{item.subject}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-blue-900/30 space-y-2">
        {isPending && (
          <>
            <button
              onClick={handleClassify}
              disabled={classifyMutation.isPending}
              className="w-full cockpit-btn cockpit-btn-primary"
            >
              <Sparkles className="w-4 h-4" />
              <span>{classifyMutation.isPending ? 'Classification...' : 'Classifier'}</span>
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="w-full cockpit-btn cockpit-btn-danger"
            >
              <XCircle className="w-4 h-4" />
              <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
            </button>
          </>
        )}
        
        {isClassified && (
          <>
            <button
              onClick={handleGenerate}
              disabled={generateMutation.isPending}
              className="w-full cockpit-btn cockpit-btn-success"
            >
              <BookOpen className="w-4 h-4" />
              <span>{generateMutation.isPending ? 'Génération...' : 'Générer document'}</span>
            </button>
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="w-full cockpit-btn cockpit-btn-danger"
            >
              <XCircle className="w-4 h-4" />
              <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
            </button>
          </>
        )}
      </div>
    </div>
  );
}
