// ProductionMode - Mode Docs (bibliothèque de documents générés)
import { useState } from 'react';
import { useCourses, useCourse, usePublishCourse, useDeleteCourse, useModifyCourse } from '../../hooks/useApi';
import {
  BookOpen, Clock, Tag, TrendingUp, Check, Archive,
  Sparkles, ChevronLeft, AlertTriangle, Calendar, Layers
} from 'lucide-react';
import { CockpitHeader } from '../components/CockpitHeader';
import { Preloader } from '../components/Preloader';
import ReactMarkdown from 'react-markdown';

// ─── QA helpers ────────────────────────────────────────────────────────────────
function qaPercent(score: number | null | undefined): number {
  if (score == null) return 0;
  return score * 10; // Backend stores 0-10; convert to 0-100%
}
function qaColor(pct: number) {
  return pct >= 80 ? 'text-emerald-500' : pct >= 60 ? 'text-amber-500' : 'text-red-500';
}
function qaBg(pct: number) {
  return pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-amber-500' : 'bg-red-500';
}

// ─── Markdown renderer ─────────────────────────────────────────────────────────
const mdComponents = {
  h1: ({ children }: any) => (
    <h1 className="text-xl font-bold text-zinc-100 mt-10 mb-4 first:mt-0">{children}</h1>
  ),
  h2: ({ children }: any) => (
    <h2 className="text-base font-semibold text-zinc-200 mt-8 mb-3 pb-2 border-b border-white/[0.06]">{children}</h2>
  ),
  h3: ({ children }: any) => (
    <h3 className="text-sm font-semibold text-zinc-300 mt-5 mb-2">{children}</h3>
  ),
  h4: ({ children }: any) => (
    <h4 className="text-xs font-semibold text-sky-400/80 mt-4 mb-1.5 uppercase tracking-wider">{children}</h4>
  ),
  p: ({ children }: any) => (
    <p className="text-sm text-zinc-400 leading-relaxed mb-3">{children}</p>
  ),
  ul: ({ children }: any) => <ul className="space-y-1.5 mb-4">{children}</ul>,
  ol: ({ children }: any) => <ol className="space-y-1.5 mb-4 pl-4 list-decimal marker:text-sky-500/50">{children}</ol>,
  li: ({ children }: any) => (
    <li className="flex gap-2 text-sm text-zinc-400 leading-relaxed">
      <span className="mt-[9px] w-1.5 h-1.5 rounded-full bg-sky-500/50 shrink-0" />
      <span>{children}</span>
    </li>
  ),
  code: ({ children, className }: any) => {
    const isBlock = !!className;
    return isBlock ? (
      <code className="block bg-zinc-900/80 border border-white/[0.08] rounded-lg px-4 py-3 text-xs font-mono text-zinc-300 overflow-x-auto mb-4 leading-relaxed">
        {children}
      </code>
    ) : (
      <code className="px-1.5 py-0.5 bg-sky-500/10 border border-sky-500/20 rounded text-[11px] font-mono text-sky-400">
        {children}
      </code>
    );
  },
  pre: ({ children }: any) => (
    <pre className="bg-zinc-900/80 border border-white/[0.08] rounded-lg overflow-x-auto mb-4">{children}</pre>
  ),
  blockquote: ({ children }: any) => (
    <blockquote className="border-l-2 border-sky-500/40 pl-4 my-4 text-sm text-zinc-500 italic">{children}</blockquote>
  ),
  strong: ({ children }: any) => <strong className="font-semibold text-zinc-200">{children}</strong>,
  hr: () => <hr className="border-white/[0.06] my-6" />,
  table: ({ children }: any) => (
    <div className="overflow-x-auto mb-4">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  th: ({ children }: any) => (
    <th className="text-left px-3 py-2 bg-white/[0.04] border border-white/[0.06] text-zinc-400 font-medium uppercase tracking-wider">{children}</th>
  ),
  td: ({ children }: any) => (
    <td className="px-3 py-2 border border-white/[0.06] text-zinc-500">{children}</td>
  ),
};

// ─── CourseReader ───────────────────────────────────────────────────────────────
function CourseReader({ courseId, onBack }: { courseId: number; onBack: () => void }) {
  const { data: course, isLoading } = useCourse(courseId);
  const publishMutation = usePublishCourse();
  const deleteMutation = useDeleteCourse();
  const modifyMutation = useModifyCourse();
  const [improveInstruction, setImproveInstruction] = useState('');
  const [showImprove, setShowImprove] = useState(false);

  if (isLoading || !course) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  const pct = qaPercent(course.qa_score);
  const isDraft = course.status === 'draft';
  const isReview = course.status === 'review';

  const handleImprove = () => {
    if (!improveInstruction.trim()) return;
    modifyMutation.mutate(
      { id: course.id, instruction: improveInstruction },
      { onSuccess: () => { setImproveInstruction(''); setShowImprove(false); } }
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* TopBar */}
      <div className="h-12 border-b border-white/[0.06] flex items-center gap-4 px-5 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-300 transition-colors shrink-0">
          <ChevronLeft className="w-3.5 h-3.5" />
          <span>Retour</span>
        </button>
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
          <span className={`shrink-0 px-2 py-0.5 rounded-md text-xs font-medium border ${
            course.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
            course.status === 'review'    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
            'bg-white/[0.04] text-zinc-500 border-white/[0.06]'
          }`}>{course.status}</span>
          {course.topic && (
            <span className="flex items-center gap-1 text-xs text-zinc-600 truncate">
              <Tag className="w-3 h-3 shrink-0" strokeWidth={1.5} />{course.topic}
            </span>
          )}
          {course.level && (
            <span className="flex items-center gap-1 text-xs text-zinc-600">
              <Layers className="w-3 h-3 shrink-0" strokeWidth={1.5} />{course.level}
            </span>
          )}
          {course.duration && (
            <span className="flex items-center gap-1 text-xs text-zinc-600">
              <Clock className="w-3 h-3 shrink-0" strokeWidth={1.5} />{course.duration} min
            </span>
          )}
          {course.qa_score != null && (
            <span className={`flex items-center gap-1 text-xs font-mono ${qaColor(pct)}`}>
              <TrendingUp className="w-3 h-3 shrink-0" strokeWidth={1.5} />QA {pct.toFixed(0)}%
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setShowImprove(!showImprove)}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              showImprove
                ? 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05] border-transparent'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Améliorer</span>
          </button>
          {(isDraft || isReview) && (
            <button
              onClick={() => publishMutation.mutate(course.id)}
              disabled={publishMutation.isPending}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 transition-all"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{publishMutation.isPending ? '...' : 'Publier'}</span>
            </button>
          )}
          <button
            onClick={() => deleteMutation.mutate(course.id)}
            disabled={deleteMutation.isPending}
            className="p-2 rounded-lg text-zinc-700 hover:text-red-400 hover:bg-red-500/[0.08] transition-all"
          >
            <Archive className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Improve panel */}
      {showImprove && (
        <div className="px-12 pt-4 pb-0 shrink-0 border-b border-white/[0.06]">
          <div className="flex gap-3 p-3 mb-4 bg-sky-500/[0.04] border border-sky-500/15 rounded-xl">
            <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" strokeWidth={1.5} />
            <textarea
              value={improveInstruction}
              onChange={(e) => setImproveInstruction(e.target.value)}
              placeholder="Instructions pour améliorer ce cours…"
              rows={2}
              className="flex-1 bg-transparent resize-none focus:outline-none text-xs text-zinc-300 placeholder-sky-500/30 leading-relaxed"
            />
            <button
              onClick={handleImprove}
              disabled={!improveInstruction.trim() || modifyMutation.isPending}
              className="self-start px-3 py-1.5 rounded-lg text-xs font-medium bg-sky-500 text-white disabled:opacity-40 hover:bg-sky-400 transition-all"
            >
              {modifyMutation.isPending ? '...' : 'Envoyer'}
            </button>
          </div>
        </div>
      )}

      {/* Content area */}
      <div className="flex-1 overflow-y-auto scrollable">
        <div className="max-w-3xl mx-auto px-12 py-10">
          <h1 className="text-2xl font-bold text-zinc-100 leading-tight mb-8">{course.title}</h1>

          {/* QA bar */}
          {course.qa_score != null && (
            <div className="mb-8 p-4 bg-white/[0.02] border border-white/[0.06] rounded-xl flex items-center gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">Score Qualité</span>
                  <span className={`text-sm font-bold font-mono ${qaColor(pct)}`}>{pct.toFixed(0)}%</span>
                </div>
                <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                  <div className={`h-1.5 rounded-full ${qaBg(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </div>
              <TrendingUp className={`w-5 h-5 shrink-0 ${qaColor(pct)}`} strokeWidth={1.5} />
            </div>
          )}

          {/* QA Issues */}
          {course.qa_issues && course.qa_issues.length > 0 && (
            <div className="mb-8 p-4 bg-amber-500/[0.04] border border-amber-500/15 rounded-xl">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
                <span className="text-[10px] font-semibold text-amber-500/80 uppercase tracking-wider">Issues QA ({course.qa_issues.length})</span>
              </div>
              <div className="space-y-1.5">
                {course.qa_issues.map((issue: string, i: number) => (
                  <p key={i} className="text-xs text-amber-400/80">• {issue}</p>
                ))}
              </div>
            </div>
          )}

          {/* Markdown content */}
          {course.content ? (
            <ReactMarkdown components={mdComponents}>{course.content}</ReactMarkdown>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <BookOpen className="w-10 h-10 text-zinc-800" strokeWidth={1.5} />
              <p className="text-sm text-zinc-700">Contenu non disponible</p>
            </div>
          )}

          {/* Footer */}
          <div className="mt-12 pt-6 border-t border-white/[0.06] flex items-center gap-6 text-xs text-zinc-700">
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5" strokeWidth={1.5} />
              Créé le {new Date(course.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </span>
            {course.published_at && (
              <span className="flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" strokeWidth={1.5} />
                Publié le {new Date(course.published_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            )}
          </div>
        </div>
      </div>

      {publishMutation.isPending && <Preloader message="Publication en cours" />}
      {deleteMutation.isPending && <Preloader message="Suppression" />}
      {modifyMutation.isPending && <Preloader message="Amélioration en cours" />}
    </div>
  );
}

// ─── ProductionMode ─────────────────────────────────────────────────────────────
export function ProductionMode() {
  const [statusFilter, setStatusFilter] = useState<'all' | 'draft' | 'review' | 'published'>('all');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);

  const { data: coursesData, isLoading } = useCourses({
    status: statusFilter === 'all' ? undefined : statusFilter,
  });
  const { data: allCoursesData } = useCourses();

  const courses = coursesData?.courses || [];
  const allCourses = allCoursesData?.courses || [];

  if (isLoading && selectedCourseId === null) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-8 h-8 rounded-full border-2 border-white/[0.06] border-t-sky-500 animate-spin" />
      </div>
    );
  }

  // ── Split-view ──────────────────────────────────────────────────────────────
  if (selectedCourseId !== null) {
    return (
      <div className="h-full flex overflow-hidden">
        {/* Left: compact list */}
        <div className="w-72 shrink-0 flex flex-col border-r border-white/[0.06]">
          <div className="h-11 border-b border-white/[0.06] flex items-center px-3 gap-1 shrink-0">
            {(['all', 'draft', 'review', 'published'] as const).map((key) => (
              <button
                key={key}
                onClick={() => setStatusFilter(key)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  statusFilter === key ? 'bg-white/[0.08] text-zinc-200' : 'text-zinc-700 hover:text-zinc-400'
                }`}
              >
                {key === 'all' ? 'Tout' : key === 'draft' ? 'Draft' : key === 'review' ? 'Revue' : 'Publiés'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto scrollable divide-y divide-white/[0.04]">
            {courses.length === 0 ? (
              <p className="text-xs text-zinc-700 text-center p-6">Aucun document</p>
            ) : (
              courses.map((course: any) => (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className={`px-3 py-3 cursor-pointer transition-all border-l-2 ${
                    course.id === selectedCourseId
                      ? 'bg-sky-500/[0.06] border-l-sky-500'
                      : 'border-l-transparent hover:bg-white/[0.03] hover:border-l-white/20'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1.5">
                    <h3 className={`text-xs font-medium leading-snug line-clamp-2 ${
                      course.id === selectedCourseId ? 'text-zinc-100' : 'text-zinc-300'
                    }`}>{course.title}</h3>
                    {course.qa_score != null && (
                      <span className={`text-[10px] font-mono shrink-0 mt-0.5 ${qaColor(qaPercent(course.qa_score))}`}>
                        {qaPercent(course.qa_score).toFixed(0)}%
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                      course.status === 'published' ? 'bg-emerald-500/10 text-emerald-500/70 border-emerald-500/15' :
                      course.status === 'review'    ? 'bg-amber-500/10 text-amber-500/70 border-amber-500/15' :
                      'bg-white/[0.04] text-zinc-600 border-white/[0.06]'
                    }`}>{course.status}</span>
                    {course.level && <span className="text-[10px] text-zinc-700">{course.level}</span>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: reader */}
        <CourseReader courseId={selectedCourseId} onBack={() => setSelectedCourseId(null)} />
      </div>
    );
  }

  // ── Grid view ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col">
      <CockpitHeader
        title="Contenu"
        subtitle="Gérez vos cours et documents générés"
        icon={<BookOpen className="w-5 h-5 text-zinc-400" />}
      />

      <div className="h-12 border-b border-white/[0.06] flex items-center px-5 gap-2">
        {([
          { key: 'all', label: 'Tout' },
          { key: 'draft',     label: `Brouillons\u00a0(${allCourses.filter((c: any) => c.status === 'draft').length})` },
          { key: 'review',    label: `Revue\u00a0(${allCourses.filter((c: any) => c.status === 'review').length})` },
          { key: 'published', label: `Publiés\u00a0(${allCourses.filter((c: any) => c.status === 'published').length})` },
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

      <div className="flex-1 overflow-y-auto scrollable p-5">
        {courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <BookOpen className="w-10 h-10 text-zinc-800" strokeWidth={1.5} />
            <p className="text-sm text-zinc-700">Aucun document trouvé</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {courses.map((course: any) => {
              const pct = qaPercent(course.qa_score);
              return (
                <div
                  key={course.id}
                  onClick={() => setSelectedCourseId(course.id)}
                  className="cockpit-card rounded-xl p-4 cursor-pointer group flex flex-col gap-3"
                >
                  <div className="flex items-start gap-3">
                    <BookOpen className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" strokeWidth={1.5} />
                    <h3 className="text-sm font-medium text-zinc-200 group-hover:text-zinc-100 transition-colors line-clamp-2 leading-snug">
                      {course.title}
                    </h3>
                  </div>
                  <div className="flex items-center justify-between mt-auto">
                    <span className={`px-2 py-0.5 rounded-md text-xs font-medium border ${
                      course.status === 'published' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                      course.status === 'review'    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                      'bg-white/[0.04] text-zinc-500 border-white/[0.06]'
                    }`}>{course.status}</span>
                    {course.qa_score != null && (
                      <span className={`text-xs font-mono ${qaColor(pct)}`}>{pct.toFixed(0)}%</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-zinc-700">
                    {course.level && <span>{course.level}</span>}
                    {course.duration && (
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" strokeWidth={1.5} />{course.duration} min
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
