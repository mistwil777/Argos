import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Users, Plus, Trash2, Settings, UserPlus, Crown, Eye, Edit3, Loader2, X, Check } from 'lucide-react'
import { api } from '@/services/api'
import { useAuth } from '@/context/AuthContext'

const ROLE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  owner:  { label: 'Propriétaire', icon: Crown,  color: 'text-[hsl(var(--yellow))]' },
  editor: { label: 'Éditeur',      icon: Edit3,   color: 'text-[hsl(var(--accent))]' },
  viewer: { label: 'Lecteur',      icon: Eye,     color: 'text-[hsl(var(--text-3))]' },
}

interface Workspace { id: number; name: string; description?: string; icon: string; color: string; slug: string }
interface Member { user_identifier: string; role: string; can_read: boolean; can_write: boolean; can_delete: boolean; can_generate: boolean }

export default function Spaces() {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selected,   setSelected]   = useState<Workspace | null>(null)
  const [members,    setMembers]     = useState<Member[]>([])
  const [loading,    setLoading]     = useState(true)
  const [membLoading, setMembLoading] = useState(false)

  // Création espace
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [creating,   setCreating]   = useState(false)

  // Ajout membre
  const [showAddMember, setShowAddMember] = useState(false)
  const [newEmail,      setNewEmail]      = useState('')
  const [newRole,       setNewRole]       = useState('editor')
  const [addingMember,  setAddingMember]  = useState(false)

  useEffect(() => { loadWorkspaces() }, [])

  async function loadWorkspaces() {
    setLoading(true)
    try {
      const res = await api.getWorkspaces()
      const list = Array.isArray(res) ? res : (res.workspaces || [])
      setWorkspaces(list)
      if (list.length > 0 && !selected) selectWorkspace(list[0])
    } finally { setLoading(false) }
  }

  async function selectWorkspace(ws: Workspace) {
    setSelected(ws)
    setMembLoading(true)
    try {
      const res = await api.getWorkspaceMembers(ws.id)
      setMembers(res.members || [])
    } catch { setMembers([]) }
    finally { setMembLoading(false) }
  }

  async function createWorkspace() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await api.createWorkspace({ name: newName.trim(), description: newDesc.trim(), icon: 'folder', color: '#6366f1' })
      setNewName(''); setNewDesc(''); setShowCreate(false)
      await loadWorkspaces()
    } finally { setCreating(false) }
  }

  async function deleteWorkspace(ws: Workspace) {
    if (!confirm(`Supprimer l'espace "${ws.name}" ?`)) return
    await api.deleteWorkspace(ws.id)
    if (selected?.id === ws.id) setSelected(null)
    await loadWorkspaces()
  }

  async function addMember() {
    if (!selected || !newEmail.trim()) return
    setAddingMember(true)
    try {
      await api.addWorkspaceMember(selected.id, newEmail.trim(), newRole)
      setNewEmail(''); setShowAddMember(false)
      const res = await api.getWorkspaceMembers(selected.id)
      setMembers(res.members || [])
    } finally { setAddingMember(false) }
  }

  async function removeMember(email: string) {
    if (!selected) return
    await api.removeWorkspaceMember(selected.id, email)
    setMembers(prev => prev.filter(m => m.user_identifier !== email))
  }


  return (
    <div className="h-full flex overflow-hidden">
      {/* ─── Panneau gauche : liste des espaces ─────────────────── */}
      <aside className="w-64 flex-shrink-0 border-r border-[hsl(var(--line))] flex flex-col bg-[hsl(var(--bg-1))]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--line))]">
          <h2 className="text-[13.5px] font-bold text-[hsl(var(--text))]">Espaces</h2>
          <button onClick={() => setShowCreate(true)}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto py-2">
            {workspaces.length === 0 ? (
              <p className="text-[11.5px] text-[hsl(var(--text-3))] px-4 py-3">Aucun espace. Créez-en un.</p>
            ) : (
              <>
                <p className="text-[10px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider px-4 py-1">
                  Tous les espaces
                </p>
                {workspaces.map(ws => (
                  <button key={ws.id} onClick={() => selectWorkspace(ws)}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left transition-colors group ${
                      selected?.id === ws.id ? 'bg-[hsl(var(--accent-dim))]' : 'hover:bg-[hsl(var(--bg-2))]'
                    }`}>
                    <span className="text-base" style={{ color: ws.color }}>
                      {ws.icon === 'users' ? '👥' : ws.icon === 'folder' ? '📁' : '🏢'}
                    </span>
                    <span className={`text-[12.5px] flex-1 truncate ${selected?.id === ws.id ? 'text-[hsl(var(--text))] font-medium' : 'text-[hsl(var(--text-2))]'}`}>
                      {ws.name}
                    </span>
                    <button onClick={e => { e.stopPropagation(); deleteWorkspace(ws) }}
                      className="opacity-0 group-hover:opacity-100 text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        {/* Créer un espace */}
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-3 space-y-2">
              <input value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Nom de l'espace" autoFocus
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[12px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))]"
              />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)}
                placeholder="Description (optionnel)"
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[12px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))]"
              />
              <div className="flex gap-2">
                <button onClick={createWorkspace} disabled={creating || !newName.trim()}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[11.5px] font-bold disabled:opacity-50">
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                  Créer
                </button>
                <button onClick={() => setShowCreate(false)} className="px-2 py-1.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))]">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </aside>

      {/* ─── Panneau droit : détail de l'espace ─────────────────── */}
      {selected ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-[18px] font-bold text-[hsl(var(--text))]">{selected.name}</h2>
              {selected.description && (
                <p className="text-[12.5px] text-[hsl(var(--text-3))] mt-1">{selected.description}</p>
              )}
            </div>
            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] transition-colors">
              <Settings className="w-3.5 h-3.5" /> Réglages
            </button>
          </div>

          {/* Membres */}
          <div className="panel overflow-hidden">
            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
            <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                <span className="text-[13.5px] font-bold text-[hsl(var(--text))]">Membres</span>
                <span className="pill">{members.length}</span>
              </div>
              <button onClick={() => setShowAddMember(v => !v)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded border border-[hsl(var(--line))] text-[11px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
                <UserPlus className="w-3.5 h-3.5" /> Inviter
              </button>
            </div>

            {/* Formulaire ajout membre */}
            <AnimatePresence>
              {showAddMember && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-4 py-3 bg-[hsl(var(--bg-2))] border-b border-[hsl(var(--line))] flex items-center gap-2">
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                      placeholder="email@exemple.fr" type="email"
                      className="flex-1 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2.5 py-1.5 text-[12px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))]"
                    />
                    <select value={newRole} onChange={e => setNewRole(e.target.value)}
                      className="bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[12px] text-[hsl(var(--text-2))] outline-none">
                      <option value="viewer">Lecteur</option>
                      <option value="editor">Éditeur</option>
                      <option value="owner">Propriétaire</option>
                    </select>
                    <button onClick={addMember} disabled={addingMember || !newEmail.trim()}
                      className="px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[11.5px] font-bold disabled:opacity-50">
                      {addingMember ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Inviter'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {membLoading ? (
              <div className="p-6 flex justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" />
              </div>
            ) : members.length === 0 ? (
              <p className="p-4 text-[12px] text-[hsl(var(--text-3))]">Aucun membre. Invitez des collaborateurs.</p>
            ) : (
              <div className="divide-y divide-[hsl(var(--line))]">
                {members.map(m => {
                  const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS['viewer']
                  const RoleIcon = roleInfo.icon
                  return (
                    <div key={m.user_identifier} className="flex items-center gap-3 px-4 py-3 group">
                      <div className="w-7 h-7 rounded-full bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] flex items-center justify-center flex-shrink-0">
                        <span className="text-[11px] font-bold text-[hsl(var(--accent))]">
                          {(m.user_identifier[0] || '?').toUpperCase()}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] text-[hsl(var(--text))] truncate">{m.user_identifier}</p>
                        <div className={`flex items-center gap-1 text-[10.5px] font-mono ${roleInfo.color}`}>
                          <RoleIcon className="w-3 h-3" /> {roleInfo.label}
                        </div>
                      </div>
                      {m.user_identifier !== user?.email && (
                        <button onClick={() => removeMember(m.user_identifier)}
                          className="opacity-0 group-hover:opacity-100 text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-all">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--text-3))]">
          <Users className="w-12 h-12 opacity-20 mb-3" />
          <p className="text-[13px] font-mono">Sélectionnez un espace ou créez-en un nouveau</p>
        </div>
      )}
    </div>
  )
}
