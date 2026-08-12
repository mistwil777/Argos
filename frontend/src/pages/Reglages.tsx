import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Volume2, VolumeX, Check, ChevronDown, RefreshCw, Loader2,
  Plug, Users, User, Settings2, Copy, CheckCheck, HelpCircle,
  Crown, Eye, Edit3, UserPlus, Trash2, X, Sun, Moon,
} from 'lucide-react'
import { useVoice } from '@/context/VoiceContext'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
import { api } from '@/services/api'
import TourOverlay from '@/components/tour/TourOverlay'
import type { TourStep } from '@/components/tour/TourOverlay'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Workspace { id: number; name: string; description?: string; icon: string; color: string; slug: string }
interface Member { user_identifier: string; role: string }

const ROLE_LABELS: Record<string, { label: string; icon: any; color: string }> = {
  owner:  { label: 'Propriétaire', icon: Crown, color: 'text-[hsl(var(--yellow))]' },
  editor: { label: 'Éditeur',      icon: Edit3, color: 'text-[hsl(var(--accent))]' },
  viewer: { label: 'Lecteur',      icon: Eye,   color: 'text-[hsl(var(--text-3))]' },
}

const LS_HOURS   = 'argos:briefing_hours'
const LS_BRIEF_H = 'argos:briefing_time'
function loadHours(): number  { return Number(localStorage.getItem(LS_HOURS)) || 24 }
function loadBriefH(): string { return localStorage.getItem(LS_BRIEF_H) ?? '07:00' }

// ─── Tour VSCode ──────────────────────────────────────────────────────────────

const VSCODE_TOUR_STEPS: TourStep[] = [
  { title: 'Ouvrir les Connexions',    description: 'Cliquez sur l\'onglet "Connexions IDE" pour voir les instructions de configuration.',   targetSelector: '[data-tour="tab-connexions"]',      position: 'right' },
  { title: 'Choisir VSCode + CC',      description: 'Cliquez sur la tuile VSCode + Claude Code pour déplier les étapes.',                     targetSelector: '[data-tour="vscode-tile"]',         position: 'right' },
  { title: 'Installer Claude Code',    description: 'Si ce n\'est pas déjà fait, installez l\'extension Claude Code dans VSCode.',            targetSelector: '[data-tour="vscode-step-1"]',       position: 'right' },
  { title: 'Copier la config MCP',     description: 'Copiez ce JSON et collez-le dans votre fichier .claude/settings.json.',                  targetSelector: '[data-tour="vscode-copy-settings"]',position: 'bottom' },
  { title: 'Copier le CLAUDE.md',      description: 'Copiez ce template dans votre projet pour que Claude Code consulte Argos automatiquement.',targetSelector: '[data-tour="vscode-copy-claudemd"]',position: 'bottom' },
  { title: 'URL du serveur MCP',       description: 'C\'est l\'adresse que Claude Code utilisera pour interroger Argos.',                     targetSelector: '[data-tour="mcp-url"]',             position: 'top' },
  { title: 'Connexion terminée',       description: 'Claude Code consultera maintenant Argos lors de vos questions sur les outils et pratiques.', targetSelector: '[data-tour="vscode-tile"]',      position: 'right' },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function useCopy(timeout = 1800) {
  const [copied, setCopied] = useState<string | null>(null)
  function copy(text: string, key: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      setTimeout(() => setCopied(null), timeout)
    })
  }
  return { copied, copy }
}

