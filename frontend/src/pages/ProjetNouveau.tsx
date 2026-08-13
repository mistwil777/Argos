import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, ArrowRight, Check, Loader2, FileText,
  Sparkles, MessageSquare, ChevronRight, AlertCircle
} from 'lucide-react'
import { api } from '@/services/api'

type Step = 'infos' | 'cdc' | 'analyse' | 'questionnaire' | 'finalisation'

const STEPS: { id: Step; label: string }[] = [
  { id: 'infos',        label: 'Informations' },
  { id: 'cdc',          label: 'CDC' },
  { id: 'analyse',      label: 'Analyse' },
  { id: 'questionnaire', label: 'Entretien' },
  { id: 'finalisation', label: 'Finalisation' },
]

export default function ProjetNouveau() {
  const navigate = useNavigate()

  // Step tracking
  const [step, setStep] = useState<Step>('infos')

  // Step 1 — infos
  const [name, setName]       = useState('')
  const [desc, setDesc]       = useState('')
  // Created project
  const [projectId, setProjectId] = useState<number | null>(null)

  // Step 2 — CDC
  const [cdcText, setCdcText]     = useState('')

  // Step 3 — analyse
  const [cdcAnalysis, setCdcAnalysis] = useState<any>(null)

  // Step 4 — questionnaire
  const [qaHistory, setQaHistory]     = useState<{ q: string; a: string }[]>([])
  const [currentQ, setCurrentQ]       = useState<any>(null)
  const [currentAnswer, setCurrentAnswer] = useState('')
  const [selectedOptions, setSelectedOptions] = useState<string[]>([])
  const [levelPair, setLevelPair]     = useState<{ current: string; target: string }>({ current: '', target: '' })

  // Step 5 — finalisation
  const [finalResult, setFinalResult] = useState<any>(null)

  // UI state
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const LEVELS = ['novice', 'débutant', 'intermédiaire', 'avancé', 'expert']
  const stepIdx = STEPS.findIndex(s => s.id === step)

  // ── Step 1 → créer le projet ──────────────────────────────────────────────

  async function handleCreateProject() {
    if (!name.trim()) return
    setLoading(true); setError(null)
    try {
      const p = await api.createProject({
        name: name.trim(),
        description: desc.trim() || undefined,
      })
      setProjectId(p.id)
      setStep('cdc')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Step 2 → skip CDC ou aller analyse ───────────────────────────────────

  function handleSkipCdc() { setStep('questionnaire'); loadFirstQuestion() }

  async function handleAnalyzeCdc() {
    if (!cdcText.trim() || cdcText.length < 50) {
      setError('Le CDC doit faire au moins 50 caractères.')
      return
    }
    setLoading(true); setError(null)
    try {
      const result = await api.analyzeCdc(projectId!, cdcText)
      setCdcAnalysis(result)
      setStep('analyse')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Step 3 → passer à l'entretien ────────────────────────────────────────

  async function handleStartQuestionnaire() {
    setStep('questionnaire')
    await loadFirstQuestion()
  }

  async function loadFirstQuestion() {
    setLoading(true); setError(null)
    try {
      const res = await api.projectCalibrationQuestion(projectId!, {
        project_name: name,
        cdc_analysis: cdcAnalysis || { subjects: [], gaps: [], domains: [], constraints: [] },
        qa_history: [],
      })
      if (res.done) { await handleFinalize([]); return }
      setCurrentQ(res.question)
      setCurrentAnswer('')
      setSelectedOptions([])
      setLevelPair({ current: '', target: '' })
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Step 4 → envoyer réponse + charger suivante ───────────────────────────

  function buildAnswer(): string {
    if (currentQ?.type === 'multiselect') return selectedOptions.join(', ')
    if (currentQ?.type === 'level_pair')  return `Niveau actuel : ${levelPair.current} — Niveau cible : ${levelPair.target}`
    return currentAnswer
  }

  async function handleNextQuestion() {
    const answer = buildAnswer()
    if (!answer.trim()) return
    const newHistory = [...qaHistory, { q: currentQ.text, a: answer }]
    setQaHistory(newHistory)
    setLoading(true); setError(null)
    try {
      const res = await api.projectCalibrationQuestion(projectId!, {
        project_name: name,
        cdc_analysis: cdcAnalysis || { subjects: [], gaps: [], domains: [], constraints: [] },
        qa_history: newHistory,
      })
      if (res.done) { await handleFinalize(newHistory); return }
      setCurrentQ(res.question)
      setCurrentAnswer('')
      setSelectedOptions([])
      setLevelPair({ current: '', target: '' })
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  function handleSkipQuestion() {
    if (qaHistory.length >= 5) handleFinalize(qaHistory)
  }

  // ── Step 5 → finaliser ───────────────────────────────────────────────────

  async function handleFinalize(history: typeof qaHistory) {
    setLoading(true); setError(null)
    try {
      const result = await api.finalizeProjectCalibration(projectId!, {
        project_name: name,
        cdc_analysis: cdcAnalysis || { subjects: [], gaps: [], domains: [], constraints: [] },
        qa_history: history,
      })
      setFinalResult(result)
      setStep('finalisation')
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-full overflow-auto px-8 py-7">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/projets')}
            className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-[15px] font-semibold text-[hsl(var(--text))]">Nouveau projet</h2>
            <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">
              {STEPS[stepIdx]?.label} — étape {stepIdx + 1}/{STEPS.length}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="flex gap-1.5">
          {STEPS.map((s, i) => (
            <div
              key={s.id}
              className="h-1 flex-1 rounded-full transition-all duration-300"
              style={{
                background: i <= stepIdx
                  ? 'hsl(var(--accent))'
                  : 'hsl(var(--line))',
              }}
            />
          ))}
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[hsl(var(--red)/.3)] bg-[hsl(var(--red)/.08)] text-[hsl(var(--red))] text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* ── Step 1 : Informations ─────────────────────────────────────── */}
          {step === 'infos' && (
            <motion.div key="infos" {...fadeSlide} className="space-y-4">
              <div className="card space-y-4">
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-mono text-[hsl(var(--text-3))]">Nom du projet *</span>
                  <input
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="Ex : Refonte portail clients"
                    className="input w-full"
                  />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-mono text-[hsl(var(--text-3))]">Description (optionnel)</span>
                  <textarea
                    value={desc} onChange={e => setDesc(e.target.value)}
                    rows={3} placeholder="Quelques phrases sur le contexte..."
                    className="input w-full resize-none"
                  />
                </label>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleCreateProject}
                  disabled={!name.trim() || loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  Continuer
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 2 : CDC ─────────────────────────────────────────────── */}
          {step === 'cdc' && (
            <motion.div key="cdc" {...fadeSlide} className="space-y-4">
              <div className="card space-y-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[hsl(var(--accent))]" />
                  <p className="text-[13px] font-medium text-[hsl(var(--text))]">Cahier des charges</p>
                </div>
                <p className="text-[12px] text-[hsl(var(--text-3))]">
                  Collez votre CDC ou décrivez librement le projet. Le LLM en extraira les sujets,
                  domaines et lacunes pour préparer l'entretien.
                </p>
                <textarea
                  value={cdcText} onChange={e => setCdcText(e.target.value)}
                  rows={12}
                  placeholder="Contexte du projet, objectifs, contraintes techniques, équipe, délais..."
                  className="input w-full resize-none font-mono text-[12px]"
                />
              </div>
              <div className="flex items-center justify-between">
                <button
                  onClick={handleSkipCdc}
                  className="text-[13px] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors"
                >
                  Passer cette étape →
                </button>
                <button
                  onClick={handleAnalyzeCdc}
                  disabled={cdcText.length < 50 || loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Analyser
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 3 : Résultat analyse ─────────────────────────────────── */}
          {step === 'analyse' && cdcAnalysis && (
            <motion.div key="analyse" {...fadeSlide} className="space-y-4">
              <div className="card space-y-4">
                <p className="text-[13px] font-medium text-[hsl(var(--text))]">
                  {cdcAnalysis.subjects?.length} sujets identifiés
                </p>
                <div className="space-y-2">
                  {cdcAnalysis.subjects?.map((s: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-[hsl(var(--bg))]">
                      <span className={`mt-0.5 flex-shrink-0 w-2 h-2 rounded-full ${
                        s.priority === 'high' ? 'bg-[hsl(var(--accent))]' :
                        s.priority === 'medium' ? 'bg-[hsl(var(--yellow))]' :
                        'bg-[hsl(var(--text-3))]'
                      }`} />
                      <div>
                        <p className="text-[13px] font-medium text-[hsl(var(--text))]">{s.name}</p>
                        {s.sub_subjects?.length > 0 && (
                          <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">
                            {s.sub_subjects.join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {cdcAnalysis.gaps?.length > 0 && (
                  <div className="px-3 py-2 rounded-lg border border-[hsl(var(--yellow)/.3)] bg-[hsl(var(--yellow)/.06)]">
                    <p className="text-[11px] font-mono text-[hsl(var(--yellow))] mb-1">Lacunes à combler</p>
                    <ul className="space-y-0.5">
                      {cdcAnalysis.gaps.map((g: string, i: number) => (
                        <li key={i} className="text-[12px] text-[hsl(var(--text-2))]">• {g}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              <div className="flex justify-end">
                <button
                  onClick={handleStartQuestionnaire}
                  disabled={loading}
                  className="btn-primary flex items-center gap-2"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
                  Lancer l'entretien
                </button>
              </div>
            </motion.div>
          )}

          {/* ── Step 4 : Questionnaire ───────────────────────────────────── */}
          {step === 'questionnaire' && (
            <motion.div key="questionnaire" {...fadeSlide} className="space-y-4">
              {loading && !currentQ ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--text-3))]" />
                </div>
              ) : currentQ ? (
                <>
                  <div className="card space-y-4">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--text-3))]">
                      <MessageSquare className="w-3.5 h-3.5" />
                      Question {qaHistory.length + 1}
                    </div>
                    <p className="text-[14px] text-[hsl(var(--text))] leading-relaxed">{currentQ.text}</p>

                    {/* Open */}
                    {currentQ.type === 'open' && (
                      <textarea
                        value={currentAnswer} onChange={e => setCurrentAnswer(e.target.value)}
                        rows={4} placeholder="Votre réponse..."
                        className="input w-full resize-none"
                      />
                    )}

                    {/* Multiselect */}
                    {currentQ.type === 'multiselect' && currentQ.options?.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {currentQ.options.map((opt: string) => (
                          <button
                            key={opt}
                            onClick={() => setSelectedOptions(prev =>
                              prev.includes(opt) ? prev.filter(o => o !== opt) : [...prev, opt]
                            )}
                            className={`px-3 py-1.5 rounded-lg text-[13px] border transition-all ${
                              selectedOptions.includes(opt)
                                ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]'
                                : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent)/.5)]'
                            }`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Level pair */}
                    {currentQ.type === 'level_pair' && (
                      <div className="space-y-3">
                        {(['current', 'target'] as const).map(k => (
                          <div key={k} className="space-y-1.5">
                            <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                              {k === 'current' ? 'Niveau actuel' : 'Niveau cible'}
                            </p>
                            <div className="flex gap-2">
                              {LEVELS.map(l => (
                                <button
                                  key={l}
                                  onClick={() => setLevelPair(prev => ({ ...prev, [k]: l }))}
                                  className={`flex-1 py-1.5 rounded-lg text-[11px] border transition-all ${
                                    levelPair[k] === l
                                      ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent)/.12)] text-[hsl(var(--accent))]'
                                      : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent)/.4)]'
                                  }`}
                                >
                                  {l}
                                </button>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    {qaHistory.length >= 5 ? (
                      <button
                        onClick={() => handleFinalize(qaHistory)}
                        disabled={loading}
                        className="text-[13px] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text))] transition-colors"
                      >
                        Finaliser maintenant →
                      </button>
                    ) : (
                      <span className="text-[12px] font-mono text-[hsl(var(--text-3))]">
                        {Math.max(0, 5 - qaHistory.length)} question{5 - qaHistory.length > 1 ? 's' : ''} minimum restante{5 - qaHistory.length > 1 ? 's' : ''}
                      </span>
                    )}
                    <button
                      onClick={handleNextQuestion}
                      disabled={loading || (
                        currentQ.type === 'open' ? !currentAnswer.trim() :
                        currentQ.type === 'multiselect' ? selectedOptions.length === 0 :
                        !levelPair.current || !levelPair.target
                      )}
                      className="btn-primary flex items-center gap-2"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ChevronRight className="w-4 h-4" />}
                      Suivant
                    </button>
                  </div>
                </>
              ) : null}
            </motion.div>
          )}

          {/* ── Step 5 : Finalisation ────────────────────────────────────── */}
          {step === 'finalisation' && finalResult && (
            <motion.div key="finalisation" {...fadeSlide} className="space-y-4">
              <div className="card space-y-4">
                <div className="flex items-center gap-2">
                  <Check className="w-5 h-5 text-[hsl(var(--aqua))]" />
                  <p className="text-[14px] font-semibold text-[hsl(var(--text))]">Projet calibré</p>
                </div>
                <p className="text-[12px] text-[hsl(var(--text-3))]">
                  {finalResult.subjects?.length} sujets créés, {finalResult.source_candidates?.length} sources suggérées.
                </p>

                {/* Sujets créés */}
                <div className="space-y-2">
                  {finalResult.subjects?.map((s: any, i: number) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[hsl(var(--bg))]">
                      <Check className="w-3.5 h-3.5 text-[hsl(var(--aqua))] flex-shrink-0" />
                      <div>
                        <p className="text-[13px] font-medium text-[hsl(var(--text))]">{s.name}</p>
                        {s.description && (
                          <p className="text-[11px] text-[hsl(var(--text-3))]">{s.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Sources suggérées */}
                {finalResult.source_candidates?.length > 0 && (
                  <div className="px-3 py-2 rounded-lg border border-[hsl(var(--line))] bg-[hsl(var(--bg))]">
                    <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mb-2">Sources suggérées</p>
                    <div className="space-y-1.5">
                      {finalResult.source_candidates.slice(0, 5).map((s: any, i: number) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--accent)/.1)] text-[hsl(var(--accent))]">
                            {s.type}
                          </span>
                          <a href={s.url} target="_blank" rel="noreferrer"
                            className="text-[12px] text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent))] truncate transition-colors">
                            {s.name || s.url}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  onClick={() => navigate(`/projets/${projectId}`)}
                  className="btn-primary flex items-center gap-2"
                >
                  <ArrowRight className="w-4 h-4" />
                  Ouvrir le projet
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

const fadeSlide = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit:    { opacity: 0, y: -8 },
  transition: { duration: 0.2, ease: [0.22, 1, 0.36, 1] as any },
}
