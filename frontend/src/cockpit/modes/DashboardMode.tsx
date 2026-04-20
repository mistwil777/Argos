// DashboardMode - Tableau de bord analytique — redesigned
import { useMemo } from 'react';
import {
  useGlobalStats, useCostsStats, useTimelineStats, useTopicsStats,
  useSources, useCourses,
} from '../../hooks/useApi';
import {
  AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

// ── Tooltip shared style ────────────────────────────────────────────────────────
const TT = {
  contentStyle: {
    background: '#18181b',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px',
    fontSize: '11px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  labelStyle: { color: '#a1a1aa', fontSize: '10px' },
  itemStyle: { color: '#e4e4e7', fontSize: '11px' },
};

// ── Bespoke: PipelineFlowBar ────────────────────────────────────────────────────
// Horizontal pipeline visualization — bespoke component
interface PipelineStage {
  label: string;
  value: number;
  color: string;
  health: 'good' | 'warn' | 'idle';
}

function PipelineFlowBar({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="relative flex items-start w-full">
      {stages.map((stage, i) => (
        <div key={stage.label} className="flex items-start flex-1 min-w-0">
          {/* Stage node + info */}
          <div className="flex flex-col items-center gap-2.5 flex-1 min-w-0">
            {/* Ring + dot */}
            <div className="relative flex items-center justify-center">
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: `${stage.color}14`, border: `1.5px solid ${stage.color}35` }}
              >
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: stage.color, boxShadow: `0 0 8px ${stage.color}60` }}
                />
              </div>
              {stage.health === 'warn' && (
                <div
                  className="absolute inset-0 rounded-full animate-ping opacity-30"
                  style={{ backgroundColor: stage.color }}
                />
              )}
              {/* Health indicator dot */}
              <div
                className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-zinc-950 ${
                  stage.health === 'good' ? 'bg-emerald-500' :
                  stage.health === 'warn' ? 'bg-amber-400' : 'bg-zinc-600'
                }`}
              />
            </div>

            {/* Count + label */}
            <div className="text-center">
              <p
                className="text-2xl font-bold font-mono leading-none tracking-tight"
                style={{ color: stage.color }}
              >
                {stage.value.toLocaleString('fr-FR')}
              </p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1 px-1">{stage.label}</p>
            </div>
          </div>

          {/* Connector line */}
          {i < stages.length - 1 && (
            <div className="flex-none w-8 flex items-center mt-5">
              <div className="w-full h-px relative">
                <div className="absolute inset-0 bg-zinc-800" />
                <div
                  className="absolute inset-0 opacity-60"
                  style={{ background: `linear-gradient(90deg, ${stage.color}40, ${stages[i+1].color}40)` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ── Bespoke: TopicDensityRow ────────────────────────────────────────────────────
// Custom CSS bar row — not a recharts chart
function TopicDensityRow({ topic, count, maxCount, courseCount, rank }: {
  topic: string;
  count: number;
  maxCount: number;
  courseCount: number;
  rank: number;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="group flex items-center gap-2.5 py-1.5 hover:bg-white/[0.02] -mx-2 px-2 rounded-lg transition-colors">
      <span className="w-4 text-[10px] text-zinc-700 font-mono shrink-0 text-right">{rank}</span>
      <span className="w-28 text-[11px] text-zinc-400 truncate shrink-0 group-hover:text-zinc-200 transition-colors leading-tight">{topic}</span>
      <div className="flex-1 h-1 bg-zinc-800/80 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, #0ea5e9 0%, #6366f1 100%)` }}
        />
      </div>
      <span className="text-[11px] font-mono text-zinc-500 w-7 text-right shrink-0 tabular-nums">{count}</span>
      {courseCount > 0 ? (
        <span className="text-[10px] text-emerald-600 w-7 text-right shrink-0 font-medium tabular-nums">+{courseCount}</span>
      ) : (
        <span className="w-7 shrink-0" />
      )}
    </div>
  );
}