function Panel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
        <Icon className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
        <span className="text-[13.5px] font-bold text-[hsl(var(--text))] tracking-tight">{title}</span>
      </div>
      {children}
    </motion.div>
  )
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function SectionGeneral() {
  const { ttsEnabled, setTtsEnabled } = useVoice()
  const { theme, toggleTheme } = useTheme()
  const [hours,           setHours]           = useState(loadHours)
  const [briefTime,       setBriefTime]       = useState(loadBriefH)
  const [saved,           setSaved]           = useState(false)
  const [adminOpen,       setAdminOpen]       = useState(false)
  const [indexing,        setIndexing]        = useState(false)
  const [indexMsg,        setIndexMsg]        = useState<string | null>(null)
  const [readingLanguage, setReadingLanguage] = useState<string>('')

  useEffect(() => {
    const stored = localStorage.getItem('argos:tts_enabled')
    if (stored !== null) setTtsEnabled(stored === 'true')
    api.updateMe({}).then((u: any) => {
      const lang = u?.preferences?.reading_language || ''
      setReadingLanguage(lang)
    }).catch(() => {})
  }, [setTtsEnabled])

  async function save() {
    localStorage.setItem(LS_HOURS,   String(hours))
    localStorage.setItem(LS_BRIEF_H, briefTime)
    localStorage.setItem('argos:tts_enabled', String(ttsEnabled))
    try {
      await api.updateMe({ preferences: { reading_language: readingLanguage } })
    } catch { /* silencieux */ }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function rebuildIndex() {
    setIndexing(true); setIndexMsg(null)
    try {
      const r = await api.rebuildRag()
      setIndexMsg(`✓ ${r.message || 'Index reconstruit'}`)
    } catch (e: any) {
      setIndexMsg(`ERR / ${e.message}`)
    } finally { setIndexing(false) }
  }

  return (
    <div className="space-y-5">
      <Panel title="Briefing quotidien" icon={Bell}>
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">Fenêtre d'analyse</label>
              <select value={hours} onChange={e => setHours(Number(e.target.value))}
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2 text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-line))] transition-colors">
                <option value={24}>24 heures</option>
                <option value={48}>48 heures</option>
                <option value={72}>72 heures</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">Heure de génération</label>
              <input type="time" value={briefTime} onChange={e => setBriefTime(e.target.value)}
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2 text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-line))] transition-colors" />
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Lecture vocale" icon={ttsEnabled ? Volume2 : VolumeX}>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[12.5px] text-[hsl(var(--text-2))]">Lire les réponses à voix haute</p>
            <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">Synthèse vocale du navigateur (fr-FR)</p>
          </div>
          <button onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${ttsEnabled ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--bg-3))]'}`}>
            <motion.div animate={{ x: ttsEnabled ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow" />
          </button>
        </div>
      </Panel>

      <Panel title="Lecture" icon={Settings2}>
        <div className="px-4 py-4 space-y-3">
          <div>
            <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">Langue de lecture cible</label>
            <select value={readingLanguage} onChange={e => setReadingLanguage(e.target.value)}
              className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2 text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none focus:border-[hsl(var(--accent-line))] transition-colors">
              <option value="">Aucune (langue originale)</option>
              <option value="français">Français</option>
              <option value="anglais">Anglais</option>
              <option value="espagnol">Espagnol</option>
              <option value="allemand">Allemand</option>
              <option value="portugais">Portugais</option>
            </select>
            <p className="text-[10.5px] text-[hsl(var(--text-3))] mt-1.5">
              Quand une langue est sélectionnée, les articles sont traduits automatiquement à l'ouverture.
            </p>
          </div>
        </div>
      </Panel>

      <Panel title="Apparence" icon={theme === 'dark' ? Moon : Sun}>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[12.5px] text-[hsl(var(--text-2))]">Thème {theme === 'dark' ? 'sombre' : 'clair'}</p>
            <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">
              {theme === 'dark' ? 'Fond navy foncé, adapté aux environnements peu éclairés' : 'Fond clair, palette Capgemini — recommandé'}
            </p>
          </div>
          <button onClick={toggleTheme}
            className={`relative w-11 h-6 rounded-full transition-colors ${theme === 'dark' ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--bg-3))]'}`}>
            <motion.div animate={{ x: theme === 'dark' ? 20 : 2 }} transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow flex items-center justify-center">
              {theme === 'dark'
                ? <Moon className="w-2.5 h-2.5 text-[hsl(var(--accent))]" />
                : <Sun className="w-2.5 h-2.5 text-yellow-500" />
              }
            </motion.div>
          </button>
        </div>
      </Panel>

      <motion.button onClick={save} whileTap={{ scale: 0.97 }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[hsl(var(--accent))] text-white text-[13px] font-bold">
        <AnimatePresence mode="wait">
          {saved
            ? <motion.span key="s" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-2"><Check className="w-4 h-4" /> Enregistré</motion.span>
            : <motion.span key="n" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>Enregistrer</motion.span>
          }
        </AnimatePresence>
      </motion.button>

      <div>
        <button onClick={() => setAdminOpen(v => !v)}
          className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
          <motion.div animate={{ rotate: adminOpen ? 0 : -90 }} transition={{ duration: 0.18 }}><ChevronDown className="w-3 h-3" /></motion.div>
          Maintenance système
        </button>
        <AnimatePresence>
          {adminOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3">
              <Panel title="Index RAG" icon={RefreshCw}>
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[11.5px] text-[hsl(var(--text-3))]">Vide LanceDB et réindexe uniquement depuis les digests.</p>
                  <div className="flex items-center gap-3">
                    <button onClick={rebuildIndex} disabled={indexing}
                      className="flex items-center gap-2 px-3 py-1.5 rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[11.5px] font-mono text-[hsl(var(--text-2))] disabled:opacity-50 transition-all">
                      {indexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Reconstruire l'index
                    </button>
                    {indexMsg && <span className={`text-[11px] font-mono ${indexMsg.startsWith('ERR') ? 'text-[hsl(var(--red))]' : 'text-[hsl(var(--green))]'}`}>{indexMsg}</span>}
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

function SectionConnexions() {
  const { copied, copy } = useCopy()
  const [open, setOpen] = useState<string | null>('vscode')
  const [tourActive, setTourActive] = useState(false)
  const mcpUrl = `${window.location.protocol}//${window.location.hostname}:8000/mcp`

  const MCP_SETTINGS = JSON.stringify({ mcpServers: { argos: { url: mcpUrl, transport: 'http' } } }, null, 2)
  const CLAUDE_MD = `# Argos — Contexte de veille

Avant de répondre à une question sur un outil, un framework, une architecture ou une bonne pratique :
1. Consulte argos_ask avec la question reformulée
2. Intègre les résultats dans ta réponse

Ne consulte pas Argos pour : corrections de syntaxe, refactoring mécanique, questions hors domaine tech.`

  function startVscodeTour() {
    setOpen('vscode')
    setTimeout(() => setTourActive(true), 300)
  }

  type AccordionProps = { id: string; title: string; sub: string; children: React.ReactNode }
  function Accordion({ id, title, sub, children }: AccordionProps) {
    const isOpen = open === id
    return (
      <div data-tour={id === 'vscode' ? 'vscode-tile' : undefined}
        className="panel overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
        <button onClick={() => setOpen(isOpen ? null : id)}
          className="w-full flex items-center justify-between px-4 py-3 bg-[hsl(var(--bg-2))] hover:bg-[hsl(var(--bg-3))] transition-colors">
          <div className="text-left">
            <p className="text-[13px] font-bold text-[hsl(var(--text))]">{title}</p>
            <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">{sub}</p>
          </div>
          <motion.div animate={{ rotate: isOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
            <ChevronDown className="w-4 h-4 text-[hsl(var(--text-3))]" />
          </motion.div>
        </button>
        <AnimatePresence>
          {isOpen && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="px-4 py-4 space-y-4">{children}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  function Step({ n, label, dataTour, children }: { n: number; label: string; dataTour?: string; children?: React.ReactNode }) {
    return (
      <div data-tour={dataTour} className="flex gap-3">
        <div className="w-5 h-5 rounded-full bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] flex items-center justify-center flex-shrink-0 mt-0.5">
          <span className="text-[10px] font-bold text-[hsl(var(--accent))]">{n}</span>
        </div>
        <div className="flex-1">
          <p className="text-[12.5px] text-[hsl(var(--text-2))]">{label}</p>
          {children}
        </div>
      </div>
    )
  }

  function CopyBlock({ code, label, dataTour }: { code: string; label: string; dataTour?: string }) {
    const key = dataTour || label
    return (
      <div data-tour={dataTour} className="relative group">
        <pre className="bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg p-3 text-[11px] font-mono text-[hsl(var(--text-2))] overflow-x-auto whitespace-pre-wrap">{code}</pre>
        <button onClick={() => copy(code, key)}
          className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] text-[10.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] hover:border-[hsl(var(--accent-line))] transition-all opacity-0 group-hover:opacity-100">
          {copied === key ? <CheckCheck className="w-3 h-3 text-[hsl(var(--green))]" /> : <Copy className="w-3 h-3" />}
          {copied === key ? 'Copié' : 'Copier'}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[hsl(var(--text-3))]">Connectez Argos à votre environnement de développement ou à votre LLM favori.</p>
        <button onClick={startVscodeTour}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
          <HelpCircle className="w-3.5 h-3.5" /> Guide pas à pas
        </button>
      </div>

      <Accordion id="vscode" title="VSCode + Claude Code" sub="Protocole MCP · Extension officielle Anthropic">
        <Step n={1} label="Installez l'extension Claude Code depuis le Marketplace VSCode." dataTour="vscode-step-1" />
        <Step n={2} label="Ajoutez la config MCP dans .claude/settings.json de votre projet :" dataTour="vscode-step-2">
          <div className="mt-2">
            <CopyBlock code={MCP_SETTINGS} label="settings" dataTour="vscode-copy-settings" />
          </div>
        </Step>
        <Step n={3} label="Copiez ce template CLAUDE.md à la racine de votre projet :" dataTour="vscode-step-3">
          <div className="mt-2">
            <CopyBlock code={CLAUDE_MD} label="claudemd" dataTour="vscode-copy-claudemd" />
          </div>
        </Step>
        <div data-tour="mcp-url" className="flex items-center gap-2 p-2.5 rounded bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
          <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">URL MCP :</span>
          <span className="text-[11px] font-mono text-[hsl(var(--accent))] flex-1">{mcpUrl}</span>
          <button onClick={() => copy(mcpUrl, 'url')} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
            {copied === 'url' ? <CheckCheck className="w-3.5 h-3.5 text-[hsl(var(--green))]" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </Accordion>

      <Accordion id="claude-desktop" title="Claude Desktop" sub="claude_desktop_config.json · MacOS & Windows">
        <Step n={1} label="Ouvrez Claude Desktop → Préférences → Développeur → Modifier la config." />
        <Step n={2} label="Ajoutez la section mcpServers :">
          <div className="mt-2">
            <CopyBlock code={JSON.stringify({ mcpServers: { argos: { url: mcpUrl, transport: 'http' } } }, null, 2)} label="claude-desktop" />
          </div>
        </Step>
        <Step n={3} label="Redémarrez Claude Desktop. Le serveur Argos apparaîtra dans la liste des outils." />
      </Accordion>

      <Accordion id="chatgpt" title="ChatGPT / Gemini" sub="Export contexte markdown · Pas d'intégration native MCP">
        <Step n={1} label="Exportez un contexte markdown depuis votre base Argos :" />
        <Step n={2} label="Collez-le dans une conversation ChatGPT ou Gemini avant de poser votre question.">
          <div className="mt-2">
            <button onClick={async () => {
              try {
                const briefing = await api.getTodayBriefing()
                const md = `# Contexte Argos — ${new Date().toLocaleDateString('fr-FR')}\n\n${briefing?.content || briefing?.summary || JSON.stringify(briefing, null, 2)}`
                copy(md, 'chatgpt-export')
              } catch { copy('# Contexte Argos\n\nAucun briefing disponible.', 'chatgpt-export') }
            }}
              className="flex items-center gap-2 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-all">
              {copied === 'chatgpt-export' ? <CheckCheck className="w-3.5 h-3.5 text-[hsl(var(--green))]" /> : <Copy className="w-3.5 h-3.5" />}
              {copied === 'chatgpt-export' ? 'Copié' : 'Exporter le contexte'}
            </button>
          </div>
        </Step>
      </Accordion>

      <TourOverlay steps={VSCODE_TOUR_STEPS} visible={tourActive} onFinish={() => setTourActive(false)} finishLabel="Connexion prête ✓" />
    </div>
  )
}

function SectionEquipe() {
  const { user } = useAuth()
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [selected,   setSelected]   = useState<Workspace | null>(null)
  const [members,    setMembers]     = useState<Member[]>([])
  const [loading,    setLoading]     = useState(true)
  const [membLoading, setMembLoading] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [newName,    setNewName]    = useState('')
  const [newDesc,    setNewDesc]    = useState('')
  const [creating,   setCreating]   = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [newEmail,   setNewEmail]   = useState('')
  const [newRole,    setNewRole]    = useState('editor')
  const [addingMember, setAddingMember] = useState(false)

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
    <div className="flex gap-4 h-[480px]">
      {/* Liste espaces */}
      <div className="w-52 flex-shrink-0 panel overflow-hidden flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
        <div className="flex items-center justify-between px-3 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
          <span className="text-[12.5px] font-bold text-[hsl(var(--text))]">Espaces</span>
          <button onClick={() => setShowCreate(true)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
            <UserPlus className="w-3.5 h-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--accent))]" /></div>
        ) : (
          <div className="flex-1 overflow-y-auto py-1">
            {workspaces.map(ws => (
              <button key={ws.id} onClick={() => selectWorkspace(ws)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors group ${selected?.id === ws.id ? 'bg-[hsl(var(--accent-dim))]' : 'hover:bg-[hsl(var(--bg-2))]'}`}>
                <span className="text-sm">{ws.icon === 'folder' ? '📁' : '👥'}</span>
                <span className={`text-[12px] flex-1 truncate ${selected?.id === ws.id ? 'text-[hsl(var(--text))] font-medium' : 'text-[hsl(var(--text-2))]'}`}>{ws.name}</span>
                <button onClick={e => { e.stopPropagation(); deleteWorkspace(ws) }}
                  className="opacity-0 group-hover:opacity-100 text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-all">
                  <Trash2 className="w-3 h-3" />
                </button>
              </button>
            ))}
            {workspaces.length === 0 && <p className="text-[11px] text-[hsl(var(--text-3))] px-3 py-2">Aucun espace.</p>}
          </div>
        )}
        <AnimatePresence>
          {showCreate && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-2.5 space-y-2">
              <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nom de l'espace" autoFocus
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[11.5px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))]" />
              <input value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optionnel)"
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[11.5px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))]" />
              <div className="flex gap-1.5">
                <button onClick={createWorkspace} disabled={creating || !newName.trim()}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[11px] font-bold disabled:opacity-50">
                  {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Créer
                </button>
                <button onClick={() => setShowCreate(false)} className="px-2 py-1.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))]">
                  <X className="w-3 h-3" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Détail membres */}
      <div className="flex-1 panel overflow-hidden flex flex-col">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
        {selected ? (
          <>
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                <span className="text-[12.5px] font-bold text-[hsl(var(--text))]">{selected.name}</span>
                <span className="pill">{members.length}</span>
              </div>
              <button onClick={() => setShowAddMember(v => !v)}
                className="flex items-center gap-1 px-2 py-1 rounded border border-[hsl(var(--line))] text-[10.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-colors">
                <UserPlus className="w-3 h-3" /> Inviter
              </button>
            </div>
            <AnimatePresence>
              {showAddMember && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                  <div className="px-4 py-2.5 bg-[hsl(var(--bg-2))] border-b border-[hsl(var(--line))] flex items-center gap-2">
                    <input value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@exemple.fr" type="email"
                      className="flex-1 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2.5 py-1.5 text-[11.5px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))]" />
                    <select value={newRole} onChange={e => setNewRole(e.target.value)}
                      className="bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5 text-[11.5px] text-[hsl(var(--text-2))] outline-none">
                      <option value="viewer">Lecteur</option>
                      <option value="editor">Éditeur</option>
                      <option value="owner">Propriétaire</option>
                    </select>
                    <button onClick={addMember} disabled={addingMember || !newEmail.trim()}
                      className="px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[11px] font-bold disabled:opacity-50">
                      {addingMember ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Inviter'}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            {membLoading ? (
              <div className="flex-1 flex items-center justify-center"><Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--accent))]" /></div>
            ) : (
              <div className="flex-1 overflow-y-auto divide-y divide-[hsl(var(--line))]">
                {members.map(m => {
                  const roleInfo = ROLE_LABELS[m.role] || ROLE_LABELS['viewer']
                  const RoleIcon = roleInfo.icon
                  return (
                    <div key={m.user_identifier} className="flex items-center gap-3 px-4 py-2.5 group">
                      <div className="w-6 h-6 rounded-full bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] flex items-center justify-center flex-shrink-0">
                        <span className="text-[10px] font-bold text-[hsl(var(--accent))]">{(m.user_identifier[0] || '?').toUpperCase()}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] text-[hsl(var(--text))] truncate">{m.user_identifier}</p>
                        <div className={`flex items-center gap-1 text-[10px] font-mono ${roleInfo.color}`}>
                          <RoleIcon className="w-2.5 h-2.5" /> {roleInfo.label}
                        </div>
                      </div>
                      {m.user_identifier !== user?.email && (
                        <button onClick={() => removeMember(m.user_identifier)}
                          className="opacity-0 group-hover:opacity-100 text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-all">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )
                })}
                {members.length === 0 && <p className="p-4 text-[11.5px] text-[hsl(var(--text-3))]">Aucun membre. Invitez des collaborateurs.</p>}
              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-[hsl(var(--text-3))]">
            <Users className="w-8 h-8 opacity-20 mb-2" />
            <p className="text-[12px] font-mono">Sélectionnez un espace</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SectionCompte() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() { logout(); navigate('/login', { replace: true }) }

  return (
    <Panel title="Compte" icon={User}>
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] flex items-center justify-center">
            <span className="text-[14px] font-bold text-[hsl(var(--accent))]">{(user?.full_name?.[0] || user?.email?.[0] || '?').toUpperCase()}</span>
          </div>
          <div>
            <p className="text-[13px] font-bold text-[hsl(var(--text))]">{user?.full_name || '—'}</p>
            <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">{user?.email}</p>
          </div>
        </div>
        <button onClick={handleLogout}
          className="flex items-center gap-2 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--red))] hover:border-[hsl(var(--red))] transition-colors">
          Se déconnecter
        </button>
      </div>
    </Panel>
  )
}

// ─── Page principale ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'general',    label: 'Général',         icon: Settings2 },
  { id: 'connexions', label: 'Connexions IDE',   icon: Plug },
  { id: 'equipe',     label: 'Équipe',           icon: Users },
  { id: 'compte',     label: 'Compte',           icon: User },
]

import { useNavigate } from 'react-router-dom'

export default function Reglages() {
  const [tab, setTab] = useState('general')

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      {/* Onglets */}
      <div className="flex gap-1 p-1 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)} data-tour={`tab-${t.id}`}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-md text-[12px] font-medium transition-all ${
                isActive
                  ? 'bg-[hsl(var(--bg))] text-[hsl(var(--text))] shadow-sm border border-[hsl(var(--line))]'
                  : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenu */}
      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}>
          {tab === 'general'    && <SectionGeneral />}
          {tab === 'connexions' && <SectionConnexions />}
          {tab === 'equipe'     && <SectionEquipe />}
          {tab === 'compte'     && <SectionCompte />}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
