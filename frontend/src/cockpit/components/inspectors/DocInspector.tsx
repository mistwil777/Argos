// DocInspector - Panneau de détails pour un document
import { useState } from 'react';
import { useCourse, usePublishCourse, useDeleteCourse } from '../../../hooks/useApi';
import { Check, Archive, RefreshCw, AlertTriangle, TrendingUp, Eye, EyeOff } from 'lucide-react';
import { ContentModal } from '../ContentModal';

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
      <div className="p-4 text-gray-500 text-sm flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="p-4 text-red-500 text-sm">
        <p className="font-medium mb-2">Erreur de chargement</p>
        <p className="text-xs text-gray-500">{error?.message || 'Document introuvable'}</p>
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
    <div className="h-full flex flex-col bg-gradient-to-b from-[#0f1420]/80 to-[#1a1e2e]/80 backdrop-blur-sm">
      {/* Header */}
      <div className="p-4 border-b border-blue-900/30">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">{course.title}</h2>
        
        <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
          isPublished ? 'bg-green-100 text-green-700' :
          isReview ? 'bg-orange-100 text-orange-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {course.status}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        <div>
          <h3 className="text-xs font-semibold text-blue-400 uppercase mb-2">Description</h3>
          <p className="text-sm text-gray-200 leading-relaxed">{course.description}</p>
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
            <div className="mt-3 p-4 bg-gray-900/40 rounded-lg border border-blue-900/30 max-h-96 overflow-y-auto">
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-xs text-gray-300 leading-relaxed">
                  {course.content.substring(0, 500)}...
                </pre>
              </div>
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
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Qualité (QA)</h3>
            <div className="flex items-center space-x-3">
              <TrendingUp className={`w-5 h-5 ${
                course.qa_score >= 0.8 ? 'text-green-600' :
                course.qa_score >= 0.6 ? 'text-orange-600' :
                'text-red-600'
              }`} />
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900">
                    {(course.qa_score * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      course.qa_score >= 0.8 ? 'bg-green-600' :
                      course.qa_score >= 0.6 ? 'bg-orange-600' :
                      'bg-red-600'
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
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span>Issues détectés ({course.qa_issues.length})</span>
            </h3>
            <div className="space-y-2">
              {course.qa_issues.map((issue: string, idx: number) => (
                <div key={idx} className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <p className="text-sm text-orange-900">{issue}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Topics */}
        {course.topics && course.topics.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Topics</h3>
            <div className="flex flex-wrap gap-2">
              {course.topics.map((topic: string, idx: number) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
                >
                  {topic}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Template */}
        {course.template_name && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Template</h3>
            <span className="inline-block px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-sm font-medium">
              {course.template_name}
            </span>
          </div>
        )}

        {/* Source Item Link */}
        {course.source_item_id && (
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Source</h3>
            <button className="text-sm text-blue-600 hover:text-blue-700 underline">
              Voir l'item source #{course.source_item_id}
            </button>
          </div>
        )}

        {/* Dates */}
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Dates</h3>
          <div className="space-y-1 text-sm text-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-600">Créé:</span>
              <span>{new Date(course.created_at).toLocaleDateString('fr-FR')}</span>
            </div>
            {course.published_at && (
              <div className="flex justify-between">
                <span className="text-gray-600">Publié:</span>
                <span>{new Date(course.published_at).toLocaleDateString('fr-FR')}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-blue-900/30 space-y-2">
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
    </div>
  );
}
