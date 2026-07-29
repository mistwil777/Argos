/**
 * Assistant Argos — vocal complet
 *
 * Wake word  : "argos wake up" → démarre la séquence
 * Séquence   : accueil TTS → STT capte la demande → route → stream réponse
 * Flow A     : RAG direct (base déjà indexée)
 * Flow B     : Discovery (nouvelles sources découvertes + pipeline lancé)
 * Sources    : drawer latéral avec explication littérale + feedback préférences
 *
 * STT/TTS    : Web Speech API native — aucune dépendance HuggingFace
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, BookOpen, Zap, Terminal,
  Mic, MicOff, Volume2, VolumeX, List, Radio,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import PageHint from '@/components/ui/PageHint'
import SourcesPanel, { type DiscoveredSource } from '@/components/assistant/SourcesPanel'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  sources?: DiscoveredSource[]
  flow?: 'rag_direct' | 'discovery' | null
  intent?: any
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api/v1'

const WAKE_PATTERNS = ['argos wake up', 'argos réveille-toi', 'argos réveil', 'argos wakeup']

const GREETINGS = [
  "Bonjour, je suis Argos. Que puis-je faire pour vous ? Souhaitez-vous un débrief des dernières nouveautés ou avez-vous une demande particulière ?",
  "Argos à votre écoute. Quelle est votre demande ?",
  "Je suis prêt. Vous pouvez me poser votre question.",
]

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
const STT_SUPPORTED = !!SpeechRecognitionAPI
const TTS_SUPPORTED = !!window.speechSynthesis

const SUGGESTIONS = [
  'Débrief des dernières nouveautés',
  'Quels sujets ont été collectés cette semaine ?',
  'Je veux apprendre sur les agents IA',
  'Quelles sources sont actives ?',
]

// ─── Composant ────────────────────────────────────────────────────────────────

export default function Assistant() {
  const [messages, setMessages]         = useState<Message[]>([])
  const [input, setInput]               = useState('')
  const [loading, setLoading]           = useState(false)

  // Vocal
  const [wakeActive, setWakeActive]     = useState(false)   // écoute wake word
  const [listening, setListening]       = useState(false)   // écoute demande
  const [ttsEnabled, setTtsEnabled]     = useState(true)
  const [awaitingDemand, setAwaiting]   = useState(false)   // entre accueil et demande

  // Sources panel
  const [panelOpen, setPanelOpen]       = useState(false)
  const [panelSources, setPanelSources] = useState<DiscoveredSource[]>([])
  const [panelIntent, setPanelIntent]   = useState<any>(null)
  const [panelFlow, setPanelFlow]       = useState<'rag_direct' | 'discovery' | null>(null)

  const recognitionRef   = useRef<any>(null)
  const wakeRecognitionRef = useRef<any>(null)
  const endRef           = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── TTS helper ───────────────────────────────────────────────────────────────

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!TTS_SUPPORTED || !ttsEnabled) { onEnd?.(); return }
    window.speechSynthesis.cancel()
    const spoken = text.replace(/[#*`\[\]]/g, '').slice(0, 800)
    const utt = new SpeechSynthesisUtterance(spoken)
    utt.lang  = 'fr-FR'; utt.rate = 1.05; utt.pitch = 1.0
    const voices = window.speechSynthesis.getVoices()
    const fr = voices.find(v => v.lang.startsWith('fr'))
    if (fr) utt.voice = fr
    if (onEnd) utt.onend = onEnd
    window.speechSynthesis.speak(utt)
  }, [ttsEnabled])

  // ── STT helper ───────────────────────────────────────────────────────────────

  function captureOnce(onResult: (transcript: string) => void) {
    if (!STT_SUPPORTED) return
    const rec = new SpeechRecognitionAPI()
    rec.lang = 'fr-FR'; rec.interimResults = false; rec.maxAlternatives = 1
    recognitionRef.current = rec
    setListening(true)
    rec.onresult = (e: any) => {
      const t = e.results[0][0].transcript.trim()
      setListening(false)
      onResult(t)
    }
    rec.onerror = () => setListening(false)
    rec.onend   = () => setListening(false)
    rec.start()
  }

  // ── Wake word — écoute continue ──────────────────────────────────────────────

  function startWakeListening() {
    if (!STT_SUPPORTED || wakeActive) return
    setWakeActive(true)
    _wakeLoop()
  }

  function stopWakeListening() {
    setWakeActive(false)
    wakeRecognitionRef.current?.stop()
  }

  function _wakeLoop() {
    if (!STT_SUPPORTED) return
    const rec = new SpeechRecognitionAPI()
    rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false
    wakeRecognitionRef.current = rec

    rec.onresult = (e: any) => {
      const t = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('').toLowerCase()
      if (WAKE_PATTERNS.some(p => t.includes(p.toLowerCase().replace(/-/g, ' ')))) {
        rec.stop()
        _onWakeDetected()
      }
    }

    rec.onend = () => {
      // Relancer si toujours en mode wake
      setWakeActive(prev => {
        if (prev) setTimeout(_wakeLoop, 300)
        return prev
      })
    }

    rec.onerror = () => {
      setWakeActive(prev => {
        if (prev) setTimeout(_wakeLoop, 1000)
        return prev
      })
    }

    try { rec.start() } catch { /* ignore double-start */ }
  }

  function _onWakeDetected() {
    setAwaiting(true)
    const greeting = GREETINGS[Math.floor(Math.random() * GREETINGS.length)]
    speak(greeting, () => {
      setAwaiting(false)
      captureOnce(transcript => {
        if (transcript.length > 2) sendVocal(transcript)
      })
    })
  }

  // ── Envoi vocal (route /assistant/vocal SSE) ─────────────────────────────────

  const sendVocal = useCallback(async (transcript: string) => {
    if (!transcript.trim() || loading) return

    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: transcript }])
    setInput('')
    setLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }])

    try {
      const resp = await fetch(`${API_BASE}/assistant/vocal`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transcript }),
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''
      let sources: DiscoveredSource[] = []
      let intent: any = null
      let flow: 'rag_direct' | 'discovery' | null = null

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)

          if (payload === '[DONE]') break
          if (payload.startsWith('[FLOW]'))     { flow = payload.slice(6) as any; continue }
          if (payload.startsWith('[SOURCES]'))  { try { sources = JSON.parse(payload.slice(8)) } catch {} ; continue }
          if (payload.startsWith('[INTENT]'))   { try { intent  = JSON.parse(payload.slice(8)) } catch {} ; continue }
          if (payload.startsWith('[DISCOVERY_START]')) continue
          if (payload.startsWith('[ERROR]'))    { fullText += `\n_Erreur : ${payload.slice(7)}_`; continue }

          fullText += payload.replace(/\\n/g, '\n')
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: fullText } : m
          ))
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: fullText, streaming: false, sources, flow, intent }
          : m
      ))

      // Ouvrir le panel sources si discovery
      if (flow === 'discovery' && sources.length > 0) {
        setPanelSources(sources)
        setPanelIntent(intent)
        setPanelFlow(flow)
        setPanelOpen(true)
      }

      if (ttsEnabled && TTS_SUPPORTED && fullText) speak(fullText)

      // Reprendre le wake word après réponse
      if (wakeActive) setTimeout(_wakeLoop, 1500)

    } catch (err: any) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: `ERR / ${err.message}`, streaming: false } : m
      ))
    } finally {
      setLoading(false)
    }
  }, [loading, ttsEnabled, wakeActive, speak])

  // ── Envoi texte classique ─────────────────────────────────────────────────────

  const send = useCallback((q: string) => sendVocal(q), [sendVocal])

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* Hint */}
      <div className="px-6 pt-6">
        <PageHint id="assistant-vocal" steps={[
          { title: 'Wake word', body: 'Dites "Argos, wake up" pour activer l\'assistant vocal. Il vous accueille puis écoute votre demande.' },
          { title: 'Demande libre', body: 'Posez n\'importe quelle question. Si votre base est vide sur ce sujet, le système découvre automatiquement des sources et lance la collecte.' },
          { title: 'Sources', body: 'Cliquez sur "Sources" pour voir quelles sources ont été choisies, pourquoi, et exclure celles qui ne vous conviennent pas.' },
        ]} />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-6">
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-6 py-8"
            >
              <motion.div
                animate={{ boxShadow: [
                  '0 0 0 0 hsl(235 85% 65% / 0)',
                  '0 0 0 12px hsl(235 85% 65% / 0.08)',
                  '0 0 0 0 hsl(235 85% 65% / 0)',
                ]}}
                transition={{ repeat: Infinity, duration: 2.5 }}
                className="w-14 h-14 rounded-xl bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] flex items-center justify-center"
              >
                <Zap className="w-6 h-6 text-[hsl(var(--accent))]" strokeWidth={2.5} />
              </motion.div>
              <div className="max-w-xs">
                <h2 className="text-[16px] font-bold text-[hsl(var(--text))] tracking-tight">Assistant Argos</h2>
                <p className="text-[12.5px] text-[hsl(var(--text-2))] mt-2 leading-relaxed">
                  Dites <span className="font-mono text-[hsl(var(--accent))]">"Argos, wake up"</span> ou tapez votre question.
                  Le système cherche dans votre base ou découvre de nouvelles sources.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button key={s}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.07 }}
                    whileHover={{ y: -2, borderColor: 'hsl(var(--accent-line))' }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => send(s)}
                    className="text-[11.5px] font-mono px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:text-[hsl(var(--accent))] bg-[hsl(var(--bg-1))] transition-colors"
                  >{s}</motion.button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="space-y-4 max-w-3xl mx-auto">
          <AnimatePresence initial={false}>
            {messages.map(msg => (
              <motion.div key={msg.id}
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 26 }}
                className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]">
                    <Bot className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                  </div>
                )}
                <div className={`max-w-[78%] ${msg.role === 'user' ? 'order-first' : ''}`}>
                  <div className={`rounded-xl px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] font-medium ml-auto'
                      : 'panel-accent text-[hsl(var(--text))]'
                  }`}>
                    {msg.role === 'assistant' ? (
                      <>
                        <div className="prose-app">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                        {msg.streaming && (
                          <span className="inline-block w-1 h-3.5 bg-[hsl(var(--accent))] rounded ml-0.5 animate-pulse" />
                        )}
                      </>
                    ) : (
                      <p className="text-[13.5px]">{msg.content}</p>
                    )}
                  </div>

                  {/* Sources + bouton panel */}
                  {!msg.streaming && msg.role === 'assistant' && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="flex items-center gap-2 mt-1.5 flex-wrap"
                    >
                      {msg.sources && msg.sources.length > 0 && (
                        <>
                          <BookOpen className="w-2.5 h-2.5 text-[hsl(var(--text-3))]" />
                          {msg.sources.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-[10px] font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] px-1.5 py-0.5 rounded">
                              {s.name || s.url || `src:${i + 1}`}
                            </span>
                          ))}
                          <button
                            onClick={() => {
                              setPanelSources(msg.sources || [])
                              setPanelIntent(msg.intent)
                              setPanelFlow(msg.flow || null)
                              setPanelOpen(true)
                            }}
                            className="flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--accent))] hover:underline"
                          >
                            <List size={9} /> Voir toutes les sources
                          </button>
                        </>
                      )}
                      {msg.flow === 'discovery' && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-900/20 border border-amber-800/30 px-1.5 py-0.5 rounded">
                          nouvelles sources — collecte en cours
                        </span>
                      )}
                    </motion.div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                    <User className="w-3.5 h-3.5 text-[hsl(var(--text-2))]" />
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>

          {/* Typing dots */}
          <AnimatePresence>
            {loading && messages.at(-1)?.content === '' && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]">
                  <Bot className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                </div>
                <div className="panel px-4 py-3 flex items-center gap-1.5">
                  {[0, 1, 2].map(i => (
                    <motion.div key={i}
                      className="w-1.5 h-1.5 rounded-full bg-[hsl(var(--text-3))]"
                      animate={{ y: [0, -5, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} />
        </div>
      </div>

      {/* Input bar */}
      <div className="flex-shrink-0 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] px-6 py-4">
        <form
          onSubmit={e => { e.preventDefault(); send(input) }}
          className="input-field flex items-center gap-2 px-3 max-w-3xl mx-auto"
        >
          <Terminal className="w-3.5 h-3.5 text-[hsl(var(--text-3))] flex-shrink-0" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={
              awaitingDemand ? 'Argos vous écoute…'
              : listening     ? 'Écoute en cours…'
              : wakeActive    ? 'En attente de "Argos, wake up"…'
              : 'Posez une question ou dites "Argos, wake up"…'
            }
            disabled={loading}
            className="flex-1 bg-transparent py-3 text-[13.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none font-mono"
          />

          {/* Sources panel toggle */}
          <motion.button type="button" whileTap={{ scale: 0.9 }}
            onClick={() => setPanelOpen(true)}
            title="Voir les sources sélectionnées"
            className="w-7 h-7 flex-shrink-0 rounded flex items-center justify-center text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors"
          >
            <List className="w-3.5 h-3.5" />
          </motion.button>

          {/* TTS toggle */}
          {TTS_SUPPORTED && (
            <motion.button type="button" whileTap={{ scale: 0.9 }}
              onClick={() => { setTtsEnabled(p => !p); window.speechSynthesis.cancel() }}
              title={ttsEnabled ? 'Désactiver lecture vocale' : 'Activer lecture vocale'}
              className={`w-7 h-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${ttsEnabled ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-3))] opacity-50'}`}
            >
              {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </motion.button>
          )}

          {/* Wake word toggle */}
          {STT_SUPPORTED && (
            <motion.button type="button" whileTap={{ scale: 0.9 }}
              onClick={wakeActive ? stopWakeListening : startWakeListening}
              disabled={loading}
              title={wakeActive ? 'Désactiver le wake word' : 'Activer "Argos, wake up"'}
              className={`w-7 h-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
                wakeActive
                  ? 'bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))]'
                  : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))]'
              }`}
            >
              <Radio className="w-3.5 h-3.5" />
            </motion.button>
          )}

          {/* Micro one-shot */}
          {STT_SUPPORTED && (
            <motion.button type="button" whileTap={{ scale: 0.9 }}
              onClick={() => captureOnce(t => { setInput(t); setTimeout(() => send(t), 100) })}
              disabled={loading || listening}
              title="Dicter une question (fr-FR)"
              className={`w-7 h-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
                listening
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))]'
              }`}
            >
              {listening ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
            </motion.button>
          )}

          {/* Envoyer */}
          <motion.button type="submit"
            disabled={loading || !input.trim()}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
            className="w-8 h-8 flex-shrink-0 my-1 rounded bg-[hsl(var(--accent))] flex items-center justify-center disabled:opacity-35 transition-opacity"
          >
            <Send className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" />
          </motion.button>
        </form>

        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] text-center mt-1.5 max-w-3xl mx-auto">
          RAG hybride · discovery automatique · wake word "Argos, wake up"
          {wakeActive && <span className="text-[hsl(var(--accent))] ml-1">· en écoute</span>}
          {awaitingDemand && <span className="text-amber-400 ml-1">· en attente de votre demande</span>}
        </p>
      </div>

      {/* Sources panel */}
      <SourcesPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        sources={panelSources}
        intent={panelIntent}
        flow={panelFlow}
        onPreferenceSaved={() => {}}
      />
    </div>
  )
}
