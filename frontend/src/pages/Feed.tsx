import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, BookOpen, ExternalLink, ChevronDown, SlidersHorizontal, Zap, Loader2, Sparkles, Check, X, Pencil, DatabaseZap, Eye, FileText, CheckSquare, Square, Plus, Globe, AlertTriangle, FileEdit, Telescope, Trash2, Upload, FileUp, Link2 } from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo, extractDomain, truncate } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import PageHint from '@/components/ui/PageHint'
import DocumentGeneratorModal from '@/components/ui/DocumentGeneratorModal'

interface FilterResult {
  item_id: number
  keep: boolean
  score: number
  reason: string
  updated_summary: string | null
}

interface PreviewData {
  item_id: number
  title: string
  url: string
  current_summary: string
  markdown: string
  json: any
  content_length: number
  pages_crawled?: number
  error?: string
}

const IMP_BAR: Record<string, string> = {
  critical: 'bg-red-500',  high: 'bg-orange-500',
  medium:   'bg-yellow-500', low: 'bg-[hsl(var(--bg-3))]',
}
const IMP_PILL: Record<string, string> = {
  critical: 'pill-red', high: 'pill-amber', medium: 'pill-muted', low: 'pill-muted',
}
const TYPE: Record<string, string> = {
  news:'Actu', research:'Recherche', tutorial:'Tuto', tool:'Outil', discussion:'Discus.', other:'Autre',
}
const FILTERS = ['all','critical','high','medium','low']

