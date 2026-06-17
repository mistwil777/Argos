import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  TrendingUp, TrendingDown, Minus, Sparkles,
  RefreshCw, Loader2, BarChart3
} from 'lucide-react'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, CartesianGrid
} from 'recharts'
import { api } from '@/services/api'

const WINDOW_OPTIONS = [
  { value: 7,  label: '7 jours' },
  { value: 14, label: '14 jours' },
  { value: 30, label: '30 jours' },
]

const PALETTE = [
  'hsl(235 85% 65%)', 'hsl(142 70% 50%)', 'hsl(38 92% 52%)',
  'hsl(262 80% 65%)', 'hsl(186 80% 54%)',
]

function DeltaBadge({ delta, pct }: { delta: string; pct: number | null }) {
  if (delta === 'new') return (
    <span className="pill pill-accent text-[10px]"><Sparkles className="w-2.5 h-2.5" />nouveau</span>
  )
  if (delta === 'up') return (
    <span className="flex items-center gap-0.5 text-[hsl(var(--green))] text-[10.5px] font-mono">
      <TrendingUp className="w-3 h-3" />+{pct}%
    </span>
  )
  if (delta === 'down') return (
    <span className="flex items-center gap-0.5 text-[hsl(var(--red))] text-[10.5px] font-mono">
      <TrendingDown className="w-3 h-3" />{pct}%
    </span>
  )
  return <span className="text-[hsl(var(--text-3))] text-[10.5px] font-mono flex items-center gap-0.5"><Minus className="w-3 h-3" />stable</span>
}

