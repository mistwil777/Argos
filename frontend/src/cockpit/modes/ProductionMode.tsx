// ProductionMode - Mode Docs (bibliothèque de documents générés)
import { useState } from 'react';
import { useCourses } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { BookOpen, CheckCircle, FileText, AlertTriangle } from 'lucide-react';
import { CockpitHeader } from '../components/CockpitHeader';
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
      {/* Header */}
      <CockpitHeader 
        title="Production de documents"
        subtitle="Gérez vos cours et documents générés"
        icon={<BookOpen className="w-8 h-8 text-blue-300" />}
      />
      
      {/* Filters Bar */}
      <div className="h-14 bg-gradient-to-r from-[#0f1420]/40 to-[#1a1e2e]/40 backdrop-blur-sm border-b border-blue-900/30 flex items-center px-4 space-x-3">
        <button
          onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all border ${
            statusFilter === 'all'
              ? 'bg-blue-600/40 text-blue-200 border-blue-500/50 shadow-lg shadow-blue-500/20'
              : 'text-gray-400 hover:bg-blue-900/20 hover:text-blue-300 border-transparent hover:border-blue-700/30'
          }`}
        >
          Tout
        </button>
        <button
          onClick={() => setStatusFilter('draft')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 border ${
            statusFilter === 'draft'
              ? 'bg-gray-500/40 text-gray-200 border-gray-500/50 shadow-lg shadow-gray-500/20'
              : 'text-gray-400 hover:bg-gray-700/20 hover:text-gray-300 border-transparent hover:border-gray-700/30'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Draft ({courses.filter(c => c.status === 'draft').length})</span>
        </button>
        <button
          onClick={() => setStatusFilter('review')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 border ${
            statusFilter === 'review'
              ? 'bg-orange-500/40 text-orange-200 border-orange-500/50 shadow-lg shadow-orange-500/20'
              : 'text-gray-400 hover:bg-orange-900/20 hover:text-orange-300 border-transparent hover:border-orange-700/30'
          }`}
        >
          <AlertTriangle className="w-4 h-4" />
          <span>Review ({courses.filter(c => c.status === 'review').length})</span>
        </button>
        <button
          onClick={() => setStatusFilter('published')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center space-x-2 border ${
            statusFilter === 'published'
              ? 'bg-green-500/40 text-green-200 border-green-500/50 shadow-lg shadow-green-500/20'
              : 'text-gray-400 hover:bg-green-900/20 hover:text-green-300 border-transparent hover:border-green-700/30'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          <span>Published ({courses.filter(c => c.status === 'published').length})</span>
        </button>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Template filter */}
        <select className="px-3 py-1.5 bg-[#0f1420]/60 border border-blue-800/30 rounded-lg text-sm text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/50 hover:bg-[#1a1e2e]/60 transition-colors">
          <option value="">Tous les templates</option>
          <option value="course">Course</option>
          <option value="guide">Guide</option>
          <option value="tutorial">Tutorial</option>
        </select>
      </div>

      {/* Docs Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <BookOpen className="w-12 h-12 mb-3 text-gray-300" />
            <p>Aucun document trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
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
      className="cockpit-card rounded-xl p-5 hover:scale-[1.02] transition-all cursor-pointer group flex flex-col shadow-lg"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center space-x-2 flex-1">
          <BookOpen className="w-5 h-5 text-blue-400 flex-shrink-0" />
          <h3 className="font-semibold text-gray-100 line-clamp-2 group-hover:text-blue-300 transition-colors">
            {course.title}
          </h3>
        </div>
      </div>

      <p className="text-sm text-gray-400 line-clamp-3 mb-4 leading-relaxed flex-1">
        {course.description}
      </p>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${
            isPublished ? 'bg-green-900/40 text-green-300 border-green-600/40' :
            isReview ? 'bg-orange-900/40 text-orange-300 border-orange-600/40' :
            'bg-gray-800/40 text-gray-400 border-gray-600/40'
          }`}>
            {course.status}
          </span>

          {course.qa_score !== undefined && (
            <div className="flex items-center space-x-1.5">
              <span className="text-xs text-gray-500 font-medium">QA:</span>
              <span className={`text-xs font-bold ${
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
          <div className="flex flex-wrap gap-1.5">
            {course.topics.slice(0, 3).map((topic: string, idx: number) => (
              <span
                key={idx}
                className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full font-medium"
              >
                {topic}
              </span>
            ))}
            {course.topics.length > 3 && (
              <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-500 rounded-full">
                +{course.topics.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