// ── Bespoke: SectionHeader ─────────────────────────────────────────────────────
function SectionHeader({ label, accentColor = '#0ea5e9', children }: {
  label: string;
  accentColor?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <div className="w-1 h-4 rounded-full shrink-0" style={{ backgroundColor: accentColor }} />
        <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">{label}</span>
      </div>
      {children}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function DashboardMode() {
  const { data: stats }        = useGlobalStats();
  const { data: costsData }    = useCostsStats('month');
  const { data: timelineData } = useTimelineStats(30);
  const { data: topicsData }   = useTopicsStats(10);
  const { data: sourcesData }  = useSources();
  const { data: coursesData }  = useCourses({ limit: 100 });

  // Derived metrics
  const classificationRate = stats?.total_items
    ? Math.round((stats.classified_items / stats.total_items) * 100) : 0;
  const publishRate = stats?.total_courses
    ? Math.round((stats.published_courses / stats.total_courses) * 100) : 0;
  const activeSources = sourcesData?.sources?.filter((s: any) => s.active).length ?? 0;
  const reviewCount = (coursesData?.courses ?? []).filter((c: any) => c.status === 'review').length;

  // Pipeline stages data
  const pipelineStages: PipelineStage[] = useMemo(() => [
    {
      label: 'Collectés',
      value: stats?.total_items ?? 0,
      color: '#0ea5e9',
      health: (stats?.total_items ?? 0) > 0 ? 'good' : 'idle',
    },
    {
      label: 'Classifiés',
      value: stats?.classified_items ?? 0,
      color: '#6366f1',
      health: classificationRate >= 70 ? 'good' : classificationRate >= 40 ? 'warn' : 'idle',
    },
    {
      label: 'En attente',
      value: stats?.pending_items ?? 0,
      color: '#f59e0b',
      health: (stats?.pending_items ?? 0) > 30 ? 'warn' : 'good',
    },
    {
      label: 'Générés',
      value: stats?.total_courses ?? 0,
      color: '#10b981',
      health: (stats?.total_courses ?? 0) > 0 ? 'good' : 'idle',
    },
    {
      label: 'Publiés',
      value: stats?.published_courses ?? 0,
      color: '#a855f7',
      health: publishRate >= 50 ? 'good' : publishRate > 0 ? 'warn' : 'idle',
    },
  ], [stats, classificationRate, publishRate]);

  // Source health by type
  const sourcesByType = useMemo(() => {
    const sources = sourcesData?.sources ?? [];
    const palette: Record<string, string> = {
      rss: '#f97316', github: '#a1a1aa', api: '#0ea5e9', website: '#a855f7',
    };
    const byType: Record<string, { total: number; active: number; color: string }> = {};
    for (const s of sources) {
      const t = s.type as string;
      if (!byType[t]) byType[t] = { total: 0, active: 0, color: palette[t] ?? '#71717a' };
      byType[t].total++;
      if (s.active) byType[t].active++;
    }
    return Object.entries(byType).map(([type, d]) => ({ type, ...d }));
  }, [sourcesData]);

  // Formatted timeline (last 14 data points)
  const formattedTimeline = useMemo(
    () => (timelineData ?? []).map((d: any) => ({ ...d, date: d.date?.slice(5) ?? '' })).slice(-14),
    [timelineData],
  );

  // Formatted costs (last 14 data points)
  const formattedCosts = useMemo(
    () => (costsData ?? []).map((d: any) => ({ ...d, date: d.date?.slice(5) ?? '' })).slice(-14),
    [costsData],
  );

  const maxTopic = topicsData?.[0]?.item_count ?? 1;

  // Contextual insights
  const insights = useMemo(() => {
    const items: Array<{ type: 'warn' | 'info' | 'ok' | 'cost'; text: string }> = [];
    if ((stats?.pending_items ?? 0) > 30)
      items.push({ type: 'warn', text: `${stats!.pending_items} items en attente — lancer une passe de classification.` });
    if (classificationRate >= 85)
      items.push({ type: 'ok', text: `Taux de classification excellent : ${classificationRate}% des items sont traités.` });
    else if (classificationRate > 0 && classificationRate < 50)
      items.push({ type: 'warn', text: `Seulement ${classificationRate}% des items sont classifiés — vérifier le classifier.` });
    if (reviewCount > 0)
      items.push({ type: 'info', text: `${reviewCount} cours en attente de revue — validation HITL recommandée.` });
    if ((stats?.cost_this_month ?? 0) > 1)
      items.push({ type: 'cost', text: `Coût ce mois : $${stats!.cost_this_month.toFixed(2)} — surveiller la fréquence de classification.` });
    if (activeSources === 0)
      items.push({ type: 'warn', text: `Aucune source active — activer au moins une source pour démarrer la collecte.` });
    if (items.length === 0)
      items.push({ type: 'ok', text: `Pipeline opérationnel — aucune anomalie détectée.` });
    return items.slice(0, 5);
  }, [stats, classificationRate, reviewCount, activeSources]);

  const insightStyle = {
    warn: { bg: 'bg-amber-500/8 border-amber-500/20', text: 'text-amber-300', glyph: '⚠' },
    info: { bg: 'bg-sky-500/8 border-sky-500/20',    text: 'text-sky-300',   glyph: 'ℹ' },
    ok:   { bg: 'bg-emerald-500/8 border-emerald-500/20', text: 'text-emerald-300', glyph: '✓' },
    cost: { bg: 'bg-violet-500/8 border-violet-500/20',   text: 'text-violet-300',  glyph: '$' },
  } as const;

  return (
    <div className="h-full overflow-y-auto bg-zinc-950">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-5">

        {/* ── Section 1: Editorial Metric Strip ─────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-1 h-4 rounded-full bg-sky-500" />
              <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest">Métriques Clés</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] text-zinc-600 font-mono uppercase tracking-wider">Live · 30s</span>
            </div>
          </div>

          {/* Metrics band — editorial, no individual card boxes */}
          <div className="grid grid-cols-4 border border-white/[0.06] rounded-xl overflow-hidden">
            {([
              { label: 'Items Collectés',  value: stats?.total_items?.toLocaleString('fr-FR') ?? '—',         sub: `${stats?.pending_items ?? 0} en attente`,          valCls: 'text-sky-500',    accentBg: 'rgba(14,165,233,0.15)' },
              { label: 'Classifiés',        value: stats?.classified_items?.toLocaleString('fr-FR') ?? '—',   sub: `${classificationRate}% taux`,                      valCls: 'text-indigo-500', accentBg: 'rgba(99,102,241,0.15)' },
              { label: 'Cours Publiés',     value: stats?.published_courses?.toLocaleString('fr-FR') ?? '—',  sub: `${stats?.draft_courses ?? 0} brouillons`,          valCls: 'text-emerald-600',accentBg: 'rgba(16,185,129,0.15)' },
              { label: 'Coût ce mois',      value: `$${(stats?.cost_this_month ?? 0).toFixed(3)}`,            sub: `Total cumulé $${(stats?.total_cost ?? 0).toFixed(2)}`, valCls: 'text-amber-600',  accentBg: 'rgba(245,158,11,0.15)' },
            ] as const).map((m, i) => (
              <div
                key={m.label}
                className={`group px-6 py-5 metric-cell transition-colors cursor-default ${i < 3 ? 'border-r border-white/[0.06]' : ''}`}
              >
                <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest mb-2.5">{m.label}</p>
                <p className={`text-[2.25rem] font-bold font-mono leading-none tracking-tight tabular-nums mb-2 ${m.valCls}`}>
                  {m.value}
                </p>
                <p className="text-[11px] text-zinc-600 group-hover:text-zinc-500 transition-colors">{m.sub}</p>
                <div className="mt-3 h-px w-full opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: m.accentBg }} />
              </div>
            ))}
          </div>
        </div>

        {/* ── Section 2: Pipeline Flow Bar ──────────────────────────────────── */}
        <div className="bg-zinc-900/40 border border-white/[0.06] rounded-xl px-6 py-5">
          <SectionHeader label="Pipeline de Traitement" accentColor="#6366f1">
            <div className="flex items-center gap-3 text-[10px] text-zinc-700">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> OK</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" /> Attention</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-zinc-600 inline-block" /> Inactif</span>
            </div>
          </SectionHeader>
          <PipelineFlowBar stages={pipelineStages} />
        </div>

        {/* ── Section 3: Timeline + Topic Density (asymmetric 3:2) ─────────── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Activité timeline — 3 cols */}
          <div className="col-span-3 bg-zinc-900/40 border border-white/[0.06] rounded-xl px-5 py-5">
            <SectionHeader label="Activité — 14 jours" accentColor="#10b981" />
            {formattedTimeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={formattedTimeline} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gCollected2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gClassified2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366f1" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip {...TT} />
                  <Area type="monotone" dataKey="items_collected"  stroke="#0ea5e9" strokeWidth={1.5} fill="url(#gCollected2)"  name="Collectés" dot={false} />
                  <Area type="monotone" dataKey="items_classified" stroke="#6366f1" strokeWidth={1.5} fill="url(#gClassified2)" name="Classifiés" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-zinc-700 text-sm">Données insuffisantes</div>
            )}
            {/* Legend */}
            <div className="flex items-center gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <span className="w-3 h-0.5 rounded-full bg-sky-500 inline-block" /> Collectés
              </span>
              <span className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <span className="w-3 h-0.5 rounded-full bg-indigo-500 inline-block" /> Classifiés
              </span>
            </div>
          </div>

          {/* Topic density map — 2 cols (bespoke) */}
          <div className="col-span-2 bg-zinc-900/40 border border-white/[0.06] rounded-xl px-5 py-5">
            <SectionHeader label="Densité Topics" accentColor="#a855f7" />
            {(topicsData ?? []).length > 0 ? (
              <div>
                {(topicsData ?? []).slice(0, 9).map((t: any, i: number) => (
                  <TopicDensityRow
                    key={t.topic}
                    rank={i + 1}
                    topic={t.topic}
                    count={t.item_count}
                    maxCount={maxTopic}
                    courseCount={t.course_count}
                  />
                ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-40 text-zinc-700 text-sm">Aucune donnée topic</div>
            )}
          </div>
        </div>

        {/* ── Section 4: Coûts LLM ──────────────────────────────────────────── */}
        <div className="bg-zinc-900/40 border border-white/[0.06] rounded-xl px-5 py-5">
          <SectionHeader label="Coûts LLM — ce mois" accentColor="#f59e0b">
            <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
              Total : <span className="text-amber-400">${(stats?.total_cost ?? 0).toFixed(3)}</span>
            </span>
          </SectionHeader>
          {formattedCosts.length > 0 ? (
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={formattedCosts} margin={{ top: 4, right: 0, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="gCostC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCostG" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gCostR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#52525b', fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip {...TT} formatter={(v: any) => `$${Number(v).toFixed(4)}`} />
                <Area type="monotone" dataKey="classifier_cost"       stroke="#3b82f6" fill="url(#gCostC)" strokeWidth={1.5} name="Classifier"  dot={false} />
                <Area type="monotone" dataKey="course_generator_cost" stroke="#10b981" fill="url(#gCostG)" strokeWidth={1.5} name="Générateur" dot={false} />
                <Area type="monotone" dataKey="rag_cost"              stroke="#f59e0b" fill="url(#gCostR)" strokeWidth={1.5} name="RAG"         dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-32 flex items-center justify-center text-zinc-700 text-sm">Pas encore de données de coût</div>
          )}
          {/* Legend */}
          <div className="flex items-center gap-5 mt-2">
            {[
              { label: 'Classifier', color: '#3b82f6' },
              { label: 'Générateur', color: '#10b981' },
              { label: 'RAG',        color: '#f59e0b' },
            ].map(l => (
              <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-zinc-600">
                <span className="w-3 h-0.5 rounded-full inline-block" style={{ backgroundColor: l.color }} />
                {l.label}
              </span>
            ))}
          </div>
        </div>

        {/* ── Section 5: Source Health + Insights (2:3) ─────────────────────── */}
        <div className="grid grid-cols-5 gap-4">

          {/* Source health — 2 cols */}
          <div className="col-span-2 bg-zinc-900/40 border border-white/[0.06] rounded-xl px-5 py-5">
            <SectionHeader label="Sources" accentColor="#f97316" />
            <div className="space-y-3.5">
              {sourcesByType.length > 0 ? sourcesByType.map(s => (
                <div key={s.type} className="flex items-center gap-3">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold uppercase"
                    style={{ backgroundColor: `${s.color}18`, color: s.color }}
                  >
                    {s.type.slice(0, 3)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[11px] font-medium text-zinc-400 uppercase tracking-wide">{s.type}</span>
                      <span className="text-[11px] font-mono text-zinc-500 tabular-nums">
                        {s.active}<span className="text-zinc-700">/{s.total}</span>
                      </span>
                    </div>
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: s.total > 0 ? `${(s.active / s.total) * 100}%` : '0%',
                          backgroundColor: s.color,
                        }}
                      />
                    </div>
                  </div>
                </div>
              )) : (
                <p className="text-[11px] text-zinc-600 text-center py-6">Aucune source configurée</p>
              )}
              <div className="pt-3 border-t border-white/[0.04] flex items-center justify-between">
                <span className="text-[11px] text-zinc-600">Sources actives</span>
                <span className="text-[11px] font-mono font-semibold text-emerald-400 tabular-nums">{activeSources}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-zinc-600">Cours en revue</span>
                <span className="text-[11px] font-mono font-semibold text-sky-400 tabular-nums">{reviewCount}</span>
              </div>
            </div>
          </div>

          {/* Intelligence contextuelle — 3 cols */}
          <div className="col-span-3 bg-zinc-900/40 border border-white/[0.06] rounded-xl px-5 py-5">
            <SectionHeader label="Intelligence Contextuelle" accentColor="#f59e0b" />
            <div className="space-y-2">
              {insights.map((ins, i) => {
                const s = insightStyle[ins.type];
                return (
                  <div key={i} className={`flex items-start gap-2.5 p-3 rounded-lg border ${s.bg} ${s.bg.replace('bg-', 'border-').replace('/8', '/20')}`}>
                    <span className={`text-xs font-bold shrink-0 mt-0.5 leading-none w-3 ${s.text}`}>{s.glyph}</span>
                    <p className={`text-[11px] leading-relaxed ${s.text}`}>{ins.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between py-2 border-t border-white/[0.04]">
          <span className="text-[10px] text-zinc-700 font-mono capitalize">
            {new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
          <span className="text-[10px] text-zinc-700 font-mono">auto-refresh · 30s</span>
        </div>

      </div>
    </div>
  );
}
