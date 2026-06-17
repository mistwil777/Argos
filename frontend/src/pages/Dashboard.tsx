import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  Globe, Rss, MessageSquare, TrendingUp,
  Clock, Radio, AlertCircle, ArrowUpRight, Cpu,
  ChevronDown, Trash2, X
} from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import StatsDrawer, { type DrawerType } from '@/components/ui/StatsDrawer'

const ONBOARDING_KEY = 'owm_onboarding_done'

const FLOW_STEPS = [
  {
    step: '1', to: '/sources', icon: Radio, color: 'text-[hsl(var(--cyan))]',
    label: 'Sources',
    desc: 'Ajoutez des flux RSS, GitHub ou APIs pour collecter du contenu automatiquement.',
  },
  {
    step: '2', to: '/feed', icon: Rss, color: 'text-[hsl(var(--accent))]',
    label: 'Feed',
    desc: 'Lisez et classifiez les items collectés par importance et type.',
  },
  {
    step: '3', to: '/browse', icon: Globe, color: 'text-[hsl(var(--violet))]',
    label: 'Browse',
    desc: 'Enrichissez n\'importe quelle URL : résumé markdown + indexation pour l\'Assistant.',
  },
  {
    step: '4', to: '/assistant', icon: MessageSquare, color: 'text-[hsl(var(--green))]',
    label: 'Assistant',
    desc: 'Posez des questions en langage naturel sur tous vos contenus indexés.',
  },
]

function GettingStarted() {
  const [visible, setVisible] = useState(() => localStorage.getItem(ONBOARDING_KEY) !== 'done')

  function dismiss() {
    localStorage.setItem(ONBOARDING_KEY, 'done')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12, height: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          className="panel-accent overflow-hidden mb-8"
        >
          <div className="px-6 pt-5 pb-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-[13px] font-bold text-[hsl(var(--text))]">Bienvenue sur OpenWebMCP</p>
                <p className="text-[11.5px] text-[hsl(var(--text-3))] mt-0.5">Suivez ces 4 étapes pour démarrer votre veille</p>
              </div>
              <button onClick={dismiss} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {FLOW_STEPS.map(({ step, to, icon: Icon, color, label, desc }, i) => (
                <Link key={to} to={to} className="group relative">
                  <motion.div
                    whileHover={{ y: -2 }}
                    className="h-full panel rounded-lg p-4 flex flex-col gap-2 hover:border-[hsl(var(--line-bright))] transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-7 h-7 rounded-lg bg-[hsl(var(--bg-3))] flex items-center justify-center ${color}`}>
                        <Icon className="w-3.5 h-3.5" strokeWidth={2} />
                      </div>
                      <span className="text-[9px] font-bold font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-3))] px-1.5 py-0.5 rounded-full">
                        0{step}
                      </span>
                    </div>
                    <p className="text-[13px] font-semibold text-[hsl(var(--text))]">{label}</p>
                    <p className="text-[11px] text-[hsl(var(--text-3))] leading-snug">{desc}</p>
                    {i < FLOW_STEPS.length - 1 && (
                      <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 z-10 hidden md:block">
                        <div className="w-3 h-3 text-[hsl(var(--text-3))]">→</div>
                      </div>
                    )}
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

interface Stats {
  total_items?: number; classified_items?: number
  total_browses?: number; total_searches?: number
  browse_sessions_total?: number; search_sessions_total?: number; items_total?: number
  rag_queries_total?: number; watched_pages?: number; digests_generated?: number
  total_cost?: number; cost_this_month?: number; llm_cost_month?: number
  tools_registered?: number
}

const STAGGER = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } }
const CARD_V = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 260, damping: 22 } }
}

const IMPORTANCE: Record<string, string> = {
  critical: 'text-red-400', high: 'text-orange-400',
  medium: 'text-yellow-400', low: 'text-[hsl(var(--text-3))]',
}

