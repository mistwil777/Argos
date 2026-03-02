// ItemInspector - Panneau de détails pour un item sélectionné
import { useItem, useClassifyItem, useDeleteItem, useGenerateCourse } from '../../../hooks/useApi';
import { Sparkles, XCircle, FileText, Calendar, Link as LinkIcon, TrendingUp, BookOpen } from 'lucide-react';
import { Preloader } from '../Preloader';

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
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div className="p-5">
        <p className="text-sm font-medium text-red-400 mb-1">Erreur de chargement</p>
        <p className="text-xs text-zinc-600">{error?.message || 'Item introuvable'}</p>
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
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <div className="flex items-start gap-2 mb-2">
          {isPending && <div className="w-1.5 h-1.5 bg-amber-500 rounded-full mt-1.5 cockpit-indicator-active shrink-0" />}
          {isClassified && <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full mt-1.5 shrink-0" />}
          <h2 className="text-sm font-medium text-zinc-200 leading-snug">{item.title}</h2>
        </div>
        {item.importance && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
            item.importance === 'High' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
            item.importance === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            'bg-white/[0.04] text-zinc-500 border-white/[0.06]'
          }`}>
            {item.importance}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-5">
        {/* Résumé */}
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Résumé</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">{item.summary}</p>
        </div>

        {/* Métadonnées */}
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Métadonnées</h3>
          <div className="flex flex-col gap-2">
            {item.item_type && (
              <div className="flex items-center gap-2 text-xs">
                <FileText className="w-3.5 h-3.5 text-zinc-700" />
                <span className="text-zinc-600">Type:</span>
                <span className="text-zinc-300">{item.item_type}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-xs">
              <Calendar className="w-3.5 h-3.5 text-zinc-700" />
              <span className="text-zinc-600">Date:</span>
              <span className="text-zinc-300 font-mono">{new Date(item.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            {item.source_type && (
              <div className="flex items-center gap-2 text-xs">
                <LinkIcon className="w-3.5 h-3.5 text-zinc-700" />
                <span className="text-zinc-600">Source:</span>
                <span className="text-zinc-300">{item.source_type}</span>
              </div>
            )}
            {item.confidence_score !== undefined && (
              <div className="flex items-center gap-2 text-xs">
                <TrendingUp className="w-3.5 h-3.5 text-zinc-700" />
                <span className="text-zinc-600">Confiance:</span>
                <span className="text-zinc-300 font-mono">{(item.confidence_score * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </div>

        {/* Topics */}
        {item.topics && item.topics.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Topics</h3>
            <div className="flex flex-wrap gap-1.5">
              {item.topics.map((topic: string, idx: number) => (
                <span key={idx} className="px-2 py-0.5 bg-sky-500/8 text-sky-500/70 border border-sky-500/15 rounded text-xs">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Sujet */}
        {item.subject && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Sujet</h3>
            <p className="text-xs text-zinc-400">{item.subject}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/[0.06] flex flex-col gap-2">
        {isPending && (
          <>
            <button onClick={handleClassify} disabled={classifyMutation.isPending} className="w-full cockpit-btn cockpit-btn-primary">
              <Sparkles className="w-4 h-4" />
              <span>{classifyMutation.isPending ? 'Classification...' : 'Classifier'}</span>
            </button>
            <button onClick={handleDelete} disabled={deleteMutation.isPending} className="w-full cockpit-btn cockpit-btn-danger">
              <XCircle className="w-4 h-4" />
              <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
            </button>
          </>
        )}
        {isClassified && (
          <>
            <button onClick={handleGenerate} disabled={generateMutation.isPending} className="w-full cockpit-btn cockpit-btn-success">
              <BookOpen className="w-4 h-4" />
              <span>{generateMutation.isPending ? 'Génération...' : 'Générer document'}</span>
            </button>
            <button onClick={handleDelete} disabled={deleteMutation.isPending} className="w-full cockpit-btn cockpit-btn-danger">
              <XCircle className="w-4 h-4" />
              <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
            </button>
          </>
        )}
      </div>

      {/* Loading Animation */}
      {classifyMutation.isPending && <Preloader message="Classification en cours" />}
      {generateMutation.isPending && <Preloader message="Génération du document" />}
      {deleteMutation.isPending && <Preloader message="Suppression" />}
    </div>
  );
}
