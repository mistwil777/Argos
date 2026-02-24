import { useState } from 'react';
import { useCourses, useCourse, usePublishCourse } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { BookOpen, Clock, CheckCircle, FileText, X } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

export default function Courses() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  
  const { data: courses, isLoading, error } = useCourses({ status: statusFilter });
  const { data: selectedCourse } = useCourse(selectedCourseId);
  const publishMutation = usePublishCourse();

  const handlePublish = async (courseId: number) => {
    if (confirm('Publier ce cours ?')) {
      await publishMutation.mutateAsync(courseId);
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
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Cours générés</h1>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          <option value="all">Tous les cours</option>
          <option value="draft">Brouillons</option>
          <option value="published">Publiés</option>
        </select>
      </div>

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
                className={`cursor-pointer transition-all ${
                  selectedCourseId === course.id ? 'ring-2 ring-primary-500' : 'hover:shadow-md'
                }`}
                onClick={() => setSelectedCourseId(course.id)}
              >
                <Card>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      {course.status === 'published' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
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
              </Card>
            </div>
            ))}
          </div>

          {/* Course Detail */}
          <div className="lg:sticky lg:top-6 h-fit">
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
                
                <div className="flex flex-wrap gap-2 mb-6">
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
                    selectedCourse.status === 'published' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {selectedCourse.status}
                  </span>
                </div>

                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{selectedCourse.content || 'Aucun contenu disponible'}</ReactMarkdown>
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
    </div>
  );
}
