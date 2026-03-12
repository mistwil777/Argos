// DashboardMode - Tableau de bord analytique global
import { useMemo } from 'react';
import {
  useGlobalStats, useCostsStats, useTimelineStats, useTopicsStats,
  useSources, useCourses, useWorkspaces,
} from '../../hooks/useApi';
import {
  AreaChart, Area, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  Euro, FileText, BookOpen, Rss, TrendingUp,
  AlertTriangle, CheckCircle, Info, Users,
} from 'lucide-react';

// ─── Shared tooltip style ─────────────────────────────────────────────────────
const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#18181b',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    fontSize: '11px',
  },
  labelStyle: { color: '#a1a1aa', fontSize: '10px' },
  itemStyle: { color: '#e4e4e7', fontSize: '10px' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────
function KpiCard({
  icon: Icon, label, value, sub, color,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  color: 'emerald' | 'sky' | 'indigo' | 'amber';
}) {
  const style: Record<string, string> = {
    emerald: 'bg-emerald-500/10 text-emerald-400',
    sky:     'bg-sky-500/10 text-sky-400',
    indigo:  'bg-indigo-500/10 text-indigo-400',
    amber:   'bg-amber-500/10 text-amber-400',
  };
  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${style[color]}`}>
          <Icon className="w-4 h-4" strokeWidth={1.75} />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-zinc-500">{label}</p>
          <p className="text-xl font-bold text-zinc-100 mt-0.5 font-mono tracking-tight">{value}</p>
          {sub && <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-zinc-900 border border-white/[0.06] rounded-xl p-4">
      <h3 className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-3">{title}</h3>
      {children}
    </div>
  );
}

function MetricRow({
  label, value, color,
}: {
  label: string;
  value: string;
  color: 'emerald' | 'amber' | 'red' | 'sky';
}) {
  const dot:  Record<string, string> = { emerald: 'bg-emerald-500', amber: 'bg-amber-500', red: 'bg-red-500', sky: 'bg-sky-500' };
  const text: Record<string, string> = { emerald: 'text-emerald-400', amber: 'text-amber-400', red: 'text-red-400', sky: 'text-sky-400' };
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-1.5 h-1.5 rounded-full ${dot[color]}`} />
        <span className="text-[11px] text-zinc-500">{label}</span>
      </div>
      <span className={`text-[11px] font-mono font-semibold ${text[color]}`}>{value}</span>
    </div>
  );
}

