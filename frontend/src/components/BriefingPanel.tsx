import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Newspaper, Loader2, Sparkles, TrendingUp, ExternalLink, ShieldCheck,
  Tag, Check, BookmarkPlus, Database, EyeOff, Square, CheckSquare,
  Layers, Clock, X
} from 'lucide-react'
import DocumentGeneratorModal from '@/components/ui/DocumentGeneratorModal'
import ItemReaderModal from '@/components/ui/ItemReaderModal'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const TIER_COLOR: Record<string, string> = {
  official:   'bg-blue-500/15 text-blue-400 border-blue-500/25',
  recognized: 'bg-green-500/15 text-green-400 border-green-500/25',
  community:  'bg-yellow-500/15 text-yellow-400 border-yellow-500/25',
  unknown:    'bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]',
}

interface BriefingPanelProps {
  briefingData: any
  sujets?: any[]
  briefingMode?: 'veille' | 'apprentissage'
  showModeToggle?: boolean
  onModeChange?: (mode: 'veille' | 'apprentissage') => void
  projectId?: number | null
}

export default function BriefingPanel({
  briefingData,
  sujets: _sujets = [],
  briefingMode = 'veille',
  showModeToggle = false,
  onModeChange,
  projectId,
}: BriefingPanelProps) {
  const [expandedSummaries, setExpandedSummaries] = useState<Set<number>>(new Set())
  const [itemActions, setItemActions] = useState<Record<number, string>>({})
  const [itemActionLoading, setItemActionLoading] = useState<Record<number, string | null>>({})
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set())
  const [batchLoading, setBatchLoading] = useState<string | null>(null)
  const [readerItemId, setReaderItemId] = useState<number | null>(null)
  const [readerItem, setReaderItem] = useState<any>(null)
  const [genModal, setGenModal] = useState<{ itemIds: number[]; itemTitle: string; sujetId?: number | null } | null>(null)

  function openRead(item: any) {
    setReaderItem(item)
    setReaderItemId(item.id)
  }

  async function handleItemAction(id: number, action: 'save' | 'ingest' | 'ignore') {
    setItemActionLoading(prev => ({ ...prev, [id]: action }))
    try {
      if (action === 'save') await api.saveItem(id)
      else if (action === 'ingest') await api.ingestItemRag(id)
      else await api.ignoreItem(id)
      const label = action === 'save' ? 'saved' : action === 'ingest' ? 'ingested' : 'ignored'
      setItemActions(prev => ({ ...prev, [id]: label }))
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setItemActionLoading(prev => ({ ...prev, [id]: null })) }
  }

  function toggleSelectItem(id: number) {
    setSelectedItems(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const allItems: any[] = briefingData?.top_items || []
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

  if (!briefingData || (!briefingData.top_items?.length && !briefingData.markdown)) {
    return (
      <div className="panel p-10 flex flex-col items-center gap-4 text-center">
        <Newspaper className="w-10 h-10 text-[hsl(var(--text-3))] opacity-30" />
        <div>
          <p className="text-[14px] font-semibold text-[hsl(var(--text))]">Aucun contenu collecté</p>
          <p className="text-[12px] text-[hsl(var(--text-3))] mt-1">
            Lancez le pipeline pour alimenter ce briefing.
          </p>
        </div>
      </div>
    )
  }

  const itemIndex: Record<number, any> = {}
  ;(briefingData.top_items || []).forEach((it: any) => { itemIndex[it.id] = it })

  const groups: Record<string, number[]> = briefingData.groups && Object.keys(briefingData.groups).length > 0
    ? briefingData.groups
    : { 'Sources': (briefingData.top_items || []).map((it: any) => it.id) }

  const allVisibleIds = Object.values(groups).flat().filter((id: number) => {
    if (!itemIndex[id] || itemActions[id] === 'ignored') return false
    const cat = itemIndex[id]?.content_tags?.category
    if (briefingMode === 'veille') return !cat || cat === 'veille' || cat === 'mixed'
    return cat === 'apprentissage' || cat === 'mixed'
  })
  const allSelected = allVisibleIds.length > 0 && allVisibleIds.every((id: number) => selectedItems.has(id))

  const md = briefingData.markdown || briefingData.executive_summary || ''
  const summaryMatch = md.match(/### Résumé en 3 lignes\n([\s\S]*?)(?=\n###|\n##|$)/)
  const signalMatch = md.match(/## Signal faible[\s\S]*?$/)
  const pourCommencerMatch = md.match(/## Pour commencer[^\n]*\n([\s\S]*?)(?=\n##|$)/)
  const summaryText = summaryMatch ? summaryMatch[1].trim() : ''
  const signalText = signalMatch ? signalMatch[0].trim() : ''
  const pourCommencerText = pourCommencerMatch ? pourCommencerMatch[1].trim() : ''

  return (
    <>
      <div className="space-y-5">

        {/* Mode toggle (optional) */}
        {showModeToggle && (
          <div className="flex items-center rounded border border-[hsl(var(--line))] overflow-hidden text-[11px] font-mono w-fit">
            <button onClick={() => onModeChange?.('veille')}
              className={`px-3 py-1.5 transition-colors ${briefingMode === 'veille' ? 'bg-[hsl(var(--accent))] text-white' : 'text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]'}`}>
              Veille
            </button>
            <button onClick={() => onModeChange?.('apprentissage')}
              className={`px-3 py-1.5 transition-colors ${briefingMode === 'apprentissage' ? 'bg-[hsl(var(--accent))] text-white' : 'text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]'}`}>
              Apprentissage
            </button>
          </div>
        )}

        {/* Meta */}
        <div className="panel-accent p-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Briefing du</p>
              <p className="text-[15px] font-bold text-[hsl(var(--text))]">
                {new Date(briefingData.date || briefingData.generated_at).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            {briefingData.stats && (
              <div className="flex items-center gap-3 text-[11px] font-mono text-[hsl(var(--text-3))]">
                <span className="text-[hsl(var(--red))]">{briefingData.stats.critical || 0} critical</span>
                <span>·</span>
                <span className="text-[hsl(var(--amber))]">{briefingData.stats.high || 0} high</span>
                <span>·</span>
                <span>{briefingData.stats.total_items || 0} items analysés</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10.5px] font-mono text-[hsl(var(--text-3))]">
            {briefingData.tokens_used > 0 && <span>{briefingData.tokens_used.toLocaleString()} tokens</span>}
          </div>
        </div>

        {/* Layout 2 colonnes */}
        <div className="grid grid-cols-3 gap-5">

          {/* Delta structuré avec checkboxes */}
          <div className="col-span-2 panel overflow-hidden flex flex-col">
            {/* Header */}
            <div className="flex items-center gap-2 px-5 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              <Newspaper className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
              <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Delta</span>
              <span className="ml-auto flex items-center gap-2">
                {briefingData.stats?.reliability_filtered && (
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

              {/* Apprentissage — Pour commencer en premier */}
              {briefingMode === 'apprentissage' && pourCommencerText && (() => {
                const recEntries = [...pourCommencerText.matchAll(
                  /[-*]\s+\*\*([^*]+)\*\*\s*(.*?)\s*→\s*(https?:\/\/\S+?)\s*\[READ:(\d+)\]/gs
                )].map(m => ({ title: m[1].trim(), reason: m[2].trim(), url: m[3].trim(), id: parseInt(m[4]) }))
                return (
                  <div className="rounded-lg border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] px-4 py-3 space-y-3">
                    <p className="text-[11px] font-mono text-[hsl(var(--accent))] uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3" />
                      Pour commencer — sélection selon ton profil
                    </p>
                    {recEntries.length > 0 ? recEntries.map(entry => {
                      const item = itemIndex[entry.id]
                      return (
                        <div key={entry.id} className="rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--bg))] p-3 space-y-1.5">
                          <p className="text-[13px] font-semibold text-[hsl(var(--text))] leading-snug">{entry.title}</p>
                          {entry.reason && <p className="text-[11.5px] text-[hsl(var(--text-2))]">{entry.reason}</p>}
                          {item?.summary && <p className="text-[11px] text-[hsl(var(--text-3))] line-clamp-2">{item.summary}</p>}
                          <div className="flex items-center gap-2 pt-0.5 flex-wrap">
                            <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">
                              → <a href={entry.url} target="_blank" rel="noreferrer" className="hover:underline hover:text-[hsl(var(--accent))]">
                                {(() => { try { return new URL(entry.url).hostname } catch { return entry.url } })()}
                              </a>
                            </span>
                            {item && (
                              <>
                                <button onClick={() => openRead(item)}
                                  className="text-[10px] font-mono text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] px-2 py-0.5 rounded hover:bg-[hsl(var(--accent))] hover:text-white transition-colors">
                                  Lire
                                </button>
                                <button disabled={!!itemActionLoading[entry.id]} onClick={() => handleItemAction(entry.id, 'save')}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors disabled:opacity-40">
                                  {itemActionLoading[entry.id] === 'save' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <BookmarkPlus className="w-2.5 h-2.5" />}
                                  Sauvegarder
                                </button>
                                <button disabled={!!itemActionLoading[entry.id]} onClick={() => handleItemAction(entry.id, 'ingest')}
                                  className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors disabled:opacity-40">
                                  {itemActionLoading[entry.id] === 'ingest' ? <Loader2 className="w-2.5 h-2.5 animate-spin" /> : <Database className="w-2.5 h-2.5" />}
                                  RAG
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )
                    }) : (
                      <div className="prose-app text-[13px]">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{pourCommencerText}</ReactMarkdown>
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Résumé 3 lignes — Veille uniquement */}
              {briefingMode === 'veille' && summaryText && (
                <div>
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Résumé en 3 lignes</p>
                  <div className="prose-app text-[13px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summaryText}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Groupes d'items */}
              {Object.entries(groups).map(([groupName, ids]) => {
                const groupItems = (ids as number[])
                  .map((id: number) => itemIndex[id])
                  .filter(Boolean)
                  .filter((item: any) => {
                    const cat = item.content_tags?.category
                    if (briefingMode === 'veille') return !cat || cat === 'veille' || cat === 'mixed'
                    return cat === 'apprentissage' || cat === 'mixed'
                  })
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
                              {item.project_relevance && (
                                <div className="mb-2 px-2.5 py-1.5 rounded-md border-l-2 border-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))]">
                                  <p className="text-[10px] font-mono text-[hsl(var(--accent))] uppercase tracking-wider mb-0.5">Pertinence projet</p>
                                  <p className="text-[12px] text-[hsl(var(--text))] leading-snug">{item.project_relevance}</p>
                                </div>
                              )}
                              {item.summary && (
                                <div className="mb-2">
                                  <p className={`text-[12px] text-[hsl(var(--text-2))] leading-relaxed ${expandedSummaries.has(item.id) ? '' : 'line-clamp-3'}`}>{item.summary}</p>
                                  {item.summary.length > 150 && !expandedSummaries.has(item.id) && (
                                    <button onClick={e => { e.stopPropagation(); setExpandedSummaries(prev => new Set(prev).add(item.id)) }}
                                      className="text-[11px] font-mono text-[hsl(var(--accent))] hover:underline mt-0.5">
                                      (+ lire la suite)
                                    </button>
                                  )}
                                </div>
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

              {/* Signal faible — veille uniquement */}
              {briefingMode === 'veille' && signalText && (
                <div className="border-t border-[hsl(var(--line))] pt-4">
                  <div className="prose-app text-[12.5px]">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{signalText}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Colonne droite */}
          <div className="space-y-4">
            {(briefingData.cited_sources?.length > 0 || briefingData.top_items?.length > 0) && (
              <div className="panel overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <ShieldCheck className="w-3.5 h-3.5 text-[hsl(var(--green))]" />
                  <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Sources vérifiées</span>
                  <span className="ml-auto text-[10px] font-mono text-[hsl(var(--text-3))]">
                    {(briefingData.cited_sources || briefingData.top_items || []).length}
                  </span>
                </div>
                <div className="divide-y divide-[hsl(var(--line))] max-h-[320px] overflow-auto">
                  {(briefingData.cited_sources?.length > 0
                    ? briefingData.cited_sources
                    : briefingData.top_items || []
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

            {briefingData.trends?.length > 0 && (
              <div className="panel overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <Tag className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                  <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Mots-clés</span>
                </div>
                <div className="p-3 flex flex-wrap gap-1.5">
                  {briefingData.trends.slice(0, 12).map((t: any, i: number) => (
                    <span key={i} className="text-[10.5px] font-mono px-2 py-0.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-2))] border border-[hsl(var(--line))]">
                      {t.keyword}
                      {t.count > 1 && <span className="ml-1 text-[hsl(var(--text-3))]">×{t.count}</span>}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {briefingData.stats?.groups?.length > 0 && (
              <div className="panel overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <TrendingUp className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
                  <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Entités couvertes</span>
                </div>
                <div className="p-3 space-y-1">
                  {briefingData.stats.groups.map((g: string, i: number) => (
                    <div key={i} className="text-[11px] text-[hsl(var(--text-2))] px-1">· {g}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal lecture article */}
      <AnimatePresence>
        {readerItemId && (
          <ItemReaderModal
            itemId={readerItemId}
            projectId={projectId}
            projectRelevanceDetail={readerItem?.project_relevance_detail ?? null}
            onClose={() => { setReaderItemId(null); setReaderItem(null) }}
            onSaved={() => { setItemActions(prev => ({ ...prev, [readerItemId]: 'saved' })); setReaderItemId(null); setReaderItem(null) }}
            onGenerateReport={(id, title) => { setGenModal({ itemIds: [id], itemTitle: title, sujetId: readerItem?.sujet_id ?? null }); setReaderItemId(null); setReaderItem(null) }}
          />
        )}
      </AnimatePresence>

      {genModal && (
        <DocumentGeneratorModal
          itemIds={genModal.itemIds}
          itemTitle={genModal.itemTitle}
          sujetId={genModal.sujetId ?? null}
          onClose={() => setGenModal(null)}
          onSaved={() => setGenModal(null)}
        />
      )}
    </>
  )
}
