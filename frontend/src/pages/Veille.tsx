import { useState, useRef, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Loader2, Folder, Check, ChevronRight, Pencil } from 'lucide-react'
import { api } from '@/services/api'
import QuestionnaireModal from '@/components/ui/QuestionnaireModal'
import SourceDiscoveryStream from '@/components/ui/SourceDiscoveryStream'

const DossiersContent = lazy(() => import('@/pages/Dossiers'))

const INTENTION_COLORS: Record<string, string> = {
  apprendre: 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]',
  surveiller: 'border-[hsl(var(--aqua)/.4)] bg-[hsl(var(--aqua)/.08)] text-[hsl(var(--aqua))]',
  projets:    'border-[hsl(var(--violet)/.4)] bg-[hsl(var(--violet)/.08)] text-[hsl(var(--violet))]',
}

const INTENTION_LABELS: Record<string, string> = {
  apprendre: 'Apprendre',
  surveiller: 'Surveiller',
  projets: 'Projet',
}

const INTENTION_ALL = ['apprendre', 'surveiller', 'projets']

interface SujetProposal {
  name: string
  intention_type: string
  rationale: string
  enabled: boolean
  editing: boolean
  editName: string
}

function CadrageVeille({ onDone }: { onDone: () => void }) {
  const [description, setDescription]     = useState('')
  const [analyzing, setAnalyzing]         = useState(false)
  const [wsName, setWsName]               = useState('')
  const [proposals, setProposals]         = useState<SujetProposal[]>([])
  const [creating, setCreating]           = useState(false)

  // File de questionnaires
  const [queue, setQueue]   = useState<{ id: number; name: string; intention: string; context: string }[]>([])
  const [currentQ, setCurrentQ] = useState<{ id: number; name: string; intention: string; context: string } | null>(null)
  const [showLaunchWarning, setShowLaunchWarning] = useState(false)
  // Sujets en cours de découverte de sources (SSE)
  const [discoveringSujets, setDiscoveringSujets] = useState<{ id: number; name: string }[]>([])

  async function analyze() {
    if (description.trim().length < 10) return
    setAnalyzing(true)
    setProposals([])
    try {
      const result = await api.decomposeNeeds(description)
      setWsName(result.workspace_name || '')
      setProposals((result.sujets || []).map((s: any) => ({
        ...s,
        enabled: true,
        editing: false,
        editName: s.name,
      })))
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setAnalyzing(false) }
  }

  function toggleSujet(i: number) {
    setProposals(prev => prev.map((p, idx) => idx === i ? { ...p, enabled: !p.enabled } : p))
  }

  function setIntention(i: number, val: string) {
    setProposals(prev => prev.map((p, idx) => idx === i ? { ...p, intention_type: val } : p))
  }

  function startEdit(i: number) {
    setProposals(prev => prev.map((p, idx) => idx === i ? { ...p, editing: true, editName: p.name } : p))
  }

  function commitEdit(i: number) {
    setProposals(prev => prev.map((p, idx) =>
      idx === i ? { ...p, editing: false, name: p.editName.trim() || p.name } : p
    ))
  }

  async function launch() {
    const active = proposals.filter(p => p.enabled)
    if (!active.length || !wsName.trim()) return
    setCreating(true)
    try {
      const ws = await api.createWorkspace({ name: wsName.trim(), icon: 'folder', color: '#6366f1' })
      const created: { id: number; name: string; intention: string }[] = []
      for (const p of active) {
        const context = [description.trim(), p.rationale].filter(Boolean).join('\n')
        const s = await api.createSujet({ workspace_id: ws.id, name: p.name, intention_type: p.intention_type })
        if (s?.id) created.push({ id: s.id, name: p.name, intention: p.intention_type, context })
      }
      if (created.length) {
        setQueue(created.slice(1))
        setCurrentQ(created[0])
      }
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setCreating(false) }
  }

  const transitioningRef = useRef(false)

  function nextQuestionnaire(completedSujetId?: number, completedSujetName?: string) {
    // Si un sujet vient d'être validé, on lance l'affichage SSE pour lui
    if (completedSujetId) {
      setDiscoveringSujets(prev => [
        ...prev.filter(s => s.id !== completedSujetId),
        { id: completedSujetId, name: completedSujetName || '' },
      ])
    }
    if (transitioningRef.current) return
    transitioningRef.current = true
    setQueue(prev => {
      if (prev.length) {
        setCurrentQ(prev[0])
        transitioningRef.current = false
        return prev.slice(1)
      } else {
        setCurrentQ(null)
        setDescription('')
        setProposals([])
        setWsName('')
        transitioningRef.current = false
        onDone()
        return []
      }
    })
  }

  const activeCount = proposals.filter(p => p.enabled).length

  return (
    <>
      <div className="panel overflow-hidden">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />

        <div className="px-5 pt-5 pb-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-[hsl(var(--accent))]" />
            <h2 className="text-[14px] font-bold text-[hsl(var(--text))]">Configurer une nouvelle veille</h2>
          </div>
          <p className="text-[11.5px] text-[hsl(var(--text-3))]">
            Décris ton besoin — Argos le décompose en sujets distincts, chacun configuré par un entretien guidé.
          </p>
        </div>

        <div className="p-5 space-y-5">

          {/* Champ de description */}
          <div className="flex gap-2 items-start">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) analyze() }}
              placeholder="Décris ton besoin de veille en quelques phrases…"
              rows={3}
              className="flex-1 px-4 py-3 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg text-[13px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none focus:border-[hsl(var(--accent-line))] resize-none transition-colors"
            />
            <button
              onClick={analyze}
              disabled={analyzing || description.trim().length < 10}
              className="flex-shrink-0 flex items-center gap-1.5 px-4 py-3 rounded-lg text-white text-[12.5px] font-bold disabled:opacity-40 transition-all"
              style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}
            >
              {analyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Analyser
            </button>
          </div>

          {/* Propositions */}
          <AnimatePresence>
            {proposals.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="space-y-4">

                {/* Nom du dossier */}
                <div className="flex items-center gap-2">
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider flex-shrink-0">Dossier</p>
                  <input
                    value={wsName}
                    onChange={e => setWsName(e.target.value)}
                    className="flex-1 px-3 py-1.5 bg-[hsl(var(--bg))] border border-[hsl(var(--accent-line))] rounded-lg text-[13px] font-semibold text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent))] transition-colors"
                  />
                </div>

                {/* Liste des sujets proposés */}
                <div className="space-y-2">
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
                    Sujets détectés — active, ajuste ou retire
                  </p>
                  {proposals.map((p, i) => (
                    <motion.div key={i} layout
                      className={`rounded-xl border-2 transition-all overflow-hidden ${
                        p.enabled ? INTENTION_COLORS[p.intention_type] : 'border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] opacity-50'
                      }`}>
                      <div className="flex items-start gap-3 px-4 py-3">
                        {/* Toggle */}
                        <button onClick={() => toggleSujet(i)} className="flex-shrink-0 mt-0.5">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${
                            p.enabled ? 'border-current bg-current' : 'border-[hsl(var(--text-3))]'
                          }`}>
                            {p.enabled && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                          </div>
                        </button>

                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Nom éditable */}
                          {p.editing ? (
                            <div className="flex items-center gap-2">
                              <input
                                autoFocus
                                value={p.editName}
                                onChange={e => setProposals(prev => prev.map((x, idx) =>
                                  idx === i ? { ...x, editName: e.target.value } : x
                                ))}
                                onKeyDown={e => { if (e.key === 'Enter') commitEdit(i); if (e.key === 'Escape') setProposals(prev => prev.map((x, idx) => idx === i ? { ...x, editing: false } : x)) }}
                                onBlur={() => commitEdit(i)}
                                className="flex-1 px-2 py-0.5 rounded border border-current bg-transparent text-[13px] font-bold outline-none"
                              />
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[13px] font-bold">{p.name}</span>
                              {p.enabled && (
                                <button onClick={() => startEdit(i)} className="opacity-40 hover:opacity-100 transition-opacity">
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          )}

                          <p className="text-[11px] opacity-70">{p.rationale}</p>

                          {/* Sélecteur d'intention inline */}
                          {p.enabled && (
                            <div className="flex gap-1.5 flex-wrap">
                              {INTENTION_ALL.map(opt => (
                                <button key={opt} onClick={() => setIntention(i, opt)}
                                  className={`px-2 py-0.5 rounded text-[10.5px] font-mono border transition-all ${
                                    p.intention_type === opt
                                      ? 'bg-current/20 border-current font-bold'
                                      : 'border-current/30 opacity-50 hover:opacity-80'
                                  }`}>
                                  {INTENTION_LABELS[opt]}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Avertissement + bouton lancer */}
                {activeCount > 0 && (
                  <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <AnimatePresence>
                      {showLaunchWarning && (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                          className="rounded-xl border border-[hsl(var(--yellow)/.4)] bg-[hsl(var(--yellow)/.06)] px-4 py-3 space-y-1.5">
                          <p className="text-[12.5px] font-bold text-[hsl(var(--yellow))]">Avant de commencer</p>
                          <p className="text-[11.5px] text-[hsl(var(--text-2))] leading-relaxed">
                            Chaque entretien dure <strong>5 à 15 minutes</strong> selon la richesse du sujet. Un agent dédié va explorer chaque sous-thème en profondeur — niveau actuel, objectifs, acteurs à surveiller.
                          </p>
                          <p className="text-[11.5px] text-[hsl(var(--text-2))] leading-relaxed">
                            Ce temps est un <strong>investissement unique</strong> : une whitelist bien construite maintenant = une veille pertinente sans bruit pour toujours.
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <motion.button
                      onClick={() => {
                        if (!showLaunchWarning) { setShowLaunchWarning(true); return }
                        launch()
                      }}
                      disabled={creating}
                      whileTap={{ scale: 0.97 }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white text-[13px] font-bold disabled:opacity-60 transition-all"
                      style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}
                    >
                      {creating
                        ? <><Loader2 className="w-4 h-4 animate-spin" /> Création…</>
                        : showLaunchWarning
                        ? <><ChevronRight className="w-4 h-4" /> Je suis prêt — lancer ({activeCount} entretien{activeCount > 1 ? 's' : ''})</>
                        : <><ChevronRight className="w-4 h-4" /> Lancer les entretiens ({activeCount} sujet{activeCount > 1 ? 's' : ''})</>
                      }
                    </motion.button>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Streams de découverte de sources */}
      <AnimatePresence>
        {discoveringSujets.map(s => (
          <SourceDiscoveryStream
            key={s.id}
            sujetId={s.id}
            onComplete={() => setDiscoveringSujets(prev => prev.filter(x => x.id !== s.id))}
          />
        ))}
      </AnimatePresence>

      {/* Questionnaires en séquence */}
      <AnimatePresence>
        {currentQ && (
          <QuestionnaireModal
            sujetId={currentQ.id}
            sujetName={currentQ.name}
            intentionType={currentQ.intention}
            initialContext={currentQ.context}
            onClose={() => nextQuestionnaire(currentQ.id, currentQ.name)}
            onDone={(_fc: any, _it: string) => nextQuestionnaire(currentQ.id, currentQ.name)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Page Veille ──────────────────────────────────────────────────────────────

export default function Veille() {
  const [refresh, setRefresh] = useState(0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">

        <CadrageVeille onDone={() => setRefresh(r => r + 1)} />

        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <Folder className="w-4 h-4 text-[hsl(var(--accent))]" />
            Vos dossiers de veille
          </h3>
        </div>

        <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" /></div>}>
          <DossiersContent key={refresh} />
        </Suspense>
      </div>
    </div>
  )
}
