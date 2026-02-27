// ProductionMode - Mode Docs (bibliothèque de documents générés)
import { useState } from 'react';
import { useCourses } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { BookOpen, CheckCircle, FileText, AlertTriangle } from 'lucide-react';
import type { Course } from '../../types';

export function ProductionMode() {
  const { setInspectorOpen, setSelectedDocId } = useCockpit();
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'review' | 'published'>('all');
  
  const { data: coursesData, isLoading } = useCourses({
    status: statusFilter === 'all' ? undefined : statusFilter
  });

  const courses = coursesData?.courses || [];

  const handleDocClick = (course: Course) => {
    setSelectedDocId(course.id);
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
          onClick={() => setStatusFilter('draft')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            statusFilter === 'draft'
              ? 'bg-gray-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Draft ({courses.filter(c => c.status === 'draft').length})</span>
        </button>
        <button
          onClick={() => setStatusFilter('review')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            statusFilter === 'review'
              ? 'bg-orange-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Review ({courses.filter(c => c.status === 'review').length})</span>
        </button>
        <button
          onClick={() => setStatusFilter('published')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            statusFilter === 'published'
              ? 'bg-green-500 text-white'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Published ({courses.filter(c => c.status === 'published').length})</span>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Template filter */}
        <select className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">Tous les templates</option>
          <option value="course">Course</option>
          <option value="guide">Guide</option>
          <option value="tutorial">Tutorial</option>
        </select>
      </div>

      {/* Docs Grid */}
      <div className="flex-1 overflow-y-auto p-4">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
            <p>Aucun document trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {courses.map((course) => (
              <DocCard
                key={course.id}
                course={course}
                onClick={() => handleDocClick(course)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// DocCard - Carte pour un document
interface DocCardProps {
  course: Course;
  onClick: () => void;
}

function DocCard({ course, onClick }: DocCardProps) {
  // const isDraft = course.status === 'draft';
  const isReview = course.status === 'review';
  const isPublished = course.status === 'published';

  return (
    <div
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2">
          <BookOpen className="w-5 h-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900 line-clamp-2">{course.title}</h3>
        </div>
      </div>

      <p className="text-sm text-gray-600 line-clamp-3 mb-4">{course.description}</p>

      <div className="flex items-center justify-between">
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          isPublished ? 'bg-green-100 text-green-700' :
          isReview ? 'bg-orange-100 text-orange-700' :
          'bg-gray-100 text-gray-700'
        }`}>
          {course.status}
        </span>

        {course.qa_score !== undefined && (
          <div className="flex items-center space-x-1">
            <span className="text-xs text-gray-500">QA:</span>
            <span className={`text-xs font-medium ${
              course.qa_score >= 0.8 ? 'text-green-600' :
              course.qa_score >= 0.6 ? 'text-orange-600' :
              'text-red-600'
            }`}>
              {(course.qa_score * 100).toFixed(0)}%
            </span>
          </div>
        )}
      </div>

      {course.topics && course.topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {course.topics.slice(0, 3).map((topic, idx) => (
            <span
              key={idx}
              className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs"
            >
              {topic}
            </span>
          ))}
          {course.topics.length > 3 && (
            <span className="px-2 py-0.5 bg-gray-50 text-gray-600 rounded-full text-xs">
              +{course.topics.length - 3}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
