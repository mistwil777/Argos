import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Send, Bot, User, Loader2, BookOpen, Zap, Terminal } from 'lucide-react'
import { api } from '@/services/api'
import ReactMarkdown from 'react-markdown'

interface Message { id: string; role: 'user' | 'assistant'; content: string; sources?: any[] }

const SUGGESTIONS = [
  'Comment fonctionne web.digest ?',
  'Quels outils MCP sont disponibles ?',
  'Comment surveiller une page web ?',
  'Intégrer OpenWebMCP avec un agent Python ?',
  'Schéma de la base de données ?',
]

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput]       = useState('')
  const [loading, setLoading]   = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  async function send(q: string) {
    if (!q.trim() || loading) return
    setMessages(prev => [...prev, { id: crypto.randomUUID(), role: 'user', content: q }])
    setInput(''); setLoading(true)
    try {
      const d = await api.ragQuery(q)
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: d.answer || 'Aucune réponse trouvée.', sources: d.sources,
      }])
    } catch (e: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(), role: 'assistant',
        content: `ERR / ${e.message}`,
      }])
    } finally { setLoading(false) }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Messages ── */}
      <div className="flex-1 overflow-auto px-6 py-6">
        {/* Welcome */}
        <AnimatePresence>
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="flex flex-col items-center justify-center h-full text-center space-y-6 py-8"
            >
              {/* Logo pulsant */}
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
                <h2 className="text-[16px] font-bold text-[hsl(var(--text))] tracking-tight">Assistant OpenWebMCP</h2>
                <p className="text-[12.5px] text-[hsl(var(--text-2))] mt-2 leading-relaxed">
                  Pose des questions sur les contenus collectés, le code source ou l'utilisation des outils MCP.
                </p>
              </div>
              {/* Suggestions */}
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

        {/* Message list */}
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
                      ? <div className="prose-app"><ReactMarkdown>{msg.content}</ReactMarkdown></div>
                      : <p className="text-[13.5px]">{msg.content}</p>}
                  </div>
                  {msg.sources && msg.sources.length > 0 && (
                    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                      className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <BookOpen className="w-2.5 h-2.5 text-[hsl(var(--text-3))]" />
                      {msg.sources.slice(0, 4).map((s: any, i: number) => (
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

          {/* Typing dots */}
          <AnimatePresence>
            {loading && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
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

      {/* ── Input bar ── */}
      <div className="flex-shrink-0 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] px-6 py-4">
        <form onSubmit={e => { e.preventDefault(); send(input) }}
          className="input-field flex items-center gap-3 px-4 max-w-3xl mx-auto">
          <Terminal className="w-3.5 h-3.5 text-[hsl(var(--text-3))] flex-shrink-0" />
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            placeholder="Pose une question sur le projet..."
            disabled={loading}
            className="flex-1 bg-transparent py-3 text-[13.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none font-mono" />
          <motion.button type="submit" disabled={loading || !input.trim()}
            whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.9 }}
            className="w-8 h-8 flex-shrink-0 my-1 rounded bg-[hsl(var(--accent))] flex items-center justify-center disabled:opacity-35 transition-opacity">
            <Send className="w-3.5 h-3.5 text-[hsl(var(--primary-foreground))]" />
          </motion.button>
        </form>
        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] text-center mt-1.5 max-w-3xl mx-auto">
          RAG hybride · LanceDB + BM25 · 522 chunks indexés
        </p>
      </div>
    </div>
  )
}
