import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Loader2, AlertCircle, Folder, Users,
  FileText, Plus, Check, X, Sparkles, Settings, Save,
  Key, Copy, Trash2, Terminal, BarChart3, Play, Newspaper, RefreshCw, ChevronDown
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'
import BriefingPanel from '@/components/BriefingPanel'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

type Tab = 'sujets' | 'membres' | 'propositions' | 'briefing' | 'ide' | 'metriques' | 'reglages'

export default function ProjetDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const projectId = Number(id)

  const [project, setProject]       = useState<any>(null)
  const [members, setMembers]       = useState<any[]>([])
  const [proposals, setProposals]   = useState<any[]>([])
  const [tab, setTab]               = useState<Tab>('sujets')
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState<string | null>(null)

  // Invite form
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole]   = useState('editor')
  const [inviting, setInviting]       = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)

  // Settings form
  const [settings, setSettings] = useState<any>(null)
  const [savingSettings, setSavingSettings] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)

  // Member actions
  const [transferTarget, setTransferTarget] = useState<number | null>(null)
  const [transferring, setTransferring]     = useState(false)
  const [confirmRemove, setConfirmRemove]   = useState<number | null>(null)
  const [expandedMember, setExpandedMember] = useState<number | null>(null)

  // Propose source form
  const [proposeUrl, setProposeUrl]     = useState('')
  const [proposeType, setProposeType]   = useState('website')
  const [proposeName, setProposeName]   = useState('')
  const [proposing, setProposing]       = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  // Pipeline
  const [pipelineRunning, setPipelineRunning] = useState(false)
  const [pipelineResult, setPipelineResult]   = useState<{launched: number; message?: string} | null>(null)
  const [briefingRefreshKey, setBriefingRefreshKey] = useState(0)

  // Source proposals grouped by subject
  const [subjectProposals, setSubjectProposals] = useState<any[]>([])  // [{id, name, proposals:[]}]
  const [expandedSubject, setExpandedSubject]   = useState<number | null>(null)
  const [selectedProposals, setSelectedProposals] = useState<Set<number>>(new Set())

  // Source suggestions
  // ── API Keys IDE ──────────────────────────────────────────────────────────
  const [apiKeys, setApiKeys]               = useState<any[]>([])
  const [generatingKey, setGeneratingKey]   = useState(false)
  const [newKey, setNewKey]                 = useState<string | null>(null)
  const [copiedKey, setCopiedKey]           = useState(false)
  const [copiedConfig, setCopiedConfig]     = useState<string | null>(null)

  const [suggesting, setSuggesting]           = useState(false)
  const [suggestions, setSuggestions]         = useState<any[]>([])
  const [suggestError, setSuggestError]       = useState<string | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())

  useEffect(() => {
    api.listProjectApiKeys(projectId).then(setApiKeys).catch(() => {})
  }, [projectId])

  function loadSubjectProposals() {
    api.getSourceProposalsBySubject(projectId)
      .then(res => setSubjectProposals(res.subjects || []))
      .catch(() => {})
  }

  useEffect(() => {
    Promise.all([
      api.getProject(projectId),
      api.listProjectMembers(projectId),
      api.listSourceProposals(projectId),
    ])
      .then(([p, m, props]) => {
        setProject(p); setMembers(m); setProposals(props)
        // Auto-sélectionner les sources approuvées
        setSelectedProposals(new Set(props.filter((pr: any) => pr.status === 'approved').map((pr: any) => pr.id)))
        setSettings({
          name: p.name || '',
          description: p.description || '',
          client_name: p.client_name || '',
          deadline: p.deadline || '',
          brief_hour: p.brief_hour ?? 7,
          brief_window_hours: p.brief_window_hours ?? 24,
          brief_language: p.brief_language || 'fr',
          alert_keywords: (p.alert_keywords || []).join(', '),
          brief_recipients: (p.brief_recipients || []).join(', '),
          visibility: p.visibility || 'private',
          manager_name: p.manager_name || '',
          manager_email: p.manager_email || '',
          manager_phone: p.manager_phone || '',
          manager_role: p.manager_role || '',
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
    loadSubjectProposals()
  }, [projectId])

  // Recharge les proposals quand on revient sur Sujets ou Propositions
  useEffect(() => {
    if (tab === 'sujets' || tab === 'propositions') loadSubjectProposals()
  }, [tab])

  async function handleInvite() {
    if (!inviteEmail.trim()) return
    setInviting(true); setInviteError(null)
    try {
      const m = await api.inviteProjectMember(projectId, { email: inviteEmail, role: inviteRole })
      setMembers(prev => [...prev, m])
      setInviteEmail('')
    } catch (e: any) { setInviteError(e.message) }
    finally { setInviting(false) }
  }

  async function handleRoleChange(memberId: number, role: string) {
    try {
      const updated = await api.updateProjectMemberRole(projectId, memberId, role)
      setMembers(prev => prev.map(m => m.id === memberId ? updated : m))
    } catch (e: any) { alert(e.message) }
  }

  async function handleRemoveMember(memberId: number) {
    try {
      await api.removeProjectMember(projectId, memberId)
      setMembers(prev => prev.filter(m => m.id !== memberId))
      setConfirmRemove(null)
    } catch (e: any) { alert(e.message) }
  }

  async function handleTransferOwnership() {
    if (!transferTarget) return
    setTransferring(true)
    try {
      const updated = await api.transferProjectOwnership(projectId, transferTarget)
      setMembers(updated)
      setTransferTarget(null)
    } catch (e: any) { alert(e.message) }
    finally { setTransferring(false) }
  }

  async function handleSuggestSources() {
    setSuggesting(true); setSuggestError(null); setSuggestions([])
    try {
      await api.suggestProjectSources(projectId)
      loadSubjectProposals()
      // Recharger les proposals flat aussi
      api.listSourceProposals(projectId).then(props => {
        setProposals(props)
        setSelectedProposals(new Set(props.filter((pr: any) => pr.status === 'approved').map((pr: any) => pr.id)))
      }).catch(() => {})
    } catch (e: any) { setSuggestError(e.message) }
    finally { setSuggesting(false) }
  }

  async function handleAddSuggestions() {
    const toAdd = suggestions.filter((_: any, i: number) => selectedSuggestions.has(i))
    for (const s of toAdd) {
      try {
        const p = await api.proposeSource(projectId, {
          url: s.url, source_type: s.source_type || 'website', name: s.name || s.title || undefined,
        })
        setProposals(prev => [p, ...prev])
      } catch {}
    }
    setSuggestions([])
    setSelectedSuggestions(new Set())
  }

  async function handlePropose() {
    if (!proposeUrl.trim()) return
    setProposing(true); setProposeError(null)
    try {
      const p = await api.proposeSource(projectId, {
        url: proposeUrl, source_type: proposeType, name: proposeName || undefined,
      })
      setProposals(prev => [p, ...prev])
      setProposeUrl(''); setProposeName('')
    } catch (e: any) { setProposeError(e.message) }
    finally { setProposing(false) }
  }

  async function handleSaveSettings() {
    if (!settings) return
    setSavingSettings(true)
    try {
      const payload: any = {
        name: settings.name || undefined,
        description: settings.description || undefined,
        client_name: settings.client_name || undefined,
        deadline: settings.deadline || undefined,
        brief_hour: Number(settings.brief_hour),
        brief_window_hours: Number(settings.brief_window_hours),
        brief_language: settings.brief_language,
        alert_keywords: settings.alert_keywords.split(',').map((s: string) => s.trim()).filter(Boolean),
        brief_recipients: settings.brief_recipients.split(',').map((s: string) => s.trim()).filter(Boolean),
        visibility: settings.visibility,
        manager_name: settings.manager_name || undefined,
        manager_email: settings.manager_email || undefined,
        manager_phone: settings.manager_phone || undefined,
        manager_role: settings.manager_role || undefined,
      }
      const updated = await api.updateProject(projectId, payload)
      setProject(updated)
      setSettingsSaved(true)
      setTimeout(() => setSettingsSaved(false), 2000)
    } catch (e: any) { setError(e.message) }
    finally { setSavingSettings(false) }
  }

  async function handleRunPipeline(proposalIds?: number[]) {
    setPipelineRunning(true); setPipelineResult(null)
    try {
      const res = await api.runProjectPipeline(projectId, proposalIds)
      setPipelineResult(res)
      setSelectedProposals(new Set())
      setBriefingRefreshKey(k => k + 1)
      setTab('briefing')
    } catch (e: any) { setError(e.message) }
    finally { setPipelineRunning(false) }
  }

  async function handleReview(proposalId: number, decision: 'approved' | 'rejected') {
    try {
      const updated = await api.reviewProposal(projectId, proposalId, { decision })
      setProposals(prev => prev.map(p => p.id === proposalId ? updated : p))
      setSelectedProposals(prev => {
        const next = new Set(prev)
        if (decision === 'approved') next.add(proposalId)
        else next.delete(proposalId)
        return next
      })
    } catch (e: any) { setError(e.message) }
  }

  async function handleGenerateKey() {
    setGeneratingKey(true)
    try {
      const result = await api.createProjectApiKey(projectId)
      setNewKey(result.key)
      setApiKeys(prev => [...prev, { id: result.id, key_prefix: result.key_prefix, created_at: result.created_at, last_used_at: null, is_active: true }])
    } catch (e: any) { setError(e.message) }
    finally { setGeneratingKey(false) }
  }

  async function handleRevokeKey(keyId: number) {
    try {
      await api.revokeProjectApiKey(projectId, keyId)
      setApiKeys(prev => prev.filter(k => k.id !== keyId))
    } catch (e: any) { setError(e.message) }
  }

  function copyToClipboard(text: string, label: string) {
    navigator.clipboard.writeText(text)
    if (label === 'key') { setCopiedKey(true); setTimeout(() => setCopiedKey(false), 2000) }
    else { setCopiedConfig(label); setTimeout(() => setCopiedConfig(null), 2000) }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--text-3))]" />
    </div>
  )

  if (error || !project) return (
    <div className="px-8 py-7">
      <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[hsl(var(--red)/.3)] bg-[hsl(var(--red)/.08)] text-[hsl(var(--red))] text-[13px]">
        <AlertCircle className="w-4 h-4 flex-shrink-0" />
        {error || 'Projet introuvable'}
      </div>
    </div>
  )

  const cdcSubjects = project.cdc_analysis?.subjects || []

  return (
    <div className="h-full overflow-auto px-8 py-7">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/projets')}
            className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <h2 className="text-[15px] font-semibold text-[hsl(var(--text))] truncate">{project.name}</h2>
              {project.cdc_analysis ? (
                <span className="flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-mono bg-[hsl(var(--aqua)/.12)] text-[hsl(var(--aqua))] border border-[hsl(var(--aqua)/.2)]">
                  Calibré
                </span>
              ) : (
                <button
                  onClick={() => navigate(`/projets/nouveau`)}
                  className="flex-shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[hsl(var(--yellow)/.12)] text-[hsl(var(--yellow))] border border-[hsl(var(--yellow)/.2)] hover:brightness-125 transition-all"
                >
                  <Sparkles className="w-3 h-3" />
                  Calibrer
                </button>
              )}
            </div>
            {project.description && (
              <p className="text-[12px] text-[hsl(var(--text-3))] mt-0.5 truncate">{project.description}</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-lg bg-[hsl(var(--bg-1))] border border-[hsl(var(--line))] w-fit">
          {([
            { id: 'sujets' as Tab, icon: Folder, label: 'Sujets' },
            { id: 'membres' as Tab, icon: Users, label: `Membres (${members.length})` },
            { id: 'propositions' as Tab, icon: FileText, label: `Propositions (${proposals.filter(p => p.status !== 'rejected').length})` },
            { id: 'briefing' as Tab, icon: Newspaper, label: 'Briefing' },
            { id: 'ide' as Tab, icon: Terminal, label: 'Connexion IDE' },
            { id: 'metriques' as Tab, icon: BarChart3, label: 'Métriques' },
            { id: 'reglages' as Tab, icon: Settings, label: 'Réglages' },
          ]).map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-[13px] font-medium transition-all ${
                tab === t.id
                  ? 'bg-[hsl(var(--accent))] text-white'
                  : 'text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]'
              }`}
            >
              <t.icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab content — tous les onglets restent montés (traitements non interrompus, état préservé) */}
        <div>

          {/* ── Sujets ──────────────────────────────────────────────────── */}
          <div hidden={tab !== 'sujets'}>
            <div className="space-y-3">
              {cdcSubjects.length === 0 && !project.cdc_analysis && (
                <div className="text-center py-12 space-y-3">
                  <Folder className="w-8 h-8 mx-auto text-[hsl(var(--text-3))]" />
                  <p className="text-[14px] text-[hsl(var(--text-2))]">Aucun sujet pour l'instant</p>
                  <p className="text-[12px] text-[hsl(var(--text-3))]">Calibrez le projet pour générer automatiquement l'arborescence de sujets.</p>
                </div>
              )}

              {/* Barre d'action si sélection active */}
              {selectedProposals.size > 0 && (
                <div className="flex items-center justify-between px-4 py-3 rounded-xl border border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.06)]">
                  <p className="text-[13px] text-[hsl(var(--text))]">
                    <span className="font-semibold">{selectedProposals.size}</span> source{selectedProposals.size > 1 ? 's' : ''} sélectionnée{selectedProposals.size > 1 ? 's' : ''}
                  </p>
                  <button
                    onClick={() => handleRunPipeline([...selectedProposals])}
                    disabled={pipelineRunning}
                    className="px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {pipelineRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    {pipelineRunning ? 'En cours…' : 'Collecter et briefer'}
                  </button>
                </div>
              )}

              {/* Liste des sujets avec leurs sources — source de vérité = workspaces */}
              {(subjectProposals.length > 0 ? subjectProposals : cdcSubjects.map((s: any) => ({ name: s.name, proposals: [] }))).map((ws: any, i: number) => {
                // Enrichissement optionnel depuis cdc_analysis (priorité, sub_subjects) par matching partiel
                const cdcMatch = cdcSubjects.find((c: any) => {
                  const a = c.name.toLowerCase(), b = ws.name.toLowerCase()
                  return a === b || a.includes(b.split(' ')[0]) || b.includes(a.split(' ')[0])
                })
                const s = { ...ws, priority: cdcMatch?.priority, sub_subjects: cdcMatch?.sub_subjects }
                const wsProposals: any[] = ws.proposals || []
                // Sources sélectionnables = approved + pending (rejected exclus)
                const selectableProposals = wsProposals.filter((p: any) => p.status !== 'rejected')
                const isExpanded = expandedSubject === i
                const allSelected = selectableProposals.length > 0 && selectableProposals.every((p: any) => selectedProposals.has(p.id))

                return (
                  <div key={i} className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] overflow-hidden">
                    {/* En-tête du sujet */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      {/* Checkbox sujet — sélectionne toutes les sources non-rejetées */}
                      <button
                        onClick={() => {
                          if (selectableProposals.length === 0) return
                          const next = new Set(selectedProposals)
                          if (allSelected) selectableProposals.forEach((p: any) => next.delete(p.id))
                          else selectableProposals.forEach((p: any) => next.add(p.id))
                          setSelectedProposals(next)
                        }}
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                          selectableProposals.length === 0 ? 'border-[hsl(var(--line))] opacity-30 cursor-default'
                          : allSelected ? 'bg-[hsl(var(--accent))] border-[hsl(var(--accent))]'
                          : 'border-[hsl(var(--line))] hover:border-[hsl(var(--accent))]'
                        }`}
                      >
                        {allSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </button>

                      <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                           style={{ background: 'hsl(var(--accent)/.12)' }}>
                        <Folder className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[hsl(var(--text))]">{s.name}</p>
                        {s.sub_subjects?.length > 0 && (
                          <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">{s.sub_subjects.join(' · ')}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                          (s.priority ?? 'low') === 'high' ? 'bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))] border-[hsl(var(--accent)/.3)]'
                          : (s.priority ?? 'low') === 'medium' ? 'bg-[hsl(var(--yellow)/.1)] text-[hsl(var(--yellow))] border-[hsl(var(--yellow)/.3)]'
                          : 'bg-[hsl(var(--line))] text-[hsl(var(--text-2))] border-[hsl(var(--line))]'
                        }`}>{s.priority ?? 'low'}</span>
                        {wsProposals.length > 0 && (
                          <button
                            onClick={() => setExpandedSubject(isExpanded ? null : i)}
                            className="flex items-center gap-1 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors"
                          >
                            <span>{wsProposals.length} source{wsProposals.length > 1 ? 's' : ''}</span>
                            <span className={`transition-transform text-[10px] ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                          </button>
                        )}
                        {wsProposals.length === 0 && (
                          <span className="text-[11px] font-mono text-[hsl(var(--text-3))] opacity-50">aucune source</span>
                        )}
                      </div>
                    </div>

                    {/* Sources expandées */}
                    {isExpanded && wsProposals.length > 0 && (
                      <div className="border-t border-[hsl(var(--line))] bg-[hsl(var(--bg))] px-4 py-3 space-y-2">
                        {wsProposals.map((p: any) => {
                          const isRejected = p.status === 'rejected'
                          const isSelected = selectedProposals.has(p.id)
                          return (
                            <div key={p.id} className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
                              isSelected ? 'border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.05)]'
                              : isRejected ? 'opacity-40 border-[hsl(var(--line)/.5)] bg-[hsl(var(--bg-1))]'
                              : 'border-[hsl(var(--line)/.5)] bg-[hsl(var(--bg-1))]'
                            }`}>
                              <button
                                onClick={() => {
                                  if (isRejected) return
                                  const next = new Set(selectedProposals)
                                  isSelected ? next.delete(p.id) : next.add(p.id)
                                  setSelectedProposals(next)
                                }}
                                className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-all ${
                                  isRejected ? 'border-[hsl(var(--line))] opacity-30 cursor-default'
                                  : isSelected ? 'bg-[hsl(var(--accent))] border-[hsl(var(--accent))]'
                                  : 'border-[hsl(var(--line))] hover:border-[hsl(var(--accent))]'
                                }`}
                              >
                                {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                              </button>
                              <div className="flex-1 min-w-0">
                                <p className="text-[12px] font-medium text-[hsl(var(--text))] truncate">{p.name || p.url}</p>
                                <p className="text-[10px] font-mono text-[hsl(var(--text-3))] truncate">{p.url}</p>
                              </div>
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-mono border ${
                                p.status === 'approved' ? 'bg-[hsl(var(--aqua)/.1)] text-[hsl(var(--aqua))] border-[hsl(var(--aqua)/.3)]'
                                : p.status === 'rejected' ? 'bg-[hsl(var(--red)/.1)] text-[hsl(var(--red))] border-[hsl(var(--red)/.3)]'
                                : 'bg-[hsl(var(--yellow)/.1)] text-[hsl(var(--yellow))] border-[hsl(var(--yellow)/.3)]'
                              }`}>{p.status}</span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>

          {/* ── Membres ─────────────────────────────────────────────────── */}
          <div hidden={tab !== 'membres'}>
            <div className="space-y-4">
              {/* Invite form */}
              <div className="card space-y-3">
                <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">Inviter un membre</p>
                <div className="flex gap-2">
                  <input
                    value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                    placeholder="email@exemple.com"
                    className="flex-1 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  />
                  <select
                    value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    className="w-28 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                  >
                    <option value="editor">Éditeur</option>
                    <option value="reader">Lecteur</option>
                  </select>
                  <button
                    onClick={handleInvite}
                    disabled={!inviteEmail.trim() || inviting}
                    className="px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {inviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Inviter
                  </button>
                </div>
                {inviteError && (
                  <p className="text-[12px] text-[hsl(var(--red))]">{inviteError}</p>
                )}
              </div>

              {/* Members list */}
              <div className="space-y-2">
                {members.map((m) => {
                  const isOwner = m.role === 'owner'
                  const isPending = m.status === 'pending'
                  const isExpanded = expandedMember === m.id
                  return (
                    <div key={m.id} className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] overflow-hidden">
                      {/* Ligne cliquable */}
                      <button
                        onClick={() => setExpandedMember(isExpanded ? null : m.id)}
                        className="w-full flex items-center justify-between px-4 py-3 hover:bg-[hsl(var(--line)/.3)] transition-colors text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                            isOwner ? 'bg-[hsl(var(--yellow)/.2)]' : 'bg-[hsl(var(--accent)/.2)]'
                          }`}>
                            <span className={`text-[12px] font-bold ${isOwner ? 'text-[hsl(var(--yellow))]' : 'text-[hsl(var(--accent))]'}`}>
                              {(m.full_name || m.invited_email || '?')[0].toUpperCase()}
                            </span>
                          </div>
                          <div>
                            {m.full_name && <p className="text-[13px] font-semibold text-[hsl(var(--text))]">{m.full_name}</p>}
                            <p className={`text-[12px] ${m.full_name ? 'text-[hsl(var(--text-2))]' : 'text-[13px] font-medium text-[hsl(var(--text))]'}`}>
                              {m.invited_email || `Utilisateur #${m.user_id}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                            isOwner ? 'bg-[hsl(var(--yellow)/.1)] text-[hsl(var(--yellow))] border-[hsl(var(--yellow)/.3)]'
                            : m.status === 'active' ? 'bg-[hsl(var(--aqua)/.1)] text-[hsl(var(--aqua))] border-[hsl(var(--aqua)/.3)]'
                            : 'bg-[hsl(var(--line))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]'
                          }`}>
                            {isOwner ? 'Propriétaire' : m.role === 'editor' ? 'Éditeur' : 'Lecteur'}
                          </span>
                          {isPending && <span className="px-2 py-0.5 rounded text-[10px] font-mono border bg-[hsl(var(--line))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]">en attente</span>}
                          <span className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>›</span>
                        </div>
                      </button>

                      {/* Panneau d'actions expansible */}
                      {isExpanded && (
                        <div className="border-t border-[hsl(var(--line))] bg-[hsl(var(--bg))] px-4 py-4 space-y-4">
                          {isOwner ? (
                            <>
                              <div>
                                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Droits propriétaire</p>
                                <div className="grid grid-cols-2 gap-1.5">
                                  {['Inviter / retirer des membres','Modifier les rôles','Valider les propositions','Modifier les réglages','Transférer la propriété','Supprimer le projet'].map(r => (
                                    <div key={r} className="flex items-center gap-2">
                                      <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--yellow))] flex-shrink-0" />
                                      <span className="text-[12px] text-[hsl(var(--text-2))]">{r}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                              <div className="border-t border-[hsl(var(--line))] pt-3">
                                <p className="text-[12px] font-medium text-[hsl(var(--text-2))] mb-2">Transférer la propriété</p>
                                {members.filter(x => x.role !== 'owner' && x.status === 'active').length === 0 ? (
                                  <p className="text-[12px] text-[hsl(var(--text-3))] italic">Invitez d'abord un membre et attendez qu'il accepte.</p>
                                ) : (
                                  <div className="flex gap-2">
                                    <select value={transferTarget ?? ''} onChange={e => setTransferTarget(Number(e.target.value) || null)}
                                      className="flex-1 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] text-[hsl(var(--text))] text-[12px] px-3 py-2 focus:outline-none focus:border-[hsl(var(--accent))]">
                                      <option value="">Choisir un membre…</option>
                                      {members.filter(x => x.role !== 'owner' && x.status === 'active').map(x => (
                                        <option key={x.id} value={x.id}>{x.full_name || x.invited_email}</option>
                                      ))}
                                    </select>
                                    <button onClick={handleTransferOwnership} disabled={!transferTarget || transferring}
                                      className="px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity text-[12px] whitespace-nowrap">
                                      {transferring ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Transférer'}
                                    </button>
                                  </div>
                                )}
                              </div>
                            </>
                          ) : (
                            <>
                              {/* Infos membre */}
                              <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[12px]">
                                {m.full_name && (
                                  <><span className="text-[hsl(var(--text-3))]">Nom</span>
                                  <span className="text-[hsl(var(--text))]">{m.full_name}</span></>
                                )}
                                <span className="text-[hsl(var(--text-3))]">Email</span>
                                <span className="text-[hsl(var(--text-2))]">{m.invited_email}</span>
                                {m.invited_at && (
                                  <><span className="text-[hsl(var(--text-3))]">Invité le</span>
                                  <span className="text-[hsl(var(--text-2))]">{new Date(m.invited_at).toLocaleDateString('fr-FR')}</span></>
                                )}
                                {m.joined_at && (
                                  <><span className="text-[hsl(var(--text-3))]">Rejoint le</span>
                                  <span className="text-[hsl(var(--text-2))]">{new Date(m.joined_at).toLocaleDateString('fr-FR')}</span></>
                                )}
                                {m.sujet_access?.length > 0 && (
                                  <><span className="text-[hsl(var(--text-3))]">Accès sujets</span>
                                  <span className="text-[hsl(var(--text-2))]">{m.sujet_access.length} sujet(s)</span></>
                                )}
                              </div>
                              {/* Rôle */}
                              <div className="border-t border-[hsl(var(--line))] pt-3">
                                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Rôle</p>
                                <div className="flex gap-2">
                                  {['editor', 'reader'].map(role => (
                                    <button key={role} onClick={() => handleRoleChange(m.id, role)}
                                      className={`px-4 py-2 rounded-lg border text-[13px] transition-colors ${
                                        m.role === role
                                          ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.15)] text-[hsl(var(--accent))]'
                                          : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent)/.5)]'
                                      }`}>
                                      {role === 'editor' ? 'Éditeur — peut modifier' : 'Lecteur — accès lecture'}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              {/* Retirer */}
                              <div className="border-t border-[hsl(var(--line))] pt-3 flex justify-end">
                                {confirmRemove === m.id ? (
                                  <div className="flex items-center gap-2">
                                    <span className="text-[12px] text-[hsl(var(--text-2))]">Confirmer le retrait ?</span>
                                    <button onClick={() => handleRemoveMember(m.id)}
                                      className="px-3 py-1.5 rounded-lg bg-[hsl(var(--red)/.15)] border border-[hsl(var(--red)/.4)] text-[hsl(var(--red))] text-[12px] hover:bg-[hsl(var(--red)/.25)] transition-colors">
                                      Confirmer
                                    </button>
                                    <button onClick={() => setConfirmRemove(null)}
                                      className="px-3 py-1.5 rounded-lg border border-[hsl(var(--line))] text-[hsl(var(--text-2))] text-[12px] hover:border-[hsl(var(--accent)/.5)] transition-colors">
                                      Annuler
                                    </button>
                                  </div>
                                ) : (
                                  <button onClick={() => setConfirmRemove(m.id)}
                                    className="px-3 py-1.5 rounded-lg border border-[hsl(var(--red)/.4)] text-[hsl(var(--red))] text-[12px] hover:bg-[hsl(var(--red)/.1)] transition-colors">
                                    {isPending ? "Annuler l'invitation" : 'Retirer du projet'}
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

            </div>
          </div>

          {/* ── Propositions ────────────────────────────────────────────── */}
          <div hidden={tab !== 'propositions'}>
            <div className="space-y-5">

              {/* Section 1 — Suggestions LLM en attente de validation */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[hsl(var(--text))]">Suggestions automatiques</p>
                    <p className="text-[12px] text-[hsl(var(--text-3))] mt-0.5">
                      Sources proposées par Argos — validez ou rejetez chacune avant de les collecter.
                    </p>
                  </div>
                  <button onClick={handleSuggestSources} disabled={suggesting}
                    className="px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5 whitespace-nowrap">
                    {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {suggesting ? 'Analyse…' : 'Générer des suggestions'}
                  </button>
                </div>
                {suggestError && <p className="text-[12px] text-[hsl(var(--red))]">{suggestError}</p>}

                {proposals.filter(p => p.status !== 'rejected').length === 0 && (
                  <p className="text-[12px] text-[hsl(var(--text-3))] italic">
                    Aucune suggestion — cliquez "Générer des suggestions" pour démarrer.
                  </p>
                )}

                <div className="space-y-2">
                  {proposals.filter(p => p.status !== 'rejected').map(p => (
                    <div key={p.id}
                      className="flex items-start gap-3 px-3 py-3 rounded-lg border border-[hsl(var(--yellow)/.3)] bg-[hsl(var(--yellow)/.04)]">
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-[hsl(var(--text))] truncate">{p.name || p.url}</p>
                        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] truncate">{p.url}</p>
                        {p.description && (
                          <p className="text-[11px] text-[hsl(var(--text-2))] mt-1 line-clamp-2">{p.description}</p>
                        )}
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        <button onClick={() => handleReview(p.id, 'approved')}
                          className="w-7 h-7 rounded flex items-center justify-center bg-[hsl(var(--aqua)/.12)] text-[hsl(var(--aqua))] hover:bg-[hsl(var(--aqua)/.25)] transition-colors"
                          title="Valider">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleReview(p.id, 'rejected')}
                          className="w-7 h-7 rounded flex items-center justify-center bg-[hsl(var(--red)/.12)] text-[hsl(var(--red))] hover:bg-[hsl(var(--red)/.25)] transition-colors"
                          title="Rejeter">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2 — Ajout manuel */}
              <div className="card space-y-3">
                <p className="text-[13px] font-medium text-[hsl(var(--text))]">Ajout manuel</p>
                <p className="text-[12px] text-[hsl(var(--text-3))]">Proposez une URL directement — elle sera soumise à validation.</p>
                <div className="flex gap-2">
                  <input
                    value={proposeUrl} onChange={e => setProposeUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[12px] font-mono px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                    onKeyDown={e => e.key === 'Enter' && handlePropose()}
                  />
                  <select value={proposeType} onChange={e => setProposeType(e.target.value)}
                    className="w-28 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 focus:outline-none focus:border-[hsl(var(--accent))] transition-colors">
                    <option value="website">Site</option>
                    <option value="rss">RSS</option>
                    <option value="github">GitHub</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <input value={proposeName} onChange={e => setProposeName(e.target.value)}
                  placeholder="Nom lisible (optionnel)"
                  className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                />
                <button onClick={handlePropose} disabled={!proposeUrl.trim() || proposing}
                  className="px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-1.5">
                  {proposing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Proposer
                </button>
                {proposeError && <p className="text-[12px] text-[hsl(var(--red))]">{proposeError}</p>}
              </div>

            </div>
          </div>

          {/* ── Briefing projet ─────────────────────────────────────────── */}
          <div hidden={tab !== 'briefing'}><ProjectBriefingTab projectId={projectId} refreshKey={briefingRefreshKey} /></div>

          {/* ── Connexion IDE ───────────────────────────────────────────── */}
          <div hidden={tab !== 'ide'}>
            <div className="space-y-5">

              {/* Intro */}
              <div className="card space-y-2">
                <p className="text-[13px] text-[hsl(var(--text-2))]">
                  Connectez votre IDE au RAG de ce projet. Chaque clé donne accès en lecture seule
                  au RAG et Knowledge Graph de ce projet — sans accès à votre espace personnel.
                </p>
              </div>

              {/* Modale clé générée */}
              {newKey && (
                <div className="card border border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.06)] space-y-3">
                  <p className="text-[12px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Nouvelle clé — copiez-la maintenant</p>
                  <p className="text-[11px] text-[hsl(var(--text-2))]">Elle ne sera plus affichée après fermeture de cette section.</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 bg-[hsl(var(--bg-1))] border border-[hsl(var(--line))] rounded-lg px-3 py-2 text-[13px] font-mono text-[hsl(var(--text))] truncate">
                      {newKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(newKey, 'key')}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-medium hover:opacity-90 transition-opacity"
                    >
                      {copiedKey ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copiedKey ? 'Copié' : 'Copier'}
                    </button>
                    <button onClick={() => setNewKey(null)} className="p-2 rounded-lg hover:bg-[hsl(var(--bg-1))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Clés actives */}
              <div className="card space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Clés actives</p>
                  <button
                    onClick={handleGenerateKey}
                    disabled={generatingKey}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 transition-all"
                  >
                    {generatingKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    Générer une clé
                  </button>
                </div>

                {apiKeys.length === 0 ? (
                  <p className="text-[13px] text-[hsl(var(--text-3))] py-2">Aucune clé active.</p>
                ) : (
                  <div className="space-y-2">
                    {apiKeys.map(k => (
                      <div key={k.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-[hsl(var(--bg-1))] border border-[hsl(var(--line))]">
                        <div className="space-y-0.5">
                          <p className="text-[13px] font-mono text-[hsl(var(--text))]">{k.key_prefix}…</p>
                          <p className="text-[11px] text-[hsl(var(--text-3))]">
                            Créée le {new Date(k.created_at).toLocaleDateString('fr-FR')}
                            {k.last_used_at && ` · Utilisée le ${new Date(k.last_used_at).toLocaleDateString('fr-FR')}`}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRevokeKey(k.id)}
                          className="p-1.5 rounded-md hover:bg-[hsl(var(--red)/.1)] text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-colors"
                          title="Révoquer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Configs IDE */}
              {apiKeys.length > 0 && (() => {
                const firstKey = apiKeys[0]
                const baseUrl = `${window.location.protocol}//${window.location.hostname}:8000`
                const claudeConfig = JSON.stringify({
                  mcpServers: {
                    [`argos-${project.name?.toLowerCase().replace(/\s+/g, '-') || 'projet'}`]: {
                      type: 'http',
                      url: `${baseUrl}/mcp`,
                      headers: { Authorization: `Bearer ${firstKey.key_prefix}… (remplacez par la clé complète)` }
                    }
                  }
                }, null, 2)

                return (
                  <div className="card space-y-4">
                    <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Configuration IDE</p>
                    <p className="text-[12px] text-[hsl(var(--text-2))]">
                      Ajoutez ce bloc dans votre <code className="font-mono bg-[hsl(var(--bg-1))] px-1 rounded">~/.claude/mcp.json</code> (Claude Desktop) ou dans les paramètres MCP de Cursor / VS Code.
                    </p>
                    <div className="relative">
                      <pre className="bg-[hsl(var(--bg-1))] border border-[hsl(var(--line))] rounded-lg p-4 text-[12px] font-mono text-[hsl(var(--text-2))] overflow-x-auto whitespace-pre-wrap">
                        {claudeConfig}
                      </pre>
                      <button
                        onClick={() => copyToClipboard(claudeConfig, 'claude')}
                        className="absolute top-2 right-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-[hsl(var(--bg))] border border-[hsl(var(--line))] text-[11px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] transition-colors"
                      >
                        {copiedConfig === 'claude' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedConfig === 'claude' ? 'Copié' : 'Copier'}
                      </button>
                    </div>
                    <p className="text-[11px] text-[hsl(var(--text-3))]">
                      Remplacez la valeur <code className="font-mono bg-[hsl(var(--bg-1))] px-1 rounded">Authorization</code> par votre clé complète générée ci-dessus.
                    </p>
                  </div>
                )
              })()}

            </div>
          </div>

          {/* ── Métriques ───────────────────────────────────────────────── */}
          <div hidden={tab !== 'metriques'}><MetriquesTab projectId={Number(id)} /></div>

          {/* ── Réglages ────────────────────────────────────────────────── */}
          <div hidden={tab !== 'reglages'}>{settings && (
            <div className="space-y-6">

              {/* Identité */}
              <div className="card space-y-4">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Identité</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Nom du projet</label>
                    <input value={settings.name} onChange={e => setSettings((s: any) => ({ ...s, name: e.target.value }))}
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Client / organisation</label>
                    <input value={settings.client_name} onChange={e => setSettings((s: any) => ({ ...s, client_name: e.target.value }))}
                      placeholder="Capgemini, SNCF…" className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-[hsl(var(--text-2))]">Description</label>
                  <textarea value={settings.description} onChange={e => setSettings((s: any) => ({ ...s, description: e.target.value }))}
                    rows={2} className="w-full resize-none rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Deadline</label>
                    <input type="date" value={settings.deadline} onChange={e => setSettings((s: any) => ({ ...s, deadline: e.target.value }))}
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Visibilité</label>
                    <select value={settings.visibility} onChange={e => setSettings((s: any) => ({ ...s, visibility: e.target.value }))}
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors">
                      <option value="private">Privé (membres uniquement)</option>
                      <option value="org">Organisation</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Gestionnaire de projet */}
              <div className="card space-y-4">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Gestionnaire de projet</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Nom complet</label>
                    <input value={settings.manager_name} onChange={e => setSettings((s: any) => ({ ...s, manager_name: e.target.value }))}
                      placeholder="Jean Dupont"
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Poste / fonction</label>
                    <input value={settings.manager_role} onChange={e => setSettings((s: any) => ({ ...s, manager_role: e.target.value }))}
                      placeholder="Chef de projet, DSI…"
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Email</label>
                    <input type="email" value={settings.manager_email} onChange={e => setSettings((s: any) => ({ ...s, manager_email: e.target.value }))}
                      placeholder="jean.dupont@entreprise.fr"
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Téléphone</label>
                    <input type="tel" value={settings.manager_phone} onChange={e => setSettings((s: any) => ({ ...s, manager_phone: e.target.value }))}
                      placeholder="+33 6 00 00 00 00"
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  </div>
                </div>
              </div>

              {/* Brief automatique */}
              <div className="card space-y-4">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Brief automatique</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Heure de génération</label>
                    <select value={settings.brief_hour} onChange={e => setSettings((s: any) => ({ ...s, brief_hour: e.target.value }))}
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors">
                      {[5,6,7,8,9,10].map(h => (
                        <option key={h} value={h}>{h}h00</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Fenêtre temporelle</label>
                    <select value={settings.brief_window_hours} onChange={e => setSettings((s: any) => ({ ...s, brief_window_hours: e.target.value }))}
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors">
                      <option value={24}>24h</option>
                      <option value={48}>48h</option>
                      <option value={168}>7 jours</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[12px] text-[hsl(var(--text-2))]">Langue de sortie</label>
                    <select value={settings.brief_language} onChange={e => setSettings((s: any) => ({ ...s, brief_language: e.target.value }))}
                      className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors">
                      <option value="fr">Français</option>
                      <option value="en">English</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-[hsl(var(--text-2))]">Destinataires du brief (emails séparés par des virgules)</label>
                  <input value={settings.brief_recipients}
                    onChange={e => setSettings((s: any) => ({ ...s, brief_recipients: e.target.value }))}
                    placeholder="alice@co.fr, bob@co.fr" className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[12px] font-mono px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                </div>
              </div>

              {/* Alertes */}
              <div className="card space-y-4">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Alertes</p>
                <div className="space-y-1.5">
                  <label className="text-[12px] text-[hsl(var(--text-2))]">Mots-clés d'alerte (séparés par des virgules)</label>
                  <input value={settings.alert_keywords}
                    onChange={e => setSettings((s: any) => ({ ...s, alert_keywords: e.target.value }))}
                    placeholder="GPT-5, concurrent X, faille CVE…" className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[12px] font-mono px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors" />
                  <p className="text-[11px] text-[hsl(var(--text-3))]">
                    Une notification est envoyée dès qu'un article contient l'un de ces termes.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className="px-3 py-1.5 rounded-lg bg-[hsl(var(--accent))] text-white text-[12px] font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center gap-2"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : settingsSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {settingsSaved ? 'Sauvegardé' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}
          </div>

        </div>
      </div>
    </div>
  )
}

function ProjectBriefingTab({ projectId, refreshKey = 0 }: { projectId: number; refreshKey?: number }) {
  const [today, setToday]         = useState<any>(null)
  const [selected, setSelected]   = useState<any>(null)
  const [history, setHistory]     = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [generating, setGenerating] = useState(false)
  const [hours, setHours]         = useState(72)
  const [histOpen, setHistOpen]   = useState(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  useEffect(() => {
    loadAll().then(t => {
      if (refreshKey > 0 && !t?.exists) generate(false)
    })
  }, [refreshKey])

  async function loadAll(): Promise<any> {
    setLoading(true)
    try {
      const [t, h] = await Promise.all([
        api.getProjectBriefingToday(projectId),
        api.listProjectBriefings(projectId),
      ])
      setToday(t)
      setHistory(Array.isArray(h) ? h : [])
      if (t?.exists) setSelected(t)
      return t
    } catch { return null }
    finally { setLoading(false) }
  }

  async function generate(force = false) {
    setGenerating(true)
    try {
      const r = await api.generateProjectBriefing(projectId, hours, force)
      if (r.already_exists) {
        const existing = await api.getBriefing(r.id)
        setToday({ ...existing, exists: true })
        setSelected({ ...existing, exists: true })
      } else if (r.no_new_content) {
        setToday({ exists: false, no_new_content: true })
        setSelected(null)
      } else {
        setToday({ ...r, exists: true })
        setSelected({ ...r, exists: true })
        await loadAll()
      }
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setGenerating(false) }
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

  return (
    <div className="space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
          Briefing — sources du projet uniquement
        </p>
        <div className="flex items-center gap-2">
          <select value={hours} onChange={e => setHours(Number(e.target.value))}
            className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[11.5px] font-mono text-[hsl(var(--text-2))] outline-none">
            {[24, 48, 72, 168].map(h => <option key={h} value={h}>{h === 168 ? '7j' : `${h}h`}</option>)}
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
        <div className="flex justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--text-3))]" />
        </div>
      )}

      {!loading && !selected && !generating && (
        <div className="panel p-10 flex flex-col items-center gap-4 text-center">
          <Newspaper className="w-10 h-10 text-[hsl(var(--text-3))] opacity-30" />
          <div>
            <p className="text-[14px] font-semibold text-[hsl(var(--text))]">Brief non généré</p>
            <p className="text-[12px] text-[hsl(var(--text-3))] mt-1">
              Lancez le pipeline puis générez le brief pour voir les résultats.
            </p>
          </div>
        </div>
      )}

      {selected && !loading && (
        <BriefingPanel briefingData={selected} projectId={projectId} />
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
                    <div key={b.id}
                      className={`flex items-center gap-2 group/row transition-colors ${selected?.id === b.id ? 'bg-[hsl(var(--accent-dim))]' : 'hover:bg-[hsl(var(--bg-2))]'}`}>
                      <button onClick={async () => { const full = await api.getBriefing(b.id); setSelected(full) }}
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
    </div>
  )
}

function MetriquesTab({ projectId }: { projectId: number }) {
  const [metrics, setMetrics] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(30)

  useEffect(() => {
    setLoading(true)
    api.getProjectMetrics(projectId, days)
      .then(d => { setMetrics(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [projectId, days])

  if (loading) return <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" /></div>
  if (!metrics?.quality) return <div className="text-sm text-[hsl(var(--text-3))] p-4">Aucune métrique disponible.</div>

  const q = metrics.quality
  const ScoreChip = ({ v }: { v: number }) => {
    const cls = v >= 4 ? 'text-green-400' : v >= 3 ? 'text-yellow-400' : 'text-red-400'
    return <span className={`font-bold tabular-nums ${cls}`}>{v.toFixed(2)}</span>
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 justify-between">
        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Métriques — {days} derniers jours</p>
        <select value={days} onChange={e => setDays(Number(e.target.value))}
          className="text-[12px] bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-md px-2 py-1">
          {[7, 14, 30, 90].map(d => <option key={d} value={d}>{d}j</option>)}
        </select>
      </div>

      {/* Quality KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Score global', v: q.avg_global },
          { label: 'Fidélité', v: q.avg_fidelity },
          { label: 'Complétude', v: q.avg_completeness },
          { label: 'Pertinence', v: q.avg_relevance },
        ].map(({ label, v }) => (
          <div key={label} className="rounded-xl border border-[hsl(var(--line))] p-3">
            <div className="text-[10px] text-[hsl(var(--text-3))] mb-1">{label}</div>
            <div className="text-xl">{q.total_scored > 0 ? <ScoreChip v={v} /> : <span className="text-[hsl(var(--text-3))]">—</span>}</div>
          </div>
        ))}
      </div>

      {/* Trend */}
      {metrics.quality_trend?.length > 0 && (
        <div className="rounded-xl border border-[hsl(var(--line))] p-4">
          <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mb-3">Évolution score global</p>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={metrics.quality_trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis domain={[1, 5]} tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="avg_global" stroke="hsl(var(--accent))" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Costs */}
      <div className="rounded-xl border border-[hsl(var(--line))] p-4">
        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mb-2">Coûts LLM</p>
        <p className="text-xl font-bold">${metrics.costs.total_usd.toFixed(4)}</p>
        {metrics.costs.by_operation?.length > 0 && (
          <div className="mt-2 space-y-1">
            {metrics.costs.by_operation.map((op: any) => (
              <div key={op.operation_type} className="flex justify-between text-[12px] text-[hsl(var(--text-2))]">
                <span>{op.operation_type}</span>
                <span>${op.cost_usd.toFixed(4)}</span>
              </div>
            ))}
          </div>
        )}
        {q.total_scored === 0 && (
          <p className="mt-3 text-[11px] text-[hsl(var(--text-3))]">
            Aucun digest évalué pour cette période — les scores apparaîtront après le prochain ingest.
          </p>
        )}
      </div>
    </div>
  )
}
