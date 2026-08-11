import { useEffect, useState, lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Newspaper, RefreshCw, Loader2, Sparkles, ChevronDown,
  TrendingUp, Clock, ExternalLink, ShieldCheck, Tag,
  AlertTriangle, GitMerge, Check, X, Archive, Trash2, Info,
  MessageSquare, PanelRightOpen, PanelRightClose, Save,
  BookmarkPlus, Database, EyeOff, Square, CheckSquare, Layers
} from 'lucide-react'
import DocumentGeneratorModal from '@/components/ui/DocumentGeneratorModal'
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
  const [readModal, setReadModal] = useState<{ item: any; content: string } | null>(null)
  const [readLoading, setReadLoading] = useState(false)
  const [readSaving, setReadSaving] = useState(false)
  const [readSaved, setReadSaved] = useState(false)
  const [readSujetId, setReadSujetId] = useState<number | null>(null)
  const [sujets, setSujets] = useState<any[]>([])
  const [genModal, setGenModal] = useState<{ itemIds: number[]; itemTitle: string; sujetId?: number | null } | null>(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const [sujetFilter, setSujetFilter] = useState<number | null>(() => {
    const v = searchParams.get('sujet')
    return v ? parseInt(v) : null
  })
  const [firstVisit, setFirstVisit] = useState(() => !!searchParams.get('sujet'))
  const [alerts, setAlerts]     = useState<any[]>([])
  const [alertsOpen, setAlertsOpen] = useState(false)
  const [resolvingId, setResolvingId] = useState<number | null>(null)
  const [confirmClearAll, setConfirmClearAll] = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [itemActions, setItemActions] = useState<Record<number, string>>({})
  const [itemActionLoading, setItemActionLoading] = useState<Record<number, string | null>>({})
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [batchLoading, setBatchLoading] = useState<string | null>(null)

  useEffect(() => { loadAll(); loadAlerts(); api.getSujets(1).then((r: any) => setSujets(Array.isArray(r) ? r : r.sujets || [])) }, [])

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

  async function openRead(item: any) {
    setReadLoading(true)
    setReadSaved(false)
    setReadSujetId(item.sujet_id ?? null)
    setReadModal({ item, content: '' })
    try {
      const r = await api.ingestPreview(item.id)
      setReadModal({ item, content: r.markdown || r.content || '' })
    } catch {
      setReadModal({ item, content: item.summary || 'Contenu non disponible.' })
    } finally { setReadLoading(false) }
  }

  async function saveReadItem() {
    if (!readModal?.item || readSaving) return
    setReadSaving(true)
    try {
      await api.saveDocument({
        title: readModal.item.title,
        doc_type: 'fiche',
        content_markdown: readModal.content,
        summary: readModal.item.summary || '',
        source_item_ids: [readModal.item.id],
        sujet_id: readSujetId,
      })
      setReadSaved(true)
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setReadSaving(false) }
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

  async function handleItemAction(itemId: number, action: 'save' | 'ingest' | 'ignore') {
    setItemActionLoading(prev => ({ ...prev, [itemId]: action }))
    try {
      if (action === 'save') await api.saveItem(itemId)
      else if (action === 'ingest') await api.ingestItemRag(itemId)
      else await api.ignoreItem(itemId)
      setItemActions(prev => ({ ...prev, [itemId]: action }))
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setItemActionLoading(prev => ({ ...prev, [itemId]: null })) }
  }

  function toggleSelectItem(id: number) {
    setSelectedItems(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const allItems: any[] = displayBriefing?.top_items || []
    const visible = allItems.map((it: any) => it.id).filter((id: number) => itemActions[id] !== 'ignored')
    if (visible.length > 0 && visible.every((id: number) => selectedItems.has(id))) {
      setSelectedItems(new Set())
    } else {
      setSelectedItems(new Set(visible))
    }
  }

  async function handleBatchAction(action: 'save' | 'ingest' | 'ignore') {
    const ids = Array.from(selectedItems)
    if (!ids.length) return
    setBatchLoading(action)
    try {
      if (action === 'save') await api.batchSaveItems(ids)
      else if (action === 'ingest') await api.batchIngestRag(ids)
      else await api.batchIgnoreItems(ids)
      const label = action === 'save' ? 'saved' : action === 'ingest' ? 'ingested' : 'ignored'
      setItemActions(prev => {
        const next = { ...prev }
        ids.forEach(id => { next[id] = label })
        return next
      })
      setSelectedItems(new Set())
    } catch (e: any) { alert(`Erreur batch : ${e.message}`) }
    finally { setBatchLoading(null) }
  }

  const displayBriefing = selected

  return (
    <div className="flex h-full">
    <div className="flex-1 overflow-y-auto">
    <div className={`p-8 space-y-6 transition-all duration-300 ${assistantOpen ? '' : 'max-w-4xl mx-auto'}`}>

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
          <select
            value={sujetFilter ?? ''}
            onChange={e => {
              const v = e.target.value ? parseInt(e.target.value) : null
              setSujetFilter(v)
              setFirstVisit(false)
              if (v) setSearchParams({ sujet: String(v) })
              else setSearchParams({})
            }}
            className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--accent-line))] rounded px-2 py-1.5 text-[11.5px] font-mono text-[hsl(var(--accent))] outline-none">
            <option value="">Tous les sujets</option>
            {sujets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
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

      {/* Message d'accueil après collecte */}
      {firstVisit && sujetFilter && !loading && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="panel-accent px-5 py-4 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-[hsl(var(--accent))] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[13px] font-semibold text-[hsl(var(--text))]">Ta première collecte est prête</p>
            <p className="text-[11.5px] text-[hsl(var(--text-2))] mt-0.5">
              Génère ton briefing pour découvrir les résultats — le LLM regroupe les articles par thème et te propose un résumé en 3 lignes.
            </p>
          </div>
          <button onClick={() => setFirstVisit(false)} className="flex-shrink-0 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]">
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}

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

            {/* Delta structuré avec checkboxes */}
            {(() => {
              // Construire un index id → item depuis top_items, filtré par sujet si actif
              const itemIndex: Record<number, any> = {}
              ;(displayBriefing.top_items || [])
                .filter((it: any) => !sujetFilter || it.sujet_id === sujetFilter)
                .forEach((it: any) => { itemIndex[it.id] = it })
              // Groupes depuis le champ groups ({nom: [id,...]}) ou fallback top_items
              const groups: Record<string, number[]> = displayBriefing.groups && Object.keys(displayBriefing.groups).length > 0
                ? displayBriefing.groups
                : { 'Sources': (displayBriefing.top_items || []).map((it: any) => it.id) }
              const allVisibleIds = Object.values(groups).flat().filter((id: number) => itemIndex[id] && itemActions[id] !== 'ignored')
              const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id: number) => selectedItems.has(id))
              // Extraire le résumé 3 lignes et signal faible depuis le markdown
              const md = displayBriefing.markdown || displayBriefing.executive_summary || ''
              const summaryMatch = md.match(/### Résumé en 3 lignes\n([\s\S]*?)(?=\n###|\n##|$)/)
              const signalMatch = md.match(/## Signal faible[\s\S]*?$/)
              const summaryText = summaryMatch ? summaryMatch[1].trim() : ''
              const signalText = signalMatch ? signalMatch[0].trim() : ''

              return (
              <div className="col-span-2 panel overflow-hidden flex flex-col">
                {/* Header */}
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <Newspaper className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                  <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Delta</span>
                  <span className="ml-auto flex items-center gap-2">
                    {displayBriefing.stats?.reliability_filtered && (
                      <span className="flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--green))] bg-green-500/10 border border-green-500/20 px-2 py-0.5 rounded">
                        <ShieldCheck className="w-3 h-3" />fiabilité vérifiée
                      </span>
                    )}
                    <button onClick={toggleSelectAll} title={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                      className="p-0.5 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                      {allSelected ? <CheckSquare className="w-3.5 h-3.5 text-[hsl(var(--accent))]" /> : <Square className="w-3.5 h-3.5" />}
                    </button>
                  </span>
                </div>

                {/* Barre batch */}
                <AnimatePresence>
                  {selectedItems.size > 0 && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="border-b border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] px-4 py-2 flex items-center gap-2 overflow-hidden flex-shrink-0">
                      <Layers className="w-3 h-3 text-[hsl(var(--accent))]" />
                      <span className="text-[10px] font-mono text-[hsl(var(--accent))] font-semibold">
                        {selectedItems.size} sélectionné{selectedItems.size > 1 ? 's' : ''}
                      </span>
                      <div className="ml-auto flex items-center gap-1.5">
                        <button disabled={!!batchLoading} onClick={() => handleBatchAction('save')}
                          className="inline-flex items-center gap-1 text-[9.5px] font-mono px-2 py-0.5 rounded border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors disabled:opacity-40">
                          {batchLoading === 'save' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <BookmarkPlus className="w-2.5 h-2.5" />}
                          Sauvegarder
                        </button>
                        <button disabled={!!batchLoading} onClick={() => handleBatchAction('ingest')}
                          className="inline-flex items-center gap-1 text-[9.5px] font-mono px-2 py-0.5 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))] hover:text-white transition-colors disabled:opacity-40">
                          {batchLoading === 'ingest' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Database className="w-2.5 h-2.5" />}
                          Intégrer au RAG
                        </button>
                        <button disabled={!!batchLoading} onClick={() => handleBatchAction('ignore')}
                          className="inline-flex items-center gap-1 text-[9.5px] font-mono px-2 py-0.5 rounded border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text-3))] hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40">
                          {batchLoading === 'ignore' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <EyeOff className="w-2.5 h-2.5" />}
                          Ignorer
                        </button>
                        <button onClick={() => setSelectedItems(new Set())} className="p-0.5 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors ml-1">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="overflow-auto max-h-[620px] px-5 py-4 space-y-5">
                  {/* Résumé 3 lignes */}
                  {summaryText && (
                    <div>
                      <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Résumé en 3 lignes</p>
                      <div className="prose-app text-[13px]">
                        <ReactMarkdown>{summaryText}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {/* Groupes d'items */}
                  {Object.entries(groups).map(([groupName, ids]) => {
                    const groupItems = (ids as number[]).map((id: number) => itemIndex[id]).filter(Boolean)
                    if (!groupItems.length) return null
                    return (
                      <div key={groupName}>
                        <p className="text-[12px] font-semibold text-[hsl(var(--accent))] mb-2 pb-1 border-b border-[hsl(var(--line))]">
                          {groupName}
                        </p>
                        <div className="space-y-3">
                          {groupItems.map((item: any) => (
                            itemActions[item.id] === 'ignored' ? null : (
                            <div key={item.id}
                              className={`flex gap-2.5 p-2.5 rounded-lg border transition-colors ${selectedItems.has(item.id) ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]' : 'border-transparent hover:border-[hsl(var(--line))] hover:bg-[hsl(var(--bg-2))]'}`}>
                              {/* Checkbox */}
                              <button onClick={() => toggleSelectItem(item.id)}
                                className="flex-shrink-0 mt-0.5 text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                                {selectedItems.has(item.id)
                                  ? <CheckSquare className="w-4 h-4 text-[hsl(var(--accent))]" />
                                  : <Square className="w-4 h-4" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-start gap-2 flex-wrap mb-1">
                                  <span className="text-[12px] font-semibold text-[hsl(var(--text))] leading-snug">{item.title}</span>
                                  {item.reliability_tier && (
                                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border capitalize flex-shrink-0 ${TIER_COLOR[item.reliability_tier || 'unknown']}`}>
                                      {item.reliability_tier}
                                    </span>
                                  )}
                                </div>
                                {item.summary && (
                                  <p className="text-[12px] text-[hsl(var(--text-2))] leading-relaxed line-clamp-3 mb-2">{item.summary}</p>
                                )}
                                <div className="flex items-center gap-3 flex-wrap">
                                  {item.url && (
                                    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                                      → <a href={item.url} target="_blank" rel="noreferrer" className="hover:underline hover:text-[hsl(var(--accent))]">{(() => { try { return new URL(item.url).hostname } catch { return item.url } })()}</a>
                                    </span>
                                  )}
                                  <button onClick={() => openRead(item)}
                                    className="text-[10px] font-mono text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] px-2 py-0.5 rounded hover:bg-[hsl(var(--accent-dim))] transition-colors">
                                    Lire
                                  </button>
                                  {/* Actions unitaires */}
                                  {itemActions[item.id] === 'saved' ? (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-mono text-[hsl(var(--green))] border border-green-500/25 bg-green-500/10 rounded px-1.5 py-0.5">
                                      <Check className="w-2.5 h-2.5" />Sauvegardé
                                    </span>
                                  ) : itemActions[item.id] === 'ingested' ? (
                                    <span className="inline-flex items-center gap-1 text-[9.5px] font-mono text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] rounded px-1.5 py-0.5">
                                      <Check className="w-2.5 h-2.5" />Dans le RAG
                                    </span>
                                  ) : (
                                    <>
                                      <button disabled={!!itemActionLoading[item.id]} onClick={() => handleItemAction(item.id, 'save')}
                                        className="inline-flex items-center gap-1 text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors disabled:opacity-40">
                                        {itemActionLoading[item.id] === 'save' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <BookmarkPlus className="w-2.5 h-2.5" />}
                                        Sauvegarder
                                      </button>
                                      <button disabled={!!itemActionLoading[item.id]} onClick={() => handleItemAction(item.id, 'ingest')}
                                        className="inline-flex items-center gap-1 text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors disabled:opacity-40">
                                        {itemActionLoading[item.id] === 'ingest' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Database className="w-2.5 h-2.5" />}
                                        RAG
                                      </button>
                                      <button disabled={!!itemActionLoading[item.id]} onClick={() => handleItemAction(item.id, 'ignore')}
                                        className="inline-flex items-center gap-1 text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40">
                                        {itemActionLoading[item.id] === 'ignore' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <EyeOff className="w-2.5 h-2.5" />}
                                        Ignorer
                                      </button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                            )
                          ))}
                        </div>
                      </div>
                    )
                  })}

                  {/* Signal faible */}
                  {signalText && (
                    <div className="border-t border-[hsl(var(--line))] pt-4">
                      <div className="prose-app text-[12.5px]">
                        <ReactMarkdown>{signalText}</ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              )
            })()}

            {/* Colonne droite : sources citées + keywords */}
            <div className="space-y-4">

              {/* Sources citées — liste simple, sans checkboxes */}
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
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-semibold text-[hsl(var(--text))] line-clamp-2 leading-snug">{item.title}</p>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <button onClick={() => openRead(item)} className="text-[10px] font-mono text-[hsl(var(--accent))] hover:underline">Lire</button>
                              {item.url && (
                                <a href={item.url} target="_blank" rel="noreferrer"
                                  className="text-[10px] font-mono text-[hsl(var(--text-3))] hover:underline flex items-center gap-1 truncate max-w-[120px]">
                                  <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                  <span className="truncate">{(() => { try { return new URL(item.url).hostname } catch { return item.url } })()}</span>
                                </a>
                              )}
                            </div>
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
    </div>{/* fin max-w */}
    </div>{/* fin panneau scrollable */}

    {/* Modal lecture article */}
    <AnimatePresence>
      {readModal && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setReadModal(null) }}>
          <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }} transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="w-full max-w-2xl max-h-[85vh] flex flex-col panel overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
              <p className="text-[13px] font-bold text-[hsl(var(--text))] line-clamp-1 pr-4">{readModal.item.title}</p>
              <button onClick={() => setReadModal(null)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto px-5 py-4">
              {readLoading
                ? <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" /></div>
                : <div className="prose-app max-w-none"><ReactMarkdown>{readModal.content}</ReactMarkdown></div>
              }
            </div>
            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
              <select value={readSujetId ?? ''} onChange={e => setReadSujetId(e.target.value ? parseInt(e.target.value) : null)}
                className="text-[11px] font-mono bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-line))]">
                <option value="">Dossier : non classé</option>
                {sujets.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
              <div className="flex items-center gap-2">
              <button onClick={() => { setGenModal({ itemIds: [readModal.item.id], itemTitle: readModal.item.title, sujetId: readSujetId }); setReadModal(null) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                <Sparkles className="w-3.5 h-3.5" />
                Générer un document IA
              </button>
              <button onClick={saveReadItem} disabled={readSaving || readSaved}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11.5px] font-mono font-bold text-white transition-all disabled:opacity-60 ${readSaved ? 'bg-[hsl(var(--green))]' : 'bg-[hsl(var(--accent))]'}`}>
                {readSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : readSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                {readSaved ? 'Conservé !' : readSaving ? 'Sauvegarde…' : 'Conserver dans la bibliothèque'}
              </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* DocumentGeneratorModal */}
    {genModal && (
      <DocumentGeneratorModal
        itemIds={genModal.itemIds}
        itemTitle={genModal.itemTitle}
        sujetId={genModal.sujetId ?? null}
        onClose={() => setGenModal(null)}
        onSaved={() => setGenModal(null)}
      />
    )}

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
