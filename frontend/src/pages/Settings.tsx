import { useState, useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Target, Bell, Volume2, VolumeX, Mic, Save, Check,
  ChevronDown, RefreshCw, Loader2, Search, Eye, ExternalLink,
  Plus, CheckSquare, Square, Zap, BookOpen, Rss,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import { useVoice } from '@/context/VoiceContext'
import { useCollect } from '@/context/CollectContext'
import { api } from '@/services/api'
import DocumentGeneratorModal from '@/components/ui/DocumentGeneratorModal'

const LS_FOCUS   = 'argos:veille_focus'
const LS_HOURS   = 'argos:briefing_hours'
const LS_BRIEF_H = 'argos:briefing_time'

function loadFocus(): string  { return localStorage.getItem(LS_FOCUS)  ?? '' }
function loadHours(): number  { return Number(localStorage.getItem(LS_HOURS)) || 24 }
function loadBriefH(): string { return localStorage.getItem(LS_BRIEF_H) ?? '07:00' }

export default function Settings() {
  const { ttsEnabled, setTtsEnabled, startDictation } = useVoice()
  const { job: collectJob, startCollect } = useCollect()
  const { pathname } = useLocation()

  // Sujet actif persisté (affiché en haut, ne change qu'après save)
  const [activeFocus, setActiveFocus] = useState(loadFocus)

  // Champ d'édition (se vide après save)
  const [focus,      setFocus]      = useState('')
  const [hours,      setHours]      = useState(loadHours)
  const [briefTime,  setBriefTime]  = useState(loadBriefH)
  const [saved,      setSaved]      = useState(false)
  const [dictating,  setDictating]  = useState(false)
  const stopDictRef = useRef<(() => void) | null>(null)

  // Sujet recherché (peut différer de activeFocus si on lance la recherche juste après avoir tout défini)
  const [searchedSubject, setSearchedSubject] = useState<string>('')

  // Étape 1 : ce qu'Argos sait déjà (RAG)
  const [ragResult,  setRagResult]  = useState<{ answer: string; sources: any[] } | null>(null)
  const [ragLoading, setRagLoading] = useState(false)

  // Étape 2 : découverte de nouvelles sources
  type DiscoveryState = 'idle' | 'searching' | 'found' | 'confirming' | 'done'
  const [discState,    setDiscState]    = useState<DiscoveryState>('idle')
  const [_discIntent,  setDiscIntent]   = useState<any>(null)
  const [discSources,  setDiscSources]  = useState<any[]>([])
  const [existingUrls, setExistingUrls] = useState<Set<string>>(new Set())
  const [selectedSrcs, setSelectedSrcs] = useState<Set<number>>(new Set())
  const [discMsg,      setDiscMsg]      = useState<string>('')

  // Sélection du sujet cible pour la collecte
  const [sujets,       setSujets]       = useState<any[]>([])
  const [selectedSujet, setSelectedSujet] = useState<number | null>(null)

  const [genModal, setGenModal] = useState(false)

  const [adminOpen, setAdminOpen] = useState(false)
  const [indexing,  setIndexing]  = useState(false)
  const [indexMsg,  setIndexMsg]  = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('argos:tts_enabled')
    if (stored !== null) setTtsEnabled(stored === 'true')
  }, [setTtsEnabled])

  useEffect(() => {
    api.getSujets().then(d => setSujets(d.sujets || [])).catch(() => {})
  }, [])

  // Reset résultats à chaque visite de la page
  useEffect(() => {
    setRagResult(null)
    setDiscState('idle')
    setDiscSources([])
    setSelectedSrcs(new Set())
    setDiscMsg('')
    setSearchedSubject('')
    setExistingUrls(new Set())
    setGenModal(false)
  }, [pathname])

  function save() {
    const trimmed = focus.trim()
    if (!trimmed) return
    localStorage.setItem(LS_FOCUS,   trimmed)
    localStorage.setItem(LS_HOURS,   String(hours))
    localStorage.setItem(LS_BRIEF_H, briefTime)
    localStorage.setItem('argos:tts_enabled', String(ttsEnabled))
    setActiveFocus(trimmed)
    setFocus('')          // vide le champ pour une nouvelle saisie éventuelle
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function launchSearch() {
    const q = activeFocus || loadFocus()
    if (!q) return
    // Reset tout
    setRagResult(null)
    setDiscState('idle')
    setDiscSources([])
    setSelectedSrcs(new Set())
    setDiscMsg('')
    setSearchedSubject(q)

    // RAG sur l'existant uniquement — discovery reste manuelle
    setRagLoading(true)
    try {
      const r = await api.ragQuery(q)
      setRagResult({ answer: r.answer || r.response || '', sources: r.sources || [] })
    } catch (e: any) {
      setRagResult({ answer: `Erreur : ${e.message}`, sources: [] })
    } finally {
      setRagLoading(false)
    }
  }

  async function launchDiscovery() {
    const q = searchedSubject || activeFocus || loadFocus()
    if (!q) return
    setDiscState('searching')
    setDiscSources([])
    setExistingUrls(new Set())
    setSelectedSrcs(new Set())
    setDiscMsg('')
    try {
      // Récupère sources existantes et candidates en parallèle
      const [d, existing] = await Promise.all([
        api.veilleDiscover(q),
        api.getSources().catch(() => ({ sources: [] })),
      ])
      const knownUrls = new Set<string>(
        (existing.sources || []).map((s: any) => {
          try { return new URL(s.url).hostname } catch { return s.url }
        })
      )
      setExistingUrls(knownUrls)

      const candidates: any[] = d.sources || []
      setDiscIntent(d.intent || null)
      setDiscSources(candidates)
      // Ne pré-cocher que les sources vraiment nouvelles
      const newIdxs = candidates.reduce((acc: number[], s: any, i: number) => {
        const host = (() => { try { return new URL(s.url).hostname } catch { return s.url } })()
        if (!knownUrls.has(host)) acc.push(i)
        return acc
      }, [])
      setSelectedSrcs(new Set(newIdxs))
      const newCount = newIdxs.length
      const dupCount = candidates.length - newCount
      setDiscState(candidates.length > 0 ? 'found' : 'idle')
      setDiscMsg(candidates.length > 0
        ? `${newCount} nouvelle${newCount > 1 ? 's' : ''}${dupCount > 0 ? ` · ${dupCount} déjà surveillée${dupCount > 1 ? 's' : ''}` : ''}`
        : 'Aucune nouvelle source identifiée')
    } catch (e: any) {
      setDiscState('idle')
      setDiscMsg(`Erreur discovery : ${e.message}`)
    }
  }

  async function confirmSources() {
    const toCreate = discSources.filter((_: any, i: number) => selectedSrcs.has(i))
    if (!toCreate.length) return
    setDiscState('confirming')
    try {
      await startCollect(toCreate, selectedSujet)
      setDiscState('done')
    } catch (e: any) {
      setDiscState('found')
      setDiscMsg(`Erreur : ${e.message}`)
    }
  }

  function toggleSource(i: number) {
    setSelectedSrcs(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function toggleDictation() {
    if (dictating) {
      stopDictRef.current?.()
      stopDictRef.current = null
      setDictating(false)
      return
    }
    setDictating(true)
    const stop = startDictation(
      (text) => {
        setDictating(false)
        stopDictRef.current = null
        setFocus(prev => prev ? `${prev.trim()}\n${text}` : text)
      },
      () => setDictating(false),
    )
    stopDictRef.current = stop
  }

  async function rebuildIndex() {
    setIndexing(true); setIndexMsg(null)
    try {
      const r = await api.rebuildRagIndex()
      setIndexMsg(`✓  ${r.message || 'Index reconstruit'}`)
    } catch (e: any) {
      setIndexMsg(`ERR / ${e.message}`)
    } finally {
      setIndexing(false)
    }
  }

  const canSave = focus.trim().length > 0

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-5">

      {/* ── Sujet actif ── */}
      {activeFocus && (
        <motion.div
          initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
          className="panel-accent p-4 flex items-start justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <Eye className="w-4 h-4 text-[hsl(var(--accent))] flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">
                Veille active
              </p>
              <p className="text-[12.5px] text-[hsl(var(--text))] leading-relaxed line-clamp-3">
                {activeFocus}
              </p>
            </div>
          </div>
          <motion.button
            onClick={launchSearch}
            whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg flex-shrink-0
                       bg-[hsl(var(--accent))] text-white text-[11.5px] font-bold
                       hover:brightness-110 transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            Recherche immédiate
          </motion.button>
        </motion.div>
      )}

      {/* ── Étape 1 : ce qu'Argos sait déjà ── */}
      <AnimatePresence>
        {(ragLoading || ragResult) && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="panel overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              {ragLoading
                ? <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--accent))] animate-spin" />
                : <Search className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />}
              <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
                {ragLoading ? 'Consultation de la base…' : 'Ce qu\'Argos sait déjà'}
              </span>
            </div>
            {ragLoading && (
              <div className="px-4 py-6 flex justify-center gap-1">
                {[0,1,2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--text-3))]"
                    animate={{ y: [0,-5,0], opacity: [0.4,1,0.4] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            )}
            {ragResult && (
              <div className="px-4 py-4 space-y-3">
                {/* Réponse RAG — hauteur fixe, scroll interne */}
                <div className="max-h-48 overflow-y-auto pr-1 prose-app text-[12.5px] scrollbar-thin">
                  <ReactMarkdown>{ragResult.answer}</ReactMarkdown>
                </div>
                {ragResult.sources.length > 0 && (
                  <div className="space-y-1 pt-2 border-t border-[hsl(var(--line))]">
                    {ragResult.sources.slice(0, 4).map((s: any, i: number) => (
                      <div key={i} className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--text-3))]">
                        <span className="text-[hsl(var(--accent))]">[{i+1}]</span>
                        {s.url
                          ? <a href={s.url} target="_blank" rel="noreferrer"
                              className="hover:text-[hsl(var(--accent))] flex items-center gap-1 truncate">
                              <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                              <span className="truncate">{s.title || s.url}</span>
                            </a>
                          : <span className="truncate">{s.title || `source ${i+1}`}</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* ── Actions post-recherche ── */}
                <div className="pt-2 border-t border-[hsl(var(--line))] space-y-2">
                  {/* Score de couverture */}
                  <div className="flex items-center gap-2">
                    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
                      Couverture
                    </span>
                    <CoverageScore count={ragResult.sources.length} />
                  </div>

                  {/* Boutons d'action */}
                  <div className="flex flex-wrap gap-2 pt-1">
                    {/* 1. Ajouter des sources de surveillance */}
                    {discState === 'idle' && (
                      <motion.button
                        onClick={launchDiscovery}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--line))]
                                   hover:border-[hsl(var(--accent-line))] text-[11.5px] font-mono text-[hsl(var(--text-2))]
                                   hover:text-[hsl(var(--accent))] transition-all"
                      >
                        <Rss className="w-3 h-3" />
                        Ajouter des sources de surveillance
                      </motion.button>
                    )}

                    {/* 2. Générer une synthèse — modale sur place */}
                    <motion.button
                      onClick={() => setGenModal(true)}
                      whileTap={{ scale: 0.95 }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--line))]
                                 hover:border-[hsl(var(--accent-line))] text-[11.5px] font-mono text-[hsl(var(--text-2))]
                                 hover:text-[hsl(var(--accent))] transition-all"
                    >
                      <BookOpen className="w-3 h-3" />
                      Générer une synthèse
                    </motion.button>

                    {/* 3. Définir comme veille active */}
                    {searchedSubject && searchedSubject !== activeFocus && (
                      <motion.button
                        onClick={() => {
                          localStorage.setItem(LS_FOCUS, searchedSubject)
                          setActiveFocus(searchedSubject)
                        }}
                        whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg
                                   bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]
                                   text-[11.5px] font-mono text-[hsl(var(--accent))] transition-all
                                   hover:brightness-110"
                      >
                        <Eye className="w-3 h-3" />
                        Définir comme veille active
                      </motion.button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Étape 2 : nouvelles sources à collecter ── */}
      <AnimatePresence>
        {discState !== 'idle' && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="panel overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              {discState === 'searching' || discState === 'confirming'
                ? <Loader2 className="w-3.5 h-3.5 text-[hsl(var(--accent))] animate-spin" />
                : discState === 'done'
                  ? <Check className="w-3.5 h-3.5 text-[hsl(var(--green))]" />
                  : <Plus className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />}
              <span className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
                {discState === 'searching' ? 'Découverte de nouvelles sources…'
                  : discState === 'confirming' ? 'Création en cours…'
                  : discState === 'done' ? 'Sources ajoutées'
                  : 'Nouvelles sources à collecter'}
              </span>
              {discMsg && discState !== 'searching' && (
                <span className={`ml-auto text-[10.5px] font-mono ${discState === 'done' ? 'text-[hsl(var(--green))]' : 'text-[hsl(var(--text-3))]'}`}>
                  {discMsg}
                </span>
              )}
            </div>

            {discState === 'searching' && (
              <div className="px-4 py-6 flex justify-center gap-1">
                {[0,1,2].map(i => (
                  <motion.div key={i} className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--text-3))]"
                    animate={{ y: [0,-5,0], opacity: [0.4,1,0.4] }}
                    transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }} />
                ))}
              </div>
            )}

            {discState === 'found' && discSources.length > 0 && (
              <div>
                {/* Liste sources — max 5 visibles, scroll interne */}
                <div className="max-h-64 overflow-y-auto divide-y divide-[hsl(var(--line))] scrollbar-thin">
                {discSources.map((s: any, i: number) => {
                  const host = (() => { try { return new URL(s.url).hostname } catch { return s.url } })()
                  const isKnown = existingUrls.has(host)
                  return (
                  <label key={i}
                    className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors ${
                      isKnown ? 'opacity-50 hover:opacity-70' : 'hover:bg-[hsl(var(--bg-2))]'
                    }`}>
                    <button type="button" onClick={() => toggleSource(i)} className="flex-shrink-0 mt-0.5">
                      {selectedSrcs.has(i)
                        ? <CheckSquare className="w-4 h-4 text-[hsl(var(--accent))]" />
                        : <Square className="w-4 h-4 text-[hsl(var(--text-3))]" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-[12.5px] font-semibold text-[hsl(var(--text))] truncate">{s.name || s.title || s.url}</p>
                        {isKnown && (
                          <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))] flex-shrink-0 border border-[hsl(var(--line))]">
                            déjà surveillée
                          </span>
                        )}
                      </div>
                      {s.url && (
                        <a href={s.url} target="_blank" rel="noreferrer"
                          className="text-[10.5px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 truncate mt-0.5">
                          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />
                          <span className="truncate">{s.url}</span>
                        </a>
                      )}
                      {s.reason && (
                        <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5 line-clamp-1">{s.reason}</p>
                      )}
                    </div>
                    {s.source_type && (
                      <span className="text-[9.5px] font-mono px-1.5 py-0.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-3))] flex-shrink-0">
                        {s.source_type}
                      </span>
                    )}
                  </label>
                  )
                })}
                </div>
                <div className="px-4 py-3 bg-[hsl(var(--bg-2))] border-t border-[hsl(var(--line))] flex items-center gap-3 flex-wrap">
                  <span className="text-[11px] text-[hsl(var(--text-3))] flex-shrink-0">
                    {selectedSrcs.size} / {discSources.length} sélectionnée{selectedSrcs.size > 1 ? 's' : ''}
                  </span>
                  {/* Sélecteur de sujet cible */}
                  {sujets.length > 0 && (
                    <select
                      value={selectedSujet ?? ''}
                      onChange={e => setSelectedSujet(e.target.value ? Number(e.target.value) : null)}
                      className="flex-1 min-w-0 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2 py-1.5
                                 text-[11.5px] font-mono text-[hsl(var(--text-2))] outline-none
                                 focus:border-[hsl(var(--accent-line))] transition-colors"
                    >
                      <option value="">— Rattacher à un sujet (optionnel)</option>
                      {sujets.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  )}
                  <motion.button
                    onClick={confirmSources}
                    disabled={selectedSrcs.size === 0}
                    whileTap={{ scale: 0.95 }}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white
                               text-[12px] font-bold disabled:opacity-40 transition-opacity flex-shrink-0"
                  >
                    <Zap className="w-3.5 h-3.5" />
                    Lancer la collecte
                  </motion.button>
                </div>
              </div>
            )}

            {discState === 'done' && collectJob && (
              <div className="px-4 py-4 space-y-3">
                <div className="flex items-center gap-3">
                  {collectJob.itemsCollected === 0
                    ? <Loader2 className="w-4 h-4 text-[hsl(var(--accent))] animate-spin flex-shrink-0" />
                    : <Check className="w-4 h-4 text-[hsl(var(--green))] flex-shrink-0" />}
                  <p className="text-[12.5px] text-[hsl(var(--text-2))]">
                    {collectJob.message}
                  </p>
                </div>
                {collectJob.itemsCollected === 0 && (
                  <div className="flex gap-1 pl-7">
                    {[0,1,2,3,4].map(i => (
                      <motion.div key={i}
                        className="w-1 h-4 rounded-full bg-[hsl(var(--accent))]"
                        animate={{ scaleY: [0.3, 1, 0.3] }}
                        transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-[hsl(var(--text-3))] pl-7">
                  Vous pouvez naviguer librement — la collecte continue en arrière-plan.
                </p>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Périmètre de veille ── */}
      <Panel title="Périmètre de veille" icon={Target}>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[12px] text-[hsl(var(--text-3))]">
            {activeFocus
              ? 'Saisissez un nouveau sujet pour remplacer la veille active.'
              : 'Décrivez ce que vous souhaitez surveiller — thèmes, entités, produits, marchés.'}
          </p>
          <div className="relative">
            <textarea
              value={focus}
              onChange={e => setFocus(e.target.value)}
              placeholder={activeFocus
                ? `Sujet actuel :\n${activeFocus}\n\n— Saisissez ici pour en définir un nouveau`
                : `Ex :\n· LLMs open-source et leurs benchmarks\n· Anthropic, OpenAI, Mistral\n· Réglementation IA en Europe`
              }
              rows={6}
              className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg px-3 py-2.5
                         text-[12.5px] font-mono text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))]
                         outline-none resize-none focus:border-[hsl(var(--accent-line))] transition-colors"
            />
            <button
              type="button"
              onClick={toggleDictation}
              title={dictating ? 'Arrêter la dictée' : 'Dicter'}
              className={`absolute bottom-2.5 right-2.5 w-7 h-7 rounded flex items-center justify-center transition-colors ${
                dictating
                  ? 'text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] animate-pulse'
                  : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] border border-[hsl(var(--line))]'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
            </button>
          </div>
          {dictating && (
            <p className="text-[11px] font-mono text-[hsl(var(--accent))] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))] animate-ping inline-block" />
              Dictez maintenant…
            </p>
          )}
        </div>
      </Panel>

      {/* ── Briefing quotidien ── */}
      <Panel title="Briefing quotidien" icon={Bell}>
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">
                Fenêtre d'analyse
              </label>
              <select
                value={hours}
                onChange={e => setHours(Number(e.target.value))}
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2
                           text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none
                           focus:border-[hsl(var(--accent-line))] transition-colors"
              >
                <option value={24}>24 heures</option>
                <option value={48}>48 heures</option>
                <option value={72}>72 heures</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">
                Heure de génération
              </label>
              <input
                type="time"
                value={briefTime}
                onChange={e => setBriefTime(e.target.value)}
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2
                           text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none
                           focus:border-[hsl(var(--accent-line))] transition-colors"
              />
            </div>
          </div>
          <p className="text-[11px] text-[hsl(var(--text-3))]">
            Générateur automatique via APScheduler (07:00 configuré côté backend).
            L'heure ici est indicative — modifier le scheduler nécessite un redémarrage.
          </p>
        </div>
      </Panel>

      {/* ── Lecture vocale ── */}
      <Panel title="Lecture vocale" icon={ttsEnabled ? Volume2 : VolumeX}>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[12.5px] text-[hsl(var(--text-2))]">Lire les réponses à voix haute</p>
            <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">Synthèse vocale du navigateur (fr-FR)</p>
          </div>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              ttsEnabled ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--bg-3))]'
            }`}
          >
            <motion.div
              animate={{ x: ttsEnabled ? 20 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
            />
          </button>
        </div>
      </Panel>

      {/* ── Boutons action ── */}
      <div className="flex gap-3">
        <motion.button
          onClick={save}
          disabled={!canSave}
          whileTap={{ scale: 0.97 }}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg
                     bg-[hsl(var(--accent))] text-white text-[13px] font-bold
                     disabled:opacity-40 transition-opacity"
        >
          <AnimatePresence mode="wait">
            {saved ? (
              <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Check className="w-4 h-4" /> Enregistré
              </motion.span>
            ) : (
              <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                exit={{ opacity: 0 }} className="flex items-center gap-2">
                <Save className="w-4 h-4" /> Enregistrer
              </motion.span>
            )}
          </AnimatePresence>
        </motion.button>

      </div>

      {/* ── Maintenance (replié) ── */}
      <div>
        <button
          onClick={() => setAdminOpen(v => !v)}
          className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors"
        >
          <motion.div animate={{ rotate: adminOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
            <ChevronDown className="w-3 h-3" />
          </motion.div>
          Maintenance système
        </button>
        <AnimatePresence>
          {adminOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3"
            >
              <Panel title="Index RAG" icon={RefreshCw}>
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[11.5px] text-[hsl(var(--text-3))]">
                    Reconstruit l'index vectoriel depuis les digests existants.
                  </p>
                  <div className="flex items-center gap-3">
                    <button onClick={rebuildIndex} disabled={indexing}
                      className="flex items-center gap-2 px-3 py-1.5 rounded border border-[hsl(var(--line))]
                                 hover:border-[hsl(var(--line-bright))] text-[11.5px] font-mono text-[hsl(var(--text-2))]
                                 hover:text-[hsl(var(--text))] disabled:opacity-50 transition-all">
                      {indexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Reconstruire l'index
                    </button>
                    {indexMsg && (
                      <span className={`text-[11px] font-mono ${indexMsg.startsWith('ERR') ? 'text-[hsl(var(--red))]' : 'text-[hsl(var(--green))]'}`}>
                        {indexMsg}
                      </span>
                    )}
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Modale génération de synthèse ── */}
      {genModal && (
        <DocumentGeneratorModal
          itemIds={[]}
          initialPrompt={searchedSubject}
          onClose={() => setGenModal(false)}
          onSaved={() => setGenModal(false)}
        />
      )}

    </div>
  )
}

function CoverageScore({ count }: { count: number }) {
  const level = count === 0 ? 'aucune' : count <= 2 ? 'faible' : count <= 5 ? 'moyenne' : 'bonne'
  const color =
    level === 'aucune' ? 'text-[hsl(var(--text-3))]' :
    level === 'faible' ? 'text-[hsl(var(--red))]' :
    level === 'moyenne' ? 'text-[hsl(var(--yellow))]' :
    'text-[hsl(var(--green))]'
  return (
    <span className={`text-[11px] font-mono font-semibold ${color}`}>
      {count} source{count > 1 ? 's' : ''} · {level}
    </span>
  )
}

function Panel({ title, icon: Icon, children }: {
  title: string; icon: any; children: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
        <Icon className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
        <span className="text-[13.5px] font-bold text-[hsl(var(--text))] tracking-tight">{title}</span>
      </div>
      {children}
    </motion.div>
  )
}
