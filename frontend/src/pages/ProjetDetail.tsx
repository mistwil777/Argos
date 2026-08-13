import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Loader2, AlertCircle, Folder, Users,
  FileText, Plus, Check, X, ChevronRight, Sparkles
} from 'lucide-react'
import { api } from '@/services/api'

type Tab = 'sujets' | 'membres' | 'propositions'

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

  // Propose source form
  const [proposeUrl, setProposeUrl]     = useState('')
  const [proposeType, setProposeType]   = useState('website')
  const [proposeName, setProposeName]   = useState('')
  const [proposing, setProposing]       = useState(false)
  const [proposeError, setProposeError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      api.getProject(projectId),
      api.listProjectMembers(projectId),
      api.listSourceProposals(projectId),
    ])
      .then(([p, m, props]) => { setProject(p); setMembers(m); setProposals(props) })
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

  const subjects = project.knowledge_profile ? [] : []  // populated via cdc_analysis
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
                    className="input flex-1"
                    onKeyDown={e => e.key === 'Enter' && handleInvite()}
                  />
                  <select
                    value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    className="input w-28"
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
                {members.map((m, i) => (
                  <div key={m.id}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))]">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[hsl(var(--accent)/.2)] flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-[hsl(var(--accent))]">
                          {(m.invited_email || '?')[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <p className="text-[13px] text-[hsl(var(--text))]">{m.invited_email || `Utilisateur #${m.user_id}`}</p>
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">{m.role}</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                      m.status === 'active'
                        ? 'bg-[hsl(var(--aqua)/.1)] text-[hsl(var(--aqua))] border-[hsl(var(--aqua)/.3)]'
                        : 'bg-[hsl(var(--line))] text-[hsl(var(--text-3))] border-[hsl(var(--line))]'
                    }`}>
                      {m.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Propositions ────────────────────────────────────────────── */}
          {tab === 'propositions' && (
            <div className="space-y-4">
              {/* Propose form */}
              <div className="card space-y-3">
                <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">Proposer une source</p>
                <div className="flex gap-2">
                  <input
                    value={proposeUrl} onChange={e => setProposeUrl(e.target.value)}
                    placeholder="https://..."
                    className="input flex-1 font-mono text-[12px]"
                    onKeyDown={e => e.key === 'Enter' && handlePropose()}
                  />
                  <select
                    value={proposeType} onChange={e => setProposeType(e.target.value)}
                    className="input w-28"
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
                  className="input w-full"
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
        </motion.div>
      </div>
    </div>
  )
}
