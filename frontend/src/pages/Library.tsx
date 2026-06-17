import { useEffect, useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  FileText, BookOpen, Map, BarChart3,
  X, Copy, Check, Download, DatabaseZap,
  Pencil, Trash2, Loader2, RefreshCw, Library as LibraryIcon,
  Search, Sparkles, SlidersHorizontal, Wand2, RotateCcw,
  CheckSquare, Square
} from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const DOC_TYPE_META: Record<string, { icon: any; label: string; color: string; pill: string }> = {
  fiche:    { icon: FileText,  label: 'Fiche',    color: 'text-[hsl(var(--cyan))]',    pill: 'bg-[hsl(var(--cyan)/.12)] text-[hsl(var(--cyan))] border-[hsl(var(--cyan)/.3)]' },
  synthese: { icon: BookOpen,  label: 'Synthèse', color: 'text-[hsl(var(--accent))]',  pill: 'bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border-[hsl(var(--accent-line))]' },
  guide:    { icon: Map,       label: 'Guide',    color: 'text-[hsl(var(--violet))]',   pill: 'bg-[hsl(var(--violet)/.12)] text-[hsl(var(--violet))] border-[hsl(var(--violet)/.3)]' },
  rapport:  { icon: BarChart3, label: 'Rapport',  color: 'text-[hsl(var(--green))]',   pill: 'bg-[hsl(var(--green)/.12)] text-[hsl(var(--green))] border-[hsl(var(--green)/.3)]' },
}

