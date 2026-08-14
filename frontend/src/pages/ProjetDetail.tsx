import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Loader2, AlertCircle, Folder, Users,
  FileText, Plus, Check, X, Sparkles, Settings, Save
} from 'lucide-react'
import { api } from '@/services/api'

type Tab = 'sujets' | 'membres' | 'propositions' | 'reglages'

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

  // Source suggestions
  const [suggesting, setSuggesting]           = useState(false)
  const [suggestions, setSuggestions]         = useState<any[]>([])
  const [suggestError, setSuggestError]       = useState<string | null>(null)
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<number>>(new Set())

  useEffect(() => {
    Promise.all([
      api.getProject(projectId),
      api.listProjectMembers(projectId),
      api.listSourceProposals(projectId),
    ])
      .then(([p, m, props]) => {
        setProject(p); setMembers(m); setProposals(props)
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
  }, [projectId])

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
      const res = await api.suggestProjectSources(projectId)
      setSuggestions(res.candidates || [])
      setSelectedSuggestions(new Set(res.candidates?.map((_: any, i: number) => i) || []))
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

  async function handleReview(proposalId: number, decision: 'approved' | 'rejected') {
    try {
      const updated = await api.reviewProposal(projectId, proposalId, { decision })
      setProposals(prev => prev.map(p => p.id === proposalId ? updated : p))
    } catch (e: any) { setError(e.message) }
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
            { id: 'propositions' as Tab, icon: FileText, label: `Propositions (${proposals.filter(p => p.status === 'pending').length})` },
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

        {/* Tab content */}
        <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }}>

          {/* ── Sujets ──────────────────────────────────────────────────── */}
          {tab === 'sujets' && (
            <div className="space-y-3">
              {cdcSubjects.length === 0 && !project.cdc_analysis && (
                <div className="text-center py-12 space-y-3">
                  <Folder className="w-8 h-8 mx-auto text-[hsl(var(--text-3))]" />
                  <p className="text-[14px] text-[hsl(var(--text-2))]">Aucun sujet pour l'instant</p>
                  <p className="text-[12px] text-[hsl(var(--text-3))]">
                    Calibrez le projet pour générer automatiquement l'arborescence de sujets.
                  </p>
                </div>
              )}
              {cdcSubjects.map((s: any, i: number) => (
                <div key={i}
                  className="flex items-center gap-4 px-4 py-3 rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))]">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                       style={{ background: 'hsl(var(--accent)/.12)' }}>
                    <Folder className="w-4 h-4 text-[hsl(var(--accent))]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-[hsl(var(--text))]">{s.name}</p>
                    {s.sub_subjects?.length > 0 && (
                      <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">{s.sub_subjects.join(' · ')}</p>
                    )}
                  </div>
                  <span className={`flex-shrink-0 px-2 py-0.5 rounded text-[10px] font-mono border ${
                    s.priority === 'high'
                      ? 'bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))] border-[hsl(var(--accent)/.3)]'
                      : s.priority === 'medium'
                      ? 'bg-[hsl(var(--yellow)/.1)] text-[hsl(var(--yellow))] border-[hsl(var(--yellow)/.3)]'
                      : 'bg-[hsl(var(--line))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]'
                  }`}>
                    {s.priority}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* ── Membres ─────────────────────────────────────────────────── */}
          {tab === 'membres' && (
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
                    className="btn-primary flex items-center gap-1.5 whitespace-nowrap"
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
                                      className="btn-primary text-[12px] whitespace-nowrap">
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
          )}

          {/* ── Propositions ────────────────────────────────────────────── */}
          {tab === 'propositions' && (
            <div className="space-y-4">

              {/* Suggestions automatiques */}
              <div className="card space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[hsl(var(--text))]">Découverte automatique</p>
                    <p className="text-[12px] text-[hsl(var(--text-3))] mt-0.5">Argos analyse le bilan du projet et propose des sources de veille adaptées.</p>
                  </div>
                  <button onClick={handleSuggestSources} disabled={suggesting}
                    className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
                    {suggesting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                    {suggesting ? 'Recherche…' : 'Suggérer des sources'}
                  </button>
                </div>
                {suggestError && <p className="text-[12px] text-[hsl(var(--red))]">{suggestError}</p>}
                {suggestions.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[12px] text-[hsl(var(--text-2))]">{suggestions.length} source(s) suggérée(s) — sélectionne celles à ajouter</p>
                      <div className="flex gap-2">
                        <button onClick={() => setSelectedSuggestions(new Set(suggestions.map((_: any, i: number) => i)))}
                          className="text-[11px] text-[hsl(var(--accent))] hover:underline">Tout</button>
                        <button onClick={() => setSelectedSuggestions(new Set())}
                          className="text-[11px] text-[hsl(var(--text-3))] hover:underline">Aucun</button>
                      </div>
                    </div>
                    {suggestions.map((s: any, i: number) => (
                      <label key={i} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedSuggestions.has(i)
                          ? 'border-[hsl(var(--accent)/.4)] bg-[hsl(var(--accent)/.05)]'
                          : 'border-[hsl(var(--line))] bg-[hsl(var(--bg))]'
                      }`}>
                        <input type="checkbox" checked={selectedSuggestions.has(i)}
                          onChange={e => {
                            const next = new Set(selectedSuggestions)
                            e.target.checked ? next.add(i) : next.delete(i)
                            setSelectedSuggestions(next)
                          }}
                          className="mt-0.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[13px] font-medium text-[hsl(var(--text))] truncate">{s.name || s.title || s.url}</p>
                          <p className="text-[11px] font-mono text-[hsl(var(--text-3))] truncate">{s.url}</p>
                          {s.description && <p className="text-[12px] text-[hsl(var(--text-2))] mt-1 line-clamp-2">{s.description}</p>}
                          {s.source_type && <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-[hsl(var(--line))] text-[hsl(var(--text-3))]">{s.source_type}</span>}
                        </div>
                      </label>
                    ))}
                    <button onClick={handleAddSuggestions} disabled={selectedSuggestions.size === 0}
                      className="btn-primary w-full">
                      Ajouter {selectedSuggestions.size} source(s) aux propositions
                    </button>
                  </div>
                )}
              </div>

              {/* Propose form */}
              <div className="card space-y-3">
                <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">Proposer une source manuellement</p>
                <div className="flex gap-2">
                  <input
                    value={proposeUrl} onChange={e => setProposeUrl(e.target.value)}
                    placeholder="https://..."
                    className="flex-1 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[12px] font-mono px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                    onKeyDown={e => e.key === 'Enter' && handlePropose()}
                  />
                  <select
                    value={proposeType} onChange={e => setProposeType(e.target.value)}
                    className="w-28 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                  >
                    <option value="website">Site</option>
                    <option value="rss">RSS</option>
                    <option value="github">GitHub</option>
                    <option value="other">Autre</option>
                  </select>
                </div>
                <input
                  value={proposeName} onChange={e => setProposeName(e.target.value)}
                  placeholder="Nom lisible (optionnel)"
                  className="w-full rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[hsl(var(--text))] text-[13px] px-3 py-2 placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent))] transition-colors"
                />
                <button
                  onClick={handlePropose}
                  disabled={!proposeUrl.trim() || proposing}
                  className="btn-primary flex items-center gap-1.5"
                >
                  {proposing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  Proposer
                </button>
                {proposeError && (
                  <p className="text-[12px] text-[hsl(var(--red))]">{proposeError}</p>
                )}
              </div>

              {/* Proposals list */}
              <div className="space-y-2">
                {proposals.length === 0 && (
                  <p className="text-center py-8 text-[13px] text-[hsl(var(--text-3))]">Aucune proposition</p>
                )}
                {proposals.map(p => (
                  <div key={p.id}
                    className="flex items-center justify-between gap-4 px-4 py-3 rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))]">
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-medium text-[hsl(var(--text))] truncate">{p.name || p.url}</p>
                      <p className="text-[11px] font-mono text-[hsl(var(--text-3))] truncate">{p.url}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                        p.status === 'approved'
                          ? 'bg-[hsl(var(--aqua)/.1)] text-[hsl(var(--aqua))] border-[hsl(var(--aqua)/.3)]'
                          : p.status === 'rejected'
                          ? 'bg-[hsl(var(--red)/.1)] text-[hsl(var(--red))] border-[hsl(var(--red)/.3)]'
                          : 'bg-[hsl(var(--yellow)/.1)] text-[hsl(var(--yellow))] border-[hsl(var(--yellow)/.3)]'
                      }`}>
                        {p.status}
                      </span>
                      {p.status === 'pending' && (
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleReview(p.id, 'approved')}
                            className="w-6 h-6 rounded flex items-center justify-center bg-[hsl(var(--aqua)/.12)] text-[hsl(var(--aqua))] hover:bg-[hsl(var(--aqua)/.25)] transition-colors"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => handleReview(p.id, 'rejected')}
                            className="w-6 h-6 rounded flex items-center justify-center bg-[hsl(var(--red)/.12)] text-[hsl(var(--red))] hover:bg-[hsl(var(--red)/.25)] transition-colors"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* ── Réglages ────────────────────────────────────────────────── */}
          {tab === 'reglages' && settings && (
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
                  className="btn-primary flex items-center gap-2"
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : settingsSaved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                  {settingsSaved ? 'Sauvegardé' : 'Sauvegarder'}
                </button>
              </div>
            </div>
          )}

        </motion.div>
      </div>
    </div>
  )
}
