import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, BookOpen, Map, BarChart3,
  X, Copy, Check, Download, DatabaseZap,
  Pencil, Trash2, Loader2,
  Search, Sparkles, SlidersHorizontal, Wand2, RotateCcw,
  CheckSquare, Square, Folder, Tag, ChevronRight, Library as LibraryIcon,
  Radio, ExternalLink, Upload, FilePlus,
  Maximize2, Minimize2,
} from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import DocumentGeneratorModal from '@/components/ui/DocumentGeneratorModal'

const DOC_TYPE_META: Record<string, { icon: any; label: string; color: string; pill: string }> = {
  fiche:    { icon: FileText,  label: 'Fiche',    color: 'text-[hsl(var(--cyan))]',    pill: 'bg-[hsl(var(--cyan)/.12)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/.3)]' },
  synthese: { icon: BookOpen,  label: 'Synthèse', color: 'text-[hsl(var(--accent))]',  pill: 'bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border-[hsl(var(--accent-line))]' },
  guide:    { icon: Map,       label: 'Guide',    color: 'text-[hsl(var(--violet))]',   pill: 'bg-[hsl(var(--violet)/.12)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/.3)]' },
  rapport:  { icon: BarChart3, label: 'Rapport',  color: 'text-[hsl(var(--green))]',   pill: 'bg-[hsl(var(--green)/.12)] text-[hsl(var(--green))] border-[hsl(var(--green)/.3)]' },
}

// Palette de couleurs pour les tuiles dossiers/sujets
const FOLDER_COLORS = [
  'from-[hsl(var(--accent)/.25)] to-[hsl(var(--accent)/.08)] border-[hsl(var(--accent-line))]',
  'from-[hsl(var(--violet)/.25)] to-[hsl(var(--violet)/.08)] border-[hsl(var(--violet)/.3)]',
  'from-[hsl(var(--aqua)/.25)] to-[hsl(var(--aqua)/.08)] border-[hsl(var(--aqua)/.3)]',
  'from-[hsl(var(--yellow)/.25)] to-[hsl(var(--yellow)/.08)] border-[hsl(var(--yellow)/.3)]',
  'from-[hsl(var(--green)/.25)] to-[hsl(var(--green)/.08)] border-[hsl(var(--green)/.3)]',
]
const FOLDER_TEXT = [
  'text-[hsl(var(--accent))]',
  'text-[hsl(var(--violet))]',
  'text-[hsl(var(--aqua))]',
  'text-[hsl(var(--yellow))]',
  'text-[hsl(var(--green))]',
]

type NavLevel = 'workspaces' | 'sujets' | 'docs'

