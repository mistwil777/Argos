import { useEffect, useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Newspaper, RefreshCw, Loader2, Sparkles, ChevronDown,
  TrendingUp, Clock, ExternalLink, ShieldCheck, Tag,
  AlertTriangle, GitMerge, Check, X, Archive, Trash2, Info,
  MessageSquare, PanelRightOpen, PanelRightClose
} from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const AssistantPanel = lazy(() => import('@/pages/Assistant'))

const TIER_COLOR: Record<string, string> = {
  official:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  recognized: 'bg-green-500/15 text-green-400 border-green-500/25',
  community:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  unknown:    'bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]',
}

export default function Briefing() {
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [today, setToday]       = useState<any>(null)
  const [history, setHistory]   = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [generating, setGenerating] = useState(false)
  const [histOpen, setHistOpen] = useState(false)
  const [hours, setHours]       = useState(24)
  const [alerts, setAlerts]     = useState<any[]>([])
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => { loadAll(); loadAlerts() }, [])

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

  async function loadAlerts() {
    try {
      const r = await api.getHygieneAlerts('pending', 5)
      setAlerts(r.alerts || [])
    } catch { /* silencieux */ }
  }

  async function resolveAlert(id: number, status: 'ignored' | 'archived' | 'confirmed') {
    setResolvingId(id)
    try {
      await api.resolveHygieneAlert(id, status)
      setAlerts(prev => prev.filter(a => a.id !== id))
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setResolvingId(null) }
  }

  async function deleteBriefing(id: number) {
    setDeletingId(id)
    try {
      await api.deleteBriefing(id)
      setHistory(prev => prev.filter(b => b.id !== id))
      if (selected?.id === id) setSelected(null)
      if (today?.id === id) setToday(null)
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setDeletingId(null) }
  }

  async function deleteAllBriefings() {
    try {
      await api.deleteAllBriefings()
      setHistory([])
      setSelected(null)
      setToday(null)
      setConfirmClearAll(false)
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
  }

  async function loadHistoricalBriefing(id: number) {
    const b = await api.getBriefing(id)
    setSelected(b)
  }

  const displayBriefing = selected

  return (
    <div className="flex h-full">
    <div className={`flex-1 overflow-y-auto p-8 space-y-6 transition-all duration-300 ${assistantOpen ? '' : 'max-w-4xl mx-auto'}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-[22px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-[hsl(var(--accent))]" />
            Briefing Delta
          </h2>
          <p className="text-[12px] font-mono text-[hsl(var(--text-3))] mt-1">
            Ce qui a changé aujourd'hui · sources fiables uniquement
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={() => setAssistantOpen(v => !v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11.5px] font-mono transition-all ${
              assistantOpen
                ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'
            }`}>
            {assistantOpen ? <PanelRightClose className="w-3.5 h-3.5" /> : <PanelRightOpen className="w-3.5 h-3.5" />}
            <MessageSquare className="w-3.5 h-3.5" />
            Assistant
          </button>
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
                <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Delta</span>
                {displayBriefing.stats?.reliability_filtered && (
                  <span className="ml-auto flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--green))] bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                    <ShieldCheck className="w-3 h-3" />fiabilité vérifiée
                  </span>
                )}
              </div>
              <div className="px-5 py-4 prose-app max-h-[620px] overflow-auto">
                <ReactMarkdown>{displayBriefing.markdown || displayBriefing.executive_summary || ''}</ReactMarkdown>
              </div>
            </div>

            {/* Colonne droite : sources citées + keywords */}
            <div className="space-y-4">

              {/* Sources citées groupées */}
              {(displayBriefing.cited_sources?.length > 0 || displayBriefing.top_items?.length > 0) && (
                <div className="panel overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                    <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--green))]" />
                    <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Sources vérifiées</span>
                    <span className="ml-auto text-[10px] font-mono text-[hsl(var(--text-3))]">
                      {(displayBriefing.cited_sources || displayBriefing.top_items || []).length}
                    </span>
                  </div>
                  <div className="divide-y divide-[hsl(var(--line))] max-h-[320px] overflow-auto">
                    {(displayBriefing.cited_sources?.length > 0
                      ? displayBriefing.cited_sources
                      : displayBriefing.top_items || []
                    ).slice(0, 12).map((item: any, i: number) => (
                      <div key={i} className="px-3 py-2 hover:bg-[hsl(var(--bg-2))] transition-colors">
                        <div className="flex items-start gap-2">
                          <span className={`text-[9px] font-mono px-1 py-0.5 rounded border capitalize flex-shrink-0 mt-0.5 ${TIER_COLOR[item.tier || item.reliability_tier || 'unknown']}`}>
                            {item.tier || item.reliability_tier || '?'}
                          </span>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-[hsl(var(--text))] line-clamp-2 leading-snug">
                              {item.title}
                            </p>
                            {item.url && (
                              <a href={item.url} target="_blank" rel="noreferrer"
                                className="text-[10px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 mt-0.5 truncate max-w-[160px]">
                                <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                <span className="truncate">{(() => { try { return new URL(item.url).hostname } catch { return item.url } })()}</span>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Keywords / tendances */}
              {displayBriefing.trends?.length > 0 && (
                <div className="panel overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                    <Tag className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                    <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Mots-clés</span>
                  </div>
                  <div className="p-3 flex flex-wrap gap-1.5">
                    {displayBriefing.trends.slice(0, 12).map((t: any, i: number) => (
                      <span key={i} className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-2))] border border-[hsl(var(--line))]">
                        {t.keyword}
                        {t.count > 1 && <span className="ml-1 text-[hsl(var(--text-3))]">×{t.count}</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Stats groupes */}
              {displayBriefing.stats?.groups?.length > 0 && (
                <div className="panel overflow-hidden">
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                    <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
                    <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Entités couvertes</span>
                  </div>
                  <div className="p-3 space-y-1">
                    {displayBriefing.stats.groups.map((g: string, i: number) => (
                      <div key={i} className="text-[11px] text-[hsl(var(--text-2))] px-1">· {g}</div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Signaux à vérifier (alertes RAG Hygiene) */}
      {alerts.length > 0 && (
        <div>
          <button onClick={() => setAlertsOpen(v => !v)}
            className="flex items-center gap-2 mb-3 text-[12px] font-semibold text-[hsl(var(--amber))] hover:text-[hsl(var(--text))] transition-colors">
            <motion.div animate={{ rotate: alertsOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.div>
            <AlertTriangle className="w-3.5 h-3.5" />
            Signaux à vérifier ({alerts.length})
          </button>
          <AnimatePresence>
            {alertsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="space-y-2">
                  {alerts.map((alert: any) => (
                    <div key={alert.id} className="panel p-4 flex items-start gap-4">
                      <div className="flex-shrink-0 mt-0.5">
                        {alert.type === 'fusion_proposal'
                          ? <GitMerge className="w-4 h-4 text-[hsl(var(--violet))]" />
                          : <AlertTriangle className="w-4 h-4 text-[hsl(var(--amber))]" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded border bg-[hsl(var(--bg-3))] border-[hsl(var(--line))] text-[hsl(var(--text-3))]">
                            {alert.type.replace('_', ' ')}
                          </span>
                          <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                            {timeAgo(alert.created_at)}
                          </span>
                        </div>
                        <p className="text-[12.5px] text-[hsl(var(--text))] leading-snug">{alert.message}</p>
                        {alert.source_url && (
                          <a href={alert.source_url} target="_blank" rel="noreferrer"
                            className="inline-flex items-center gap-1 mt-1 text-[10.5px] font-mono text-[hsl(var(--accent))] hover:underline">
                            <ExternalLink className="w-2.5 h-2.5" />
                            {(() => { try { return new URL(alert.source_url).hostname } catch { return alert.source_url } })()}
                          </a>
                        )}
                        {alert.proposed_content && (
                          <details className="mt-2">
                            <summary className="text-[10.5px] font-mono text-[hsl(var(--text-3))] cursor-pointer hover:text-[hsl(var(--text-2))]">
                              Voir la synthèse proposée
                            </summary>
                            <p className="mt-2 text-[11.5px] text-[hsl(var(--text-2))] bg-[hsl(var(--bg-3))] rounded p-3 leading-relaxed whitespace-pre-wrap">
                              {alert.proposed_content}
                            </p>
                          </details>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {alert.type === 'fusion_proposal' && (
                          <button
                            disabled={resolvingId === alert.id}
                            onClick={() => resolveAlert(alert.id, 'confirmed')}
                            title="Confirmer la fusion"
                            className="flex items-center gap-1 px-2 py-1 rounded text-[10.5px] font-mono bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))]/20 transition-colors disabled:opacity-40"
                          >
                            {resolvingId === alert.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                            Fusionner
                          </button>
                        )}
                        <button
                          disabled={resolvingId === alert.id}
                          onClick={() => resolveAlert(alert.id, 'archived')}
                          title="Archiver"
                          className="p-1.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors disabled:opacity-40"
                        >
                          <Archive className="w-3 h-3" />
                        </button>
                        <button
                          disabled={resolvingId === alert.id}
                          onClick={() => resolveAlert(alert.id, 'ignored')}
                          title="Ignorer"
                          className="p-1.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors disabled:opacity-40"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Historique */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <button onClick={() => setHistOpen(v => !v)}
              className="flex items-center gap-2 text-[12px] font-semibold text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] transition-colors">
              <motion.div animate={{ rotate: histOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
                <ChevronDown className="w-3.5 h-3.5" />
              </motion.div>
              Historique ({history.length} briefings)
            </button>
            <div className="flex items-center gap-2">
              {/* Bulle d'info */}
              <div className="relative group/info">
                <Info className="w-3.5 h-3.5 text-[hsl(var(--text-3))] cursor-help" />
                <div className="absolute right-0 bottom-6 w-72 p-3 rounded-lg bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] text-[11px] text-[hsl(var(--text-2))] leading-relaxed shadow-lg opacity-0 group-hover/info:opacity-100 pointer-events-none transition-opacity z-10">
                  Supprimer un briefing n'efface pas les articles. Ils restent dans Argos et continuent d'alimenter tes recherches.
                </div>
              </div>
              {/* Vider tout */}
              {confirmClearAll ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">Confirmer ?</span>
                  <button onClick={deleteAllBriefings}
                    className="px-2 py-1 rounded text-[10.5px] font-mono bg-red-500/15 border border-red-500/30 text-red-400 hover:bg-red-500/25 transition-colors">
                    Oui, tout vider
                  </button>
                  <button onClick={() => setConfirmClearAll(false)}
                    className="px-2 py-1 rounded text-[10.5px] font-mono border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--line-bright))] transition-colors">
                    Annuler
                  </button>
                </div>
              ) : (
                <button onClick={() => setConfirmClearAll(true)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10.5px] font-mono border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-red-500/40 hover:text-red-400 transition-colors">
                  <Trash2 className="w-3 h-3" />
                  Tout vider
                </button>
              )}
            </div>
          </div>
          <AnimatePresence>
            {histOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="panel overflow-hidden divide-y divide-[hsl(var(--line))]">
                  {history.map((b: any) => (
                    <div key={b.id}
                      className={`flex items-center gap-2 group/row transition-colors ${selected?.id === b.id ? 'bg-[hsl(var(--accent-dim))]' : 'hover:bg-[hsl(var(--bg-2))]'}`}>
                      <button onClick={() => loadHistoricalBriefing(b.id)}
                        className="flex-1 text-left px-4 py-3 flex items-center justify-between gap-4">
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
                      <button
                        onClick={() => deleteBriefing(b.id)}
                        disabled={deletingId === b.id}
                        className="mr-3 p-1.5 rounded opacity-0 group-hover/row:opacity-100 text-[hsl(var(--text-3))] hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-40"
                      >
                        {deletingId === b.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <Trash2 className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>{/* fin panneau scrollable */}

    {/* Panneau assistant latéral */}
    {assistantOpen && (
      <div className="flex-shrink-0 w-[420px] border-l border-[hsl(var(--line))] overflow-hidden bg-[hsl(var(--bg-1))]">
        <Suspense fallback={
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" />
          </div>
        }>
          <AssistantPanel />
        </Suspense>
      </div>
    )}
    </div>
  )
}