function MetricCard({ icon: Icon, label, value, sub, accent = false, onClick }: {
  icon: any; label: string; value: string | number; sub?: string; accent?: boolean; onClick?: () => void
}) {
  return (
    <motion.div
      variants={CARD_V}
      whileHover={{ y: -3, transition: { duration: 0.18 } }}
      onClick={onClick}
      className={`relative panel overflow-hidden group ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {/* Top accent line */}
      {accent && (
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[hsl(var(--accent))] to-transparent" />
      )}
      {/* Glow blob */}
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full bg-[hsl(var(--accent-dim))] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

      <div className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="w-8 h-8 rounded-lg bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] flex items-center justify-center">
            <Icon className="w-3.5 h-3.5 text-[hsl(var(--text-2))]" strokeWidth={1.75} />
          </div>
          <ArrowUpRight className="w-3.5 h-3.5 text-[hsl(var(--text-3))] opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
        <div>
          <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em] mb-1">{label}</p>
          <p className="text-3xl font-bold text-[hsl(var(--text))] tracking-tight tabular-nums leading-none">{value}</p>
          {sub && <p className="text-[11px] text-[hsl(var(--text-3))] mt-1.5">{sub}</p>}
        </div>
      </div>
    </motion.div>
  )
}

export default function Dashboard() {
  const [stats, setStats]   = useState<Stats | null>(null)
  const [items, setItems]   = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]   = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)
  const [drawer, setDrawer] = useState<DrawerType>(null)

  useEffect(() => {
    Promise.all([api.getStats(), api.getRecentActivity(20)])
      .then(([s, activity]) => { setStats(s); setItems(activity || []) })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="p-8 grid grid-cols-2 md:grid-cols-4 gap-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-28 skeleton" />
      ))}
    </div>
  )

  if (error) return (
    <div className="flex flex-col items-center justify-center h-full gap-4 text-[hsl(var(--text-2))]">
      <AlertCircle className="w-10 h-10 text-[hsl(var(--red))]" />
      <p className="text-sm font-mono">Backend inaccessible</p>
    </div>
  )

  const browses    = stats?.total_browses  ?? stats?.browse_sessions_total ?? 0
  const totalItems = stats?.total_items    ?? stats?.items_total           ?? 0
  const cost       = stats?.cost_this_month?? stats?.llm_cost_month        ?? 0

  const isVirgin = totalItems === 0 && browses === 0

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-8">

      {/* ── Onboarding ── */}
      {isVirgin && <GettingStarted />}

      {/* ── Metrics grid ── */}
      <motion.div variants={STAGGER} initial="hidden" animate="show"
        className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard icon={Globe}         label="Browses"         value={browses}                                   accent onClick={() => setDrawer('browses')} />
        <MetricCard icon={Rss}           label="Items"           value={totalItems} sub={`${stats?.classified_items ?? 0} classifiés`} onClick={() => setDrawer('items')} />
        <MetricCard icon={Radio}         label="Surveillées"     value={stats?.watched_pages ?? 0}                 accent onClick={() => setDrawer('watched')} />
        <MetricCard icon={TrendingUp}    label="Digests"         value={stats?.digests_generated ?? 0}            onClick={() => setDrawer('digests')} />
        <MetricCard icon={MessageSquare} label="Queries RAG"     value={stats?.rag_queries_total ?? 0}            onClick={() => setDrawer('rag')} />
        <MetricCard icon={Clock}         label="Coût LLM / mois" value={`$${cost.toFixed(3)}`}                    onClick={() => setDrawer('costs')} />
        <MetricCard icon={Cpu}           label="Outils MCP"      value={stats?.tools_registered ?? 19} sub="actifs" accent onClick={() => setDrawer('tools')} />
      </motion.div>

      <StatsDrawer type={drawer} onClose={() => setDrawer(null)} />

      {/* ── Feed ── */}
      <div>
        {/* Header — cliquable pour toggle */}
        <button
          onClick={() => setFeedOpen(v => !v)}
          className="w-full flex items-center justify-between mb-3 group"
        >
          <div className="flex items-center gap-2.5">
            <motion.div
              animate={{ rotate: feedOpen ? 0 : -90 }}
              transition={{ duration: 0.18 }}
            >
              <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--text-3))] group-hover:text-[hsl(var(--text-2))] transition-colors" />
            </motion.div>
            <h2 className="text-[15px] font-bold text-[hsl(var(--text))] tracking-tight group-hover:text-[hsl(var(--text))] transition-colors">
              Activité récente
            </h2>
            <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
              {feedOpen ? `${items.length} entrées` : 'réduit'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {feedOpen && items.length > 0 && (
              <motion.button
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                onClick={e => { e.stopPropagation(); setItems([]) }}
                className="flex items-center gap-1 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-colors"
              >
                <Trash2 className="w-3 h-3" /> vider
              </motion.button>
            )}
            <a
              href="/feed"
              onClick={e => e.stopPropagation()}
              className="flex items-center gap-1 text-[11px] font-mono text-[hsl(var(--accent))] hover:text-[hsl(var(--text))] transition-colors"
            >
              Voir tout <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {feedOpen && (
            <motion.div
              key="feed-table"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ type: 'spring', stiffness: 300, damping: 32 }}
              className="overflow-hidden"
            >
              <div className="panel overflow-hidden">
                <div className="grid grid-cols-[1fr_120px_80px] gap-4 px-5 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em]">Titre</p>
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em]">Source</p>
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em] text-right">Ajouté</p>
                </div>
                {items.length === 0 ? (
                  <p className="text-[13px] text-[hsl(var(--text-3))] text-center py-12 font-mono">— aucun contenu —</p>
                ) : (
                  <div>
                    {items.map((it, i) => (
                      <motion.div
                        key={it.id}
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03, type: 'spring', stiffness: 300, damping: 28 }}
                        className={`grid grid-cols-[1fr_120px_80px] gap-4 px-5 py-3.5 hover:bg-[hsl(var(--bg-2))] transition-colors ${i > 0 ? 'border-t border-[hsl(var(--line))]' : ''}`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className={`w-1 h-5 rounded-full flex-shrink-0 ${
                            it.kind === 'browse' ? 'bg-[hsl(var(--accent))]' :
                            it.kind === 'search' ? 'bg-yellow-500' : 'bg-[hsl(var(--bg-3))]'
                          }`} />
                          {it.ref
                            ? <a href={it.ref} target="_blank" rel="noreferrer"
                                className="text-[13px] font-medium text-[hsl(var(--text))] hover:text-[hsl(var(--accent))] truncate transition-colors">
                                {it.title}
                              </a>
                            : <span className="text-[13px] font-medium text-[hsl(var(--text))] truncate">{it.title}</span>
                          }
                        </div>
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] truncate self-center">
                          {it.kind}{it.sub ? ` · ${it.sub}` : ''}
                        </p>
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] text-right self-center">
                          {timeAgo(it.created_at)}
                        </p>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
