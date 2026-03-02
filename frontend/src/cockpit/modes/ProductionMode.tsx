// ProductionMode - Mode Docs (bibliothèque de documents générés)
import { useState } from 'react';
import { useCourses } from '../../hooks/useApi';
import { useCockpit } from '../context/CockpitContext';
import { BookOpen } from 'lucide-react';
import { CockpitHeader } from '../components/CockpitHeader';
import type { Course } from '../../types';

export function ProductionMode() {
  const { setSelectedDocId, setInspectorOpen } = useCockpit();
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
        <div className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <CockpitHeader
        title="Production"
        subtitle="Gérez vos cours et documents générés"
        icon={<BookOpen className="w-5 h-5 text-zinc-400" />}
      />

      {/* Filters */}
      <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-2">
        {([
          { key: 'all', label: 'Tout' },
          { key: 'draft', label: `Brouillons\u00a0(${courses.filter(c => c.status === 'draft').length})` },
          { key: 'review', label: `Revue\u00a0(${courses.filter(c => c.status === 'review').length})` },
          { key: 'published', label: `Publiés\u00a0(${courses.filter(c => c.status === 'published').length})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setStatusFilter(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 ${
              statusFilter === key
                ? 'bg-white/[0.08] text-zinc-200'
                : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 overflow-y-auto scrollable p-5">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <BookOpen className="w-10 h-10 text-zinc-800" strokeWidth={1.5} />
            <p className="text-sm text-zinc-700">Aucun document trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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

// DocCard
interface DocCardProps {
  course: Course;
  onClick: () => void;
}

function DocCard({ course, onClick }: DocCardProps) {
  const isPublished = course.status === 'published';
  const isReview = course.status === 'review';

  return (
    <div
      onClick={onClick}
      className="cockpit-card rounded-xl p-4 cursor-pointer group flex flex-col gap-3"
    >
      <div className="flex items-start gap-3">
        <BookOpen className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" strokeWidth={1.5} />
        <h3 className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors line-clamp-2 leading-snug">
          {course.title}
        </h3>
      </div>

      <p className="text-xs text-zinc-600 line-clamp-2 leading-relaxed">
        {course.description}
      </p>

      <div className="flex items-center justify-between mt-auto">
        <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
          isPublished ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
          isReview ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
          'bg-white/[0.04] text-zinc-500 border-white/[0.06]'
        }`}>
          {course.status}
        </span>

        {course.qa_score !== undefined && (
          <span className={`text-xs font-mono ${
            course.qa_score >= 0.8 ? 'text-emerald-500' :
            course.qa_score >= 0.6 ? 'text-amber-500' : 'text-red-500'
          }`}>
            {(course.qa_score * 100).toFixed(0)}%
          </span>
        )}
      </div>

      {course.topics && course.topics.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {course.topics.slice(0, 3).map((topic: string, idx: number) => (
            <span key={idx} className="text-xs px-2 py-0.5 bg-sky-500/8 text-sky-500/70 rounded border border-sky-500/15">
              {topic}
            </span>
          ))}
          {course.topics.length > 3 && (
            <span className="text-xs px-2 py-0.5 text-zinc-700">+{course.topics.length - 3}</span>
          )}
        </div>
      )}
    </div>
  );
}