function InsightCard({ type, text }: { type: 'warning' | 'info' | 'success' | 'purple'; text: string }) {
  const styles: Record<string, { bg: string; textCls: string; icon: React.ElementType }> = {
    warning: { bg: 'bg-amber-500/8 border-amber-500/20',   textCls: 'text-amber-300',   icon: AlertTriangle },
    info:    { bg: 'bg-sky-500/8 border-sky-500/20',       textCls: 'text-sky-300',     icon: Info },
    success: { bg: 'bg-emerald-500/8 border-emerald-500/20', textCls: 'text-emerald-300', icon: CheckCircle },
    purple:  { bg: 'bg-purple-500/8 border-purple-500/20', textCls: 'text-purple-300',  icon: Euro },
  };
  const { bg, textCls, icon: Icon } = styles[type];
  return (
    <div className={`flex items-start gap-2 p-3 rounded-lg border ${bg}`}>
      <Icon className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${textCls}`} strokeWidth={1.75} />
      <p className={`text-[11px] leading-relaxed ${textCls}`}>{text}</p>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function DashboardMode() {
  const { data: stats }       = useGlobalStats();
  const { data: costsData }   = useCostsStats('month');
  const { data: timelineData }= useTimelineStats(30);
  const { data: topicsData }  = useTopicsStats(10);
  const { data: sourcesData } = useSources();
  const { data: coursesData } = useCourses({ limit: 100 });
  const { data: workspaces = [] } = useWorkspaces();

  // Documents by template type
  const docsByType = useMemo(() => {
    const courses = coursesData?.courses ?? [];
    const byType: Record<string, number> = {};
    for (const c of courses) {
      const t = c.template_name || 'cours';
      byType[t] = (byType[t] || 0) + 1;
    }
    return Object.entries(byType)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [coursesData]);

  // Courses by status for bar chart
  const coursesByStatus = useMemo(() => {
    const courses = coursesData?.courses ?? [];
    const statuses = ['draft', 'review', 'published', 'archived'];
    const labels: Record<string, string> = { draft: 'Brouillon', review: 'Revue', published: 'Publié', archived: 'Archivé' };
    return statuses.map(s => ({
      status: labels[s],
      count: courses.filter(c => c.status === s).length,
    }));
  }, [coursesData]);

  // Sources by type
  const sourcesByType = useMemo(() => {
    const sources = sourcesData?.sources ?? [];
    const byType: Record<string, { total: number; active: number }> = {};
    for (const s of sources) {
      if (!byType[s.type]) byType[s.type] = { total: 0, active: 0 };
      byType[s.type].total++;
      if (s.active) byType[s.type].active++;
    }
    return Object.entries(byType).map(([type, d]) => ({ type, ...d }));
  }, [sourcesData]);

  const activeSources = useMemo(
    () => sourcesData?.sources?.filter(s => s.active).length ?? 0,
    [sourcesData],
  );

  const classificationRate = stats?.total_items && stats.total_items > 0
    ? Math.round((stats.classified_items / stats.total_items) * 100)
    : 0;

  const publishRate = stats?.total_courses && stats.total_courses > 0
    ? Math.round((stats.published_courses / stats.total_courses) * 100)
    : 0;

  const reviewCount = (coursesData?.courses ?? []).filter(c => c.status === 'review').length;

  const formattedCosts = useMemo(
    () => (costsData ?? []).map(d => ({ ...d, date: d.date?.slice(5) ?? '' })),
    [costsData],
  );

  const formattedTimeline = useMemo(
    () => (timelineData ?? []).map(d => ({ ...d, date: d.date?.slice(5) ?? '' })),
    [timelineData],
  );

  const maxTopic = topicsData?.[0]?.item_count ?? 1;

  const sourceTypeColor: Record<string, string> = {
    rss:     'bg-orange-500',
    github:  'bg-zinc-300',
    api:     'bg-sky-500',
    website: 'bg-purple-500',
  };

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <div className="max-w-7xl mx-auto p-6 space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-zinc-100 tracking-tight">Tableau de bord</h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">Vue globale · Actualisation auto toutes les 30 s</p>
          </div>
          <span className="text-[11px] text-zinc-600 font-mono capitalize">
            {new Date().toLocaleDateString('fr-FR', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
          </span>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            icon={Euro}
            label="Coût aujourd'hui"
            value={`€${(stats?.cost_today ?? 0).toFixed(4)}`}
            sub={`Ce mois : €${(stats?.cost_this_month ?? 0).toFixed(4)} · Total : €${(stats?.total_cost ?? 0).toFixed(2)}`}
            color="emerald"
          />
          <KpiCard
            icon={FileText}
            label="Items collectés"
            value={String(stats?.total_items ?? 0)}
            sub={`${stats?.pending_items ?? 0} en attente · ${classificationRate}% classifiés`}
            color="sky"
          />
          <KpiCard
            icon={BookOpen}
            label="Documents générés"
            value={String(stats?.total_courses ?? 0)}
            sub={`${stats?.published_courses ?? 0} publiés · ${stats?.draft_courses ?? 0} brouillons`}
            color="indigo"
          />
          <KpiCard
            icon={Rss}
            label="Sources de veille"
            value={String(sourcesData?.total ?? 0)}
            sub={`${activeSources} actives`}
            color="amber"
          />
        </div>

        {/* Charts row 1: Cost + Items timeline */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Coûts LLM — 30 derniers jours">
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={formattedCosts}>
                <defs>
                  <linearGradient id="gClassifier" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gGenerator" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gRag" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 9 }} tickFormatter={v => `$${v}`} width={38} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#71717a' }} />
                <Area type="monotone" dataKey="classifier_cost" stroke="#3b82f6" fill="url(#gClassifier)" name="Classifier" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="course_generator_cost" stroke="#10b981" fill="url(#gGenerator)" name="Générateur" strokeWidth={1.5} dot={false} />
                <Area type="monotone" dataKey="rag_cost" stroke="#f59e0b" fill="url(#gRag)" name="RAG" strokeWidth={1.5} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Collecte d'items — 30 derniers jours">
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={formattedTimeline} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 9 }} />
                <YAxis tick={{ fill: '#52525b', fontSize: 9 }} width={28} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: '10px', color: '#71717a' }} />
                <Bar dataKey="items_collected" fill="#0ea5e9" name="Collectés" radius={[2, 2, 0, 0]} maxBarSize={18} />
                <Bar dataKey="items_classified" fill="#6366f1" name="Classifiés" radius={[2, 2, 0, 0]} maxBarSize={18} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        {/* Row 2: Documents by type + status + Sources */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Documents by template */}
          <ChartCard title="Documents par type">
            <div className="space-y-2.5 mt-1">
              {docsByType.length > 0 ? docsByType.map(d => (
                <div key={d.name} className="flex items-center gap-2.5">
                  <span className="text-[11px] text-zinc-500 w-16 shrink-0 capitalize truncate">{d.name}</span>
                  <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, (d.count / (stats?.total_courses || 1)) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[11px] font-mono text-zinc-400 w-5 text-right shrink-0">{d.count}</span>
                </div>
              )) : (
                <p className="text-xs text-zinc-600 text-center py-6">Aucun document généré</p>
              )}
            </div>
          </ChartCard>

          {/* Documents by status */}
          <ChartCard title="Documents par statut">
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={coursesByStatus} layout="vertical" margin={{ left: 0, right: 10 }}>
                <XAxis type="number" tick={{ fill: '#52525b', fontSize: 9 }} />
                <YAxis type="category" dataKey="status" tick={{ fill: '#71717a', fontSize: 10 }} width={55} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[0, 3, 3, 0]} maxBarSize={16} name="Documents">
                  {coursesByStatus.map((entry) => {
                    const colors: Record<string, string> = {
                      Brouillon: '#6366f1', Revue: '#f59e0b', Publié: '#10b981', Archivé: '#52525b',
                    };
                    return <Cell key={entry.status} fill={colors[entry.status] ?? '#71717a'} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* Sources by type */}
          <ChartCard title="Sources par type">
            <div className="space-y-3 mt-1">
              {sourcesByType.length > 0 ? sourcesByType.map(s => (
                <div key={s.type}>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${sourceTypeColor[s.type] ?? 'bg-zinc-500'}`} />
                      <span className="text-[11px] text-zinc-400 uppercase font-semibold tracking-wider">{s.type}</span>
                    </div>
                    <span className="text-[11px] font-mono text-zinc-500">{s.active}<span className="text-zinc-700">/{s.total}</span></span>
                  </div>
                  <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${s.total > 0 ? (s.active / s.total) * 100 : 0}%`,
                        background: s.type === 'rss' ? '#f97316' : s.type === 'github' ? '#a1a1aa' : s.type === 'api' ? '#0ea5e9' : '#a855f7',
                      }}
                    />
                  </div>
                </div>
              )) : (
                <p className="text-xs text-zinc-600 text-center py-6">Aucune source configurée</p>
              )}
            </div>
          </ChartCard>
        </div>

        {/* Row 3: Pipeline health + Top topics + Workspaces */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

          {/* Pipeline health */}
          <ChartCard title="Santé du pipeline">
            <div className="space-y-3 mt-1">
              <MetricRow
                label="Taux de classification"
                value={`${classificationRate}%`}
                color={classificationRate > 70 ? 'emerald' : classificationRate > 40 ? 'amber' : 'red'}
              />
              <MetricRow
                label="Taux de publication"
                value={`${publishRate}%`}
                color={publishRate > 50 ? 'emerald' : 'amber'}
              />
              <MetricRow
                label="Items en attente"
                value={String(stats?.pending_items ?? 0)}
                color={(stats?.pending_items ?? 0) > 50 ? 'red' : 'emerald'}
              />
              <MetricRow
                label="Brouillons"
                value={String(stats?.draft_courses ?? 0)}
                color={(stats?.draft_courses ?? 0) > 10 ? 'amber' : 'emerald'}
              />
              <MetricRow
                label="En revue"
                value={String(reviewCount)}
                color={reviewCount > 0 ? 'sky' : 'emerald'}
              />
              <div className="pt-1 border-t border-white/[0.05]">
                <div className="flex items-center gap-2 mt-2">
                  <TrendingUp className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                  <span className="text-[10px] text-zinc-600">
                    {stats?.classified_items ?? 0} classifiés · {stats?.total_courses ?? 0} générés · {stats?.published_courses ?? 0} publiés
                  </span>
                </div>
              </div>
            </div>
          </ChartCard>

          {/* Top topics */}
          <ChartCard title="Top 10 sujets">
            <div className="space-y-2 mt-1">
              {(topicsData ?? []).slice(0, 8).map((t, i) => (
                <div key={t.topic} className="flex items-center gap-2.5">
                  <span className="text-[10px] text-zinc-700 w-3.5 shrink-0 font-mono">{i + 1}</span>
                  <span className="text-[11px] text-zinc-400 flex-1 truncate">{t.topic}</span>
                  <div className="w-18 h-1.5 bg-zinc-800 rounded-full overflow-hidden shrink-0" style={{ width: '72px' }}>
                    <div
                      className="h-full bg-sky-500 rounded-full"
                      style={{ width: `${Math.min(100, (t.item_count / maxTopic) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono text-zinc-600 w-5 text-right shrink-0">{t.item_count}</span>
                </div>
              ))}
              {!(topicsData?.length) && (
                <p className="text-xs text-zinc-600 text-center py-4">Aucun sujet disponible</p>
              )}
            </div>
          </ChartCard>

          {/* Workspaces */}
          <ChartCard title={`Espaces de travail (${workspaces.length})`}>
            <div className="space-y-2 mt-1">
              {workspaces.length > 0 ? workspaces.map(ws => (
                <div key={ws.id} className="flex items-center gap-2.5 p-2 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div
                    className="w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: ws.color }}
                  >
                    {ws.name?.charAt(0)?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-medium text-zinc-300 truncate">{ws.name}</p>
                    {ws.description && (
                      <p className="text-[10px] text-zinc-600 truncate">{ws.description}</p>
                    )}
                  </div>
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${ws.is_active ? 'bg-emerald-500' : 'bg-zinc-700'}`} />
                </div>
              )) : (
                <div className="flex flex-col items-center justify-center py-6 gap-2">
                  <Users className="w-8 h-8 text-zinc-700" strokeWidth={1} />
                  <p className="text-xs text-zinc-600">Aucun espace créé</p>
                </div>
              )}
            </div>
          </ChartCard>
        </div>

        {/* Insights */}
        <ChartCard title="⚡ Insights automatiques">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 mt-1">
            {(stats?.pending_items ?? 0) > 50 && (
              <InsightCard type="warning" text={`${stats!.pending_items} items en attente de classification — lancez le classifier`} />
            )}
            {(stats?.draft_courses ?? 0) > 5 && (
              <InsightCard type="info" text={`${stats!.draft_courses} cours en brouillon prêts à être publiés`} />
            )}
            {(stats?.total_cost ?? 0) > 10 && (
              <InsightCard type="purple" text={`Coût total €${stats!.total_cost.toFixed(2)} — pensez à optimiser vos prompts`} />
            )}
            {classificationRate < 50 && (stats?.total_items ?? 0) > 10 && (
              <InsightCard type="warning" text={`Seulement ${classificationRate}% des items sont classifiés`} />
            )}
            {reviewCount > 0 && (
              <InsightCard type="info" text={`${reviewCount} document${reviewCount > 1 ? 's' : ''} en attente de revue`} />
            )}
            {!(stats?.pending_items) && !(stats?.draft_courses) && (
              <InsightCard type="success" text="Pipeline à jour — aucune action requise" />
            )}
            <InsightCard
              type="info"
              text={`${workspaces.length} espace${workspaces.length !== 1 ? 's' : ''} · ${sourcesData?.total ?? 0} sources · ${activeSources} actives`}
            />
          </div>
        </ChartCard>

      </div>
    </div>
  );
}
