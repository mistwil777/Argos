import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Newspaper, RefreshCw, Loader2, Sparkles, ChevronDown,
  TrendingUp, AlertCircle, Clock, DatabaseZap, ExternalLink
} from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const IMP_COLOR: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/25',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/25',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  low: 'bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]',
}

export default function Briefing() {
  const [today, setToday]       = useState<any>(null)
  const [history, setHistory]   = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [hours, setHours]       = useState(24)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      const [t, h] = await Promise.all([api.getTodayBriefing(), api.listBriefings(30)])
      setToday(t)
      setHistory(Array.isArray(h) ? h : [])
      if (t?.exists) setSelected(t)
    } finally { setLoading(false) }
  }

  async function generate(force = false) {
    setGenerating(true)
    try {
      const r = await api.generateBriefing(hours, force)
      if (r.already_exists && !force) {
        // Load the existing one
        const existing = await api.getBriefing(r.id)
        setToday({ ...existing, exists: true })
        setSelected({ ...existing, exists: true })
      } else {
        setToday({ ...r, exists: true })
        setSelected({ ...r, exists: true })
        await loadAll()
      }
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setGenerating(false) }
  }

  async function loadHistoricalBriefing(id: number) {
    const b = await api.getBriefing(id)
    setSelected(b)
  }

  const displayBriefing = selected

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-[hsl(var(--accent))]" />
            Briefing de veille
          </h2>
          <p className="text-[12px] font-mono text-[hsl(var(--text-3))] mt-1">
            Synthèse quotidienne automatique des items high &amp; critical
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select value={hours} onChange={e => setHours(+e.target.value)}
            className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[11.5px] font-mono text-[hsl(var(--text-2))] outline-none">
            <option value={24}>24h</option>
            <option value={48}>48h</option>
            <option value={72}>72h</option>
          </select>
          <motion.button
            onClick={() => generate(!!today?.exists)}
            disabled={generating || loading}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-2 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
          >
            {generating
              ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Génération…</>
              : today?.exists
                ? <><RefreshCw className="w-3.5 h-3.5" />Regénérer</>
                : <><Sparkles className="w-3.5 h-3.5" />Générer le brief</>
            }
          </motion.button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--text-3))]" />
        </div>
      )}

      {!loading && !displayBriefing?.exists && !generating && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="panel p-10 flex flex-col items-center gap-4 text-center">
          <Newspaper className="w-10 h-10 text-[hsl(var(--text-3))] opacity-40" />
          <div>
            <p className="text-[14px] font-semibold text-[hsl(var(--text))]">Aucun briefing pour aujourd'hui</p>
            <p className="text-[12px] text-[hsl(var(--text-3))] mt-1">
              Cliquez sur "Générer le brief" pour créer le résumé des dernières {hours}h.
              Le briefing se génère automatiquement chaque matin à 7h00.
            </p>
          </div>
        </motion.div>
      )}

      {/* Briefing actif */}
      {!loading && displayBriefing && (
        <div className="space-y-5">

          {/* Meta */}
          <div className="panel-accent p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div>
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Briefing du</p>
                <p className="text-[15px] font-bold text-[hsl(var(--text))]">
                  {new Date(displayBriefing.date || displayBriefing.generated_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              {displayBriefing.stats && (
                <div className="flex items-center gap-3 text-[11px] font-mono text-[hsl(var(--text-3))]">
                  <span className="text-[hsl(var(--red))]">{displayBriefing.stats.critical || 0} critical</span>
                  <span>·</span>
                  <span className="text-[hsl(var(--amber))]">{displayBriefing.stats.high || 0} high</span>
                  <span>·</span>
                  <span>{displayBriefing.stats.total_items || 0} items analysés</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 text-[10.5px] font-mono text-[hsl(var(--text-3))]">
              {displayBriefing.generated_at && <span><Clock className="w-3 h-3 inline mr-1" />{timeAgo(displayBriefing.generated_at)}</span>}
              {displayBriefing.tokens_used > 0 && <span>{displayBriefing.tokens_used.toLocaleString()} tokens</span>}
            </div>
          </div>

          {/* Layout 2 colonnes */}
          <div className="grid grid-cols-3 gap-5">

            {/* Markdown principal */}
            <div className="col-span-2 panel overflow-hidden">
              <div className="flex items-center gap-2 px-5 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                <Newspaper className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Synthèse</span>
              </div>
              <div className="px-5 py-4 prose-app max-h-[600px] overflow-auto">
                <ReactMarkdown>{displayBriefing.markdown || displayBriefing.executive_summary || ''}</ReactMarkdown>
              </div>
            </div>

            {/* Colonne droite : tendances + sources */}
            <div className="space-y-4">

              {/* Tendances */}
              {displayBriefing.trends?.length > 0 && (
                <div className="panel overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                    <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--green))]" />
                    <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Tendances</span>
                  </div>
                  <div className="p-3 space-y-1.5">
                    {displayBriefing.trends.map((t: any, i: number) => (
                      <div key={i} className="flex items-center justify-between gap-2">
                        <span className="text-[12px] text-[hsl(var(--text-2))] truncate">{t.keyword}</span>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <div className="h-1 rounded-full bg-[hsl(var(--accent))]"
                            style={{ width: `${Math.min(60, t.count * 12)}px` }} />
                          <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{t.count}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Top items */}
              {displayBriefing.top_items?.length > 0 && (
                <div className="panel overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                    <AlertCircle className="w-3.5 h-3.5 text-[hsl(var(--amber))]" />
                    <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Sources</span>
                  </div>
                  <div className="divide-y divide-[hsl(var(--line))]">
                    {displayBriefing.top_items.slice(0, 6).map((item: any, i: number) => (
                      <div key={i} className="px-3 py-2.5 hover:bg-[hsl(var(--bg-2))] transition-colors">
                        <div className="flex items-start gap-2">
                          <span className={`text-[9.5px] font-mono px-1 py-0.5 rounded border capitalize flex-shrink-0 mt-0.5 ${IMP_COLOR[item.importance] ?? IMP_COLOR.low}`}>
                            {item.importance}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11.5px] font-semibold text-[hsl(var(--text))] line-clamp-2 leading-snug">{item.title}</p>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noreferrer"
                                className="text-[10px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 mt-0.5">
                                <ExternalLink className="w-2.5 h-2.5" />source
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Historique */}
      {history.length > 0 && (
        <div>
          <button onClick={() => setHistOpen(v => !v)}
            className="flex items-center gap-2 mb-3 text-[12px] font-semibold text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] transition-colors">
            <motion.div animate={{ rotate: histOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.div>
            Historique ({history.length} briefings)
          </button>
          <AnimatePresence>
            {histOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="panel overflow-hidden divide-y divide-[hsl(var(--line))]">
                  {history.map((b: any) => (
                    <button key={b.id} onClick={() => loadHistoricalBriefing(b.id)}
                      className={`w-full text-left px-4 py-3 hover:bg-[hsl(var(--bg-2))] transition-colors flex items-center justify-between gap-4 ${selected?.id === b.id ? 'bg-[hsl(var(--accent-dim))]' : ''}`}>
                      <div>
                        <p className="text-[12.5px] font-semibold text-[hsl(var(--text))]">
                          {new Date(b.date).toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}
                        </p>
                        <p className="text-[11px] text-[hsl(var(--text-3))] line-clamp-1 mt-0.5">{b.excerpt?.replace(/#+\s/g, '')}</p>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0 text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                        {b.stats?.total_items && <span>{b.stats.total_items} items</span>}
                        <span>{timeAgo(b.generated_at)}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