export default function Library() {
  const [docs, setDocs]           = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [filterType, setFilterType] = useState('all')
  const [filterRag, setFilterRag] = useState<'all' | 'indexed' | 'not_indexed'>('all')
  const [sortBy, setSortBy]       = useState<'date_desc' | 'date_asc' | 'title'>('date_desc')

  // Recherche
  const [query, setQuery]         = useState('')
  const [semantic, setSemantic]   = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchMode, setSearchMode] = useState(false)  // true = en mode résultats de recherche
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [selected, setSelected]   = useState<any | null>(null)
  const [editMode, setEditMode]   = useState(false)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving]       = useState(false)
  const [indexing, setIndexing]   = useState(false)
  const [copied, setCopied]       = useState(false)
  const [deleting, setDeleting]   = useState<number | null>(null)

  // ── Sélection multiple ──
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  function selectAll() { setSelectedIds(new Set(docs.map(d => d.id))) }
  function clearSelection() { setSelectedIds(new Set()) }

  async function batchDelete() {
    const ids = [...selectedIds]
    setBatchDeleting(true)
    try {
      const result = await api.deleteDocuments(ids)
      setDocs(prev => prev.filter(d => !ids.includes(d.id)))
      setSelectedIds(new Set())
      if (result.vectors_cleaned > 0) {
        console.info(`Suppression : ${result.deleted} docs, ${result.vectors_cleaned} vecteurs RAG nettoyés`)
      }
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setBatchDeleting(false) }
  }

  // ── Édition IA ──
  const [aiInstruction, setAiInstruction] = useState('')
  const [aiLoading, setAiLoading]         = useState(false)
  const [beforeAi, setBeforeAi]           = useState('')  // snapshot avant l'IA pour annuler

  const load = useCallback(async () => {
    setLoading(true)
    setSearchMode(false)
    try {
      const params: any = {}
      if (filterType !== 'all') params.doc_type = filterType
      if (filterRag === 'indexed') params.rag_indexed = true
      if (filterRag === 'not_indexed') params.rag_indexed = false
      const sortMap = { date_desc: 'created_at DESC', date_asc: 'created_at ASC', title: 'title ASC' }
      params.sort = sortMap[sortBy]
      const d = await api.getDocuments(params)
      setDocs(d.documents || [])
    } finally { setLoading(false) }
  }, [filterType, filterRag, sortBy])

  useEffect(() => { load() }, [filterType, filterRag, sortBy])

  // Recherche avec debounce 400ms
  useEffect(() => {
    if (!query.trim()) { if (searchMode) load(); return }
    if (searchTimeout.current) clearTimeout(searchTimeout.current)
    searchTimeout.current = setTimeout(async () => {
      setSearching(true)
      setSearchMode(true)
      try {
        const d = await api.searchDocuments(query, semantic, filterType !== 'all' ? filterType : undefined)
        setDocs(d.results || [])
      } catch {} finally { setSearching(false) }
    }, 400)
    return () => { if (searchTimeout.current) clearTimeout(searchTimeout.current) }
  }, [query, semantic, filterType])

  async function openDoc(doc: any) {
    const full = await api.getDocument(doc.id)
    setSelected(full)
    setEditTitle(full.title)
    setEditContent(full.content_markdown)
    setEditMode(false)
  }

  async function applyAiEdit() {
    if (!selected || !aiInstruction.trim()) return
    setBeforeAi(editContent)
    setAiLoading(true)
    try {
      const result = await api.aiEditDocument(selected.id, aiInstruction, editContent)
      setEditContent(result.markdown)
      setAiInstruction('')
    } catch (e: any) { alert(`Erreur IA : ${e.message}`) }
    finally { setAiLoading(false) }
  }

  async function saveEdit() {
    if (!selected) return
    setSaving(true)
    try {
      await api.updateDocument(selected.id, { title: editTitle, content_markdown: editContent })
      setSelected({ ...selected, title: editTitle, content_markdown: editContent })
      setDocs(prev => prev.map(d => d.id === selected.id ? { ...d, title: editTitle } : d))
      setEditMode(false)
    } finally { setSaving(false) }
  }

  async function indexDoc() {
    if (!selected) return
    setIndexing(true)
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
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
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

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">

      {/* ── Barre de recherche ── */}
      <div className="space-y-3">
        <div className="flex gap-2">
          {/* Champ de recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
            {searching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-[hsl(var(--text-3))]" />}
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher dans les titres et contenus…"
              className="w-full pl-9 pr-4 py-2.5 bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded-lg text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] transition-all"
            />
          </div>

          {/* Toggle sémantique */}
          <button
            onClick={() => setSemantic(v => !v)}
            title={semantic ? 'Mode sémantique actif (LanceDB) — désactiver' : 'Activer la recherche sémantique (LanceDB, docs indexés uniquement)'}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[11.5px] font-mono font-semibold transition-all ${
              semantic
                ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--line-bright))] hover:text-[hsl(var(--text-2))]'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            {semantic ? 'Sémantique ✓' : 'Sémantique'}
          </button>

          {/* Reset */}
          {(query || searchMode) && (
            <button onClick={() => { setQuery(''); load() }}
              className="px-3 py-2 rounded-lg border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          )}

          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
            onClick={load} disabled={loading}
            className="w-10 h-10 flex items-center justify-center rounded-lg border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[hsl(var(--text-2))] transition-colors">
            <RefreshCw className="w-3.5 h-3.5" />
          </motion.button>
        </div>

        {/* Filtres combinés */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
            {/* Type */}
            <div className="seg">
              {TYPES.map(t => (
                <button key={t} onClick={() => setFilterType(t)}
                  className={`seg-item ${filterType === t ? 'active' : ''}`}>
                  {filterType === t && (
                    <motion.div layoutId="lib-seg"
                      className="absolute inset-0 bg-[hsl(var(--bg-2))] rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--line-bright))]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10 capitalize">{t === 'all' ? 'Tous' : DOC_TYPE_META[t]?.label}</span>
                </button>
              ))}
            </div>

            {/* RAG status */}
            <div className="seg">
              {([['all','Tous'],['indexed','✓ RAG'],['not_indexed','Sans RAG']] as const).map(([val, lbl]) => (
                <button key={val} onClick={() => setFilterRag(val)}
                  className={`seg-item ${filterRag === val ? 'active' : ''}`}>
                  {filterRag === val && (
                    <motion.div layoutId="lib-rag"
                      className="absolute inset-0 bg-[hsl(var(--bg-2))] rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--line-bright))]"
                      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    />
                  )}
                  <span className="relative z-10">{lbl}</span>
                </button>
              ))}
            </div>

            {/* Tri */}
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)}
              className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded px-2 py-1 text-[11.5px] font-mono text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-line))] transition-all">
              <option value="date_desc">Plus récent</option>
              <option value="date_asc">Plus ancien</option>
              <option value="title">Titre A→Z</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            {/* Tout sélectionner */}
            {docs.length > 0 && (
              <button
                onClick={selectedIds.size === docs.length ? clearSelection : selectAll}
                title={selectedIds.size === docs.length ? 'Tout désélectionner' : 'Tout sélectionner'}
                className="flex items-center gap-1.5 px-2 py-1 rounded border border-[hsl(var(--line))] text-[11px] font-mono text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors"
              >
                {selectedIds.size === docs.length
                  ? <><CheckSquare className="w-3 h-3" /> Tout désélectionner</>
                  : <><Square className="w-3 h-3" /> Tout sélectionner</>
                }
              </button>
            )}
            {searchMode && query && (
              <span className="text-[11px] font-mono text-[hsl(var(--accent))]">
                {docs.length} résultat{docs.length !== 1 ? 's' : ''} pour "{query}"
                {semantic && <span className="ml-1 text-[hsl(var(--text-3))]">+ sémantique</span>}
              </span>
            )}
            {!searchMode && (
              <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                <span className="text-[hsl(var(--text))] font-bold">{docs.length}</span> document{docs.length !== 1 ? 's' : ''}
              </p>
            )}
          </div>
        </div>

        {/* Hint sémantique */}
        <AnimatePresence>
          {semantic && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]">
                <Sparkles className="w-3 h-3 text-[hsl(var(--accent))] flex-shrink-0" />
                <p className="text-[11px] text-[hsl(var(--text-2))]">
                  Mode sémantique actif — cherche par concept (ex: "authentification" trouve "JWT", "OAuth"...). Fonctionne uniquement sur les documents indexés dans le RAG.
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Barre sélection batch ── */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="panel-accent p-3 flex items-center justify-between gap-4"
          >
            <div className="flex items-center gap-3 text-[12px] font-mono">
              <span className="text-[hsl(var(--accent))]">
                {selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}
              </span>
              <button onClick={clearSelection} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                désélectionner
              </button>
            </div>
            <motion.button
              onClick={batchDelete}
              disabled={batchDeleting}
              whileTap={{ scale: 0.95 }}
              className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--red))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
            >
              {batchDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              {batchDeleting ? 'Suppression…' : `Supprimer (${selectedIds.size})`}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Grid */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-36 skeleton rounded-lg" />)}
        </div>
      )}

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-24 gap-4 text-[hsl(var(--text-3))]">
          <LibraryIcon className="w-12 h-12 opacity-30" />
          <p className="text-[13px] font-mono">Aucun document — sélectionnez des items dans Contenus et cliquez "Générer un document"</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AnimatePresence>
          {docs.map((doc, i) => {
            const meta = DOC_TYPE_META[doc.doc_type] ?? DOC_TYPE_META.fiche
            const Icon = meta.icon
            return (
              <motion.div
                key={doc.id}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 280, damping: 28 }}
                onClick={() => openDoc(doc)}
                className={`panel p-5 cursor-pointer transition-all group relative ${
                  selectedIds.has(doc.id)
                    ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]'
                    : 'hover:border-[hsl(var(--line-bright))]'
                }`}
              >
                {/* Top accent */}
                <div className={`absolute top-0 left-0 right-0 h-[1px] rounded-t-lg bg-gradient-to-r from-transparent to-transparent transition-all ${
                  selectedIds.has(doc.id) ? 'via-[hsl(var(--accent))]' : 'via-[hsl(var(--line-bright))] group-hover:via-[hsl(var(--accent))]'
                }`} />

                <div className="flex items-start justify-between mb-3">
                  {/* Checkbox + icône */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => toggleSelect(doc.id, e)}
                      className={`w-5 h-5 flex items-center justify-center rounded border flex-shrink-0 transition-all ${
                        selectedIds.has(doc.id)
                          ? 'bg-[hsl(var(--accent))] border-[hsl(var(--accent))] text-white'
                          : 'border-[hsl(var(--line))] text-transparent hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                    </button>
                    <div className={`w-8 h-8 rounded-lg bg-[hsl(var(--bg-3))] flex items-center justify-center ${meta.color}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`pill border text-[10px] ${meta.pill}`}>{meta.label}</span>
                    {doc.rag_indexed && <span className="pill pill-green text-[10px]"><DatabaseZap className="w-2.5 h-2.5" />RAG</span>}
                    {searchMode && doc.match_type === 'semantic' && (
                      <span className="pill pill-accent text-[10px]"><Sparkles className="w-2.5 h-2.5" />sémantique</span>
                    )}
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
                    <motion.button
                      whileTap={{ scale: 0.9 }}
                      onClick={e => { e.stopPropagation(); deleteDoc(doc.id) }}
                      disabled={deleting === doc.id}
                      className="ml-1 p-1 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] hover:bg-[hsl(var(--red)/.08)] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      {deleting === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Modal lecture / édition */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
            onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="w-full max-w-4xl max-h-[92vh] flex flex-col panel overflow-hidden"
            >
              {/* Header */}
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

              {/* Content */}
              <div className="flex-1 overflow-auto p-6">
                {editMode
                  ? <div className="flex flex-col gap-3 h-full">
                      {/* Panneau édition IA */}
                      <div className="panel-accent p-3 flex-shrink-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Wand2 className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                          <span className="text-[11.5px] font-semibold text-[hsl(var(--text))]">Éditer avec l'IA</span>
                          <span className="text-[10.5px] text-[hsl(var(--text-3))]">— décris la modification souhaitée</span>
                        </div>
                        <div className="flex gap-2">
                          <input
                            value={aiInstruction}
                            onChange={e => setAiInstruction(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && applyAiEdit()}
                            disabled={aiLoading}
                            placeholder='Ex : "Ajoute une section sur la gestion des erreurs" · "Traduis en anglais" · "Résume en 3 points"'
                            className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded px-3 py-1.5 text-[12.5px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] transition-all disabled:opacity-50"
                          />
                          <motion.button
                            onClick={applyAiEdit}
                            disabled={aiLoading || !aiInstruction.trim()}
                            whileTap={{ scale: 0.95 }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12px] font-bold disabled:opacity-40 transition-opacity"
                          >
                            {aiLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                            {aiLoading ? 'Réécriture…' : 'Appliquer'}
                          </motion.button>
                          {beforeAi && !aiLoading && (
                            <button
                              onClick={() => { setEditContent(beforeAi); setBeforeAi('') }}
                              title="Annuler la modification IA"
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] hover:border-[hsl(var(--red)/.3)] transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Annuler
                            </button>
                          )}
                        </div>
                      </div>
                      {/* Textarea */}
                      <textarea
                        value={editContent} onChange={e => { setEditContent(e.target.value); setBeforeAi('') }}
                        className="flex-1 min-h-[300px] bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-4 py-3 text-[12.5px] text-[hsl(var(--text-2))] outline-none font-mono leading-relaxed resize-none focus:border-[hsl(var(--accent-line))] transition-all"
                      />
                    </div>
                  : <div className="prose-app max-w-none">
                      <ReactMarkdown>{selected.content_markdown}</ReactMarkdown>
                    </div>
                }
              </div>

              {/* Footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
                <div className="flex items-center gap-2">
                  {!editMode ? (
                    <>
                      <button onClick={copyContent}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                        {copied ? <><Check className="w-3 h-3 text-[hsl(var(--green))]" />Copié</> : <><Copy className="w-3 h-3" />Copier</>}
                      </button>
                      <button onClick={exportMd}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                        <Download className="w-3 h-3" /> Export .md
                      </button>
                      <button onClick={() => setEditMode(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
                        <Pencil className="w-3 h-3" /> Éditer
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => setEditMode(false)}
                        className="px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                        Annuler
                      </button>
                      <motion.button onClick={saveEdit} disabled={saving} whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12px] font-bold disabled:opacity-50">
                        {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        Sauvegarder
                      </motion.button>
                    </>
                  )}
                </div>
                {!selected.rag_indexed && !editMode && (
                  <motion.button onClick={indexDoc} disabled={indexing} whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-1.5 rounded border border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] text-[12px] font-bold disabled:opacity-50 transition-all">
                    {indexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <DatabaseZap className="w-3.5 h-3.5" />}
                    {indexing ? 'Indexation…' : 'Indexer dans le RAG'}
                  </motion.button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
