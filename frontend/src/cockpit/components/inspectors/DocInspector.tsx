// DocInspector - Panneau de détails pour un document
import { useState } from 'react';
import { useCourse, usePublishCourse, useDeleteCourse } from '../../../hooks/useApi';
import { Check, Archive, RefreshCw, AlertTriangle, TrendingUp, Eye, EyeOff } from 'lucide-react';
import { ContentModal } from '../ContentModal';
import { Preloader } from '../Preloader';

interface DocInspectorProps {
  docId: number;
}

export function DocInspector({ docId }: DocInspectorProps) {
  const { data: course, isLoading, isError, error } = useCourse(docId);
  const publishMutation = usePublishCourse();
  const deleteMutation = useDeleteCourse();
  const [showContent, setShowContent] = useState(false);
  const [showFullContent, setShowFullContent] = useState(false);

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
        {/* Description */}
        <div>
          <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Description</h3>
          <p className="text-xs text-zinc-400 leading-relaxed">{course.description}</p>
        </div>

        {/* Content Viewer Toggle */}
        <div className="space-y-2">
          <button
            onClick={() => setShowContent(!showContent)}
            className="cockpit-btn cockpit-btn-primary w-full"
          >
            {showContent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{showContent ? 'Masquer l\'aperçu' : 'Afficher l\'aperçu'}</span>
          </button>
          
          {course.content && (
            <button
              onClick={() => setShowFullContent(true)}
              className="cockpit-btn w-full"
            >
              <Eye className="w-4 h-4" />
              <span>Ouvrir en grand</span>
            </button>
          )}
          
          {showContent && course.content && (
            <div className="mt-3 p-3 bg-white/[0.03] rounded-lg border border-white/[0.06] max-h-48 overflow-y-auto scrollable">
              <pre className="whitespace-pre-wrap text-xs text-zinc-400 leading-relaxed">
                {course.content.substring(0, 500)}...
              </pre>
            </div>
          )}
        </div>

        {/* Content Modal */}
        <ContentModal 
          isOpen={showFullContent}
          onClose={() => setShowFullContent(false)}
          title={course.title}
          content={course.content || ''}
        />

        {/* QA Score */}
        {course.qa_score !== undefined && (
          <div>
            <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Qualité (QA)</h3>
            <div className="flex items-center gap-3">
              <TrendingUp className={`w-4 h-4 ${
                course.qa_score >= 0.8 ? 'text-emerald-500' :
                course.qa_score >= 0.6 ? 'text-amber-500' :
                'text-red-500'
              }`} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-mono text-zinc-300">
                    {(course.qa_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      course.qa_score >= 0.8 ? 'bg-emerald-500' :
                      course.qa_score >= 0.6 ? 'bg-amber-500' :
                      'bg-red-500'
                    }`}
                    style={{ width: `${course.qa_score * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

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
    </div>
  );
}
