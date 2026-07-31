import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Folder, Tag, Plus, ChevronRight, ChevronDown, ExternalLink,
  Loader2, Trash2, Check, X, Radio, Shield,
  BookOpen, Settings2, ToggleLeft, ToggleRight, Sparkles, Pencil, AlertTriangle, Info,
} from 'lucide-react'
import { api } from '@/services/api'

// ── types ─────────────────────────────────────────────────────────────────────

interface Workspace {
  id: number; name: string; slug: string; description?: string
  icon?: string; color?: string; sujet_count: number
}

interface Sujet {
  id: number; workspace_id: number; name: string; description?: string
  icon?: string; color?: string; source_count: number; item_count: number
  knowledge_profile: {
    official_domains: string[]; recognized_domains: string[]
    trusted_queries: string[]; keywords: string[]
  }
  sources?: Source[]
}

interface Source {
  id: number; name: string; url: string; type: string
  active: boolean; tags: string[]
}

// ── composant principal ───────────────────────────────────────────────────────

export default function Dossiers() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [sujets, setSujets]         = useState<Sujet[]>([])
  const [loading, setLoading]       = useState(true)
  const [activeWs, setActiveWs]     = useState<number | null>(null)
  const [activeSujet, setActiveSujet] = useState<Sujet | null>(null)
  const [sujetLoading, setSujetLoading] = useState(false)

  // Formulaires création
  const [newWsName, setNewWsName]     = useState('')
  const [newWsOpen, setNewWsOpen]     = useState(false)
  const [newSujetName, setNewSujetName] = useState('')
  const [newSujetOpen, setNewSujetOpen] = useState(false)
  const [sujetsOpen, setSujetsOpen]     = useState(true)
  const [saving, setSaving]           = useState(false)

  // Édition profil de connaissance
  const [editProfile, setEditProfile] = useState(false)
  // profileDraft stocke le texte brut (une entrée par ligne) pour ne pas perdre les sauts de ligne en cours de frappe
  const [profileDraftRaw, setProfileDraftRaw] = useState<Record<string, string>>({})
  const [, setProfileDraft] = useState<Sujet['knowledge_profile'] | null>(null)
  const [suggesting, setSuggesting] = useState(false)
  const [sourcesOpen, setSourcesOpen] = useState(false)

  // Renommage inline
  const [renameWsId, setRenameWsId]     = useState<number | null>(null)
  const [renameWsVal, setRenameWsVal]   = useState('')
  const [renameSujetId, setRenameSujetId]   = useState<number | null>(null)
  const [renameSujetVal, setRenameSujetVal] = useState('')

  // Confirmation suppression
  const [confirmDeleteWs, setConfirmDeleteWs]       = useState<number | null>(null)
  const [confirmDeleteSujet, setConfirmDeleteSujet] = useState<number | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [wsData, sData] = await Promise.all([api.getWorkspaces(), api.getSujets()])
      setWorkspaces(wsData.workspaces || [])
      setSujets(sData.sujets || [])
      if (!activeWs && wsData.workspaces?.length) setActiveWs(wsData.workspaces[0].id)
    } finally { setLoading(false) }
  }, [activeWs])

  useEffect(() => { load() }, [])

  async function openSujet(s: Sujet) {
    setSujetLoading(true)
    setActiveSujet(s)
    setEditProfile(false)
    setSourcesOpen(false)
    try {
      const full = await api.getSujet(s.id)
      setActiveSujet(full)
    } finally { setSujetLoading(false) }
  }

  async function createWorkspace() {
    if (!newWsName.trim()) return
    setSaving(true)
    try {
      await api.createWorkspace({ name: newWsName.trim() })
      setNewWsName(''); setNewWsOpen(false)
      await load()
    } finally { setSaving(false) }
  }

  async function createSujet() {
    if (!newSujetName.trim() || !activeWs) return
    setSaving(true)
    try {
      await api.createSujet({ workspace_id: activeWs, name: newSujetName.trim() })
      setNewSujetName(''); setNewSujetOpen(false)
      const data = await api.getSujets(activeWs)
      setSujets(data.sujets || [])
    } finally { setSaving(false) }
  }

  async function deleteSujet(id: number) {
    await api.deleteSujet(id)
    setConfirmDeleteSujet(null)
    if (activeSujet?.id === id) setActiveSujet(null)
    setSujets(prev => prev.filter(s => s.id !== id))
    await load()
  }

  async function deleteWorkspace(id: number) {
    await api.deleteWorkspace(id)
    setConfirmDeleteWs(null)
    setActiveWs(null)
    setActiveSujet(null)
    await load()
  }

  async function renameWorkspace(id: number) {
    if (!renameWsVal.trim()) return
    await api.updateWorkspace(id, { name: renameWsVal.trim() })
    setRenameWsId(null)
    await load()
  }

  async function renameSujet(id: number) {
    if (!renameSujetVal.trim()) return
    await api.updateSujet(id, { name: renameSujetVal.trim() })
    setRenameSujetId(null)
    const data = await api.getSujets(activeWs ?? undefined)
    setSujets(data.sujets || [])
    if (activeSujet?.id === id) setActiveSujet(prev => prev ? { ...prev, name: renameSujetVal.trim() } : null)
  }

  function openEditProfile(initial: Sujet['knowledge_profile']) {
    setEditProfile(true)
    setProfileDraft(initial)
    setProfileDraftRaw({
      official_domains:   initial.official_domains.join('\n'),
      recognized_domains: initial.recognized_domains.join('\n'),
      trusted_queries:    initial.trusted_queries.join('\n'),
      keywords:           initial.keywords.join('\n'),
    })
  }

  async function suggestProfile() {
    if (!activeSujet) return
    setSuggesting(true)
    try {
      const result = await api.suggestKnowledgeProfile(activeSujet.id)
      openEditProfile(result.knowledge_profile)
    } finally { setSuggesting(false) }
  }

  async function saveProfile() {
    if (!activeSujet) return
    // Convertir le texte brut en tableaux au moment de la sauvegarde
    const parsed: Sujet['knowledge_profile'] = {
      official_domains:   (profileDraftRaw.official_domains   ?? '').split('\n').map(s => s.trim()).filter(Boolean),
      recognized_domains: (profileDraftRaw.recognized_domains ?? '').split('\n').map(s => s.trim()).filter(Boolean),
      trusted_queries:    (profileDraftRaw.trusted_queries    ?? '').split('\n').map(s => s.trim()).filter(Boolean),
      keywords:           (profileDraftRaw.keywords           ?? '').split('\n').map(s => s.trim()).filter(Boolean),
    }
    setSaving(true)
    try {
      await api.updateKnowledgeProfile(activeSujet.id, parsed)
      setActiveSujet(prev => prev ? { ...prev, knowledge_profile: parsed } : null)
      setEditProfile(false)
    } finally { setSaving(false) }
  }

  async function toggleSource(sourceId: number, active: boolean) {
    await api.toggleSource(sourceId, !active)
    setActiveSujet(prev => prev ? {
      ...prev,
      sources: prev.sources?.map(s => s.id === sourceId ? { ...s, active: !active } : s),
    } : null)
  }

  const visibleSujets = sujets.filter(s => s.workspace_id === activeWs)

  if (loading) return (
    <div className="h-full flex items-center justify-center">
      <Loader2 className="w-5 h-5 text-[hsl(var(--accent))] animate-spin" />
    </div>
  )

  return (
    <div className="h-full flex overflow-hidden">

      {/* ── Colonne gauche : Dossiers + Sujets ── */}
      <div className="w-64 flex-shrink-0 flex flex-col border-r border-[hsl(var(--line))] overflow-hidden">

        {/* Dossiers */}
        <div className="flex-shrink-0 px-3 pt-4 pb-2">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Dossiers</span>
            <button onClick={() => setNewWsOpen(v => !v)}
              className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <AnimatePresence>
            {newWsOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
                <div className="flex gap-1">
                  <input value={newWsName} onChange={e => setNewWsName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createWorkspace()}
                    placeholder="Nom du dossier"
                    autoFocus
                    className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded px-2 py-1
                               text-[11.5px] font-mono text-[hsl(var(--text))] outline-none placeholder:text-[hsl(var(--text-3))]" />
                  <button onClick={createWorkspace} disabled={saving}
                    className="px-2 rounded bg-[hsl(var(--accent))] text-white">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-0.5">
            {workspaces.map(ws => (
              <div key={ws.id} className="group/ws relative">
                {renameWsId === ws.id ? (
                  <div className="flex gap-1 px-1">
                    <input value={renameWsVal} onChange={e => setRenameWsVal(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') renameWorkspace(ws.id); if (e.key === 'Escape') setRenameWsId(null) }}
                      autoFocus
                      className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded px-2 py-1
                                 text-[11.5px] font-mono text-[hsl(var(--text))] outline-none" />
                    <button onClick={() => renameWorkspace(ws.id)} className="px-1.5 rounded bg-[hsl(var(--accent))] text-white"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setRenameWsId(null)} className="px-1.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))]"><X className="w-3 h-3" /></button>
                  </div>
                ) : confirmDeleteWs === ws.id ? (
                  <div className="px-2 py-2 rounded-md border border-[hsl(var(--red))]/40 bg-[hsl(var(--red))]/5">
                    <p className="text-[10.5px] text-[hsl(var(--red))] mb-1.5 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Supprimer "{ws.name}" ?
                    </p>
                    <p className="text-[10px] text-[hsl(var(--text-3))] mb-2">Sources exclusives supprimées.</p>
                    <div className="flex gap-1">
                      <button onClick={() => deleteWorkspace(ws.id)}
                        className="flex-1 py-0.5 rounded bg-[hsl(var(--red))] text-white text-[10.5px] font-bold">Supprimer</button>
                      <button onClick={() => setConfirmDeleteWs(null)}
                        className="flex-1 py-0.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-2))] text-[10.5px]">Annuler</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => { setActiveWs(ws.id); setActiveSujet(null) }}
                    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors ${
                      activeWs === ws.id
                        ? 'bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))]'
                        : 'text-[hsl(var(--text-2))] hover:bg-[hsl(var(--bg-2))]'
                    }`}>
                    <Folder className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="text-[12px] font-medium truncate flex-1">{ws.name}</span>
                    <span className="text-[10px] font-mono text-[hsl(var(--text-3))] group-hover/ws:hidden">{ws.sujet_count}</span>
                    <div className="hidden group-hover/ws:flex items-center gap-0.5">
                      <button onClick={e => { e.stopPropagation(); setRenameWsId(ws.id); setRenameWsVal(ws.name) }}
                        className="p-0.5 rounded hover:text-[hsl(var(--accent))] text-[hsl(var(--text-3))] transition-colors">
                        <Pencil className="w-3 h-3" />
                      </button>
                      <button onClick={e => { e.stopPropagation(); setConfirmDeleteWs(ws.id) }}
                        className="p-0.5 rounded hover:text-[hsl(var(--red))] text-[hsl(var(--text-3))] transition-colors">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mx-3 h-px bg-[hsl(var(--line))]" />

        {/* Sujets du dossier actif */}
        <div className="flex-1 overflow-y-auto px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <button onClick={() => setSujetsOpen(v => !v)}
              className="flex items-center gap-1.5 text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider hover:text-[hsl(var(--text-2))] transition-colors">
              <motion.div animate={{ rotate: sujetsOpen ? 0 : -90 }} transition={{ duration: 0.15 }}>
                <ChevronDown className="w-3 h-3" />
              </motion.div>
              Sujets {visibleSujets.length > 0 && <span className="normal-case tracking-normal">({visibleSujets.length})</span>}
            </button>
            {activeWs && (
              <button onClick={() => setNewSujetOpen(v => !v)}
                className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <AnimatePresence>
            {newSujetOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }} className="overflow-hidden mb-2">
                <div className="flex gap-1">
                  <input value={newSujetName} onChange={e => setNewSujetName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && createSujet()}
                    placeholder="Nom du sujet"
                    autoFocus
                    className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded px-2 py-1
                               text-[11.5px] font-mono text-[hsl(var(--text))] outline-none placeholder:text-[hsl(var(--text-3))]" />
                  <button onClick={createSujet} disabled={saving}
                    className="px-2 rounded bg-[hsl(var(--accent))] text-white">
                    {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence initial={false}>
          {sujetsOpen && <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }}
            className="overflow-hidden">
          <div className="space-y-0.5">
            <AnimatePresence>
              {visibleSujets.map(s => (
                <motion.div key={s.id}
                  initial={{ opacity: 0, x: -4 }} animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="group/s"
                >
                  {renameSujetId === s.id ? (
                    <div className="flex gap-1 px-1">
                      <input value={renameSujetVal} onChange={e => setRenameSujetVal(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') renameSujet(s.id); if (e.key === 'Escape') setRenameSujetId(null) }}
                        autoFocus
                        className="flex-1 bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded px-2 py-1
                                   text-[11.5px] font-mono text-[hsl(var(--text))] outline-none" />
                      <button onClick={() => renameSujet(s.id)} className="px-1.5 rounded bg-[hsl(var(--accent))] text-white"><Check className="w-3 h-3" /></button>
                      <button onClick={() => setRenameSujetId(null)} className="px-1.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))]"><X className="w-3 h-3" /></button>
                    </div>
                  ) : confirmDeleteSujet === s.id ? (
                    <div className="px-2 py-2 rounded-md border border-[hsl(var(--red))]/40 bg-[hsl(var(--red))]/5">
                      <p className="text-[10.5px] text-[hsl(var(--red))] mb-1.5 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Supprimer "{s.name}" ?
                      </p>
                      <p className="text-[10px] text-[hsl(var(--text-3))] mb-2">Sources exclusives + articles RAG supprimés.</p>
                      <div className="flex gap-1">
                        <button onClick={() => deleteSujet(s.id)}
                          className="flex-1 py-0.5 rounded bg-[hsl(var(--red))] text-white text-[10.5px] font-bold">Supprimer</button>
                        <button onClick={() => setConfirmDeleteSujet(null)}
                          className="flex-1 py-0.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-2))] text-[10.5px]">Annuler</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                      activeSujet?.id === s.id
                        ? 'bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]'
                        : 'hover:bg-[hsl(var(--bg-2))]'
                    }`} onClick={() => openSujet(s)}>
                      <Tag className={`w-3 h-3 flex-shrink-0 ${activeSujet?.id === s.id ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-3))]'}`} />
                      <span className={`text-[12px] flex-1 truncate ${activeSujet?.id === s.id ? 'text-[hsl(var(--accent))] font-semibold' : 'text-[hsl(var(--text-2))]'}`}>
                        {s.name}
                      </span>
                      <span className="text-[10px] font-mono text-[hsl(var(--text-3))] group-hover/s:hidden">{s.source_count}</span>
                      <div className="hidden group-hover/s:flex items-center gap-0.5">
                        <button onClick={e => { e.stopPropagation(); setRenameSujetId(s.id); setRenameSujetVal(s.name) }}
                          className="p-0.5 rounded hover:text-[hsl(var(--accent))] text-[hsl(var(--text-3))] transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={e => { e.stopPropagation(); setConfirmDeleteSujet(s.id) }}
                          className="p-0.5 rounded hover:text-[hsl(var(--red))] text-[hsl(var(--text-3))] transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>
            {visibleSujets.length === 0 && (
              <p className="text-[11px] text-[hsl(var(--text-3))] px-2 py-3">
                Aucun sujet — cliquez + pour en créer un.
              </p>
            )}
          </div>
          </motion.div>}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Panneau droit : détail du sujet ── */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          {!activeSujet ? (
            <motion.div key="empty"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col items-center justify-center gap-3 text-[hsl(var(--text-3))]">
              <Folder className="w-10 h-10 opacity-20" />
              <p className="text-[12.5px] font-mono">Sélectionnez un sujet pour le gérer</p>
            </motion.div>
          ) : (
            <motion.div key={activeSujet.id}
              initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
              className="h-full flex flex-col overflow-hidden">

              {/* Header sujet */}
              <div className="flex-shrink-0 px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-1))]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <Tag className="w-4 h-4 text-[hsl(var(--accent))]" />
                      <h2 className="text-[15px] font-bold text-[hsl(var(--text))]">{activeSujet.name}</h2>
                      {sujetLoading && <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--text-3))] animate-spin" />}
                    </div>
                    <div className="flex items-center gap-4 mt-1.5">
                      <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                        <Radio className="w-2.5 h-2.5 inline mr-1" />
                        {activeSujet.source_count} source{activeSujet.source_count !== 1 ? 's' : ''}
                      </span>
                      <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                        <BookOpen className="w-2.5 h-2.5 inline mr-1" />
                        {activeSujet.item_count} articles
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Corps scrollable — deux sections en hauteur fixe */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

                {/* Profil de connaissance */}
                <section className="panel overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                    <div className="flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                      <span className="text-[12px] font-bold text-[hsl(var(--text))]">Profil de connaissance</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={suggestProfile} disabled={suggesting || editProfile}
                        className="flex items-center gap-1 text-[10.5px] font-mono text-[hsl(var(--violet))] hover:text-[hsl(var(--accent))] transition-colors disabled:opacity-40">
                        {suggesting
                          ? <><Loader2 className="w-3 h-3 animate-spin" /> Génération…</>
                          : <><Sparkles className="w-3 h-3" /> Suggérer avec l'IA</>}
                      </button>
                      <button onClick={() => {
                        if (editProfile) { setEditProfile(false); setProfileDraft(null); setProfileDraftRaw({}) }
                        else { openEditProfile({ ...activeSujet.knowledge_profile }) }
                      }}
                        className="flex items-center gap-1 text-[10.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                        {editProfile ? <><X className="w-3 h-3" /> Annuler</> : <><Settings2 className="w-3 h-3" /> Modifier</>}
                      </button>
                    </div>
                  </div>
                  <div className="px-4 py-3 space-y-4">
                    {(['official_domains', 'recognized_domains', 'trusted_queries', 'keywords'] as const).map(key => {
                      const labels: Record<string, string> = {
                        official_domains: 'Domaines officiels',
                        recognized_domains: 'Domaines reconnus',
                        trusted_queries: 'Requêtes de confiance',
                        keywords: 'Mots-clés',
                      }
                      const tooltips: Record<string, string> = {
                        trusted_queries: 'Requêtes envoyées à SearXNG pour découvrir de nouveaux contenus. Chaque nuit, Argos relance ces recherches et ingère les résultats pertinents dans le RAG.',
                      }
                      const items: string[] = activeSujet.knowledge_profile[key] || []
                      const rows = key === 'trusted_queries' ? 6 : key === 'keywords' ? 6 : 5
                      return (
                        <div key={key}>
                          <div className="flex items-center gap-1.5 mb-2">
                            <p className="text-[10px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
                              {labels[key]}
                            </p>
                            {tooltips[key] && (
                              <div className="group/tip relative">
                                <Info className="w-3 h-3 text-[hsl(var(--text-3))] cursor-help hover:text-[hsl(var(--accent))] transition-colors" />
                                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-50
                                                opacity-0 group-hover/tip:opacity-100 transition-opacity w-64">
                                  <div className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line-bright))]
                                                  text-[10.5px] text-[hsl(var(--text-2))] px-3 py-2 rounded-md shadow-lg leading-relaxed">
                                    {tooltips[key]}
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                          {editProfile ? (
                            <textarea
                              value={profileDraftRaw[key] ?? ''}
                              onChange={e => setProfileDraftRaw(prev => ({ ...prev, [key]: e.target.value }))}
                              rows={rows}
                              placeholder="Une entrée par ligne"
                              className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded px-3 py-2
                                         text-[11.5px] font-mono text-[hsl(var(--text))] outline-none resize-none
                                         focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] leading-relaxed"
                            />
                          ) : items.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {items.map((item, i) => (
                                <span key={i} className="text-[10.5px] font-mono px-2 py-0.5 rounded
                                                          bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))]
                                                          text-[hsl(var(--text-2))]">
                                  {item}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <p className="text-[11px] text-[hsl(var(--text-3))] italic">Non défini</p>
                          )}
                        </div>
                      )
                    })}
                    {editProfile && (
                      <motion.button onClick={saveProfile} disabled={saving} whileTap={{ scale: 0.97 }}
                        className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-white
                                   text-[12px] font-bold disabled:opacity-50 transition-opacity">
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                        Enregistrer le profil
                      </motion.button>
                    )}
                  </div>
                </section>

                {/* Sources rattachées — repliable */}
                <section className="panel overflow-hidden">
                  <button onClick={() => setSourcesOpen(v => !v)}
                    className="w-full flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] hover:bg-[hsl(var(--bg-3))] transition-colors text-left">
                    <Radio className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                    <span className="text-[12px] font-bold text-[hsl(var(--text))]">Sources surveillées</span>
                    <span className="ml-auto text-[10.5px] font-mono text-[hsl(var(--text-3))] mr-1">
                      {activeSujet.sources?.length ?? 0} source{(activeSujet.sources?.length ?? 0) !== 1 ? 's' : ''}
                    </span>
                    <ChevronRight className={`w-3.5 h-3.5 text-[hsl(var(--text-3))] transition-transform flex-shrink-0 ${sourcesOpen ? 'rotate-90' : ''}`} />
                  </button>
                  <AnimatePresence>
                    {sourcesOpen && (
                      <motion.div
                        key="sources-body"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        {sujetLoading ? (
                          <div className="px-4 py-6 flex justify-center">
                            <Loader2 className="w-4 h-4 text-[hsl(var(--accent))] animate-spin" />
                          </div>
                        ) : !activeSujet.sources || activeSujet.sources.length === 0 ? (
                          <div className="px-4 py-4 text-center">
                            <p className="text-[11.5px] text-[hsl(var(--text-3))]">
                              Aucune source — utilisez "Ajouter des sources" depuis la page Veille.
                            </p>
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto divide-y divide-[hsl(var(--line))]">
                            {activeSujet.sources.map(src => (
                              <div key={src.id} className="flex items-center gap-3 px-4 py-2 hover:bg-[hsl(var(--bg-2))] transition-colors">
                                <button onClick={() => toggleSource(src.id, src.active)}
                                  className="flex-shrink-0 text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                                  {src.active
                                    ? <ToggleRight className="w-4 h-4 text-[hsl(var(--accent))]" />
                                    : <ToggleLeft className="w-4 h-4" />}
                                </button>
                                <div className="min-w-0 flex-1">
                                  <p className={`text-[11.5px] font-medium truncate ${src.active ? 'text-[hsl(var(--text))]' : 'text-[hsl(var(--text-3))]'}`}>
                                    {src.name}
                                  </p>
                                  <a href={src.url} target="_blank" rel="noreferrer"
                                    className="text-[10px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 truncate">
                                    <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                                    <span className="truncate">{src.url}</span>
                                  </a>
                                </div>
                                <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] flex-shrink-0">
                                  {src.type}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </section>

              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