export default function Library() {
  const location = useLocation()
  const navigate = useNavigate()

  // ── Navigation ──
  const [level, setLevel]               = useState<NavLevel>('workspaces')
  const [activeWs, setActiveWs]         = useState<any | null>(null)
  const [activeSujet, setActiveSujet]   = useState<any | null>(null)
  const [workspaces, setWorkspaces]     = useState<any[]>([])
  const [sujets, setSujets]             = useState<any[]>([])
  const [wsLoading, setWsLoading]       = useState(true)

  // ── Onglet actif ──
  const [tab, setTab] = useState<'articles' | 'documents'>('articles')
  const [ragFilter, setRagFilter] = useState<'bruts' | 'rag'>('bruts')
  const [contentTab, setContentTab] = useState<'veille' | 'apprentissage'>('veille')
  const [docRagFilter, setDocRagFilter] = useState<'all' | 'rag'>('all')

  // ── Articles (items) ──
  const [items, setItems]         = useState<any[]>([])
  const [itemsLoading, setItemsLoading] = useState(false)

  // ── Documents ──
  const [docs, setDocs]           = useState<any[]>([])
  const [loading, setLoading]     = useState(false)
  const [filterType, setFilterType] = useState('all')
  const [sortBy, setSortBy]       = useState<'date_desc' | 'date_asc' | 'title'>('date_desc')

  // ── Recherche ──
  const [query, setQuery]         = useState('')
  const [semantic, setSemantic]   = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchMode, setSearchMode] = useState(false)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [genModal, setGenModal]   = useState<{ prefill?: string; itemIds?: number[]; itemTitle?: string } | null>(null)

  // ── Modale article collecté ──
  const [itemModal, setItemModal] = useState<any | null>(null)
  const [itemPreview, setItemPreview] = useState<{ markdown: string; title: string; summary: string; json?: any } | null>(null)
  const [itemPreviewLoading, setItemPreviewLoading] = useState(false)
  const [itemSaving, setItemSaving] = useState(false)
  const [itemModalTab, setItemModalTab] = useState<'analyse' | 'contenu'>('analyse')
  const [itemFullContent, setItemFullContent] = useState<string | null>(null)
  const [itemFullLoading, setItemFullLoading] = useState(false)
  const itemScrollRef = useRef<HTMLDivElement>(null)

  // ── Sélection batch articles ──
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(new Set())
  const [batchItemLoading, setBatchItemLoading] = useState<string | null>(null)

  // ── Sélection / édition ──
  const [selected, setSelected]   = useState<any | null>(null)
  const [docReadPct, setDocReadPct] = useState(0)
  const [readFilter, setReadFilter] = useState<'all'|'unread'|'reading'|'done'>('all')
  const docScrollRef = useRef<HTMLDivElement>(null)
  const readPctTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [editMode, setEditMode]   = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]       = useState(false)
  const [ragIndexing, setRagIndexing] = useState(false)
  const [docFullscreen, setDocFullscreen] = useState(false)
  const [itemRagIndexing, setItemRagIndexing] = useState(false)

  const [copied, setCopied]       = useState(false)
  const [deleting, setDeleting]   = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [beforeAi, setBeforeAi]   = useState('')

  // ── Import OCR ──
  const [importModal, setImportModal] = useState(false)
  const [importFile, setImportFile]   = useState<File | null>(null)
  const [importing, setImporting]     = useState(false)
  const [importResult, setImportResult] = useState<any | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleImportFile(file: File) {
    setImportFile(file)
    setImporting(true)
    setImportResult(null)
    try {
      const res = await api.uploadDocument(file)
      setImportResult(res)
      loadDocs()
    } catch (e: any) {
      setImportResult({ error: e.message })
    } finally {
      setImporting(false)
    }
  }

  // ── Chargement workspaces ──
  useEffect(() => {
    setWsLoading(true)
    Promise.all([api.getWorkspaces(), api.getSujets()])
      .then(([wsData, sData]) => {
        const wsList = wsData.workspaces || []
        const sList = sData.sujets || []
        setWorkspaces(wsList)
        setSujets(sList)
        // Naviguer vers un sujet direct si ?sujet= dans l'URL
        const params = new URLSearchParams(location.search)
        const sujetParam = params.get('sujet')
        if (sujetParam) {
          const sujetId = parseInt(sujetParam, 10)
          const sujet = sList.find((s: any) => s.id === sujetId)
          if (sujet) {
            const ws = wsList.find((w: any) => w.id === sujet.workspace_id)
            if (ws) setActiveWs(ws)
            setActiveSujet(sujet)
            setLevel('docs')
            setTab('articles')
          }
        }
      })
      .finally(() => setWsLoading(false))
  }, [])

  // ── Chargement documents ──
  const loadDocs = useCallback(async (sujetId?: number | null) => {
    setLoading(true)
    setSearchMode(false)
    setQuery('')
    try {
      const params: any = {}
      if (filterType !== 'all') params.doc_type = filterType
      if (sujetId != null) params.sujet_id = sujetId
      else if (sujetId === null) params.unclassified = true
      const sortMap = { date_desc: 'created_at DESC', date_asc: 'created_at ASC', title: 'title ASC' }
      params.sort = sortMap[sortBy]
      const d = await api.getDocuments(params)
      setDocs(d.documents || [])
    } finally { setLoading(false) }
  }, [filterType, sortBy])

  const loadItems = useCallback(async (sujetId?: number) => {
    setItemsLoading(true)
    try {
      const params: any = { limit: 100 }
      if (sujetId != null) params.sujet_id = sujetId
      const d = await api.getItems(params)
      setItems(d.items || d.results || [])
    } finally { setItemsLoading(false) }
  }, [])

  useEffect(() => {
    if (level === 'docs' && activeSujet) {
      loadDocs(activeSujet.id)
      loadItems(activeSujet.id ?? undefined)
    }
  }, [filterType, sortBy, level, activeSujet])

  // Auto-open generator modal
  useEffect(() => {
    const q = (location.state as any)?.generateQuery
    if (q) { setGenModal({ prefill: q }); navigate(location.pathname, { replace: true, state: {} }) }
  }, [location.state])

  // Auto-open document from external navigation (e.g. Briefing → "Conserver")
  useEffect(() => {
    const docId = (location.state as any)?.openDocId
    if (docId) {
      navigate(location.pathname, { replace: true, state: {} })
      api.getDocument(docId).then(full => {
        setSelected(full); setEditTitle(full.title); setEditContent(full.content_markdown); setEditMode(false)
        setDocReadPct(full.reading_progress || 0)
      }).catch(() => {})
    }
  }, [location.state])

  // Recherche — fonctionne depuis n'importe quel niveau
  useEffect(() => {
    if (!query.trim()) {
      if (searchMode) { setSearchMode(false); if (level === 'docs') loadDocs(activeSujet?.id ?? null) }
      return
    }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true); setSearchMode(true)
      // Si on est à la racine ou dans un dossier, basculer en mode docs sans sujet
      if (level !== 'docs') setLevel('docs')
      try {
        const sujetId = level === 'docs' ? activeSujet?.id : undefined
        const d = await api.searchDocuments(query, semantic, filterType !== 'all' ? filterType : undefined, sujetId)
        setDocs(d.results || [])
      } catch {} finally { setSearching(false) }
    }, 400)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [query, semantic, filterType, level, activeSujet])

  async function openItemModal(item: any) {
    setItemModal(item)
    setItemPreview(null)
    setItemFullContent(null)
    setItemModalTab('analyse')
    setItemPreviewLoading(true)
    try {
      const result = await api.ingestPreview(item.id)
      setItemPreview({
        markdown: result.markdown || '',
        title: result.title || item.title || '',
        summary: result.current_summary || item.summary || '',
        json: result.json,
      })
    } catch { setItemPreview({ markdown: '', title: item.title || '', summary: item.summary || '' }) }
    finally { setItemPreviewLoading(false) }
  }

  async function loadItemFullContent(translate = false) {
    if (!itemModal) return
    if (!translate && itemFullContent !== null) return
    setItemFullLoading(true)
    try {
      const result = await api.getItemRawContent(itemModal.id, translate)
      const pages = result.pages || []
      const text = pages.map((p: any) => p.content || '').filter(Boolean).join('\n\n---\n\n')
      setItemFullContent(text || '')
    } catch { setItemFullContent('') }
    finally { setItemFullLoading(false) }
  }

  async function saveItemAsDoc() {
    if (!itemModal) return
    setItemSaving(true)
    try {
      // Utilise le contenu complet si disponible, sinon le digest
      const content = itemFullContent || itemPreview?.markdown || ''
      const title = itemPreview?.title || itemModal.title || 'Article sans titre'
      await api.saveDocument({
        title,
        doc_type: 'fiche',
        content_markdown: content,
        summary: itemPreview?.summary || '',
        sujet_id: activeSujet?.id ?? null,
        source_item_ids: [itemModal.id],
      })
      setItemModal(null)
      setItemPreview(null)
      setItemFullContent(null)
      loadDocs(activeSujet?.id ?? undefined)
      setTab('documents')
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setItemSaving(false) }
  }

  function toggleSelectItem(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedItemIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  async function batchItemAction(action: 'ingest' | 'ignore') {
    const ids = Array.from(selectedItemIds)
    if (!ids.length) return
    setBatchItemLoading(action)
    try {
      if (action === 'ingest') await api.batchIngestRag(ids)
      else await api.batchIgnoreItems(ids)
      setSelectedItemIds(new Set())
      // Recharger la liste pour refléter les changements
      if (activeSujet) loadItems(activeSujet.id)
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setBatchItemLoading(null) }
  }

  // ── Navigation ──
  function enterWorkspace(ws: any) {
    setActiveWs(ws)
    setLevel('sujets')
  }
  function enterSujet(s: any) {
    setActiveSujet(s)
    setLevel('docs')
    loadDocs(s.id)
  }
  function enterUnclassified() {
    setActiveSujet({ id: null, name: 'Non classés', _unclassified: true })
    setLevel('docs')
    loadDocs(undefined) // no sujet_id filter → returns docs with sujet_id IS NULL
  }
  // ── Sélection multiple ──
  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function selectAll() { setSelectedIds(new Set(docs.map(d => d.id))) }
  function clearSelection() { setSelectedIds(new Set()) }
  async function batchDelete() {
    const ids = [...selectedIds]; setBatchDeleting(true)
    try {
      await api.deleteDocuments(ids)
      setDocs(prev => prev.filter(d => !ids.includes(d.id)))
      setSelectedIds(new Set())
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setBatchDeleting(false) }
  }

  // ── Édition ──
  async function openDoc(doc: any) {
    const full = await api.getDocument(doc.id)
    setSelected(full); setEditTitle(full.title); setEditContent(full.content_markdown); setEditMode(false)
    setDocReadPct(full.reading_progress || 0)
    setTimeout(() => {
      const el = docScrollRef.current
      if (el && full.reading_progress > 0) {
        el.scrollTop = ((full.reading_progress / 100) * (el.scrollHeight - el.clientHeight))
      }
    }, 100)
  }

  function onDocScroll() {
    const el = docScrollRef.current
    if (!el || !selected) return
    const pct = Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100)
    const newPct = Math.min(100, pct)
    setDocReadPct(newPct)
    if (readPctTimer.current) clearTimeout(readPctTimer.current)
    readPctTimer.current = setTimeout(() => {
      api.updateDocument(selected.id, { reading_progress: newPct })
      setDocs(prev => prev.map(d => d.id === selected.id ? { ...d, reading_progress: newPct } : d))
    }, 800)
  }
  async function applyAiEdit() {
    if (!selected || !aiInstruction.trim()) return
    setBeforeAi(editContent); setAiLoading(true)
    try {
      const result = await api.aiEditDocument(selected.id, aiInstruction, editContent)
      setEditContent(result.markdown); setAiInstruction('')
    } catch (e: any) { alert(`Erreur IA : ${e.message}`) }
    finally { setAiLoading(false) }
  }
  async function saveEdit() {
    if (!selected) return; setSaving(true)
    try {
      await api.updateDocument(selected.id, { title: editTitle, content_markdown: editContent })
      setSelected({ ...selected, title: editTitle, content_markdown: editContent })
      setDocs(prev => prev.map(d => d.id === selected.id ? { ...d, title: editTitle } : d))
      setEditMode(false)
    } finally { setSaving(false) }
  }

  async function deleteDoc(id: number) {
    setDeleting(id)
    try {
      await api.deleteDocument(id)
      setDocs(prev => prev.filter(d => d.id !== id))
      if (selected?.id === id) setSelected(null)
    } finally { setDeleting(null) }
  }
  function copyContent() {
    if (!selected) return
    navigator.clipboard.writeText(selected.content_markdown)
    setCopied(true); setTimeout(() => setCopied(false), 1500)
  }
  function exportMd() {
    if (!selected) return
    const blob = new Blob([selected.content_markdown], { type: 'text/markdown' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${selected.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`
    a.click()
  }

  const TYPES = ['all', 'fiche', 'synthese', 'guide', 'rapport']
  const visibleSujets = sujets.filter(s => s.workspace_id === activeWs?.id)
  const visibleDocs = docs.filter(d => {
    if (readFilter === 'unread') return !d.reading_progress || d.reading_progress === 0
    if (readFilter === 'reading') return d.reading_progress > 0 && d.reading_progress < 100
    if (readFilter === 'done') return d.reading_progress === 100
    return true
  }).filter(d => docRagFilter === 'rag' ? d.rag_indexed : true)

  // ─── RENDU ────────────────────────────────────────────────────────────────

  if (wsLoading) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-[hsl(var(--accent))] animate-spin" />
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Modal Import OCR ── */}
      <AnimatePresence>
        {importModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setImportModal(false) }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-[hsl(var(--bg-1))] border border-[hsl(var(--line))] rounded-2xl shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--line))]">
                <div className="flex items-center gap-2">
                  <Upload className="w-4 h-4 text-[hsl(var(--accent))]" />
                  <span className="text-[14px] font-semibold text-[hsl(var(--text))]">Importer un document</span>
                </div>
                <button onClick={() => setImportModal(false)} className="p-1 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <p className="text-[12px] text-[hsl(var(--text-3))]">
                  PDF, image (PNG, JPG, TIFF) ou document Word. Le texte est extrait par OCR puis indexé dans la bibliothèque.
                </p>
                <input ref={importFileRef} type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.docx,.doc"
                  className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleImportFile(e.target.files[0]) }} />
                {!importResult && !importing && (
                  <button onClick={() => importFileRef.current?.click()}
                    className="w-full border-2 border-dashed border-[hsl(var(--line))] rounded-xl py-8 flex flex-col items-center gap-3 text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors cursor-pointer">
                    <FilePlus className="w-8 h-8" />
                    <span className="text-[13px] font-medium">Cliquer pour sélectionner un fichier</span>
                    <span className="text-[11px]">PDF · PNG · JPG · TIFF · DOCX</span>
                  </button>
                )}
                {importing && (
                  <div className="flex flex-col items-center gap-3 py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-[hsl(var(--accent))]" />
                    <span className="text-[13px] text-[hsl(var(--text-3))]">Extraction en cours…</span>
                    {importFile && <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">{importFile.name}</span>}
                  </div>
                )}
                {importResult && !importing && (
                  <div className={`rounded-lg p-4 ${importResult.error ? 'bg-red-500/10 border border-red-500/25' : 'bg-green-500/10 border border-green-500/25'}`}>
                    {importResult.error ? (
                      <p className="text-[12px] text-red-400 font-mono">{importResult.error}</p>
                    ) : (
                      <div className="space-y-1">
                        <p className="text-[12px] font-semibold text-[hsl(var(--green))] flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" /> Document importé avec succès
                        </p>
                        {importResult.title && <p className="text-[11.5px] text-[hsl(var(--text-2))]">{importResult.title}</p>}
                        {importResult.word_count && <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">{importResult.word_count} mots extraits</p>}
                      </div>
                    )}
                  </div>
                )}
                <div className="flex justify-end gap-2 pt-1">
                  {importResult && !importResult.error && (
                    <button onClick={() => { setImportModal(false); setImportResult(null); setImportFile(null) }}
                      className="px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 transition-opacity">
                      Fermer
                    </button>
                  )}
                  {(importResult?.error || (!importing && !importResult)) && (
                    <button onClick={() => { setImportResult(null); setImportFile(null); importFileRef.current?.click() }}
                      className="px-4 py-2 rounded-lg border border-[hsl(var(--accent-line))] text-[hsl(var(--accent))] text-[12px] font-semibold hover:bg-[hsl(var(--accent-dim))] transition-colors">
                      {importResult?.error ? 'Réessayer' : 'Sélectionner'}
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Breadcrumb + bouton retour ── */}
      <div className="flex-shrink-0 px-8 pt-6 pb-4 space-y-3">
      <div className="flex items-center gap-2 text-[12px] font-mono">
        <button onClick={() => { setLevel('workspaces'); setActiveWs(null); setActiveSujet(null); setDocs([]) }}
          className={`transition-colors ${level === 'workspaces' ? 'text-[hsl(var(--text))] font-bold' : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
          Bibliothèque
        </button>
        {activeWs && (
          <>
            <ChevronRight className="w-3 h-3 text-[hsl(var(--text-3))]" />
            <button onClick={() => { setLevel('sujets'); setActiveSujet(null); setDocs([]) }}
              className={`transition-colors ${level === 'sujets' ? 'text-[hsl(var(--text))] font-bold' : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
              {activeWs.name}
            </button>
          </>
        )}
        {activeSujet && (
          <>
            <ChevronRight className="w-3 h-3 text-[hsl(var(--text-3))]" />
            <span className="text-[hsl(var(--text))] font-bold">{activeSujet.name}</span>
          </>
        )}
      </div>

      {/* ── Barre de recherche globale ── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
          {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[hsl(var(--text-3))]" />}
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher dans les titres et contenus…"
            className="w-full pl-9 pr-4 py-2 bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded-lg text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] transition-all" />
        </div>
        <button onClick={() => setSemantic(v => !v)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] font-mono font-semibold transition-all ${semantic ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]' : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--line-bright))]'}`}>
          <Sparkles className="w-3.5 h-3.5" />{semantic ? 'Sémantique ✓' : 'Sémantique'}
        </button>
        {(query || searchMode) && (
          <button onClick={() => { setQuery(''); if (level === 'docs') loadDocs(activeSujet?.id ?? null) }}
            className="px-3 py-2 rounded-lg border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      </div>

      <AnimatePresence mode="wait">

        {/* ══ Niveau 1 : Dossiers ══ */}
        {level === 'workspaces' && (
          <motion.div key="ws" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex-1 overflow-auto px-8 py-6">
            {workspaces.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[hsl(var(--text-3))]">
                <Folder className="w-12 h-12 opacity-20" />
                <p className="text-[13px] font-mono">Aucun dossier — créez-en un dans la page Dossiers</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {workspaces.map((ws, i) => (
                  <motion.button key={ws.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => enterWorkspace(ws)}
                    className={`relative p-6 rounded-xl border bg-gradient-to-br ${FOLDER_COLORS[i % FOLDER_COLORS.length]} text-left transition-all group`}
                  >
                    <Folder className={`w-8 h-8 mb-3 ${FOLDER_TEXT[i % FOLDER_TEXT.length]}`} />
                    <p className={`text-[15px] font-bold ${FOLDER_TEXT[i % FOLDER_TEXT.length]}`}>{ws.name}</p>
                    <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-1">
                      {ws.sujet_count} sujet{ws.sujet_count !== 1 ? 's' : ''}
                    </p>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--text-3))] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ══ Niveau 2 : Sujets ══ */}
        {level === 'sujets' && (
          <motion.div key="sujets" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex-1 overflow-auto px-8 py-6">
            {visibleSujets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-[hsl(var(--text-3))]">
                <Tag className="w-12 h-12 opacity-20" />
                <p className="text-[13px] font-mono">Aucun sujet dans ce dossier</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {visibleSujets.map((s, i) => (
                  <motion.button key={s.id}
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.06 }}
                    whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                    onClick={() => enterSujet(s)}
                    className={`relative p-6 rounded-xl border bg-gradient-to-br ${FOLDER_COLORS[(i + 1) % FOLDER_COLORS.length]} text-left transition-all group`}
                  >
                    <Tag className={`w-7 h-7 mb-3 ${FOLDER_TEXT[(i + 1) % FOLDER_TEXT.length]}`} />
                    <p className={`text-[15px] font-bold ${FOLDER_TEXT[(i + 1) % FOLDER_TEXT.length]}`}>{s.name}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                        <Radio className="w-2.5 h-2.5 inline mr-0.5" />{s.item_count} article{s.item_count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                        <FileText className="w-2.5 h-2.5 inline mr-0.5" />{s.doc_count ?? 0} doc{(s.doc_count ?? 0) !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--text-3))] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                ))}
                {/* Tuile documents non rattachés à un sujet */}
                <motion.button
                  initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: visibleSujets.length * 0.06 }}
                  whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                  onClick={enterUnclassified}
                  className="relative p-6 rounded-xl border bg-gradient-to-br from-[hsl(var(--bg-2))] to-[hsl(var(--bg-3))] border-[hsl(var(--line))] text-left transition-all group"
                >
                  <FileText className="w-7 h-7 mb-3 text-[hsl(var(--text-3))]" />
                  <p className="text-[15px] font-bold text-[hsl(var(--text-2))]">Non classés</p>
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-1">documents sans sujet</p>
                  <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--text-3))] opacity-0 group-hover:opacity-100 transition-opacity" />
                </motion.button>
              </div>
            )}
          </motion.div>
        )}

        {/* ══ Niveau 3 : Articles + Documents ══ */}
        {level === 'docs' && (
          <motion.div key="docs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex-1 flex flex-col overflow-hidden">

            {/* Onglets */}
            <div className="flex-shrink-0 px-8 pt-4 pb-0 border-b border-[hsl(var(--line))] flex items-end gap-6">
              <button onClick={() => setTab('articles')}
                className={`flex items-center gap-2 pb-3 border-b-2 text-[13px] font-semibold transition-all ${tab === 'articles' ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                <Radio className="w-3.5 h-3.5" />
                Bruts
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))]">
                  {items.length}
                </span>
              </button>
              <button onClick={() => setTab('documents')}
                className={`flex items-center gap-2 pb-3 border-b-2 text-[13px] font-semibold transition-all ${tab === 'documents' ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                <FileText className="w-3.5 h-3.5" />
                Documents générés
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))]">
                  {docs.length}
                </span>
              </button>
            </div>

            <AnimatePresence mode="wait">

              {/* ── Onglet Articles ── */}
              {tab === 'articles' && (
                <motion.div key="tab-articles" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden">
                  {/* Onglets Veille / Apprentissage */}
                  <div className="flex-shrink-0 px-8 pt-2 pb-0 bg-[hsl(var(--bg-2))] border-b border-[hsl(var(--line))] flex items-end gap-0">
                    {(['veille', 'apprentissage'] as const).map(t => (
                      <button key={t} onClick={() => setContentTab(t)}
                        className={`px-4 py-2 text-[11.5px] font-mono border-b-2 transition-all -mb-px capitalize ${contentTab === t ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                        {t}
                      </button>
                    ))}
                    <div className="ml-auto flex items-center gap-2 pb-2">
                      {(['bruts', 'rag'] as const).map(f => {
                        const labels = { bruts: 'Bruts', rag: 'Dans le RAG' }
                        return (
                          <button key={f} onClick={() => setRagFilter(f)}
                            className={`text-[10.5px] font-mono px-2.5 py-1 rounded transition-colors ${ragFilter === f ? 'bg-[hsl(var(--accent))] text-white' : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                            {labels[f]}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                  {/* Barre batch articles */}
                  <AnimatePresence>
                    {selectedItemIds.size > 0 && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="flex-shrink-0 border-b border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] px-8 py-2 flex items-center gap-3 overflow-hidden">
                        <span className="text-[11px] font-mono text-[hsl(var(--accent))] font-semibold">
                          {selectedItemIds.size} sélectionné{selectedItemIds.size > 1 ? 's' : ''}
                        </span>
                        <div className="ml-auto flex items-center gap-2">
                          <button disabled={!!batchItemLoading} onClick={() => batchItemAction('ingest')}
                            className="inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1 rounded-lg border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent))] text-white hover:opacity-90 transition-opacity disabled:opacity-40">
                            {batchItemLoading === 'ingest' ? <Loader2 className="w-3 h-3 animate-spin" /> : <DatabaseZap className="w-3 h-3" />}
                            Intégrer dans le RAG
                          </button>
                          <button disabled={!!batchItemLoading} onClick={() => batchItemAction('ignore')}
                            className="inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text-3))] hover:border-red-500/40 hover:text-red-400 transition-colors disabled:opacity-40">
                            {batchItemLoading === 'ignore' ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
                            Ignorer
                          </button>
                          <button onClick={() => setSelectedItemIds(new Set())} className="p-1 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))]">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex-1 overflow-auto px-8 py-4">
                    {itemsLoading && (
                      <div className="space-y-2">
                        {[...Array(8)].map((_, i) => <div key={i} className="h-14 skeleton rounded-lg" />)}
                      </div>
                    )}
                    {!itemsLoading && items.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full gap-3 text-[hsl(var(--text-3))]">
                        <Radio className="w-12 h-12 opacity-20" />
                        <p className="text-[13px] font-mono">Aucun article collecté</p>
                        <p className="text-[11px] font-mono text-center leading-relaxed">
                          Retournez dans Dossiers, activez la surveillance<br />puis lancez une collecte.
                        </p>
                      </div>
                    )}
                    {!itemsLoading && items.length > 0 && (
                      <div className="space-y-2">
                        {/* Tout sélectionner */}
                        {(() => {
                          const filteredItems = items.filter((it: any) => {
                            const cat = it.content_tags?.category
                            const matchContent = contentTab === 'veille'
                              ? (!cat || cat === 'veille' || cat === 'mixed')
                              : (cat === 'apprentissage' || cat === 'mixed')
                            const matchRag = ragFilter === 'rag' ? it.rag_indexed : !it.rag_indexed
                            return matchContent && matchRag
                          })
                          return (
                          <>
                          <div className="flex items-center gap-2 pb-1">
                            <button onClick={e => {
                              e.stopPropagation()
                              if (selectedItemIds.size === filteredItems.length) setSelectedItemIds(new Set())
                              else setSelectedItemIds(new Set(filteredItems.map((it: any) => it.id)))
                            }} className="flex items-center gap-1.5 text-[10.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                              {selectedItemIds.size === filteredItems.length && filteredItems.length > 0
                                ? <CheckSquare className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                                : <Square className="w-3.5 h-3.5" />}
                              Tout sélectionner ({filteredItems.length})
                            </button>
                          </div>
                          {filteredItems.map((item: any, i: number) => (
                          <motion.div key={item.id}
                            initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: i * 0.02 }}
                            onClick={() => openItemModal(item)}
                            className={`flex items-start gap-4 p-4 panel hover:border-[hsl(var(--accent-line))] cursor-pointer transition-all group ${selectedItemIds.has(item.id) ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]' : ''}`}>
                            {/* Checkbox */}
                            <button onClick={e => toggleSelectItem(item.id, e)}
                              className="flex-shrink-0 mt-1 text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                              {selectedItemIds.has(item.id)
                                ? <CheckSquare className="w-4 h-4 text-[hsl(var(--accent))]" />
                                : <Square className="w-4 h-4" />}
                            </button>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-semibold text-[hsl(var(--text))] leading-snug line-clamp-2 group-hover:text-[hsl(var(--accent))] transition-colors">
                                {item.title || item.source_url || 'Sans titre'}
                              </p>
                              {item.summary && (
                                <p className="text-[11.5px] text-[hsl(var(--text-3))] mt-1 line-clamp-2 leading-relaxed">{item.summary}</p>
                              )}
                              <div className="flex items-center gap-3 mt-2">
                                <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{timeAgo(item.created_at)}</span>
                                {item.source_url && (
                                  <a href={item.source_url} target="_blank" rel="noreferrer"
                                    onClick={e => e.stopPropagation()}
                                    className="text-[10px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 truncate">
                                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                    <span className="truncate">{item.source_url.replace(/^https?:\/\//, '').split('/')[0]}</span>
                                  </a>
                                )}
                                {item.content_tags?.category === 'mixed' && (
                                  <span className="text-[9.5px] font-mono text-[hsl(var(--violet))] border border-[hsl(var(--violet)/.3)] bg-[hsl(var(--violet)/.08)] rounded px-1.5 py-0.5">mixed</span>
                                )}
                                {item.rag_indexed && (
                                  <span className="text-[9.5px] font-mono text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] rounded px-1.5 py-0.5 flex items-center gap-1">
                                    <DatabaseZap className="w-2.5 h-2.5" />RAG
                                  </span>
                                )}
                              </div>
                            </div>
                          </motion.div>
                        ))}
                          </>
                          )
                        })()}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ── Onglet Documents ── */}
              {tab === 'documents' && (
                <motion.div key="tab-docs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  className="flex-1 flex flex-col overflow-hidden">
                  {/* Description */}
                  <div className="flex-shrink-0 px-8 py-3 bg-[hsl(var(--bg-2))] border-b border-[hsl(var(--line))] flex items-center gap-2">
                    <FileText className="w-3 h-3 text-[hsl(var(--accent))]" />
                    <p className="text-[11.5px] text-[hsl(var(--text-3))]">
                      Fiches, synthèses et guides que vous avez générés depuis les articles — knowledge base structurée.
                    </p>
                  </div>

                  {/* Barre de contrôle docs */}
                  <div className="flex-shrink-0 px-8 py-3 border-b border-[hsl(var(--line))]">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
                        <div className="seg">
                          {TYPES.map(t => (
                            <button key={t} onClick={() => setFilterType(t)} className={`seg-item ${filterType === t ? 'active' : ''}`}>
                              {filterType === t && <motion.div layoutId="lib-seg" className="absolute inset-0 bg-[hsl(var(--bg-2))] rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--line-bright))]" transition={{ type: 'spring', stiffness: 400, damping: 30 }} />}
                              <span className="relative z-10 capitalize">{t === 'all' ? 'Tous' : DOC_TYPE_META[t]?.label}</span>
                            </button>
                          ))}
                        </div>
                        <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
                          className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded px-2 py-1 text-[11.5px] font-mono text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-line))] transition-all">
                          <option value="date_desc">Plus récent</option>
                          <option value="date_asc">Plus ancien</option>
                          <option value="title">Titre A→Z</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center rounded border border-[hsl(var(--line))] overflow-hidden text-[10.5px] font-mono">
                          {([['all','Tous'],['unread','Non lus'],['reading','En cours'],['done','Terminés']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setReadFilter(val)}
                              className={`px-2 py-1 transition-colors ${readFilter === val ? 'bg-[hsl(var(--bg-2))] text-[hsl(var(--text))]' : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center rounded border border-[hsl(var(--line))] overflow-hidden text-[10.5px] font-mono">
                          {([['all','Tous'],['rag','Dans le RAG']] as const).map(([val, label]) => (
                            <button key={val} onClick={() => setDocRagFilter(val)}
                              className={`px-2 py-1 transition-colors ${docRagFilter === val ? 'bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                              {label}
                            </button>
                          ))}
                        </div>
                        {docs.length > 0 && (
                          <button onClick={selectedIds.size === docs.length ? clearSelection : selectAll}
                            className="flex items-center gap-1.5 px-2 py-1 rounded border border-[hsl(var(--line))] text-[11px] font-mono text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
                            {selectedIds.size === docs.length ? <><CheckSquare className="w-3 h-3" /> Tout désélectionner</> : <><Square className="w-3 h-3" /> Tout sélectionner</>}
                          </button>
                        )}
                        <button onClick={() => { setImportModal(true); setImportResult(null); setImportFile(null) }}
                          className="flex items-center gap-1.5 px-2 py-1 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[11px] font-mono text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent))] hover:text-white transition-colors">
                          <FilePlus className="w-3 h-3" /> Importer
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Batch delete bar */}
                  <AnimatePresence>
                    {selectedIds.size > 0 && (
                      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                        className="flex-shrink-0 mx-8 mt-3 panel-accent p-3 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 text-[12px] font-mono">
                          <span className="text-[hsl(var(--accent))]">{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
                          <button onClick={clearSelection} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">désélectionner</button>
                        </div>
                        <motion.button onClick={batchDelete} disabled={batchDeleting} whileTap={{ scale: 0.95 }}
                          className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--red))] text-white text-[12.5px] font-bold disabled:opacity-40">
                          {batchDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                          {batchDeleting ? 'Suppression…' : `Supprimer (${selectedIds.size})`}
                        </motion.button>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Grid documents */}
                  <div className="flex-1 overflow-auto px-8 py-4">
                    {loading && (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {[...Array(6)].map((_, i) => <div key={i} className="h-36 skeleton rounded-lg" />)}
                      </div>
                    )}
                    {!loading && docs.length === 0 && (
                      <div className="flex flex-col items-center justify-center h-full gap-4 text-[hsl(var(--text-3))]">
                        <LibraryIcon className="w-12 h-12 opacity-30" />
                        <p className="text-[13px] font-mono">Aucun document dans ce sujet</p>
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">Générez-en un depuis le Briefing ou l'Assistant</p>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      <AnimatePresence>
                        {visibleDocs.map((doc, i) => {
                          const meta = DOC_TYPE_META[doc.doc_type] ?? DOC_TYPE_META.fiche
                          const Icon = meta.icon
                          return (
                            <motion.div key={doc.id}
                              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              transition={{ delay: i * 0.04, type: 'spring', stiffness: 280, damping: 28 }}
                              onClick={() => openDoc(doc)}
                              className={`panel p-5 cursor-pointer transition-all group relative ${selectedIds.has(doc.id) ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]' : 'hover:border-[hsl(var(--line-bright))]'}`}
                            >
                              <div className={`absolute top-0 left-0 right-0 h-[1px] rounded-t-lg bg-gradient-to-r from-transparent to-transparent transition-all ${selectedIds.has(doc.id) ? 'via-[hsl(var(--accent))]' : 'via-[hsl(var(--line-bright))] group-hover:via-[hsl(var(--accent))]'}`} />
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-2">
                                  <button onClick={e => toggleSelect(doc.id, e)}
                                    className={`w-5 h-5 flex items-center justify-center rounded border flex-shrink-0 transition-all ${selectedIds.has(doc.id) ? 'bg-[hsl(var(--accent))] border-[hsl(var(--accent))] text-white' : 'border-[hsl(var(--line))] text-transparent hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'}`}>
                                    <Check className="w-3 h-3" />
                                  </button>
                                  <div className={`w-8 h-8 rounded-lg bg-[hsl(var(--bg-3))] flex items-center justify-center ${meta.color}`}>
                                    <Icon className="w-3.5 h-3.5" />
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className={`pill border text-[10px] ${meta.pill}`}>{meta.label}</span>
                                  {!doc.reading_progress || doc.reading_progress === 0
                                    ? <span className="pill text-[10px] bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))] border border-[hsl(var(--line))]">Non lu</span>
                                    : doc.reading_progress === 100
                                      ? <span className="pill text-[10px] bg-green-500/10 text-[hsl(var(--green))] border border-green-500/20">✓ Terminé</span>
                                      : <span className="pill text-[10px] bg-yellow-500/10 text-[hsl(var(--amber))] border border-yellow-500/20">{doc.reading_progress}%</span>
                                  }
                                  {doc.rag_indexed && (
                                    <span className="pill text-[10px] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] flex items-center gap-1">
                                      <DatabaseZap className="w-2.5 h-2.5" />RAG
                                    </span>
                                  )}
                                </div>
                              </div>
                              <p className="text-[13.5px] font-semibold text-[hsl(var(--text))] leading-snug mb-2 line-clamp-2">{doc.title}</p>
                              <p className="text-[11.5px] text-[hsl(var(--text-3))] leading-snug line-clamp-3">{doc.excerpt?.replace(/#+\s/g, '').replace(/\*\*[^*]*\*\*/g, '').replace(/\[[^\]]*\]\([^)]*\)/g, '').replace(/^-{3,}$/gm, '').replace(/\s+/g, ' ').trim()}</p>
                              <div className="flex items-center justify-between mt-4 pt-3 border-t border-[hsl(var(--line))]">
                                <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                                  {doc.nb_sources > 0 ? `${doc.nb_sources} source${doc.nb_sources > 1 ? 's' : ''}` : 'thème libre'}
                                </span>
                                <div className="flex items-center gap-1">
                                  <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{timeAgo(doc.created_at)}</span>
                                  <motion.button whileTap={{ scale: 0.9 }}
                                    onClick={e => { e.stopPropagation(); deleteDoc(doc.id) }} disabled={deleting === doc.id}
                                    className="ml-1 p-1 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] hover:bg-[hsl(var(--red)/.08)] transition-colors opacity-0 group-hover:opacity-100">
                                    {deleting === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                                  </motion.button>
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </motion.div>
        )}

      </AnimatePresence>

      {/* ── Modal lecture/édition ── */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className={`flex flex-col panel overflow-hidden transition-all ${docFullscreen ? 'fixed inset-4 z-[60] max-w-none max-h-none' : 'w-full max-w-4xl max-h-[92vh]'}`}>
              <div className="flex items-start justify-between px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
                <div className="flex-1 min-w-0 pr-4">
                  {editMode
                    ? <input value={editTitle} onChange={e => setEditTitle(e.target.value)}
                        className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded px-2 py-1 text-[14px] font-bold text-[hsl(var(--text))] outline-none" />
                    : <p className="text-[14px] font-bold text-[hsl(var(--text))] truncate">{selected.title}</p>
                  }
                  <div className="flex items-center gap-2 mt-1">
                    {(DOC_TYPE_META[selected.doc_type] ?? DOC_TYPE_META.fiche) && (
                      <span className={`pill border text-[10px] ${(DOC_TYPE_META[selected.doc_type] ?? DOC_TYPE_META.fiche).pill}`}>
                        {(DOC_TYPE_META[selected.doc_type] ?? DOC_TYPE_META.fiche).label}
                      </span>
                    )}
                    {selected.rag_indexed && <span className="pill pill-green text-[10px]"><DatabaseZap className="w-2.5 h-2.5" />RAG</span>}
                    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{timeAgo(selected.created_at)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => setDocFullscreen(f => !f)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                    {docFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button onClick={() => { setSelected(null); setDocFullscreen(false) }} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {/* Barre progression lecture */}
              <div className="h-0.5 bg-[hsl(var(--bg-3))] flex-shrink-0">
                <div className="h-full bg-[hsl(var(--accent))] transition-all duration-300" style={{ width: `${docReadPct}%` }} />
              </div>
              <div ref={docScrollRef} onScroll={onDocScroll} className="flex-1 overflow-auto p-6">
                {editMode
                  ? <div className="flex flex-col gap-3 h-full">
                      <div className="panel-accent p-3 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Wand2 className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                          <span className="text-[11.5px] font-semibold text-[hsl(var(--text))]">Éditer avec l'IA</span>
                        </div>
                        <div className="flex gap-2">
                          <input value={aiInstruction} onChange={e => setAiInstruction(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && applyAiEdit()} disabled={aiLoading}
                            placeholder='Ex : "Ajoute une section sur les erreurs" · "Traduis en anglais"'
                            className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded px-3 py-1.5 text-[12.5px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] disabled:opacity-50" />
                          <motion.button onClick={applyAiEdit} disabled={aiLoading || !aiInstruction.trim()} whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12px] font-bold disabled:opacity-40">
                            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                            {aiLoading ? 'Réécriture…' : 'Appliquer'}
                          </motion.button>
                          {beforeAi && !aiLoading && (
                            <button onClick={() => { setEditContent(beforeAi); setBeforeAi('') }}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-colors">
                              <RotateCcw className="w-3 h-3" /> Annuler
                            </button>
                          )}
                        </div>
                      </div>
                      <textarea value={editContent} onChange={e => { setEditContent(e.target.value); setBeforeAi('') }}
                        className="flex-1 min-h-[300px] bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-4 py-3 text-[12.5px] text-[hsl(var(--text-2))] outline-none font-mono leading-relaxed resize-none focus:border-[hsl(var(--accent-line))]" />
                    </div>
                  : <div className="prose-app max-w-none"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.content_markdown}</ReactMarkdown></div>
                }
              </div>
              <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
                <div className="flex items-center gap-2">
                  {!editMode ? (
                    <>
                      <button onClick={copyContent} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                        {copied ? <><Check className="w-3 h-3 text-[hsl(var(--green))]" />Copié</> : <><Copy className="w-3 h-3" />Copier</>}
                      </button>
                      <button onClick={exportMd} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                        <Download className="w-3 h-3" /> Export .md
                      </button>
                      <button onClick={() => setEditMode(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
                        <Pencil className="w-3 h-3" /> Éditer
                      </button>
                      {selected.rag_indexed ? (
                        <span className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--green)/.3)] text-[11.5px] font-mono text-[hsl(var(--green))] bg-green-500/5">
                          <DatabaseZap className="w-3 h-3" />✓ Ingéré dans le RAG
                        </span>
                      ) : (
                        <button disabled={ragIndexing} onClick={async () => {
                          setRagIndexing(true)
                          try {
                            await api.indexDocument(selected.id)
                            setSelected({ ...selected, rag_indexed: true })
                            setDocs((prev: any[]) => prev.map(d => d.id === selected.id ? { ...d, rag_indexed: true } : d))
                          } catch (e: any) { alert(`Erreur RAG : ${e.message}`) }
                          finally { setRagIndexing(false) }
                        }} className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--accent-line))] text-[11.5px] font-mono text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent-dim))] transition-colors disabled:opacity-40">
                          {ragIndexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <DatabaseZap className="w-3 h-3" />}
                          Ingérer dans le RAG
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditMode(false)} className="px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">Annuler</button>
                      <motion.button onClick={saveEdit} disabled={saving} whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12px] font-bold disabled:opacity-50">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Sauvegarder
                      </motion.button>
                    </>
                  )}
                </div>
                {!editMode && docReadPct > 0 && (
                  <span className={`text-[10.5px] font-mono ${docReadPct === 100 ? 'text-[hsl(var(--green))]' : 'text-[hsl(var(--amber))]'}`}>
                    {docReadPct === 100 ? '✓ Terminé' : `${docReadPct}% lu`}
                  </span>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal génération */}
      {genModal && (
        <DocumentGeneratorModal itemIds={genModal.itemIds || []} initialPrompt={genModal.prefill}
          itemTitle={genModal.itemTitle}
          sujetId={activeSujet?.id ?? null}
          onClose={() => setGenModal(null)} onSaved={() => { setGenModal(null); loadDocs(activeSujet?.id ?? undefined) }} />
      )}

      {/* ── Modale article collecté ── */}
      <AnimatePresence>
        {itemModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) { setItemModal(null); setItemPreview(null); setItemFullContent(null) } }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-3xl max-h-[90vh] flex flex-col panel overflow-hidden">

              {/* Header */}
              <div className="flex items-start justify-between px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-[14px] font-bold text-[hsl(var(--text))] leading-snug">
                    {itemPreview?.title || itemModal.title || 'Article collecté'}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="pill text-[10px] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))]">
                      <Radio className="w-2.5 h-2.5 inline mr-1" />collecté automatiquement
                    </span>
                    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{timeAgo(itemModal.created_at)}</span>
                  </div>
                </div>
                <button onClick={() => { setItemModal(null); setItemPreview(null); setItemFullContent(null) }}
                  className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Onglets */}
              <div className="flex-shrink-0 flex border-b border-[hsl(var(--line))] px-6 bg-[hsl(var(--bg-2))]">
                <button onClick={() => setItemModalTab('analyse')}
                  className={`py-2.5 px-1 mr-5 text-[12px] font-semibold border-b-2 transition-all ${itemModalTab === 'analyse' ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                  Analyse IA
                </button>
                <button onClick={() => { setItemModalTab('contenu'); loadItemFullContent() }}
                  className={`py-2.5 px-1 text-[12px] font-semibold border-b-2 transition-all ${itemModalTab === 'contenu' ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]' : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'}`}>
                  Contenu complet
                </button>
              </div>

              {/* Contenu */}
              <div ref={itemScrollRef} className="flex-1 overflow-auto p-6">
                {itemModalTab === 'analyse' && (
                  <>
                    {itemPreviewLoading && (
                      <div className="flex flex-col items-center justify-center h-40 gap-3 text-[hsl(var(--text-3))]">
                        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent))]" />
                        <p className="text-[12px] font-mono">Chargement…</p>
                      </div>
                    )}
                    {!itemPreviewLoading && itemPreview && (
                      <div className="prose-app max-w-none">
                        {itemPreview.markdown
                          ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{itemPreview.markdown}</ReactMarkdown>
                          : <p className="text-[12px] text-[hsl(var(--text-3))] italic">Contenu non disponible pour cet article.</p>
                        }
                      </div>
                    )}
                  </>
                )}
                {itemModalTab === 'contenu' && (
                  <>
                    {itemFullLoading && (
                      <div className="flex flex-col items-center justify-center h-40 gap-3 text-[hsl(var(--text-3))]">
                        <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent))]" />
                        <p className="text-[12px] font-mono">Récupération du contenu…</p>
                      </div>
                    )}
                    {!itemFullLoading && itemFullContent !== null && (
                      <>
                        {itemFullContent ? (
                          <>
                            <div className="flex items-center justify-end mb-4">
                              <button onClick={() => loadItemFullContent(true)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-mono px-3 py-1 rounded-lg border border-[hsl(var(--accent-line))] text-[hsl(var(--accent))] hover:bg-[hsl(var(--accent-dim))] transition-colors">
                                <Wand2 className="w-3 h-3" />
                                Traduire en français
                              </button>
                            </div>
                            <div className="text-[13px] text-[hsl(var(--text-2))] leading-relaxed space-y-3">
                              {itemFullContent.split(/\n{2,}/).map((para, i) => (
                                para.trim() === '---'
                                  ? <hr key={i} className="border-[hsl(var(--line))] my-4" />
                                  : <p key={i}>{para.trim()}</p>
                              ))}
                            </div>
                          </>
                        ) : (
                          <p className="text-[12px] text-[hsl(var(--text-3))] italic">Contenu complet non disponible — la page n'a pas pu être récupérée.</p>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>

              {/* Footer : lien source + actions */}
              <div className="flex-shrink-0 px-6 py-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                {/* Lien source */}
                {(itemModal.source_url || itemModal.url) && (
                  <div className="mb-3 pb-3 border-b border-[hsl(var(--line))]">
                    <a href={itemModal.source_url || itemModal.url} target="_blank" rel="noreferrer"
                      className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--accent))] hover:underline">
                      <ExternalLink className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{itemModal.source_url || itemModal.url}</span>
                    </a>
                  </div>
                )}
                {/* Actions */}
                <div className="flex items-center gap-3">
                  {!itemModal.rag_indexed && (
                    <motion.button
                      onClick={async () => {
                        setItemRagIndexing(true)
                        try {
                          await api.ingestItemRag(itemModal.id)
                          setItemModal({ ...itemModal, rag_indexed: true })
                          setItems((prev: any[]) => prev.map(it => it.id === itemModal.id ? { ...it, rag_indexed: true } : it))
                        } catch (e: any) { alert(`Erreur RAG : ${e.message}`) }
                        finally { setItemRagIndexing(false) }
                      }}
                      disabled={itemRagIndexing}
                      whileTap={{ scale: 0.97 }}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-all"
                    >
                      {itemRagIndexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                      {itemRagIndexing ? 'Ingestion…' : 'Ingérer dans le RAG'}
                    </motion.button>
                  )}
                  <motion.button
                    onClick={saveItemAsDoc}
                    disabled={itemSaving || itemPreviewLoading || !itemPreview?.markdown}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--accent-line))] text-[hsl(var(--accent))] text-[12.5px] font-bold hover:bg-[hsl(var(--accent-dim))] disabled:opacity-40 transition-all"
                  >
                    {itemSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    {itemSaving ? 'Enregistrement…' : 'Conserver dans Documents générés'}
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      const item = itemModal
                      setItemModal(null); setItemPreview(null)
                      setGenModal({ itemIds: [item.id], itemTitle: item.title })
                    }}
                    disabled={itemPreviewLoading}
                    whileTap={{ scale: 0.97 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border border-[hsl(var(--accent-line))] text-[hsl(var(--accent))] text-[12.5px] font-bold hover:bg-[hsl(var(--accent-dim))] disabled:opacity-40 transition-all"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Générer un document IA
                  </motion.button>
                  <button onClick={() => { setItemModal(null); setItemPreview(null); setItemFullContent(null) }}
                    className="ml-auto text-[11.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                    Fermer
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
