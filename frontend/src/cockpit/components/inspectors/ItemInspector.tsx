// ItemInspector - Panneau de détails pour un item sélectionné
import { useState } from 'react';
import { useItem, useDeleteItem, useClassifyItem } from '../../../hooks/useApi';
import { useCockpit } from '../../context/CockpitContext';
import type { GenerationTask } from '../../context/CockpitContext';
import { XCircle, FileText, Calendar, Link as LinkIcon, TrendingUp, BookOpen, X, GraduationCap, Map, Newspaper, ClipboardList, Briefcase, Sparkles, Check, Loader2 } from 'lucide-react';
import { Preloader } from '../Preloader';

interface ItemInspectorProps {
  itemId: number;
}

const CONTENT_TYPES = [
  { id: 'course',       label: 'Cours pédagogique', desc: 'Structure complète 5000+ mots, objectifs, quiz', icon: GraduationCap, color: 'text-sky-400',     bg: 'bg-sky-500/10 border-sky-500/20',     ring: 'ring-sky-500/40' },
  { id: 'guide',        label: 'Guide pratique',    desc: 'Étapes concrètes et actionnables',              icon: Map,            color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20', ring: 'ring-emerald-500/40' },
  { id: 'article',      label: 'Article de veille', desc: 'Analyse tendances, accessibl, 1500-2000 mots',  icon: Newspaper,      color: 'text-indigo-400',  bg: 'bg-indigo-500/10 border-indigo-500/20',  ring: 'ring-indigo-500/40' },
  { id: 'fiche',        label: 'Fiche de synthèse', desc: 'Points clés, avantages/limites, ressources',    icon: ClipboardList,  color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20',    ring: 'ring-amber-500/40' },
  { id: 'cas_pratique', label: 'Cas pratique',      desc: 'Contexte métier, mise en œuvre, résultats',     icon: Briefcase,      color: 'text-rose-400',    bg: 'bg-rose-500/10 border-rose-500/20',      ring: 'ring-rose-500/40' },
];

export function ItemInspector({ itemId }: ItemInspectorProps) {
  const { data: item, isLoading, isError, error } = useItem(itemId);
  const deleteMutation = useDeleteItem();
  const classifyMutation = useClassifyItem();
  const { enqueueGenerations, activeGeneration, pendingGenerations } = useCockpit();

  const [showTypeModal, setShowTypeModal] = useState(false);
  // Multi-select: Set of selected content type ids
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set(['course']));

  // Derive generation state for THIS item from the global context queue
  const myPending = pendingGenerations.filter(t => t.itemId === itemId);
  const myActive = activeGeneration?.itemId === itemId ? activeGeneration : null;
  const isGeneratingForThisItem = myActive !== null || myPending.length > 0;

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

  const handleDelete = () => { deleteMutation.mutate(item.id); };

  const toggleType = (id: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        // Keep at least one selected
        if (next.size > 1) next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleGenerateConfirm = () => {
    setShowTypeModal(false);
    const tasks: GenerationTask[] = [...selectedTypes].map(contentType => ({
      id: `${item.id}-${contentType}`,
      itemId: item.id,
      contentType,
      durationMinutes: 60,
      label: CONTENT_TYPES.find(t => t.id === contentType)?.label ?? contentType,
    }));
    enqueueGenerations(tasks);
  };

  return (
    <div className="h-full flex flex-col relative">
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
          {isPending ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] text-amber-500/70 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 cockpit-indicator-active shrink-0" />
                Résumé FR disponible après classification
              </p>
              {item.summary ? (
                <p className="text-xs text-zinc-600 leading-relaxed line-clamp-4">{item.summary}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-zinc-400 leading-relaxed">{item.summary}</p>
          )}
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
            <button
              onClick={() => classifyMutation.mutate(item.id)}
              disabled={classifyMutation.isPending}
              className="w-full cockpit-btn cockpit-btn-primary"
            >
              <Sparkles className="w-4 h-4" />
              <span>{classifyMutation.isPending ? 'Classification…' : 'Classifier maintenant'}</span>
            </button>
            <button onClick={handleDelete} disabled={deleteMutation.isPending} className="w-full cockpit-btn cockpit-btn-danger">
              <XCircle className="w-4 h-4" />
              <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
            </button>
          </>
        )}
        {isClassified && (
          <>
            <button onClick={() => setShowTypeModal(true)} disabled={isGeneratingForThisItem} className="w-full cockpit-btn cockpit-btn-success">
              {isGeneratingForThisItem
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <BookOpen className="w-4 h-4" />}
              <span>
                {myActive
                  ? `Génération en cours…`
                  : myPending.length > 0
                  ? `${myPending.length} en attente…`
                  : 'Générer document(s)'}
              </span>
            </button>
            <button onClick={handleDelete} disabled={deleteMutation.isPending} className="w-full cockpit-btn cockpit-btn-danger">
              <XCircle className="w-4 h-4" />
              <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
            </button>
          </>
        )}
      </div>

      {/* Content Type Selection Modal */}
      {showTypeModal && (
        <div className="absolute inset-0 bg-zinc-900 z-20 flex flex-col p-4 gap-3">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h3 className="text-sm font-semibold text-zinc-200">Type de document</h3>
              <p className="text-[11px] text-zinc-500 mt-0.5">Sélectionnez un ou plusieurs formats</p>
            </div>
            <button onClick={() => setShowTypeModal(false)} className="p-1.5 rounded-lg hover:bg-white/[0.08] text-zinc-500 hover:text-zinc-200 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-col gap-2 flex-1 overflow-y-auto scrollable">
            {CONTENT_TYPES.map((type) => {
              const Icon = type.icon;
              const isSelected = selectedTypes.has(type.id);
              return (
                <button
                  key={type.id}
                  onClick={() => toggleType(type.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${
                    isSelected
                      ? `${type.bg} ring-1 ${type.ring}`
                      : 'bg-white/[0.05] border-white/[0.1] hover:bg-white/[0.09] hover:border-white/[0.15]'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? type.bg : 'bg-white/[0.04]'}`}>
                    <Icon className={`w-4 h-4 ${isSelected ? type.color : 'text-zinc-600'}`} strokeWidth={1.75} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs font-semibold ${isSelected ? type.color : 'text-zinc-400'}`}>{type.label}</p>
                    <p className="text-[10px] text-zinc-600 truncate">{type.desc}</p>
                  </div>
                  {isSelected && (
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${type.bg}`}>
                      <Check className={`w-3 h-3 ${type.color}`} strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <button
            onClick={handleGenerateConfirm}
            disabled={selectedTypes.size === 0}
            className="mt-auto w-full cockpit-btn cockpit-btn-success"
          >
            <BookOpen className="w-4 h-4" />
            <span>
              {selectedTypes.size === 1
                ? `Générer — ${CONTENT_TYPES.find(t => selectedTypes.has(t.id))?.label}`
                : `Générer ${selectedTypes.size} documents`}
            </span>
          </button>
        </div>
      )}

      {deleteMutation.isPending && <Preloader message="Suppression" />}
    </div>
  );
}
