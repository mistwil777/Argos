/**
 * Assistant Argos — RAG conversationnel avec vocal
 *
 * STT  : Web Speech API (SpeechRecognition) — natif navigateur, français
 * TTS  : Web Speech API (SpeechSynthesis)   — natif navigateur, aucun modèle à télécharger
 * LLM  : Claude via /rag/ask/stream (SSE)   — tokens affichés en temps réel
 *
 * Aucune dépendance HuggingFace — fonctionne derrière Zscaler.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, Loader2, BookOpen, Zap, Terminal,
  Mic, MicOff, Volume2, VolumeX,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import PageHint from '@/components/ui/PageHint'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  sources?: Source[]
}

interface Source {
  title?: string
  source?: string
  url?: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api/v1'

const SUGGESTIONS = [
  'Comment fonctionne web.digest ?',
  'Quels outils MCP sont disponibles ?',
  'Quels sont les derniers articles haute importance ?',
  'Résume les tendances de cette semaine.',
  'Comment configurer une source GitHub ?',
]

// ─── Helpers Web Speech API ───────────────────────────────────────────────────

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

const STT_SUPPORTED = !!SpeechRecognitionAPI
const TTS_SUPPORTED = !!window.speechSynthesis

// ─── Composant principal ──────────────────────────────────────────────────────

export default function Assistant() {
  const [messages, setMessages]     = useState<Message[]>([])
  const [input, setInput]           = useState('')
  const [loading, setLoading]       = useState(false)

  // Vocal
  const [listening, setListening]   = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const recognitionRef = useRef<any>(null)
  const synthRef       = useRef<SpeechSynthesisUtterance | null>(null)

  const endRef     = useRef<HTMLDivElement>(null)
  const abortRef   = useRef<AbortController | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Envoi question + streaming SSE ──────────────────────────────────────────

  const send = useCallback(async (q: string) => {
    if (!q.trim() || loading) return

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: q }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }])

    abortRef.current = new AbortController()

    try {
      const resp = await fetch(`${API_BASE}/rag/ask/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, use_hybrid_search: true }),
        signal: abortRef.current.signal,
      })

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      if (!resp.body) throw new Error('No body')

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let sources: Source[] = []
      let fullText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)

          if (payload === '[DONE]') break

          if (payload.startsWith('[SOURCES]')) {
            try { sources = JSON.parse(payload.slice(9)) } catch { /* ignore */ }
            continue
          }

          if (payload.startsWith('[ERROR]')) {
            fullText += `\n\n_Erreur : ${payload.slice(7)}_`
            continue
          }

          // Rétablir les newlines échappés
          const text = payload.replace(/\\n/g, '\n')
          fullText += text

          setMessages(prev => prev.map(m =>
            m.id === assistantId
              ? { ...m, content: fullText, streaming: true }
              : m
          ))
        }
      }

      // Finaliser le message
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: fullText, streaming: false, sources }
          : m
      ))

      // TTS : lire la réponse si activé
      if (ttsEnabled && TTS_SUPPORTED && fullText) {
        speakText(fullText)
      }

    } catch (err: any) {
      if (err.name === 'AbortError') return
      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: `ERR / ${err.message}`, streaming: false }
          : m
      ))
    } finally {
      setLoading(false)
    }
  }, [loading, ttsEnabled])

  // ── STT : Web Speech API ─────────────────────────────────────────────────────

  function startListening() {
    if (!STT_SUPPORTED || listening) return

    const recognition = new SpeechRecognitionAPI()
    recognition.lang         = 'fr-FR'
    recognition.interimResults = true
    recognition.maxAlternatives = 1

    recognitionRef.current = recognition

    recognition.onstart = () => setListening(true)

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
      setInput(transcript)
    }

    recognition.onend = () => {
      setListening(false)
      // Si du texte a été capturé, envoyer automatiquement
      setInput(prev => {
        if (prev.trim().length > 2) {
          setTimeout(() => send(prev), 100)
        }
        return prev
      })
    }

    recognition.onerror = () => setListening(false)

    recognition.start()
  }

  function stopListening() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  // ── TTS : Web Speech API ─────────────────────────────────────────────────────

  function speakText(text: string) {
    if (!TTS_SUPPORTED) return
    window.speechSynthesis.cancel()

    // Tronquer le texte pour la lecture vocale (max ~600 caractères)
    const spoken = text.replace(/[#*`]/g, '').slice(0, 600)
    const utterance = new SpeechSynthesisUtterance(spoken)
    utterance.lang  = 'fr-FR'
    utterance.rate  = 1.05
    utterance.pitch = 1.0

    // Préférer une voix française si disponible
    const voices = window.speechSynthesis.getVoices()
    const frVoice = voices.find(v => v.lang.startsWith('fr'))
    if (frVoice) utterance.voice = frVoice

    synthRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

  function stopSpeaking() {
    window.speechSynthesis.cancel()
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      {/* Hint */}
      <div className="px-6 pt-6">
        <PageHint id="assistant-vocal" steps={[
          { title: 'Vocal (STT)', body: 'Cliquez sur le micro pour dicter votre question. Utilise l\'API native du navigateur — aucun modèle à télécharger.' },
          { title: 'Streaming', body: 'La réponse s\'affiche token par token via SSE. Vous pouvez lire pendant que Claude rédige.' },
          { title: 'Lecture (TTS)', body: 'Après chaque réponse, le système lit les 600 premiers caractères. Désactivez avec le bouton haut-parleur.' },
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
                  Questions en texte ou en vocal. Réponses streamées depuis votre base de connaissances.
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
                    {msg.role === 'assistant'
                      ? (
                        <>
                          <div className="prose-app">
                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                          </div>
                          {msg.streaming && (
                            <span className="inline-block w-1 h-3.5 bg-[hsl(var(--accent))] rounded ml-0.5 animate-pulse" />
                          )}
                        </>
                      )
                      : <p className="text-[13.5px]">{msg.content}</p>
                    }
                  </div>
                  {msg.sources && msg.sources.length > 0 && !msg.streaming && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="flex items-center gap-1.5 mt-1.5 flex-wrap"
                    >
                      <BookOpen className="w-2.5 h-2.5 text-[hsl(var(--text-3))]" />
                      {msg.sources.slice(0, 4).map((s, i) => (
                        <span key={i} className="text-[10px] font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] px-1.5 py-0.5 rounded">
                          {s.title || s.source || `src:${i + 1}`}
                        </span>
                      ))}
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

          {/* Typing dots — visible uniquement avant que le premier token arrive */}
          <AnimatePresence>
            {loading && messages.at(-1)?.content === '' && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                className="flex gap-3"
              >
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
            placeholder={listening ? 'Écoute en cours…' : 'Pose une question ou utilise le micro…'}
            disabled={loading}
            className="flex-1 bg-transparent py-3 text-[13.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none font-mono"
          />

          {/* TTS toggle */}
          {TTS_SUPPORTED && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={() => { setTtsEnabled(p => !p); stopSpeaking() }}
              title={ttsEnabled ? 'Désactiver lecture vocale' : 'Activer lecture vocale'}
              className={`w-7 h-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
                ttsEnabled
                  ? 'text-[hsl(var(--accent))]'
                  : 'text-[hsl(var(--text-3))] opacity-50'
              }`}
            >
              {ttsEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </motion.button>
          )}

          {/* STT bouton micro */}
          {STT_SUPPORTED && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.9 }}
              onClick={listening ? stopListening : startListening}
              disabled={loading}
              title={listening ? 'Arrêter la dictée' : 'Dicter une question (fr-FR)'}
              className={`w-7 h-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
                listening
                  ? 'bg-red-500/20 text-red-400 animate-pulse'
                  : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))]'
              }`}
            >
              {listening
                ? <MicOff className="w-3.5 h-3.5" />
                : <Mic className="w-3.5 h-3.5" />
              }
            </motion.button>
          )}

          {/* Envoyer */}
          <motion.button
            type="submit"
            disabled={loading || !input.trim()}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
            className="w-8 h-8 flex-shrink-0 my-1 rounded bg-[hsl(var(--accent))] flex items-center justify-center disabled:opacity-35 transition-opacity"
          >
            {loading
              ? <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
              : <Send className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" />
            }
          </motion.button>
        </form>

        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] text-center mt-1.5 max-w-3xl mx-auto">
          RAG hybride · LanceDB + BM25 · streaming SSE
          {STT_SUPPORTED && ' · STT Web Speech API'}
          {TTS_SUPPORTED && ' · TTS natif'}
        </p>
      </div>
    </div>
  )
}
