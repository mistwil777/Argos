import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Sparkles, Check, ChevronRight, Plus } from 'lucide-react'
import { api } from '@/services/api'
import ReactMarkdown from 'react-markdown'

const INTENTION_LABELS: Record<string, string> = {
  apprendre: 'Apprendre',
  projets: 'Projet',
  surveiller: 'Surveiller',
}

interface QA { q: string; a: string }

interface Props {
  sujetId: number
  sujetName: string
  intentionType: string
  initialContext?: string
  onClose: () => void
  onDone: (filterConfig: any, intentionType: string) => void
}

type Phase = 'interview' | 'summary' | 'filter'

export default function QuestionnaireModal({ sujetId, sujetName, intentionType, initialContext, onClose, onDone }: Props) {
  const [phase, setPhase] = useState<Phase>('interview')

  // Interview
  const [history, setHistory] = useState<QA[]>([])
  const [currentQuestion, setCurrentQuestion] = useState('')
  const [currentType, setCurrentType] = useState<'open' | 'multiselect' | 'scale5'>('open')
  const [currentOptions, setCurrentOptions] = useState<string[]>([])
  const [answer, setAnswer] = useState('')
  const [loadingNext, setLoadingNext] = useState(false)
  const [interviewDone, setInterviewDone] = useState(false)

  // Bilan
  const [summaryMd, setSummaryMd] = useState('')
  const [loadingSummary, setLoadingSummary] = useState(false)
  const [extraInfo, setExtraInfo] = useState('')
  const [addingExtra, setAddingExtra] = useState(false)

  // Whitelist
  const [confirmedItems, setConfirmedItems] = useState<{ term: string; accepted: boolean }[]>([])
  const [suggestedItems, setSuggestedItems] = useState<{ term: string; accepted: boolean }[]>([])
  const [filterSummary, setFilterSummary] = useState('')
  const [loadingFilter, setLoadingFilter] = useState(false)

  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Charger la première question au montage
  useEffect(() => {
    loadNextQuestion([])
  }, [])

  useEffect(() => {
    if (phase === 'interview' && !loadingNext) textareaRef.current?.focus()
  }, [currentQuestion, phase, loadingNext])

  async function loadNextQuestion(qa: QA[]) {
    setLoadingNext(true)
    setAnswer('')
    try {
      const result = await api.nextQuestion(sujetId, {
        intention_type: intentionType,
        sujet_name: sujetName,
        previous_qa: qa,
        ...(initialContext ? { initial_context: initialContext } : {}),
      })
      if (result.done) {
        setInterviewDone(true)
        setCurrentQuestion('')
      } else {
        setCurrentQuestion(result.question.text)
        setCurrentType(result.question.type || 'open')
        setCurrentOptions(result.question.options || [])
      }
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setLoadingNext(false) }
  }

  async function submitAnswer() {
    if (!answer.trim()) return
    const newHistory = [...history, { q: currentQuestion, a: answer.trim() }]
    setHistory(newHistory)
    if (interviewDone) return
    await loadNextQuestion(newHistory)
  }

  async function finishInterview() {
    setLoadingSummary(true)
    setPhase('summary')
    try {
      const result = await api.generateSummary(sujetId, {
        intention_type: intentionType,
        sujet_name: sujetName,
        previous_qa: history,
        ...(initialContext ? { initial_context: initialContext } : {}),
      })
      setSummaryMd(result.summary_md || '')
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setLoadingSummary(false) }
  }

  async function addExtraAndContinue() {
    if (!extraInfo.trim()) { generateFilter(); return }
    setAddingExtra(true)
    // Régénérer le bilan avec les infos supplémentaires
    try {
      const result = await api.generateSummary(sujetId, {
        intention_type: intentionType,
        sujet_name: sujetName,
        previous_qa: history,
        extra_info: extraInfo,
        ...(initialContext ? { initial_context: initialContext } : {}),
      })
      setSummaryMd(result.summary_md || '')
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setAddingExtra(false) }
  }

  async function generateFilter() {
    setLoadingFilter(true)
    setPhase('filter')
    try {
      const result = await api.generateFilterConfig(sujetId, {
        intention_type: intentionType,
        sujet_name: sujetName,
        previous_qa: history,
        extra_info: extraInfo,
        ...(initialContext ? { initial_context: initialContext } : {}),
      })
      const fc = result.filter_config || {}
      setConfirmedItems((fc.must_match_confirmed || fc.must_match || []).map((t: string) => ({ term: t, accepted: true })))
      setSuggestedItems((fc.must_match_suggested || []).map((t: string) => ({ term: t, accepted: false })))
      setFilterSummary(result.summary || '')
    } catch (e: any) { alert(`Erreur : ${e.message}`) }
    finally { setLoadingFilter(false) }
  }

  function confirm() {
    const accepted = [
      ...confirmedItems.filter(f => f.accepted).map(f => f.term),
      ...suggestedItems.filter(f => f.accepted).map(f => f.term),
    ]
    onDone({ must_match: accepted, min_match_count: 1 }, intentionType)
  }

  const canSubmit = answer.trim().length > 0
  const progressPct = history.length > 0 ? Math.min(100, history.length * 12) : 0

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 16 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-2xl max-h-[90vh] flex flex-col panel overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
          <div>
            <p className="text-[14px] font-bold text-[hsl(var(--text))]">{sujetName}</p>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{INTENTION_LABELS[intentionType]}</span>
              {phase === 'interview' && history.length > 0 && (
                <>
                  <span className="text-[hsl(var(--text-3))]">·</span>
                  <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{history.length} réponse{history.length > 1 ? 's' : ''}</span>
                </>
              )}
              {phase === 'summary' && <span className="text-[10.5px] font-mono text-[hsl(var(--aqua))]">Bilan</span>}
              {phase === 'filter' && <span className="text-[10.5px] font-mono text-[hsl(var(--accent))]">Whitelist</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Barre de progression interview */}
        {phase === 'interview' && (
          <div className="flex-shrink-0 h-1 bg-[hsl(var(--bg-3))]">
            <motion.div className="h-full bg-[hsl(var(--accent))]"
              animate={{ width: `${progressPct}%` }} transition={{ duration: 0.4 }} />
          </div>
        )}

        {/* Contenu */}
        <div className="flex-1 overflow-auto">

          {/* ── Phase interview ── */}
          {phase === 'interview' && (
            <div className="p-6 space-y-6">

              {/* Historique */}
              {history.length > 0 && (
                <div className="space-y-3">
                  {history.map((qa, i) => (
                    <div key={i} className="space-y-1">
                      <p className="text-[11.5px] text-[hsl(var(--text-3))]">{qa.q}</p>
                      <div className="px-3 py-2 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                        <p className="text-[12.5px] text-[hsl(var(--text-2))]">{qa.a}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Question courante */}
              <AnimatePresence mode="wait">
                {loadingNext ? (
                  <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    className="flex items-center gap-2 text-[hsl(var(--text-3))]">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-[12px] font-mono">Analyse en cours…</span>
                  </motion.div>
                ) : interviewDone ? (
                  <motion.div key="done" initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                    className="p-4 rounded-xl bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]">
                    <p className="text-[13px] font-semibold text-[hsl(var(--accent))]">Entretien terminé</p>
                    <p className="text-[12px] text-[hsl(var(--text-2))] mt-1">
                      J'ai suffisamment d'informations pour configurer ta veille. Passe au bilan pour vérifier avant de valider.
                    </p>
                  </motion.div>
                ) : currentQuestion ? (
                  <motion.div key={currentQuestion} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }} className="space-y-3">
                    <p className="text-[14px] font-semibold text-[hsl(var(--text))] leading-snug">{currentQuestion}</p>

                    {currentType === 'scale5' ? (
                      <div className="flex gap-2">
                        {[1, 2, 3, 4, 5].map(n => (
                          <button key={n} onClick={() => setAnswer(String(n))}
                            className={`flex-1 py-3 rounded-xl border-2 text-[13px] font-bold transition-all ${
                              answer === String(n)
                                ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                                : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))]'
                            }`}>
                            {n}
                          </button>
                        ))}
                      </div>
                    ) : currentType === 'multiselect' && currentOptions.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {currentOptions.map(opt => {
                          const sel = answer.split(',').map(s => s.trim()).filter(Boolean)
                          const isOn = sel.includes(opt)
                          return (
                            <button key={opt} onClick={() => {
                              const cur = answer.split(',').map(s => s.trim()).filter(Boolean)
                              const next = isOn ? cur.filter(s => s !== opt) : [...cur, opt]
                              setAnswer(next.join(', '))
                            }}
                              className={`px-3 py-1.5 rounded-lg border text-[12px] transition-all ${
                                isOn
                                  ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))]'
                                  : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))]'
                              }`}>{opt}</button>
                          )
                        })}
                        {answer && (
                          <p className="w-full text-[11px] font-mono text-[hsl(var(--text-3))]">Sélectionné : {answer}</p>
                        )}
                      </div>
                    ) : (
                      <textarea
                        ref={textareaRef}
                        value={answer}
                        onChange={e => setAnswer(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && canSubmit) submitAnswer() }}
                        rows={3}
                        placeholder="Ta réponse… (Cmd+Entrée pour valider)"
                        className="w-full px-4 py-3 rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg))] text-[13px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent-line))] resize-none"
                      />
                    )}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          )}

          {/* ── Phase bilan ── */}
          {phase === 'summary' && (
            <div className="p-6 space-y-5">
              {loadingSummary ? (
                <div className="flex items-center gap-2 text-[hsl(var(--text-3))]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[12px] font-mono">Génération du bilan…</span>
                </div>
              ) : (
                <>
                  <div className="prose prose-sm prose-invert max-w-none text-[13px] leading-relaxed text-[hsl(var(--text-2))] [&_h2]:text-[14px] [&_h2]:font-bold [&_h2]:text-[hsl(var(--text))] [&_h3]:text-[12.5px] [&_h3]:font-semibold [&_h3]:text-[hsl(var(--text))] [&_strong]:text-[hsl(var(--text))] [&_ul]:space-y-1 [&_li]:text-[12.5px]">
                    <ReactMarkdown>{summaryMd}</ReactMarkdown>
                  </div>

                  {/* Champ pour ajouter des infos */}
                  <div className="border-t border-[hsl(var(--line))] pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-[11.5px] font-semibold text-[hsl(var(--text-2))]">
                        Quelque chose à corriger ou ajouter ?
                      </p>
                      {extraInfo.trim() && (
                        <button onClick={addExtraAndContinue} disabled={addingExtra}
                          className="flex items-center gap-1.5 text-[11.5px] font-mono text-[hsl(var(--accent))] hover:underline disabled:opacity-40">
                          {addingExtra ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Mettre à jour
                        </button>
                      )}
                    </div>
                    <textarea
                      value={extraInfo}
                      onChange={e => setExtraInfo(e.target.value)}
                      rows={3}
                      placeholder="Tu as oublié de mentionner LangGraph, je veux aussi suivre Mistral AI, exclure tel sujet…"
                      className="w-full px-3 py-2 rounded-lg border border-[hsl(var(--accent-line)/0.4)] bg-[hsl(var(--bg))] text-[12.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] focus:outline-none focus:border-[hsl(var(--accent-line))] resize-none transition-colors"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Phase whitelist ── */}
          {phase === 'filter' && (
            <div className="p-6 space-y-5">
              {loadingFilter ? (
                <div className="flex items-center gap-2 text-[hsl(var(--text-3))]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[12px] font-mono">Génération de la whitelist…</span>
                </div>
              ) : (
                <>
                  {filterSummary && (
                    <p className="text-[12.5px] text-[hsl(var(--text-2))] leading-relaxed">{filterSummary}</p>
                  )}

                  {/* Termes confirmés — ce que l'utilisateur a nommé */}
                  {confirmedItems.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11.5px] font-semibold text-[hsl(var(--aqua))]">Termes confirmés</p>
                        <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                          ce que tu as mentionné — {confirmedItems.filter(f => f.accepted).length}/{confirmedItems.length} actifs
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {confirmedItems.map((f, i) => (
                          <button key={i} onClick={() => setConfirmedItems(prev => prev.map((item, idx) =>
                            idx === i ? { ...item, accepted: !item.accepted } : item
                          ))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-mono transition-all ${
                              f.accepted
                                ? 'border-[hsl(var(--aqua)/.5)] bg-[hsl(var(--aqua)/.08)] text-[hsl(var(--aqua))]'
                                : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] line-through opacity-40'
                            }`}>
                            {f.accepted ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                            {f.term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Termes suggérés — proposés par l'agent, à valider */}
                  {suggestedItems.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-[11.5px] font-semibold text-[hsl(var(--yellow))]">Termes suggérés par l'agent</p>
                        <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                          à valider — {suggestedItems.filter(f => f.accepted).length}/{suggestedItems.length} sélectionnés
                        </p>
                      </div>
                      <p className="text-[11px] text-[hsl(var(--text-3))] mb-2">
                        Termes connexes détectés par l'agent — coche ceux qui correspondent à ton périmètre.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {suggestedItems.map((f, i) => (
                          <button key={i} onClick={() => setSuggestedItems(prev => prev.map((item, idx) =>
                            idx === i ? { ...item, accepted: !item.accepted } : item
                          ))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11.5px] font-mono transition-all ${
                              f.accepted
                                ? 'border-[hsl(var(--yellow)/.5)] bg-[hsl(var(--yellow)/.08)] text-[hsl(var(--yellow))]'
                                : 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] opacity-60 hover:opacity-90'
                            }`}>
                            {f.accepted ? <Check className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                            {f.term}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {confirmedItems.length === 0 && suggestedItems.length === 0 && (
                    <p className="text-[12px] text-[hsl(var(--text-3))]">Aucun terme généré.</p>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 px-6 py-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex items-center justify-between">
          <button onClick={onClose} className="text-[11.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
            Annuler
          </button>

          <div className="flex items-center gap-3">
            {/* Interview — soumettre la réponse ou finir */}
            {phase === 'interview' && !loadingNext && (
              interviewDone ? (
                <button onClick={finishInterview}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold transition-all">
                  <Sparkles className="w-3.5 h-3.5" /> Voir le bilan
                </button>
              ) : currentQuestion ? (
                <button onClick={submitAnswer} disabled={!canSubmit}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-all">
                  Suivant <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : null
            )}

            {/* Bilan — générer la whitelist */}
            {phase === 'summary' && !loadingSummary && !addingExtra && (
              <button onClick={generateFilter}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold transition-all">
                <Sparkles className="w-3.5 h-3.5" /> Générer la whitelist
              </button>
            )}

            {/* Whitelist — valider */}
            {phase === 'filter' && !loadingFilter && (
              <button onClick={confirm}
                disabled={confirmedItems.filter(f => f.accepted).length === 0 && suggestedItems.filter(f => f.accepted).length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-all">
                <Check className="w-3.5 h-3.5" /> Valider la configuration
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