export default function Trends() {
  const [window, setWindow]   = useState(7)
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab]         = useState<'keywords' | 'volume' | 'sparklines'>('keywords')

  async function load() {
    setLoading(true)
    try { setData(await api.getTrends(window, 40)) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [window])

  const trends: any[] = data?.trends || []
  const newItems = trends.filter(t => t.delta === 'new')
  const rising   = trends.filter(t => t.delta === 'up').sort((a,b) => (b.delta_pct||0)-(a.delta_pct||0))
  const stable   = trends.filter(t => t.delta === 'stable')
  const falling  = trends.filter(t => t.delta === 'down')

  // Build sparkline data: pivot timeline by date
  const sparklineData = (() => {
    if (!data?.timeline?.length) return []
    const byDate: Record<string, any> = {}
    for (const row of data.timeline) {
      if (!byDate[row.date]) byDate[row.date] = { date: row.date }
      byDate[row.date][row.keyword] = row.freq
    }
    return Object.values(byDate).sort((a: any, b: any) => a.date.localeCompare(b.date))
  })()
  const top5Keywords = [...new Set(data?.timeline?.map((t: any) => t.keyword) || [])] as string[]

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[20px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[hsl(var(--accent))]" />
            Tendances & signaux faibles
          </h2>
          <p className="text-[12px] font-mono text-[hsl(var(--text-3))] mt-1">
            Évolution des concepts clés détectés dans vos contenus
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="seg">
            {WINDOW_OPTIONS.map(o => (
              <button key={o.value} onClick={() => setWindow(o.value)}
                className={`seg-item ${window === o.value ? 'active' : ''}`}>
                {window === o.value && (
                  <motion.div layoutId="trends-seg"
                    className="absolute inset-0 bg-[hsl(var(--bg-2))] rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--line-bright))]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{o.label}</span>
              </button>
            ))}
          </div>
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
            onClick={load} disabled={loading}
            className="w-8 h-8 flex items-center justify-center rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[hsl(var(--text-2))] transition-colors">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          </motion.button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--text-3))]" />
        </div>
      )}

      {!loading && data && (
        <>
          {/* Stats résumé */}
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'Concepts détectés', value: data.total_keywords, color: 'text-[hsl(var(--text))]' },
              { label: 'Nouveaux', value: newItems.length, color: 'text-[hsl(var(--accent))]' },
              { label: 'En hausse', value: rising.length, color: 'text-[hsl(var(--green))]' },
              { label: 'En baisse', value: falling.length, color: 'text-[hsl(var(--red))]' },
            ].map(s => (
              <div key={s.label} className="panel p-4">
                <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">{s.label}</p>
                <p className={`text-3xl font-bold tabular-nums ${s.color}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Onglets */}
          <div className="flex gap-1 border-b border-[hsl(var(--line))]">
            {[
              { id: 'keywords' as const, icon: TrendingUp,  label: 'Classement keywords' },
              { id: 'volume'   as const, icon: BarChart3,   label: 'Volume quotidien' },
              { id: 'sparklines' as const, icon: Sparkles,  label: 'Évolution top 5' },
            ].map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-[11.5px] font-mono border-b-2 transition-all ${
                  tab === t.id
                    ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]'
                    : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'
                }`}>
                <t.icon className="w-3.5 h-3.5" />{t.label}
              </button>
            ))}
          </div>

          {/* ── Classement keywords ── */}
          {tab === 'keywords' && (
            <div className="space-y-4">
              {newItems.length > 0 && (
                <Section title="Nouveaux concepts" color="accent">
                  {newItems.map(t => <TrendRow key={t.keyword} trend={t} max={trends[0]?.freq || 1} />)}
                </Section>
              )}
              {rising.length > 0 && (
                <Section title="En hausse" color="green">
                  {rising.map(t => <TrendRow key={t.keyword} trend={t} max={trends[0]?.freq || 1} />)}
                </Section>
              )}
              {stable.length > 0 && (
                <Section title="Stables" color="text-3" collapsible>
                  {stable.map(t => <TrendRow key={t.keyword} trend={t} max={trends[0]?.freq || 1} />)}
                </Section>
              )}
              {falling.length > 0 && (
                <Section title="En baisse" color="red" collapsible>
                  {falling.map(t => <TrendRow key={t.keyword} trend={t} max={trends[0]?.freq || 1} />)}
                </Section>
              )}
              {trends.length === 0 && (
                <div className="text-center py-16 text-[hsl(var(--text-3))] font-mono text-[12px]">
                  — aucun keyword détecté sur cette période —
                  <br /><span className="text-[11px]">Classifiez des items pour voir les tendances</span>
                </div>
              )}
            </div>
          )}

          {/* ── Volume quotidien ── */}
          {tab === 'volume' && (
            <div className="panel p-5">
              <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-4">
                Items collectés par jour — {window} derniers jours
              </p>
              {data.daily_volume.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={data.daily_volume} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 16%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215 12% 38%)' }}
                      tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215 12% 38%)' }} width={24} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220 18% 7%)', border: '1px solid hsl(220 10% 16%)', borderRadius: 6 }}
                      labelStyle={{ color: 'hsl(210 20% 96%)', fontSize: 11 }}
                      itemStyle={{ color: 'hsl(235 85% 65%)', fontSize: 11 }}
                    />
                    <Bar dataKey="count" fill="hsl(235 85% 65%)" radius={[3, 3, 0, 0]} name="Items" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-[hsl(var(--text-3))] font-mono text-[12px] py-10">— aucune donnée —</p>
              )}
            </div>
          )}

          {/* ── Sparklines top 5 ── */}
          {tab === 'sparklines' && (
            <div className="panel p-5">
              <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-4">
                Évolution quotidienne — top 5 keywords
              </p>
              {sparklineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={sparklineData} margin={{ top: 4, right: 4, bottom: 4, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 10% 16%)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(215 12% 38%)' }}
                      tickFormatter={d => d.slice(5)} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(215 12% 38%)' }} width={24} />
                    <Tooltip
                      contentStyle={{ background: 'hsl(220 18% 7%)', border: '1px solid hsl(220 10% 16%)', borderRadius: 6 }}
                      labelStyle={{ color: 'hsl(210 20% 96%)', fontSize: 11 }}
                      itemStyle={{ fontSize: 11 }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11, color: 'hsl(215 16% 58%)' }} />
                    {top5Keywords.map((kw, i) => (
                      <Line key={kw} type="monotone" dataKey={kw}
                        stroke={PALETTE[i % PALETTE.length]}
                        strokeWidth={2} dot={false}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-center text-[hsl(var(--text-3))] font-mono text-[12px] py-10">
                  — données insuffisantes pour afficher l'évolution —
                  <br /><span className="text-[11px]">Il faut des items sur plusieurs jours</span>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, color, children, collapsible = false }: {
  title: string; color: string; children: React.ReactNode; collapsible?: boolean
}) {
  const [open, setOpen] = useState(true)
  const colorClass = color === 'accent' ? 'text-[hsl(var(--accent))]'
    : color === 'green' ? 'text-[hsl(var(--green))]'
    : color === 'red' ? 'text-[hsl(var(--red))]'
    : 'text-[hsl(var(--text-3))]'

  return (
    <div>
      <button onClick={() => collapsible && setOpen(v => !v)}
        className={`flex items-center gap-2 mb-2 ${collapsible ? 'cursor-pointer' : 'cursor-default'}`}>
        {collapsible && (
          <motion.div animate={{ rotate: open ? 0 : -90 }} transition={{ duration: 0.15 }}>
            <TrendingUp className={`w-3 h-3 ${colorClass}`} />
          </motion.div>
        )}
        <p className={`text-[11.5px] font-bold uppercase tracking-wider ${colorClass}`}>{title}</p>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="panel overflow-hidden divide-y divide-[hsl(var(--line))]">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function TrendRow({ trend, max }: { trend: any; max: number }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[hsl(var(--bg-2))] transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-[hsl(var(--text))] capitalize truncate">{trend.keyword}</span>
          <DeltaBadge delta={trend.delta} pct={trend.delta_pct} />
        </div>
        {trend.prev_freq > 0 && (
          <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">
            {trend.prev_freq} → {trend.freq} occurrences
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0 w-40">
        <div className="flex-1 h-1.5 bg-[hsl(var(--bg-3))] rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(trend.freq / max) * 100}%` }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="h-full bg-[hsl(var(--accent))] rounded-full"
          />
        </div>
        <span className="text-[11px] font-mono font-bold text-[hsl(var(--text-2))] w-6 text-right">{trend.freq}</span>
      </div>
    </div>
  )
}
