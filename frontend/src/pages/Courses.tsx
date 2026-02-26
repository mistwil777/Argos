import { useState } from 'react';
import { useCourses, useCourse, usePublishCourse, useModifyCourse, useDeleteCourse, useValidateCourse, useExportCourse } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BookOpen, Clock, CheckCircle, FileText, X, Edit, Trash2, Download, FileDown, Check, CheckSquare, Square } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface CoursesProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number) => string;
  removeToast?: (id: string) => void;
}

export default function Courses({ addToast, removeToast }: CoursesProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [showModifyModal, setShowModifyModal] = useState(false);
  const [modifyInstruction, setModifyInstruction] = useState('');
  const [activeModifications, setActiveModifications] = useState<Set<number>>(new Set());
  const [selectedCourses, setSelectedCourses] = useState<Set<number>>(new Set());
  
  const { data: courses, isLoading, error } = useCourses({ status: statusFilter });
  const { data: selectedCourse } = useCourse(selectedCourseId);
  const publishMutation = usePublishCourse();
  const modifyMutation = useModifyCourse();
  const deleteMutation = useDeleteCourse();
  const validateMutation = useValidateCourse();
  const exportMutation = useExportCourse();

  const toggleSelectCourse = (courseId: number) => {
    setSelectedCourses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(courseId)) {
        newSet.delete(courseId);
      } else {
        newSet.add(courseId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedCourses.size === courses?.courses.length) {
      setSelectedCourses(new Set());
    } else {
      setSelectedCourses(new Set(courses?.courses.map(c => c.id) || []));
    }
  };

  const handlePublish = async (courseId: number) => {
    try {
      await publishMutation.mutateAsync(courseId);
      addToast?.('Cours publié', 'success');
    } catch (error) {
      addToast?.('Erreur lors de la publication', 'error');
    }
  };

  const handleBulkPublish = async () => {
    if (selectedCourses.size === 0) return;
    
    addToast?.(`Publication de ${selectedCourses.size} cours...`, 'loading', 0);
    let successCount = 0;

    for (const courseId of selectedCourses) {
      try {
        await publishMutation.mutateAsync(courseId);
        successCount++;
      } catch (error) {
        console.error(error);
      }
    }

    addToast?.(
      `${successCount}/${selectedCourses.size} cours publiés`,
      successCount === selectedCourses.size ? 'success' : 'info',
      5000
    );
    setSelectedCourses(new Set());
  };

  const handleDelete = async (courseId: number) => {
    try {
      await deleteMutation.mutateAsync(courseId);
      setSelectedCourseId(null);
      addToast?.('Cours supprimé', 'success');
    } catch (error) {
      addToast?.('Erreur lors de la suppression', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedCourses.size === 0) return;

    addToast?.(`Suppression de ${selectedCourses.size} cours...`, 'loading', 0);

    for (const courseId of selectedCourses) {
      try {
        await deleteMutation.mutateAsync(courseId);
      } catch (error) {
        console.error(error);
      }
    }

    addToast?.(`${selectedCourses.size} cours supprimés`, 'success');
    setSelectedCourses(new Set());
  };

  const handleValidate = async (courseId: number) => {
    try {
      await validateMutation.mutateAsync(courseId);
      addToast?.('Cours validé et déplacé en révision', 'success');
    } catch (error) {
      addToast?.('Erreur lors de la validation', 'error');
    }
  };

  const handleBulkValidate = async () => {
    if (selectedCourses.size === 0) return;
    
    addToast?.(`Validation de ${selectedCourses.size} cours...`, 'loading', 0);
    let successCount = 0;

    for (const courseId of selectedCourses) {
      try {
        await validateMutation.mutateAsync(courseId);
        successCount++;
      } catch (error) {
        console.error(error);
      }
    }

    addToast?.(
      `${successCount}/${selectedCourses.size} cours validés`,
      successCount === selectedCourses.size ? 'success' : 'info',
      5000
    );
    setSelectedCourses(new Set());
  };

  const handleModify = async () => {
    if (!selectedCourseId || !modifyInstruction.trim()) {
      addToast?.('Veuillez entrer une instruction de modification', 'error');
      return;
    }

    const courseId = selectedCourseId;
    const instruction = modifyInstruction;
    
    // Add to active modifications
    setActiveModifications(prev => new Set(prev).add(courseId));
    
    // Show loading toast
    let toastId: string | undefined;
    if (addToast) {
      toastId = addToast('Modification du cours en cours...', 'loading', 0);
    }
    
    // Close modal immediately - user can continue browsing
    setShowModifyModal(false);
    setModifyInstruction('');

    try {
      const result = await modifyMutation.mutateAsync({
        id: courseId,
        instruction
      });
      
      // Remove loading toast
      if (toastId && removeToast) {
        removeToast(toastId);
      }
      
      addToast?.(
        `Cours modifié avec succès! Coût: $${result.cost.toFixed(4)}, Tokens: ${result.tokens_used}`,
        'success',
        6000
      );
    } catch (error) {
      // Remove loading toast
      if (toastId && removeToast) {
        removeToast(toastId);
      }
      
      addToast?.('Erreur lors de la modification du cours', 'error');
    } finally {
      setActiveModifications(prev => {
        const newSet = new Set(prev);
        newSet.delete(courseId);
        return newSet;
      });
    }
  };

  const handleExport = async (format: 'markdown' | 'pdf') => {
    if (!selectedCourseId) return;
    
    try {
      await exportMutation.mutateAsync({ id: selectedCourseId, format });
      addToast?.(`Cours exporté en ${format === 'markdown' ? 'Markdown' : 'PDF'}`, 'success');
    } catch (error) {
      addToast?.('Erreur lors de l\'export', 'error');
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Erreur lors du chargement des cours</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <BookOpen className="h-5 w-5 text-blue-600 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-blue-900 mb-1">Workflow des cours</h3>
            <p className="text-xs text-blue-800">
              <span className="font-medium">Draft</span> → Cours nouvellement généré • 
              <span className="font-medium"> En révision</span> → Cours validé • 
              <span className="font-medium"> Publié</span> → Cours finalisé et accessible
            </p>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Cours générés</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Tous les cours</option>
          <option value="draft">Brouillons</option>
          <option value="review">En révision</option>
          <option value="published">Publiés</option>
        </select>
      </div>

      {/* Select All Button */}
      {courses && courses.courses.length > 0 && (
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary-600 transition-colors"
        >
          {selectedCourses.size === courses.courses.length ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {selectedCourses.size === courses.courses.length ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      )}

      {/* Bulk Actions Bar */}
      {selectedCourses.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900">
            {selectedCourses.size} cours sélectionné{selectedCourses.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            {courses?.courses.some(c => selectedCourses.has(c.id) && c.status === 'draft') && (
              <Button variant="primary" size="sm" onClick={handleBulkValidate}>
                <Check className="h-4 w-4 mr-1" />
                Valider tout
              </Button>
            )}
            {courses?.courses.some(c => selectedCourses.has(c.id) && c.status === 'review') && (
              <Button variant="success" size="sm" onClick={handleBulkPublish}>
                <CheckCircle className="h-4 w-4 mr-1" />
                Publier tout
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleBulkDelete}>
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedCourses(new Set())}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      {courses && courses.courses.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <BookOpen className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun cours</h3>
            <p className="mt-1 text-sm text-gray-500">
              Aucun cours ne correspond aux filtres sélectionnés.
            </p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Course List */}
          <div className="space-y-4">
            {courses?.courses.map((course) => (
              <div 
                key={course.id}
                className={`transition-all ${
                  selectedCourseId === course.id ? 'ring-2 ring-primary-500' : 'hover:shadow-md'
                }`}
              >
                <Card>
                <div className="flex items-start gap-4">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelectCourse(course.id);
                    }}
                    className="mt-1 flex-shrink-0"
                    title="Sélectionner ce cours"
                  >
                    {selectedCourses.has(course.id) ? (
                      <CheckSquare className="h-5 w-5 text-primary-600" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>

                  <div 
                    className="flex items-start justify-between flex-1 cursor-pointer"
                    onClick={() => setSelectedCourseId(course.id)}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        {course.status === 'published' ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : course.status === 'review' ? (
                          <Check className="h-5 w-5 text-blue-600" />
                        ) : (
                          <FileText className="h-5 w-5 text-yellow-600" />
                        )}
                        <h3 className="text-lg font-semibold text-gray-900">{course.title}</h3>
                      </div>
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {course.topic && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {course.topic}
                        </span>
                      )}
                      {course.level && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          course.level === 'beginner' ? 'bg-green-100 text-green-800' :
                          course.level === 'intermediate' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-red-100 text-red-800'
                        }`}>
                          {course.level}
                        </span>
                      )}
                      {activeModifications.has(course.id) && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 animate-pulse">
                          <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-orange-600"></div>
                          Modification en cours...
                        </span>
                      )}
                      {course.qa_score !== null && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          QA: {course.qa_score?.toFixed(1)}/10
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      {course.duration && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          {course.duration} min
                        </span>
                      )}
                      {course.created_at && (
                        <span>Créé le {new Date(course.created_at).toLocaleDateString('fr-FR')}</span>
                      )}
                    </div>
                  </div>
                  
                  {course.status === 'draft' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePublish(course.id);
                      }}
                      isLoading={publishMutation.isPending}
                    >
                      Publier
                    </Button>
                  )}
                  </div>
                </div>
              </Card>
            </div>
            ))}
          </div>

          {/* Course Detail */}
          <div className="lg:sticky lg:top-6 h-fit max-h-[calc(100vh-8rem)] overflow-hidden">
            {selectedCourseId && selectedCourse ? (
              <Card>
                <div className="flex justify-between items-start mb-4">
                  <h2 className="text-xl font-bold text-gray-900">{selectedCourse.title}</h2>
                  <button
                    onClick={() => setSelectedCourseId(null)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                
                <div className="flex flex-wrap gap-2 mb-4">
                  {selectedCourse.topic && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                      {selectedCourse.topic}
                    </span>
                  )}
                  {selectedCourse.level && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
                      {selectedCourse.level}
                    </span>
                  )}
                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                    selectedCourse.status === 'published' ? 'bg-green-100 text-green-800' : 
                    selectedCourse.status === 'review' ? 'bg-blue-100 text-blue-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {selectedCourse.status}
                  </span>
                  {selectedCourse.duration && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium bg-purple-100 text-purple-800">
                      <Clock className="h-4 w-4" />
                      {selectedCourse.duration} min
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-2 mb-4 pb-4 border-b border-gray-200">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowModifyModal(true)}
                    isLoading={modifyMutation.isPending}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    Modifier avec IA
                  </Button>
                  
                  {selectedCourse.status !== 'review' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleValidate(selectedCourseId)}
                      isLoading={validateMutation.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Valider
                    </Button>
                  )}
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleExport('markdown')}
                    isLoading={exportMutation.isPending}
                  >
                    <FileDown className="h-4 w-4 mr-1" />
                    Export MD
                  </Button>
                  
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleExport('pdf')}
                    isLoading={exportMutation.isPending}
                  >
                    <Download className="h-4 w-4 mr-1" />
                    Export PDF
                  </Button>
                  
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(selectedCourseId)}
                    isLoading={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Supprimer
                  </Button>
                </div>

                <div className="overflow-y-auto max-h-[calc(100vh-28rem)] pr-2 custom-scrollbar">
                  <div className="prose prose-sm max-w-none 
                    prose-headings:text-gray-900 
                    prose-h1:text-3xl prose-h1:font-bold prose-h1:mb-6 prose-h1:mt-8 prose-h1:border-b-2 prose-h1:border-primary-500 prose-h1:pb-3
                    prose-h2:text-2xl prose-h2:font-bold prose-h2:mt-8 prose-h2:mb-4 prose-h2:text-primary-700 prose-h2:border-l-4 prose-h2:border-primary-500 prose-h2:pl-4
                    prose-h3:text-xl prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-3 prose-h3:text-primary-600
                    prose-h4:text-lg prose-h4:font-semibold prose-h4:mt-4 prose-h4:mb-2 prose-h4:text-gray-800
                    prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-4
                    prose-strong:text-primary-800 prose-strong:font-bold prose-strong:bg-yellow-50 prose-strong:px-1
                    prose-em:text-purple-700 prose-em:italic
                    prose-code:bg-gray-100 prose-code:text-pink-600 prose-code:px-2 prose-code:py-1 prose-code:rounded prose-code:text-sm prose-code:font-mono
                    prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:p-4 prose-pre:rounded-lg prose-pre:overflow-x-auto prose-pre:shadow-lg
                    prose-ul:list-none prose-ul:ml-0 prose-ul:space-y-2
                    prose-li:text-gray-700 prose-li:mb-2 prose-li:pl-6 prose-li:relative 
                    prose-li:before:content-['▸'] prose-li:before:absolute prose-li:before:left-0 prose-li:before:text-primary-500 prose-li:before:font-bold
                    prose-ol:list-decimal prose-ol:ml-6 prose-ol:space-y-2
                    prose-blockquote:border-l-4 prose-blockquote:border-primary-500 prose-blockquote:bg-primary-50 prose-blockquote:pl-4 prose-blockquote:py-2 prose-blockquote:italic prose-blockquote:text-gray-700 prose-blockquote:rounded-r
                    prose-a:text-primary-600 prose-a:underline prose-a:font-medium hover:prose-a:text-primary-800
                    prose-hr:border-gray-300 prose-hr:my-8
                    prose-table:border-collapse prose-table:w-full
                    prose-th:bg-primary-100 prose-th:p-3 prose-th:text-left prose-th:font-semibold prose-th:text-primary-900
                    prose-td:border prose-td:border-gray-300 prose-td:p-3
                  ">
                    <style dangerouslySetInnerHTML={{__html: `
                      .custom-scrollbar::-webkit-scrollbar {
                        width: 8px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-track {
                        background: #f1f1f1;
                        border-radius: 4px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-thumb {
                        background: #888;
                        border-radius: 4px;
                      }
                      .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background: #555;
                      }
                      .prose pre code {
                        background: transparent;
                        color: inherit;
                        padding: 0;
                      }
                      .prose code::before,
                      .prose code::after {
                        content: none;
                      }
                    `}} />
                    <ReactMarkdown>{selectedCourse.content || 'Aucun contenu disponible'}</ReactMarkdown>
                  </div>
                </div>
              </Card>
            ) : (
              <Card>
                <div className="text-center py-12 text-gray-500">
                  <BookOpen className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                  <p>Sélectionnez un cours pour voir les détails</p>
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* Modify Modal */}
      {showModifyModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">🤖 Modifier le cours avec l'IA</h3>
              <button
                onClick={() => {
                  setShowModifyModal(false);
                  setModifyInstruction('');
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Instruction de modification
                </label>
                <textarea
                  value={modifyInstruction}
                  onChange={(e) => setModifyInstruction(e.target.value)}
                  placeholder="Ex: Ajouter des exemples concrets pour chaque concept, Ajouter plus de définitions techniques, Simplifier l'introduction..."
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 Exemples d'instructions :</strong>
                </p>
                <ul className="text-sm text-blue-700 mt-2 space-y-1 list-disc list-inside">
                  <li>Ajouter des exemples de code Python pour chaque concept</li>
                  <li>Développer la section sur les applications pratiques</li>
                  <li>Ajouter des définitions pour les termes techniques</li>
                  <li>Simplifier le langage pour des débutants</li>
                  <li>Ajouter des exercices pratiques supplémentaires</li>
                </ul>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowModifyModal(false);
                    setModifyInstruction('');
                  }}
                >
                  Annuler
                </Button>
                <Button
                  variant="primary"
                  onClick={handleModify}
                  isLoading={modifyMutation.isPending}
                  disabled={!modifyInstruction.trim()}
                >
                  <Edit className="h-4 w-4 mr-1" />
                  Modifier
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
