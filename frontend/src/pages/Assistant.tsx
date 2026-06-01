import { useState, useRef, useEffect } from 'react'
import { Send, Bot, User, Loader2, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/services/api'
import ReactMarkdown from 'react-markdown'
import { timeAgo } from '@/lib/utils'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  sources?: any[]
  timestamp: Date
}

const SUGGESTIONS = [
  'Comment ajouter une source à surveiller ?',
  'Comment fonctionne le digest ?',
  'Quels outils MCP sont disponibles ?',
  'Comment interroger le RAG depuis un agent ?',
]

export default function Assistant() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send(query: string) {
    if (!query.trim() || loading) return
    const userMsg: Message = {
      id: crypto.randomUUID(), role: 'user', content: query, timestamp: new Date()
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const data = await api.ragQuery(query)
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.answer || 'Aucune réponse trouvée.',
        sources: data.sources,
        timestamp: new Date(),
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `Erreur : ${err.message}`,
        timestamp: new Date(),
      }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border flex-shrink-0">
        <h1 className="text-xl font-semibold text-foreground">Assistant</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Q&A sur le corpus indexé — notice utilisateur incluse</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-6 py-12">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Bot className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">Assistant OpenWebMCP</p>
              <p className="text-xs text-muted-foreground mt-1">Pose une question sur les contenus collectés ou sur l'utilisation de l'outil</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {SUGGESTIONS.map(s => (
                <button key={s} onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 bg-card border border-border rounded-full text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slideUp`}>
            {msg.role === 'assistant' && (
              <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Bot className="w-3.5 h-3.5 text-primary" />
              </div>
            )}
            <div className={`max-w-[80%] ${msg.role === 'user' ? 'order-first' : ''}`}>
              <div className={`rounded-lg px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground ml-auto'
                  : 'bg-card border border-border text-foreground'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="prose-digest">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                ) : msg.content}
              </div>

              {/* Sources */}
              {msg.sources && msg.sources.length > 0 && (
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  <BookOpen className="w-3 h-3 text-muted-foreground" />
                  {msg.sources.slice(0, 3).map((s: any, i: number) => (
                    <span key={i} className="text-xs text-muted-foreground bg-secondary px-1.5 py-0.5 rounded">
                      {s.title || s.source || `Source ${i + 1}`}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground mt-1">{timeAgo(msg.timestamp.toISOString())}</p>
            </div>

            {msg.role === 'user' && (
              <div className="w-7 h-7 rounded-md bg-secondary flex items-center justify-center flex-shrink-0 mt-0.5">
                <User className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex gap-3 animate-slideUp">
            <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center">
              <Bot className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="bg-card border border-border rounded-lg px-4 py-3">
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-6 py-4 border-t border-border flex-shrink-0">
        <form onSubmit={e => { e.preventDefault(); send(input) }} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Pose une question..."
            disabled={loading}
            className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
          />
          <Button type="submit" disabled={loading || !input.trim()} size="icon">
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  )
}
