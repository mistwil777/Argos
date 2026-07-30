import { useEffect, useState, useCallback, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, BookOpen, Map, BarChart3,
  X, Copy, Check, Download, DatabaseZap,
  Pencil, Trash2, Loader2, RefreshCw,
  Search, Sparkles, SlidersHorizontal, Wand2, RotateCcw,
  CheckSquare, Square, Folder, Tag, ChevronRight, Library as LibraryIcon,
} from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'
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

  // ── Navigation ──
  const [level, setLevel]               = useState<NavLevel>('workspaces')
  const [activeWs, setActiveWs]         = useState<any | null>(null)
  const [activeSujet, setActiveSujet]   = useState<any | null>(null)
  const [workspaces, setWorkspaces]     = useState<any[]>([])
  const [sujets, setSujets]             = useState<any[]>([])
  const [wsLoading, setWsLoading]       = useState(true)

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

  const [genModal, setGenModal]   = useState<{ prefill?: string } | null>(null)

  // ── Sélection / édition ──
  const [selected, setSelected]   = useState<any | null>(null)
  const [editMode, setEditMode]   = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]       = useState(false)
  const [indexing, setIndexing]   = useState(false)
  const [copied, setCopied]       = useState(false)
  const [deleting, setDeleting]   = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [beforeAi, setBeforeAi]   = useState('')

  // ── Chargement workspaces ──
  useEffect(() => {
    setWsLoading(true)
    Promise.all([api.getWorkspaces(), api.getSujets()])
      .then(([wsData, sData]) => {
        setWorkspaces(wsData.workspaces || [])
        setSujets(sData.sujets || [])
      })
      .finally(() => setWsLoading(false))
  }, [])

  // ── Chargement documents ──
  const loadDocs = useCallback(async (sujetId?: number) => {
    setLoading(true)
    setSearchMode(false)
    setQuery('')
    try {
      const params: any = {}
      if (filterType !== 'all') params.doc_type = filterType
      if (sujetId != null) params.sujet_id = sujetId
      const sortMap = { date_desc: 'created_at DESC', date_asc: 'created_at ASC', title: 'title ASC' }
      params.sort = sortMap[sortBy]
      const d = await api.getDocuments(params)
      setDocs(d.documents || [])
    } finally { setLoading(false) }
  }, [filterType, sortBy])

  useEffect(() => {
    if (level === 'docs' && activeSujet) loadDocs(activeSujet.id)
  }, [filterType, sortBy, level, activeSujet])

  // Auto-open generator modal
  useEffect(() => {
    const q = (location.state as any)?.generateQuery
    if (q) { setGenModal({ prefill: q }); window.history.replaceState({}, '') }
  }, [location.state])

  // Recherche
  useEffect(() => {
    if (level !== 'docs') return
    if (!query.trim()) { if (searchMode) loadDocs(activeSujet?.id); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true); setSearchMode(true)
      try {
        const d = await api.searchDocuments(query, semantic, filterType !== 'all' ? filterType : undefined, activeSujet?.id)
        setDocs(d.results || [])
      } catch {} finally { setSearching(false) }
    }, 400)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [query, semantic, filterType, level, activeSujet])

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
  function goBack() {
    if (level === 'docs') { setLevel('sujets'); setActiveSujet(null); setDocs([]) }
    else if (level === 'sujets') { setLevel('workspaces'); setActiveWs(null) }
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
  async function indexDoc() {
    if (!selected) return; setIndexing(true)
    try {
      await api.indexDocument(selected.id)
      setSelected({ ...selected, rag_indexed: true })
      setDocs(prev => prev.map(d => d.id === selected.id ? { ...d, rag_indexed: true } : d))
    } finally { setIndexing(false) }
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

  // ─── RENDU ────────────────────────────────────────────────────────────────

  if (wsLoading) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-[hsl(var(--accent))] animate-spin" />
    </div>
  )

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Breadcrumb + bouton retour ── */}
      <div className="flex-shrink-0 px-8 pt-6 pb-2 flex items-center gap-2 text-[12px] font-mono">
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
                    <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-1">
                      {s.source_count} source{s.source_count !== 1 ? 's' : ''}
                    </p>
                    <ChevronRight className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--text-3))] opacity-0 group-hover:opacity-100 transition-opacity" />
                  </motion.button>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ══ Niveau 3 : Documents ══ */}
        {level === 'docs' && (
          <motion.div key="docs" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="flex-1 flex flex-col overflow-hidden">

            {/* Barre de contrôle */}
            <div className="flex-shrink-0 px-8 py-3 space-y-2 border-b border-[hsl(var(--line))]">
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
                  <button onClick={() => { setQuery(''); loadDocs(activeSujet?.id) }}
                    className="px-3 py-2 rounded-lg border border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
                  onClick={() => loadDocs(activeSujet?.id)} disabled={loading}
                  className="w-10 h-10 flex items-center justify-center rounded-lg border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[hsl(var(--text-2))] transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                </motion.button>
              </div>

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
                  {docs.length > 0 && (
                    <button onClick={selectedIds.size === docs.length ? clearSelection : selectAll}
                      className="flex items-center gap-1.5 px-2 py-1 rounded border border-[hsl(var(--line))] text-[11px] font-mono text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
                      {selectedIds.size === docs.length ? <><CheckSquare className="w-3 h-3" /> Tout désélectionner</> : <><Square className="w-3 h-3" /> Tout sélectionner</>}
                    </button>
                  )}
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                    {searchMode && query
                      ? <span className="text-[hsl(var(--accent))]">{docs.length} résultat{docs.length !== 1 ? 's' : ''}</span>
                      : <><span className="text-[hsl(var(--text))] font-bold">{docs.length}</span> document{docs.length !== 1 ? 's' : ''}</>
                    }
                  </p>
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
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">Générez-en un depuis la page Veille ou l'Assistant</p>
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <AnimatePresence>
                  {docs.map((doc, i) => {
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
                            {doc.rag_indexed && <span className="pill pill-green text-[10px]"><DatabaseZap className="w-2.5 h-2.5" />RAG</span>}
                          </div>
                        </div>
                        <p className="text-[13.5px] font-semibold text-[hsl(var(--text))] leading-snug mb-2 line-clamp-2">{doc.title}</p>
                        <p className="text-[11.5px] text-[hsl(var(--text-3))] leading-snug line-clamp-3">{doc.excerpt?.replace(/#+\s/g, '')}</p>
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

      {/* ── Modal lecture/édition ── */}
      <AnimatePresence>
        {selected && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-4xl max-h-[92vh] flex flex-col panel overflow-hidden">
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
                <button onClick={() => setSelected(null)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors flex-shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-auto p-6">
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
                  : <div className="prose-app max-w-none"><ReactMarkdown>{selected.content_markdown}</ReactMarkdown></div>
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
                {!selected.rag_indexed && !editMode && (
                  <motion.button onClick={indexDoc} disabled={indexing} whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] text-[12px] font-bold disabled:opacity-50">
                    {indexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                    {indexing ? 'Indexation…' : 'Indexer dans le RAG'}
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Modal génération */}
      {genModal && (
        <DocumentGeneratorModal itemIds={[]} initialPrompt={genModal.prefill}
          onClose={() => setGenModal(null)} onSaved={() => { setGenModal(null); if (activeSujet) loadDocs(activeSujet.id) }} />
      )}
    </div>
  )
}