function PdfLinksPanel({ links, onIngest }: { links: string[]; onIngest: (url: string) => Promise<void> }) {
  const [previewing, setPreviewing] = useState<string | null>(null)  // url en cours de preview
  const [pdfPreview, setPdfPreview] = useState<{ url: string; filename: string; text: string; char_count: number; truncated: boolean } | null>(null)
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null)
  const [ingesting, setIngesting] = useState(false)

  async function openPreview(url: string) {
    setLoadingPreview(url)
    try {
      const data = await api.previewPdfUrl(url)
      setPdfPreview(data)
      setPreviewing(url)
    } catch (e: any) {
      // Pas d'alert — afficher inline
      setPdfPreview({ url, filename: url.split('/').pop() || url, text: `Erreur : ${e.message}`, char_count: 0, truncated: false })
      setPreviewing(url)
    } finally { setLoadingPreview(null) }
  }

  async function confirmIngest() {
    if (!pdfPreview) return
    setIngesting(true)
    try {
      await onIngest(pdfPreview.url)
      setPdfPreview(null); setPreviewing(null)
    } finally { setIngesting(false) }
  }

  return (
    <>
      <div className="rounded-lg border border-[hsl(var(--amber)/.3)] bg-[hsl(var(--amber)/.06)] p-3">
        <div className="flex items-center gap-2 mb-2">
          <FileUp className="w-3.5 h-3.5 text-[hsl(var(--amber))]" />
          <p className="text-[11.5px] font-semibold text-[hsl(var(--amber))]">
            {links.length} PDF{links.length > 1 ? 's' : ''} détecté{links.length > 1 ? 's' : ''} sur cette page
          </p>
        </div>
        <div className="space-y-1.5">
          {links.map(url => (
            <div key={url} className="flex items-center gap-2">
              <a href={url} target="_blank" rel="noreferrer"
                className="flex-1 text-[11px] font-mono text-[hsl(var(--accent))] hover:underline truncate">
                <Link2 className="w-3 h-3 inline mr-1" />{url.split('/').pop()}
              </a>
              <button
                onClick={() => openPreview(url)}
                disabled={loadingPreview === url}
                className="flex items-center gap-1 px-2 py-1 rounded border border-[hsl(var(--amber)/.4)] text-[hsl(var(--amber))] text-[10.5px] font-mono hover:bg-[hsl(var(--amber)/.1)] disabled:opacity-50 transition-colors flex-shrink-0"
              >
                {loadingPreview === url ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                Consulter
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Modal preview PDF */}
      <AnimatePresence>
        {previewing && pdfPreview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) { setPreviewing(null); setPdfPreview(null) } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-3xl max-h-[88vh] flex flex-col panel overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
                <div>
                  <p className="text-[13.5px] font-bold text-[hsl(var(--text))]">{pdfPreview.filename}</p>
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">
                    {pdfPreview.char_count.toLocaleString()} caractères extraits
                    {pdfPreview.truncated && ' · tronqué à 12 000 chars'}
                    {' · '}<a href={pdfPreview.url} target="_blank" rel="noreferrer" className="text-[hsl(var(--accent))] hover:underline">PDF original ↗</a>
                  </p>
                </div>
                <button onClick={() => { setPreviewing(null); setPdfPreview(null) }}
                  className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors ml-4">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Contenu */}
              <div className="flex-1 overflow-auto p-5">
                <pre className="text-[12.5px] text-[hsl(var(--text-2))] font-mono leading-relaxed whitespace-pre-wrap">
                  {pdfPreview.text || 'Aucun texte extrait'}
                </pre>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-5 py-3.5 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                  Vérifiez que le contenu est pertinent avant d'ingérer
                </p>
                <div className="flex gap-2">
                  <button onClick={() => { setPreviewing(null); setPdfPreview(null) }}
                    className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[12px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                    Annuler
                  </button>
                  <motion.button
                    onClick={confirmIngest}
                    disabled={ingesting || !pdfPreview.text || pdfPreview.text.startsWith('Erreur')}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
                  >
                    {ingesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                    Ingérer dans la base
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}

function FilterScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const color = score >= 0.7
    ? 'text-[hsl(var(--green))] bg-[hsl(var(--green)/.12)] border-[hsl(var(--green)/.3)]'
    : score >= 0.4
      ? 'text-[hsl(var(--amber))] bg-[hsl(var(--amber)/.12)] border-[hsl(var(--amber)/.3)]'
      : 'text-[hsl(var(--red))] bg-[hsl(var(--red)/.12)] border-[hsl(var(--red)/.3)]'
  return <span className={`pill border font-bold ${color}`}>{pct}%</span>
}

export default function Feed() {
  const [items, setItems]         = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [expanded, setExpanded]   = useState<number | null>(null)
  const [filter, setFilter]       = useState('all')
  const [page, setPage]           = useState(0)
  const [digesting, setDigesting] = useState<number | null>(null)
  const LIMIT = 20

  // ── Filtre IA ──
  const [filterOpen, setFilterOpen]     = useState(false)
  const [filterPrompt, setFilterPrompt] = useState('')
  const [filtering, setFiltering]       = useState(false)
  const [filterResults, setFilterResults] = useState<Record<number, FilterResult>>({})
  const [filterMode, setFilterMode]     = useState(false)
  const [decisions, setDecisions]       = useState<Record<number, 'keep' | 'ignore' | null>>({})
  const [editing, setEditing]           = useState<number | null>(null)
  const [editText, setEditText]         = useState('')
  const [savingSummary, setSavingSummary] = useState<number | null>(null)
  const [ingesting, setIngesting]       = useState<number | null>(null)
  const [ingestingAll, setIngestingAll] = useState(false)
  const [ingestedIds, setIngestedIds]   = useState<Set<number>>(new Set())

  // ── Prévisualisation avant indexation ──
  const [preview, setPreview]           = useState<PreviewData | null>(null)
  const [previewLoading, setPreviewLoading] = useState<number | null>(null)
  const [previewMarkdown, setPreviewMarkdown] = useState('')
  const [previewSummary, setPreviewSummary]   = useState('')
  const [confirming, setConfirming]     = useState(false)

  // ── Toast notifications ──
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  function showToast(msg: string, type: 'ok' | 'err' = 'ok') {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3500)
  }

  // ── Générateur de documents ──
  const [docModalOpen, setDocModalOpen] = useState(false)

  // ── Upload de documents ──
  const [uploadOpen, setUploadOpen]     = useState(false)
  const [uploadDragging, setUploadDragging] = useState(false)
  const [uploading, setUploading]       = useState(false)
  const [uploadResult, setUploadResult] = useState<any>(null)
  const [uploadPreview, setUploadPreview] = useState<{ file: File; text: string; char_count: number; truncated: boolean } | null>(null)
  const [confirmingUpload, setConfirmingUpload] = useState(false)

  async function handleUpload(file: File) {
    // Step 1 : extract text for preview
    setUploading(true); setUploadResult(null); setUploadPreview(null)
    try {
      const form = new FormData(); form.append('file', file)
      const resp = await fetch('/api/v1/items/preview-upload', { method: 'POST', body: form })
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ detail: 'Erreur extraction' }))
        throw new Error(err.detail)
      }
      const data = await resp.json()
      setUploadPreview({ file, text: data.text, char_count: data.char_count, truncated: data.truncated })
    } catch (e: any) { setUploadResult({ success: false, error: e.message }) }
    finally { setUploading(false) }
  }

  async function confirmUpload() {
    if (!uploadPreview) return
    setConfirmingUpload(true)
    try {
      const r = await api.uploadDocument(uploadPreview.file)
      setUploadResult(r)
      setUploadPreview(null)
      if (r.success && !r.already_exists) await load(true)
    } catch (e: any) { setUploadResult({ success: false, error: e.message }) }
    finally { setConfirmingUpload(false) }
  }

  function onDropUpload(e: React.DragEvent) {
    e.preventDefault(); setUploadDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleUpload(file)
  }

  // ── Veille à la demande ──
  const [veilleOpen, setVeilleOpen]     = useState(false)
  const [veilleSubject, setVeilleSubject] = useState('')
  const [veilleMax, setVeilleMax]       = useState(5)
  const [veilleSources, setVeilleSources] = useState<string[]>(['hn', 'devto', 'arxiv'])
  const [veilleRunning, setVeilleRunning] = useState(false)
  const [veilleResult, setVeilleResult]   = useState<any>(null)

  async function runVeille() {
    if (!veilleSubject.trim()) return
    setVeilleRunning(true); setVeilleResult(null)
    try {
      const r = await api.veilleOnDemand(veilleSubject, veilleMax, veilleSources)
      setVeilleResult(r)
      if (r.new_items > 0) await load(true)
    } catch (e: any) { setVeilleResult({ success: false, message: e.message }) }
    finally { setVeilleRunning(false) }
  }

  // ── Ajout URL manuelle ──
  const [urlPanelOpen, setUrlPanelOpen] = useState(false)
  const [manualUrl, setManualUrl]       = useState('')
  const [urlLookup, setUrlLookup]       = useState<any>(null)  // résultat du lookup
  const [lookingUp, setLookingUp]       = useState(false)
  const [addingUrl, setAddingUrl]       = useState(false)

  async function lookupUrl(url: string) {
    if (!url.trim() || !url.startsWith('http')) { setUrlLookup(null); return }
    setLookingUp(true)
    try { setUrlLookup(await api.lookupUrl(url)) }
    catch { setUrlLookup(null) }
    finally { setLookingUp(false) }
  }

  async function addManualUrl() {
    if (!manualUrl.trim()) return
    setAddingUrl(true)
    try {
      const item = await api.addManualUrl(manualUrl, 1)
      await load(true)
      setManualUrl('')
      setUrlLookup(null)
      setUrlPanelOpen(false)
      // Auto-open digest on the new item
      if (item?.id) setExpanded(item.id)
    } catch (e: any) { showToast(e.message, 'err') }
    finally { setAddingUrl(false) }
  }

  // ── Sélection batch ──
  const [selected, setSelected]         = useState<Set<number>>(new Set())
  const [batchIngesting, setBatchIngesting] = useState(false)
  const [batchProgress, setBatchProgress]   = useState(0)
  const [batchDeleting, setBatchDeleting]   = useState(false)

  function toggleSelect(id: number) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function selectAll() { setSelected(new Set(items.map(i => i.id))) }
  function clearSelection() { setSelected(new Set()) }

  async function batchDeleteSelected() {
    const ids = [...selected]
    setBatchDeleting(true)
    try {
      await Promise.all(ids.map(id =>
        fetch(`/api/v1/items/${id}`, { method: 'DELETE' }).catch(() => {})
      ))
      setItems(prev => prev.filter(i => !ids.includes(i.id)))
      setSelected(new Set())
    } finally { setBatchDeleting(false) }
  }

  async function batchIngestSelected() {
    const ids = [...selected]
    setBatchIngesting(true)
    setBatchProgress(0)
    for (let i = 0; i < ids.length; i++) {
      try { await api.ingestConfirm(ids[i], '', '', {}) } catch {}
      setBatchProgress(i + 1)
    }
    setBatchIngesting(false)
    setSelected(new Set())
    await load(true)
  }

  // ── Contenu brut fetché par item ──
  const [rawContent, setRawContent]     = useState<Record<number, any>>({})  // { pages: [...] }
  const [fetchingRaw, setFetchingRaw]   = useState<number | null>(null)
  const [activeTab, setActiveTab]       = useState<Record<number, 'summary' | 'content'>>({})  // tab par item

  const load = useCallback(async (reset = false) => {
    setLoading(true)
    try {
      const offset = reset ? 0 : page * LIMIT
      const d = await api.getItems({ limit: LIMIT, offset, ...(filter !== 'all' ? { importance: filter } : {}) })
      if (reset) { setItems(d.items || []); setPage(0) }
      else setItems(prev => [...prev, ...(d.items || [])])
    } finally { setLoading(false) }
  }, [filter, page])

  useEffect(() => { load(true) }, [filter])

  async function runLlmFilter() {
    if (!filterPrompt.trim() || items.length === 0) return
    setFiltering(true)
    try {
      const ids = items.map(i => i.id)
      const results = await api.llmFilter(ids, filterPrompt)
      const map: Record<number, FilterResult> = {}
      const dec: Record<number, 'keep' | 'ignore' | null> = {}
      for (const r of results) {
        map[r.item_id] = r
        dec[r.item_id] = r.keep ? 'keep' : 'ignore'
      }
      setFilterResults(map)
      setDecisions(dec)
      setFilterMode(true)
      // Update summaries in local state for items where LLM rewrote it
      setItems(prev => prev.map(item => {
        const r = map[item.id]
        return r?.updated_summary ? { ...item, summary: r.updated_summary } : item
      }))
    } catch {}
    finally { setFiltering(false) }
  }

  function exitFilterMode() {
    setFilterMode(false)
    setFilterResults({})
    setDecisions({})
    setFilterOpen(false)
    setFilterPrompt('')
    setIngestedIds(new Set())
  }

  async function openPreview(itemId: number) {
    setPreviewLoading(itemId)
    try {
      const data = await api.ingestPreview(itemId)
      setPreview(data)
      setPreviewMarkdown(data.markdown || '')
      setPreviewSummary(data.current_summary || '')
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`, 'err')
    } finally { setPreviewLoading(null) }
  }

  async function confirmIngest() {
    if (!preview) return
    setConfirming(true)
    try {
      await api.ingestConfirm(preview.item_id, previewMarkdown, previewSummary, preview.json)
      setIngestedIds(prev => new Set([...prev, preview.item_id]))
      // Update summary in local state
      setItems(prev => prev.map(i => i.id === preview.item_id ? { ...i, summary: previewSummary, digest_markdown: previewMarkdown } : i))
      setPreview(null)
    } catch (e: any) {
      showToast(`Erreur : ${e.message}`, 'err')
    } finally { setConfirming(false) }
  }

  async function ingestAll() {
    const toIngest = items.filter(i => decisions[i.id] === 'keep' && !ingestedIds.has(i.id))
    setIngestingAll(true)
    for (const item of toIngest) {
      await openPreview(item.id)
      // ingestAll opens previews one at a time — user must confirm each
      // For true batch: use confirm directly without preview
    }
    setIngestingAll(false)
  }

  async function saveSummary(itemId: number) {
    setSavingSummary(itemId)
    try {
      await api.updateSummary(itemId, editText)
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, summary: editText } : i))
      setEditing(null)
    } catch {}
    finally { setSavingSummary(null) }
  }

  async function generateDigest(item: any) {
    setDigesting(item.id)
    try {
      const result = await api.digest(item.url)
      // Update item in local state immediately without full reload
      if (result?.markdown) {
        setItems(prev => prev.map(i =>
          i.id === item.id ? { ...i, digest_markdown: result.markdown, summary: result.json?.summary || i.summary } : i
        ))
      } else {
        await load(true)
      }
      setExpanded(item.id)
      setActiveTab(prev => ({ ...prev, [item.id]: 'summary' }))
    } catch {}
    finally { setDigesting(null) }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-5">
      <PageHint id="feed" steps={[
        { title: 'Filtres d\'importance', body: 'Utilisez les filtres (critical / high / medium / low) pour prioriser votre lecture — critical et high sont les signaux forts.' },
        { title: 'Lire le digest', body: 'Cliquez sur l\'icône livre pour déplier le résumé généré par le LLM. S\'il est vide, allez dans Browse pour le générer.' },
      ]} />
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {!filterMode && (
            <>
              <SlidersHorizontal className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
              <div className="seg">
                {FILTERS.map(f => (
                  <button key={f} onClick={() => setFilter(f)}
                    className={`seg-item ${filter === f ? 'active' : ''}`}>
                    {filter === f && (
                      <motion.div layoutId="feed-seg"
                        className="absolute inset-0 bg-[hsl(var(--bg-2))] rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--line-bright))]"
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}
                    <span className="relative z-10">{f === 'all' ? 'Tous' : f}</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {filterMode && (
            <div className="flex items-center gap-2">
              <span className="pill pill-accent"><Sparkles className="w-3 h-3" />Mode filtre IA</span>
              <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">"{truncate(filterPrompt, 40)}"</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {filterMode
            ? <button onClick={exitFilterMode}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                <X className="w-3 h-3" /> Quitter le filtre
              </button>
            : <motion.button
                onClick={() => setFilterOpen(v => !v)}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11.5px] font-mono font-semibold transition-all ${
                  filterOpen
                    ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                    : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'
                }`}>
                <Sparkles className="w-3.5 h-3.5" /> Filtre IA
              </motion.button>
          }
          {!filterMode && (
            <>
              {/* Veille à la demande */}
              <motion.button
                onClick={() => { setVeilleOpen(v => !v); setUrlPanelOpen(false); setFilterOpen(false) }}
                whileTap={{ scale: 0.95 }}
                title="Lancer une veille ciblée sur un sujet"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11.5px] font-mono font-semibold transition-all ${
                  veilleOpen
                    ? 'border-[hsl(var(--violet)/.5)] bg-[hsl(var(--violet)/.12)] text-[hsl(var(--violet))]'
                    : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--violet)/.4)] hover:text-[hsl(var(--violet))]'
                }`}>
                <Telescope className="w-3.5 h-3.5" /> Veille
              </motion.button>

              {/* + Document */}
              <motion.button
                onClick={() => { setUploadOpen(v => !v); setUrlPanelOpen(false); setVeilleOpen(false) }}
                whileTap={{ scale: 0.95 }}
                title="Uploader un document (PDF, image, DOCX...)"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11.5px] font-mono font-semibold transition-all ${
                  uploadOpen
                    ? 'border-[hsl(var(--green)/.5)] bg-[hsl(var(--green)/.1)] text-[hsl(var(--green))]'
                    : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--green)/.4)] hover:text-[hsl(var(--green))]'
                }`}>
                <Upload className="w-3.5 h-3.5" /> Doc
              </motion.button>

              {/* + URL manuelle */}
              <motion.button
                onClick={() => { setUrlPanelOpen(v => !v); setVeilleOpen(false); setUploadOpen(false) }}
                whileTap={{ scale: 0.95 }}
                title="Ajouter une URL manuellement"
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded border text-[11.5px] font-mono font-semibold transition-all ${
                  urlPanelOpen
                    ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                    : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'
                }`}>
                <Plus className="w-3.5 h-3.5" /> URL
              </motion.button>
              <button
                onClick={items.length > 0 && selected.size === items.length ? clearSelection : selectAll}
                title={items.length > 0 && selected.size === items.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                className="w-8 h-8 flex items-center justify-center rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--accent-line))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                {items.length > 0 && selected.size === items.length
                  ? <CheckSquare className="w-3.5 h-3.5" />
                  : <Square className="w-3.5 h-3.5" />}
              </button>
              <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
                onClick={() => load(true)} disabled={loading}
                className="w-8 h-8 flex items-center justify-center rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[hsl(var(--text-2))] transition-colors">
                <RefreshCw className="w-3.5 h-3.5" />
              </motion.button>
            </>
          )}
        </div>
      </div>

      {/* ── Bandeau filtre IA ── */}
      <AnimatePresence>
        {filterOpen && !filterMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="panel-accent p-4 space-y-3">
              <div className="flex items-start gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[hsl(var(--accent))] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[hsl(var(--text))]">Filtre LLM</p>
                  <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">
                    Décrivez ce que vous voulez conserver. Le LLM évalue chaque item et vous propose une sélection avant ingestion.
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={filterPrompt}
                  onChange={e => setFilterPrompt(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runLlmFilter()}
                  placeholder="Ex : Garde uniquement ce qui est encore valide en 2026..."
                  className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-3 py-2 text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] transition-all"
                />
                <motion.button
                  onClick={runLlmFilter}
                  disabled={filtering || !filterPrompt.trim() || items.length === 0}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
                >
                  {filtering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {filtering ? 'Analyse…' : 'Analyser'}
                </motion.button>
              </div>
              <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                {items.length} item{items.length > 1 ? 's' : ''} seront analysés — aucune donnée n'est ingérée avant validation
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panneau Veille à la demande ── */}
      <AnimatePresence>
        {veilleOpen && !filterMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="panel p-4 space-y-3 border-[hsl(var(--violet)/.3)]" style={{ borderColor: 'hsl(var(--violet) / .3)' }}>
              <div className="flex items-start gap-2">
                <Telescope className="w-3.5 h-3.5 text-[hsl(var(--violet))] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[hsl(var(--text))]">Veille à la demande</p>
                  <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">
                    Tapez un sujet — le système recherche, fetche, digeste et classifie automatiquement les contenus pertinents.
                  </p>
                </div>
              </div>

              {/* Info sources */}
              <div className="flex items-center gap-2 text-[11.5px] text-[hsl(var(--text-3))]">
                <Sparkles className="w-3 h-3 text-[hsl(var(--violet))] flex-shrink-0" />
                Le LLM recommande les meilleures sources disponibles sur ce sujet spécifique — blogs d'experts, docs officielles, papers, newsletters.
              </div>

              <div className="flex gap-2">
                <input
                  value={veilleSubject}
                  onChange={e => setVeilleSubject(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && runVeille()}
                  placeholder="Ex : déploiement LLM en production, RAG avec LanceDB, FastAPI sécurité..."
                  disabled={veilleRunning}
                  className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-3 py-2 text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--violet)/.5)] placeholder:text-[hsl(var(--text-3))] transition-all disabled:opacity-50"
                />
                <select
                  value={veilleMax}
                  onChange={e => setVeilleMax(+e.target.value)}
                  disabled={veilleRunning}
                  className="bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-2 py-2 text-[12px] font-mono text-[hsl(var(--text-2))] outline-none transition-all"
                >
                  {[3,5,8,10].map(n => <option key={n} value={n}>{n} résultats</option>)}
                </select>
                <motion.button
                  onClick={runVeille}
                  disabled={veilleRunning || !veilleSubject.trim() || veilleSources.length === 0}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-2 rounded bg-[hsl(var(--violet))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
                >
                  {veilleRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Telescope className="w-3.5 h-3.5" />}
                  {veilleRunning ? 'En cours…' : 'Lancer'}
                </motion.button>
              </div>

              {/* Résultat */}
              <AnimatePresence>
                {veilleResult && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {veilleResult.success ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-3 text-[11.5px] font-mono">
                          <span className="text-[hsl(var(--green))]">✓ {veilleResult.new_items} nouveaux item{veilleResult.new_items > 1 ? 's' : ''} créés</span>
                          {veilleResult.already_known > 0 && (
                            <span className="text-[hsl(var(--text-3))]">{veilleResult.already_known} déjà connus</span>
                          )}
                          <span className="text-[hsl(var(--text-3))]">{veilleResult.searched} sources analysées</span>
                        </div>
                        {veilleResult.items?.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            {veilleResult.items.map((item: any) => (
                              <div key={item.id} className="flex items-start gap-2 px-3 py-2 rounded bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                                <div className="flex-1 min-w-0">
                                  <p className="text-[12.5px] font-semibold text-[hsl(var(--text))] truncate">{item.title}</p>
                                  <p className="text-[11px] text-[hsl(var(--text-3))] truncate font-mono">{item.url}</p>
                                </div>
                                <div className="flex items-center gap-1.5 flex-shrink-0">
                                  {item.source_label && (
                                    <span className="text-[10px] font-mono text-[hsl(var(--violet))] bg-[hsl(var(--violet)/.1)] px-1.5 py-0.5 rounded">
                                      {item.source_label}
                                    </span>
                                  )}
                                  <span className="text-[10px] font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-3))] px-1.5 py-0.5 rounded">
                                    {item.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {veilleResult.new_items === 0 && (
                          <p className="text-[11.5px] font-mono text-[hsl(var(--amber))]">Tous les résultats étaient déjà dans votre base.</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-[12px] font-mono text-[hsl(var(--red))]">ERR / {veilleResult.message}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panneau Upload document ── */}
      <AnimatePresence>
        {uploadOpen && !filterMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="panel p-4 space-y-3" style={{ borderColor: 'hsl(var(--green) / .3)' }}>
              <div className="flex items-start gap-2">
                <Upload className="w-3.5 h-3.5 text-[hsl(var(--green))] mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[13px] font-semibold text-[hsl(var(--text))]">Ingérer un document</p>
                  <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">
                    PDF, image (OCR), DOCX, TXT — extraction automatique + digest LLM + classement
                  </p>
                </div>
              </div>

              {/* Zone drag & drop ou Preview */}
              {uploadPreview ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[12px] font-semibold text-[hsl(var(--text))]">{uploadPreview.file.name}</p>
                    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                      {uploadPreview.char_count.toLocaleString()} chars{uploadPreview.truncated ? ' · tronqué' : ''}
                    </span>
                  </div>
                  <pre className="text-[11.5px] text-[hsl(var(--text-2))] font-mono leading-relaxed whitespace-pre-wrap bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg p-3 max-h-60 overflow-auto">
                    {uploadPreview.text || 'Aucun texte extrait'}
                  </pre>
                  <div className="flex gap-2">
                    <motion.button onClick={confirmUpload} disabled={confirmingUpload || !uploadPreview.text}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--green))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity">
                      {confirmingUpload ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                      Ingérer dans la base
                    </motion.button>
                    <button onClick={() => { setUploadPreview(null); setUploadResult(null) }}
                      className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[12px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                      Changer de fichier
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  onDragOver={e => { e.preventDefault(); setUploadDragging(true) }}
                  onDragLeave={() => setUploadDragging(false)}
                  onDrop={onDropUpload}
                  className={`relative rounded-lg border-2 border-dashed transition-all ${
                    uploadDragging
                      ? 'border-[hsl(var(--green))] bg-[hsl(var(--green)/.08)]'
                      : 'border-[hsl(var(--line))] hover:border-[hsl(var(--green)/.4)]'
                  }`}
                >
                  <label className="flex flex-col items-center justify-center gap-2 py-8 cursor-pointer">
                    <FileUp className={`w-8 h-8 ${uploadDragging ? 'text-[hsl(var(--green))]' : 'text-[hsl(var(--text-3))]'}`} />
                    <p className="text-[12.5px] font-semibold text-[hsl(var(--text-2))]">
                      {uploading ? 'Extraction en cours…' : 'Glissez un fichier ici ou cliquez pour sélectionner'}
                    </p>
                    <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                      PDF · PNG · JPG · DOCX · TXT · MD — max 50MB
                    </p>
                    {!uploading && (
                      <input type="file" className="hidden"
                        accept=".pdf,.png,.jpg,.jpeg,.webp,.tiff,.docx,.txt,.md"
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
                      />
                    )}
                    {uploading && <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--green))]" />}
                  </label>
                </div>
              )}

              {/* Résultat */}
              <AnimatePresence>
                {uploadResult && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {uploadResult.success ? (
                      <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-[hsl(var(--green)/.08)] border border-[hsl(var(--green)/.3)]">
                        <Check className="w-3.5 h-3.5 text-[hsl(var(--green))] flex-shrink-0 mt-0.5" />
                        <div>
                          {uploadResult.already_exists
                            ? <p className="text-[12px] text-[hsl(var(--amber))]">Déjà en base — "{uploadResult.title}"</p>
                            : <>
                                <p className="text-[12px] font-semibold text-[hsl(var(--green))]">"{uploadResult.title}" ingéré</p>
                                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">
                                  {uploadResult.char_count?.toLocaleString()} chars · méthode: {uploadResult.method}
                                  {uploadResult.truncated && ' · tronqué'}
                                </p>
                              </>
                          }
                        </div>
                      </div>
                    ) : (
                      <p className="text-[12px] font-mono text-[hsl(var(--red))]">ERR / {uploadResult.error}</p>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Panneau ajout URL manuelle ── */}
      <AnimatePresence>
        {urlPanelOpen && !filterMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="panel-accent p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Globe className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                <p className="text-[13px] font-semibold text-[hsl(var(--text))]">Ajouter une URL</p>
                <p className="text-[11px] text-[hsl(var(--text-3))]">— ajout en base + digest à la demande</p>
              </div>
              <div className="flex gap-2">
                <input
                  value={manualUrl}
                  onChange={e => { setManualUrl(e.target.value); setUrlLookup(null) }}
                  onBlur={() => lookupUrl(manualUrl)}
                  onKeyDown={e => e.key === 'Enter' && !urlLookup?.exists && addManualUrl()}
                  placeholder="https://example.com/article  ou  https://docs.example.com/tutorial/"
                  className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-3 py-2 text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] transition-all font-mono"
                />
                {lookingUp && <Loader2 className="w-4 h-4 animate-spin self-center text-[hsl(var(--text-3))]" />}
              </div>

              {/* Résultat lookup */}
              {urlLookup && (
                <div className={`rounded-lg px-3 py-2.5 flex items-start gap-2.5 ${
                  urlLookup.exists
                    ? 'bg-[hsl(var(--amber)/.08)] border border-[hsl(var(--amber)/.3)]'
                    : 'bg-[hsl(var(--green)/.08)] border border-[hsl(var(--green)/.3)]'
                }`}>
                  {urlLookup.exists
                    ? <AlertTriangle className="w-3.5 h-3.5 text-[hsl(var(--amber))] flex-shrink-0 mt-0.5" />
                    : <Check className="w-3.5 h-3.5 text-[hsl(var(--green))] flex-shrink-0 mt-0.5" />}
                  <div>
                    {urlLookup.exists ? (
                      <>
                        <p className="text-[12px] font-semibold text-[hsl(var(--amber))]">Déjà en base</p>
                        <p className="text-[11.5px] text-[hsl(var(--text-2))] mt-0.5">
                          "{urlLookup.title}" · {urlLookup.has_digest ? '⚡ digest' : '○ brut'} · {urlLookup.rag_indexed ? '✓ RAG' : 'non indexé'}
                        </p>
                      </>
                    ) : (
                      <p className="text-[12px] text-[hsl(var(--green))]">URL disponible — sera ajoutée comme nouvel item</p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <motion.button
                  onClick={addManualUrl}
                  disabled={addingUrl || !manualUrl.trim() || urlLookup?.exists}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
                >
                  {addingUrl ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Ajouter
                </motion.button>
                {urlLookup?.exists && (
                  <motion.button
                    onClick={addManualUrl}
                    disabled={addingUrl}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded border border-[hsl(var(--amber)/.4)] text-[hsl(var(--amber))] text-[12.5px] font-mono disabled:opacity-40 transition-opacity"
                  >
                    Forcer la mise à jour
                  </motion.button>
                )}
                <button onClick={() => { setUrlPanelOpen(false); setManualUrl(''); setUrlLookup(null) }}
                  className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[12px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                  Annuler
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Bandeau actions groupées (mode filtre) ── */}
      <AnimatePresence>
        {filterMode && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="panel-accent p-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-[12px] font-mono">
              <span className="text-[hsl(var(--green))]">
                {Object.values(decisions).filter(d => d === 'keep').length} à indexer
              </span>
              <span className="text-[hsl(var(--text-3))]">·</span>
              <span className="text-[hsl(var(--red))]">
                {Object.values(decisions).filter(d => d === 'ignore').length} ignorés
              </span>
              <span className="text-[hsl(var(--text-3))]">·</span>
              <span className="text-[hsl(var(--text-3))]">
                {ingestedIds.size} indexés
              </span>
            </div>
            <motion.button
              onClick={ingestAll}
              disabled={ingestingAll || Object.values(decisions).filter(d => d === 'keep').length === 0}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
            >
              {ingestingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
              Indexer tout ce qui est accepté
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Barre de sélection batch ── */}
      <AnimatePresence>
        {selected.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="panel-accent p-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-[12px] font-mono">
              <span className="text-[hsl(var(--accent))]">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
              <button onClick={selectAll} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">tout</button>
              <button onClick={clearSelection} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-colors">désélectionner</button>
              {batchIngesting && (
                <span className="text-[hsl(var(--text-3))]">{batchProgress}/{selected.size}</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setDocModalOpen(true)}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-1.5 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] text-[12.5px] font-bold transition-all"
              >
                <FileEdit className="w-3.5 h-3.5" /> Générer un document
              </motion.button>
              <motion.button
                onClick={batchIngestSelected}
                disabled={batchIngesting}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
              >
                {batchIngesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                Indexer la sélection
              </motion.button>
              <motion.button
                onClick={batchDeleteSelected}
                disabled={batchDeleting}
                whileTap={{ scale: 0.95 }}
                className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--red))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
              >
                {batchDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Supprimer
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Items ── */}
      <div className="space-y-2">
        {loading && page === 0 && [...Array(4)].map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
            className="h-20 skeleton" />
        ))}

        <>
          {items.map((item, i) => (
            <div key={item.id}
              className={`panel overflow-hidden transition-colors ${
                selected.has(item.id) ? 'border-[hsl(var(--accent-line))]' : ''
              }`}
            >
              <div className="flex items-stretch">
                {/* Checkbox sélection batch */}
                <button
                  onClick={() => toggleSelect(item.id)}
                  className={`w-7 flex-shrink-0 flex items-center justify-center border-r transition-colors ${
                    selected.has(item.id)
                      ? 'border-[hsl(var(--accent-line))] text-[hsl(var(--accent))]'
                      : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))]'
                  }`}
                >
                  {selected.has(item.id)
                    ? <CheckSquare className="w-3.5 h-3.5" />
                    : <Square className="w-3.5 h-3.5" />}
                </button>

                {/* Importance / filter bar */}
                <div className={`w-0.5 flex-shrink-0 ${
                  filterMode
                    ? decisions[item.id] === 'keep'   ? 'bg-[hsl(var(--green))]'
                    : decisions[item.id] === 'ignore' ? 'bg-[hsl(var(--red))]'
                    : 'bg-[hsl(var(--bg-3))]'
                    : IMP_BAR[item.importance] ?? 'bg-[hsl(var(--bg-3))]'
                }`} />

                <div className="flex-1 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Tags row */}
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {/* Score badge en mode filtre */}
                        {filterMode && filterResults[item.id] && (
                          <FilterScoreBadge score={filterResults[item.id].score} />
                        )}
                        {!filterMode && item.importance && (
                          <span className={`pill ${IMP_PILL[item.importance] ?? 'pill-muted'} capitalize`}>
                            {item.importance}
                          </span>
                        )}
                        {item.item_type && (
                          <span className="pill pill-muted">{TYPE[item.item_type] || item.item_type}</span>
                        )}
                        <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{extractDomain(item.url)}</span>
                        {/* Badges de statut déduplication */}
                        {(item.rag_indexed || ingestedIds.has(item.id)) && (
                          <span className="pill pill-green text-[10px]"><DatabaseZap className="w-2.5 h-2.5" />RAG</span>
                        )}
                        {!item.rag_indexed && !ingestedIds.has(item.id) && item.digest_markdown && (
                          <span className="pill pill-accent text-[10px]"><Zap className="w-2.5 h-2.5" />digest</span>
                        )}
                        {!item.rag_indexed && !ingestedIds.has(item.id) && !item.digest_markdown && (
                          <span className="text-[10px] font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-3))] px-1.5 py-0.5 rounded">brut</span>
                        )}
                      </div>

                      <a href={item.url} target="_blank" rel="noreferrer"
                        className="text-[13.5px] font-semibold text-[hsl(var(--text))] hover:text-[hsl(var(--accent))] flex items-center gap-1 group transition-colors">
                        {truncate(item.title, 110)}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
                      </a>

                      {/* Raison LLM en mode filtre */}
                      {filterMode && filterResults[item.id]?.reason && (
                        <p className="text-[11.5px] italic text-[hsl(var(--text-3))] mt-1 leading-snug">
                          {filterResults[item.id].reason}
                        </p>
                      )}

                      {/* Résumé normal */}
                      {!filterMode && item.summary && (
                        <p className="text-[12px] text-[hsl(var(--text-2))] mt-1.5 line-clamp-2 leading-relaxed">{item.summary}</p>
                      )}

                      {/* Édition inline du résumé */}
                      {filterMode && editing === item.id && (
                        <div className="mt-2 space-y-2">
                          <textarea
                            value={editText}
                            onChange={e => setEditText(e.target.value)}
                            rows={4}
                            className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded-lg px-3 py-2 text-[12.5px] text-[hsl(var(--text))] outline-none resize-none font-mono leading-relaxed"
                          />
                          <div className="flex gap-2">
                            <button onClick={() => saveSummary(item.id)} disabled={savingSummary === item.id}
                              className="flex items-center gap-1 px-3 py-1 rounded bg-[hsl(var(--accent))] text-white text-[11.5px] font-bold disabled:opacity-50">
                              {savingSummary === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              Sauvegarder
                            </button>
                            <button onClick={() => setEditing(null)}
                              className="px-3 py-1 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))]">
                              Annuler
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                      <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{timeAgo(item.created_at)}</span>

                      {/* Boutons mode filtre */}
                      {filterMode && !ingestedIds.has(item.id) && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setDecisions(d => ({ ...d, [item.id]: 'keep' }))}
                            title="Garder cet item"
                            className={`w-7 h-7 flex items-center justify-center rounded border transition-all ${
                              decisions[item.id] === 'keep'
                                ? 'bg-[hsl(var(--green)/.15)] border-[hsl(var(--green)/.4)] text-[hsl(var(--green))]'
                                : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--green)/.4)] hover:text-[hsl(var(--green))]'
                            }`}>
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button onClick={() => setDecisions(d => ({ ...d, [item.id]: 'ignore' }))}
                            title="Ignorer cet item"
                            className={`w-7 h-7 flex items-center justify-center rounded border transition-all ${
                              decisions[item.id] === 'ignore'
                                ? 'bg-[hsl(var(--red)/.15)] border-[hsl(var(--red)/.4)] text-[hsl(var(--red))]'
                                : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--red)/.4)] hover:text-[hsl(var(--red))]'
                            }`}>
                            <X className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => { setEditing(item.id); setEditText(item.summary || '') }}
                            title="Éditer le résumé avant indexation"
                            className="w-7 h-7 flex items-center justify-center rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-all">
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          {decisions[item.id] === 'keep' && !ingestedIds.has(item.id) && (
                            <button onClick={() => openPreview(item.id)} disabled={previewLoading === item.id}
                              title="Prévisualiser avant indexation"
                              className="flex items-center gap-1 px-2 py-1 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] text-[10.5px] font-mono disabled:opacity-50 transition-all">
                              {previewLoading === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                              Voir &amp; indexer
                            </button>
                          )}
                        </div>
                      )}

                      {/* Bouton digest — mode normal seulement */}
                      {!filterMode && !item.digest_markdown && (
                        <motion.button whileTap={{ scale: 0.9 }}
                          disabled={digesting === item.id}
                          onClick={() => generateDigest(item)}
                          title="Générer un digest LLM"
                          className="flex items-center gap-1 px-2 py-1 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] text-[10.5px] font-mono hover:bg-[hsl(var(--accent-dim))] transition-all disabled:opacity-50"
                        >
                          {digesting === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                          digest
                        </motion.button>
                      )}

                      {/* Bouton expand — toujours visible */}
                      <motion.button whileTap={{ scale: 0.9 }}
                        disabled={fetchingRaw === item.id}
                        title="Lire le résumé et le contenu"
                        onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                        className={`w-7 h-7 flex items-center justify-center rounded border transition-all ${
                          expanded === item.id
                            ? 'bg-[hsl(var(--accent-dim))] border-[hsl(var(--accent-line))] text-[hsl(var(--accent))]'
                            : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--line-bright))] hover:text-[hsl(var(--text-2))]'
                        }`}>
                        <motion.div animate={{ rotate: expanded === item.id ? 180 : 0 }} transition={{ duration: 0.2 }}>
                          <ChevronDown className="w-3.5 h-3.5" />
                        </motion.div>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expand panel — summary or digest */}
              <AnimatePresence>
                {expanded === item.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[hsl(var(--line))] bg-[hsl(var(--bg))]">
                      {/* Onglets */}
                      <div className="flex items-center justify-between px-5 pt-3 pb-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          {[
                            { id: 'summary' as const, icon: BookOpen, label: item.digest_markdown ? 'Digest' : 'Résumé' },
                            { id: 'content' as const, icon: FileText, label: item.url?.endsWith('/') ? 'Contenu crawlé' : 'Contenu' },
                          ].map(tab => (
                            <button key={tab.id}
                              onClick={() => {
                                setActiveTab(prev => ({ ...prev, [item.id]: tab.id }))
                                if (tab.id === 'content' && !rawContent[item.id]) {
                                  setFetchingRaw(item.id)
                                  api.getItemRawContent(item.id, false)
                                    .then(data => setRawContent(prev => ({ ...prev, [item.id]: data })))
                                    .catch(() => {})
                                    .finally(() => setFetchingRaw(null))
                                }
                              }}
                              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono rounded-t border-b-2 transition-all ${
                                (activeTab[item.id] ?? 'summary') === tab.id
                                  ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))]'
                                  : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'
                              }`}>
                              <tab.icon className="w-3 h-3" />
                              {tab.label}
                            </button>
                          ))}
                          {/* Bouton traduire — visible quand onglet Contenu actif et contenu chargé */}
                          {(activeTab[item.id] ?? 'summary') === 'content' && rawContent[item.id] && !rawContent[item.id]?.translated && (
                            <button
                              onClick={() => {
                                setFetchingRaw(item.id)
                                api.getItemRawContent(item.id, true)
                                  .then(data => setRawContent(prev => ({ ...prev, [item.id]: data })))
                                  .catch(() => {})
                                  .finally(() => setFetchingRaw(null))
                              }}
                              disabled={fetchingRaw === item.id}
                              className="ml-2 flex items-center gap-1 px-2 py-1 text-[10.5px] font-mono rounded border border-[hsl(var(--amber)/.3)] text-[hsl(var(--amber))] hover:bg-[hsl(var(--amber)/.08)] transition-colors disabled:opacity-50"
                            >
                              {fetchingRaw === item.id ? <Loader2 className="w-3 h-3 animate-spin" /> : '🌐'}
                              {fetchingRaw === item.id ? 'Traduction…' : 'Traduire en FR'}
                            </button>
                          )}
                          {rawContent[item.id]?.translated && (
                            <span className="ml-2 text-[10px] font-mono text-[hsl(var(--green))]">✓ traduit</span>
                          )}
                        </div>
                        <a href={item.url} target="_blank" rel="noreferrer"
                          className="flex items-center gap-1 text-[10.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors pb-1">
                          <ExternalLink className="w-3 h-3" /> source
                        </a>
                      </div>

                      {/* Contenu de l'onglet */}
                      <div className="px-5 py-4">
                        {(activeTab[item.id] ?? 'summary') === 'summary' ? (
                          item.digest_markdown
                            ? <div className="prose-app"><ReactMarkdown>{item.digest_markdown}</ReactMarkdown></div>
                            : <p className="text-[13px] text-[hsl(var(--text-2))] leading-relaxed">{item.summary}</p>
                        ) : (
                          fetchingRaw === item.id
                            ? <div className="flex items-center gap-2 text-[12px] font-mono text-[hsl(var(--text-3))]">
                                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Chargement du contenu…
                              </div>
                            : rawContent[item.id]
                              ? <div className="space-y-4">
                                  {/* Liens PDF détectés */}
                                  {rawContent[item.id].pdf_links?.length > 0 && (
                                    <PdfLinksPanel
                                      links={rawContent[item.id].pdf_links}
                                      onIngest={async (url: string) => {
                                        try {
                                          const r = await api.ingestPdfUrl(url)
                                          if (r.success && !r.already_exists) await load(true)
                                          showToast(r.already_exists ? `Déjà en base` : `✓ PDF ingéré et indexé dans le RAG`, r.already_exists ? 'err' : 'ok')
                                        } catch (e: any) { showToast(`Erreur : ${e.message}`, 'err') }
                                      }}
                                    />
                                  )}
                                  {rawContent[item.id].pages?.map((page: any, pi: number) => (
                                    <div key={pi}>
                                      {rawContent[item.id].pages.length > 1 && (
                                        <div className="flex items-center gap-2 mb-2">
                                          <span className="text-[10px] font-mono text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))] px-2 py-0.5 rounded">
                                            page {pi + 1}/{rawContent[item.id].pages.length}
                                          </span>
                                          <a href={page.url} target="_blank" rel="noreferrer"
                                            className="text-[10.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] truncate transition-colors">
                                            {page.url}
                                          </a>
                                        </div>
                                      )}
                                      <p className="text-[12.5px] text-[hsl(var(--text-2))] leading-relaxed whitespace-pre-wrap max-h-[400px] overflow-auto">
                                        {page.content}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              : <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">Cliquez sur l'onglet pour charger le contenu.</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}
        </>

        {items.length === 0 && !loading && (
          <div className="text-center py-20 text-[hsl(var(--text-3))] font-mono text-[12px]">
            — aucun contenu —
          </div>
        )}
      </div>

      {items.length > 0 && items.length % LIMIT === 0 && (
        <div className="text-center">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setPage(p => p + 1); load() }} disabled={loading}
            className="px-5 py-2 rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[12px] font-mono text-[hsl(var(--text-2))] transition-colors">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline" /> : '↓ charger plus'}
          </motion.button>
        </div>
      )}

      {/* ── Modal Prévisualisation ── */}
      <AnimatePresence>
        {preview && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setPreview(null) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 16 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-3xl max-h-[90vh] flex flex-col panel overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between p-5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Eye className="w-4 h-4 text-[hsl(var(--accent))]" />
                    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Prévisualisation avant indexation</span>
                  </div>
                  <p className="text-[14px] font-semibold text-[hsl(var(--text))] truncate">{preview.title}</p>
                  <a href={preview.url} target="_blank" rel="noreferrer"
                    className="text-[10.5px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 mt-0.5">
                    <ExternalLink className="w-2.5 h-2.5" />{preview.url}
                  </a>
                </div>
                <button onClick={() => setPreview(null)} className="ml-4 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body scrollable */}
              <div className="flex-1 overflow-auto p-5 space-y-5">
                {/* Résumé éditable */}
                <div>
                  <label className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-2">
                    Résumé — éditable avant indexation
                  </label>
                  <textarea
                    value={previewSummary}
                    onChange={e => setPreviewSummary(e.target.value)}
                    rows={3}
                    className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] focus:border-[hsl(var(--accent-line))] rounded-lg px-3 py-2 text-[13px] text-[hsl(var(--text))] outline-none resize-none leading-relaxed transition-all"
                  />
                </div>

                {/* Digest markdown éditable */}
                <div>
                  <label className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-2">
                    Digest markdown — éditable avant indexation
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <textarea
                      value={previewMarkdown}
                      onChange={e => setPreviewMarkdown(e.target.value)}
                      rows={14}
                      className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] focus:border-[hsl(var(--accent-line))] rounded-lg px-3 py-2 text-[11.5px] text-[hsl(var(--text-2))] outline-none resize-none font-mono leading-relaxed transition-all"
                    />
                    <div className="bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg px-3 py-2 overflow-auto max-h-64 prose-app text-[12.5px]">
                      <ReactMarkdown>{previewMarkdown}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between p-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                  {preview.content_length?.toLocaleString()} chars extraits
                  {preview.pages_crawled && preview.pages_crawled > 1 && (
                    <span className="ml-2 text-[hsl(var(--accent))]">· {preview.pages_crawled} pages crawlées</span>
                  )}
                </p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPreview(null)}
                    className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[12px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                    Annuler
                  </button>
                  <motion.button
                    onClick={confirmIngest}
                    disabled={confirming}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-50 transition-opacity"
                  >
                    {confirming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                    Confirmer l'indexation
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal Générateur de documents ── */}
      <AnimatePresence>
        {docModalOpen && (
          <DocumentGeneratorModal
            itemIds={[...selected]}
            onClose={() => setDocModalOpen(false)}
            onSaved={() => { setDocModalOpen(false); clearSelection() }}
          />
        )}
      </AnimatePresence>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-[12.5px] font-mono flex items-center gap-2 ${
              toast.type === 'ok'
                ? 'bg-[hsl(var(--green))] text-white'
                : 'bg-[hsl(var(--red))] text-white'
            }`}
          >
            {toast.type === 'ok' ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
