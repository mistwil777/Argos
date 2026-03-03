// DocInspector - Panneau de détails pour un document
import { useState } from 'react';
import { useCourse, usePublishCourse, useDeleteCourse, useModifyCourse } from '../../../hooks/useApi';
import { Check, Archive, RefreshCw, AlertTriangle, TrendingUp, Sparkles, Tag, Clock, Layers } from 'lucide-react';
import { Preloader } from '../Preloader';

interface DocInspectorProps {
  docId: number;
}

export function DocInspector({ docId }: DocInspectorProps) {
  const { data: course, isLoading, isError, error } = useCourse(docId);
  const publishMutation = usePublishCourse();
  const deleteMutation = useDeleteCourse();
  const modifyMutation = useModifyCourse();
  const [improveInstruction, setImproveInstruction] = useState('');

  const handleImprove = () => {
    if (!improveInstruction.trim()) return;
    modifyMutation.mutate(
      { id: course!.id, instruction: improveInstruction },
      { onSuccess: () => setImproveInstruction('') }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="w-6 h-6 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="p-5">
        <p className="text-sm font-medium text-red-400 mb-1">Erreur de chargement</p>
        <p className="text-xs text-zinc-600">{error?.message || 'Document introuvable'}</p>
      </div>
    );
  }

  const isDraft = course.status === 'draft';
  const isReview = course.status === 'review';
  const isPublished = course.status === 'published';

  const handlePublish = () => {
    publishMutation.mutate(course.id);
  };

  const handleDelete = () => {
    deleteMutation.mutate(course.id);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-white/[0.06]">
        <h2 className="text-sm font-medium text-zinc-200 mb-2 leading-snug">{course.title}</h2>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
          isPublished ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          isReview ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
          'bg-white/[0.04] text-zinc-500 border-white/[0.06]'
        }`}>
          {course.status}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollable p-4 flex flex-col gap-5">
        {/* Métadonnées */}
        <div className="flex flex-col gap-2">
          <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1">Métadonnées</h3>
          {course.topic && (
            <div className="flex items-center gap-2 text-xs">
              <Tag className="w-3.5 h-3.5 text-zinc-600 shrink-0" strokeWidth={1.5} />
              <span className="text-zinc-400">{course.topic}</span>
            </div>
          )}
          {course.level && (
            <div className="flex items-center gap-2 text-xs">
              <Layers className="w-3.5 h-3.5 text-zinc-600 shrink-0" strokeWidth={1.5} />
              <span className="text-zinc-400">{course.level}</span>
            </div>
          )}
          {course.duration && (
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-zinc-600 shrink-0" strokeWidth={1.5} />
              <span className="text-zinc-400">{course.duration} min</span>
            </div>
          )}
          {!course.topic && !course.level && !course.duration && (
            <p className="text-xs text-zinc-700 italic">Aucune métadonnée disponible</p>
          )}
        </div>

        {/* Améliorer avec IA */}
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Améliorer avec IA</h3>
          <textarea
            value={improveInstruction}
            onChange={(e) => setImproveInstruction(e.target.value)}
            placeholder="Ex: Ajoute plus d'exemples concrets, restructure la section 2..."
            rows={3}
            className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 text-xs text-zinc-300 placeholder-zinc-700"
          />
          <button
            onClick={handleImprove}
            disabled={!improveInstruction.trim() || modifyMutation.isPending}
            className="w-full cockpit-btn cockpit-btn-primary mt-2"
          >
            <Sparkles className="w-4 h-4" />
            <span>{modifyMutation.isPending ? 'Amélioration...' : 'Améliorer avec IA'}</span>
          </button>
        </div>

        {/* QA Score */}
        {course.qa_score !== undefined && course.qa_score !== null && (() => {
          const qaPercent = course.qa_score * 10; // Backend stores 0-10 scale
          return (
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Qualité (QA)</h3>
              <div className="flex items-center gap-3">
                <TrendingUp className={`w-4 h-4 ${
                  qaPercent >= 80 ? 'text-emerald-500' :
                  qaPercent >= 60 ? 'text-amber-500' :
                  'text-red-500'
                }`} />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-mono text-zinc-300">{qaPercent.toFixed(0)}%</span>
                  </div>
                  <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                    <div
                      className={`h-1.5 rounded-full transition-all ${
                        qaPercent >= 80 ? 'bg-emerald-500' :
                        qaPercent >= 60 ? 'bg-amber-500' :
                        'bg-red-500'
                      }`}
                      style={{ width: `${Math.min(qaPercent, 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* QA Issues */}
        {course.qa_issues && course.qa_issues.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span>Issues ({course.qa_issues.length})</span>
            </h3>
            <div className="flex flex-col gap-1.5">
              {course.qa_issues.map((issue: string, idx: number) => (
                <div key={idx} className="p-2.5 bg-amber-500/8 border border-amber-500/15 rounded-lg">
                  <p className="text-xs text-amber-400">{issue}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        {course.topics && course.topics.length > 0 && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Topics</h3>
            <div className="flex flex-wrap gap-1.5">
              {course.topics.map((topic: string, idx: number) => (
                <span key={idx} className="px-2 py-0.5 bg-sky-500/8 text-sky-500/70 border border-sky-500/15 rounded text-xs">
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Template */}
        {course.template_name && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Template</h3>
            <span className="inline-flex items-center px-2 py-0.5 bg-white/[0.05] text-zinc-400 border border-white/[0.08] rounded text-xs">
              {course.template_name}
            </span>
          </div>
        )}

        {/* Source Item Link */}
        {course.source_item_id && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Source</h3>
            <button className="text-xs text-sky-500 hover:text-sky-400 underline transition-colors">
              Voir l'item source #{course.source_item_id}
            </button>
          </div>
        )}

        {/* Dates */}
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Dates</h3>
          <div className="flex flex-col gap-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-600">Créé:</span>
              <span className="text-zinc-400 font-mono">{new Date(course.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            {course.published_at && (
              <div className="flex justify-between">
                <span className="text-zinc-600">Publié:</span>
                <span className="text-zinc-400 font-mono">{new Date(course.published_at).toLocaleDateString('fr-FR')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-white/[0.06] flex flex-col gap-2">
        {(isDraft || isReview) && (
          <button
            onClick={handlePublish}
            disabled={publishMutation.isPending}
            className="w-full cockpit-btn cockpit-btn-success"
          >
            <Check className="w-4 h-4" />
            <span>{publishMutation.isPending ? 'Publication...' : 'Publier'}</span>
          </button>
        )}
        
        <button
          disabled
          className="w-full cockpit-btn cockpit-btn-primary"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Régénérer</span>
        </button>

        <button
          onClick={handleDelete}
          disabled={deleteMutation.isPending}
          className="w-full cockpit-btn cockpit-btn-danger"
        >
          <Archive className="w-4 h-4" />
          <span>{deleteMutation.isPending ? 'Suppression...' : 'Supprimer'}</span>
        </button>
      </div>

      {/* Loading Animation */}
      {publishMutation.isPending && <Preloader message="Publication en cours" />}
      {deleteMutation.isPending && <Preloader message="Suppression" />}
      {modifyMutation.isPending && <Preloader message="Amélioration en cours" />}
    </div>
  );
}
