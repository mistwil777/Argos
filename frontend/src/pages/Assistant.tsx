/**
 * Assistant Argos — page de conversation
 *
 * L'écoute vocale est gérée globalement par VoiceContext (App.tsx).
 * Cette page s'enregistre comme handler de demandes : quand l'utilisateur
 * dit "Argos <demande>" depuis n'importe quelle page, la navigation
 * arrive ici et sendVocal() est appelé automatiquement.
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send, Bot, User, BookOpen, Terminal, List, Mic, Volume2,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import PageHint from '@/components/ui/PageHint'
import SourcesPanel, { type DiscoveredSource } from '@/components/assistant/SourcesPanel'
import { useVoice } from '@/context/VoiceContext'

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
  status?: string
  sources?: DiscoveredSource[]
  flow?: 'rag_direct' | 'discovery' | null
  intent?: any
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api/v1'

const SUGGESTIONS = [
  'Débrief des dernières nouveautés',
  'Quels sujets ont été collectés cette semaine ?',
  'Je veux apprendre sur les agents IA',
  'Quelles sources sont actives ?',
]

// ─── Composant ────────────────────────────────────────────────────────────────

export default function Assistant() {
  const { speak, startDictation } = useVoice()
  const { state: routeState } = useLocation()
  const [dictating, setDictating] = useState(false)
  const stopDictRef = useRef<(() => void) | null>(null)
  const autoSentRef = useRef(false)

  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)

  const [panelOpen, setPanelOpen]       = useState(false)
  const [panelSources, setPanelSources] = useState<DiscoveredSource[]>([])
  const [panelIntent, setPanelIntent]   = useState<any>(null)
  const [panelFlow, setPanelFlow]       = useState<'rag_direct' | 'discovery' | null>(null)

  const endRef    = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // ── Envoi vocal / texte ───────────────────────────────────────────────────────

  const sendVocal = useCallback(async (transcript: string) => {
    if (!transcript.trim() || loading) return

    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: transcript }])
    setInput('')
    setLoading(true)

    const assistantId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '', streaming: true }])

    const abortCtrl = new AbortController()
    cancelRef.current = () => {
      abortCtrl.abort()
    }
    const timeoutId = setTimeout(() => abortCtrl.abort(), 3 * 60 * 1000) // 3 min max

    try {
      const resp = await fetch(`${API_BASE}/assistant/vocal`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ transcript }),
        signal:  abortCtrl.signal,
      })

      if (!resp.ok || !resp.body) throw new Error(`HTTP ${resp.status}`)

      const reader  = resp.body.getReader()
      const decoder = new TextDecoder()
      let fullText  = ''
      let sources: DiscoveredSource[] = []
      let intent: any = null
      let flow: 'rag_direct' | 'discovery' | null = null
      let done = false

      while (!done) {
        const { done: streamDone, value } = await reader.read()
        if (streamDone) break

        for (const line of decoder.decode(value, { stream: true }).split('\n')) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)

          if (payload === '[DONE]') { done = true; break }
          if (payload.startsWith('[FLOW]'))            { flow   = payload.slice(6) as any; continue }
          if (payload.startsWith('[SOURCES]'))         { try { sources = JSON.parse(payload.slice(8)) } catch {} ; continue }
          if (payload.startsWith('[INTENT]'))          { try { intent  = JSON.parse(payload.slice(8)) } catch {} ; continue }
          if (payload.startsWith('[DISCOVERY_START]')) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, status: 'Recherche de sources en cours…' } : m
            ))
            continue
          }
          if (payload.startsWith('[ERROR]'))           { fullText += `\n_Erreur : ${payload.slice(7)}_`; continue }

          if (payload.startsWith('[STATUS]')) {
            const statusMsg = payload.slice(8).replace(/\\n/g, '\n')
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, status: statusMsg } : m
            ))
            continue
          }

          fullText += payload.replace(/\\n/g, '\n')
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, content: fullText, status: undefined } : m
          ))
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId
          ? { ...m, content: fullText, streaming: false, sources, flow, intent }
          : m
      ))

      if (flow === 'discovery' && sources.length > 0) {
        setPanelSources(sources)
        setPanelIntent(intent)
        setPanelFlow(flow)
        setPanelOpen(true)
      }


    } catch (err: any) {
      const msg = err.name === 'AbortError' ? 'Délai dépassé (3 min).' : `ERR / ${err.message}`
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: msg, streaming: false } : m
      ))
    } finally {
      clearTimeout(timeoutId)
      cancelRef.current = null
      setLoading(false)
    }
  }, [loading, speak])

  // ── Auto-envoi depuis Settings (navigate state) ───────────────────────────────

  useEffect(() => {
    const q = (routeState as any)?.query
    if (q && !autoSentRef.current) {
      autoSentRef.current = true
      sendVocal(q)
    }
  }, [routeState, sendVocal])

  // ── Dictée manuelle ───────────────────────────────────────────────────────────

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
        sendVocal(text)
      },
      () => setDictating(false)
    )
    stopDictRef.current = stop
  }

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full">

      <div className="px-6 pt-6">
        <PageHint id="assistant-vocal" steps={[
          { title: 'Commande vocale', body: 'Dites "Argos" suivi de votre demande depuis n\'importe quelle page. Ex : "Argos, quelles sont les dernières nouveautés ?"' },
          { title: 'Recherche automatique', body: 'Si votre base ne contient pas de réponse, Argos découvre des sources, collecte et analyse le contenu automatiquement.' },
          { title: 'Sources', body: 'Le panneau Sources explique pourquoi chaque source a été choisie. Donnez votre avis pour affiner les prochaines recherches.' },
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
                <svg viewBox="0 0 32 32" className="w-7 h-7">
                  <path d="M4.5 16 C8.5 9.5, 23.5 9.5, 27.5 16 C23.5 22.5, 8.5 22.5, 4.5 16 Z" fill="none" stroke="#3987e5" strokeWidth="1.4"/>
                  <circle cx="16" cy="16" r="5" fill="url(#iris-a)"/>
                  <circle cx="16" cy="16" r="2.2" fill="#0e0e1c"/>
                  <circle cx="14.4" cy="14.4" r="1.1" fill="white" opacity="0.55"/>
                  <defs>
                    <radialGradient id="iris-a" cx="45%" cy="40%" r="55%">
                      <stop offset="0%" stopColor="#9085e9"/>
                      <stop offset="100%" stopColor="#3987e5"/>
                    </radialGradient>
                  </defs>
                </svg>
              </motion.div>
              <div className="max-w-sm">
                <h2 className="text-[16px] font-bold text-[hsl(var(--text))] tracking-tight">Assistant Argos</h2>
                <p className="text-[12.5px] text-[hsl(var(--text-2))] mt-2 leading-relaxed">
                  Posez une question ou dictez votre demande.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {SUGGESTIONS.map((s, i) => (
                  <motion.button key={s}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 + i * 0.07 }}
                    whileHover={{ y: -2, borderColor: 'hsl(var(--accent-line))' }}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => sendVocal(s)}
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
                        {msg.status && !msg.content && (
                          <p className="text-[12px] italic text-[hsl(var(--text-3))] flex items-center gap-2">
                            <span className="inline-block w-1.5 h-1.5 rounded-full bg-[hsl(var(--accent))] animate-pulse flex-shrink-0" />
                            {msg.status}
                          </p>
                        )}
                        {msg.content && (
                          <div className="prose-app">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                          </div>
                        )}
                        {msg.streaming && msg.content && (
                          <span className="inline-block w-1 h-3.5 bg-[hsl(var(--accent))] rounded ml-0.5 animate-pulse" />
                        )}
                      </>
                    ) : (
                      <p className="text-[13.5px]">{msg.content}</p>
                    )}
                  </div>

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
                      {msg.content && (
                        <button
                          onClick={() => speak(msg.content)}
                          title="Lire à voix haute"
                          className="ml-auto flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors"
                        >
                          <Volume2 className="w-3 h-3" /> Écouter
                        </button>
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
            {loading && messages.at(-1)?.content === '' && !messages.at(-1)?.status && (
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
          onSubmit={e => { e.preventDefault(); sendVocal(input) }}
          className="input-field flex items-center gap-2 px-3 max-w-3xl mx-auto"
        >
          <Terminal className="w-3.5 h-3.5 text-[hsl(var(--text-3))] flex-shrink-0" />
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder={dictating ? 'Dictez maintenant…' : 'Posez votre question…'}
            disabled={loading}
            className="flex-1 bg-transparent py-3 text-[13.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none font-mono"
          />

          <button type="button"
            onClick={toggleDictation}
            title={dictating ? 'Arrêter la dictée' : 'Dicter'}
            className={`w-7 h-7 flex-shrink-0 rounded flex items-center justify-center transition-colors ${
              dictating
                ? 'text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))] animate-pulse'
                : 'text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))]'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
          </button>

          <button type="button"
            onClick={() => setPanelOpen(true)}
            title="Voir les sources"
            className="w-7 h-7 flex-shrink-0 rounded flex items-center justify-center text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <motion.button type="submit"
            disabled={loading || !input.trim()}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
            className="w-8 h-8 flex-shrink-0 my-1 rounded bg-[hsl(var(--accent))] flex items-center justify-center disabled:opacity-35 transition-opacity"
          >
            <Send className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" />
          </motion.button>
        </form>
        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] text-center mt-1.5 max-w-3xl mx-auto">
          RAG hybride · discovery automatique · dictée à la demande
        </p>
      </div>

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
