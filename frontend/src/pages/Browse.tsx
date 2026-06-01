import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Globe, Loader2, ExternalLink, BookOpen, Copy, Check, Zap, FileText, ArrowRight } from 'lucide-react'
import { api } from '@/services/api'
import { extractDomain } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

type Mode = 'digest' | 'browse'
const MODES = [
  { id: 'digest' as Mode, icon: BookOpen, label: 'Digest + RAG', desc: 'LLM → markdown + JSON structuré, indexé' },
  { id: 'browse' as Mode, icon: FileText,  label: 'Contenu brut',  desc: 'HTML extrait, liens, métadonnées' },
]

export default function Browse() {
  const [url, setUrl]       = useState('')
  const [mode, setMode]     = useState<Mode>('digest')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError]   = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function run(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true); setError(null); setResult(null)
    try { setResult(mode === 'digest' ? await api.digest(url) : await api.browse(url)) }
    catch (err: any) { setError(err.message || 'Erreur') }
    finally { setLoading(false) }
  }

  function copy() {
    if (result?.markdown) {
      navigator.clipboard.writeText(result.markdown)
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">

      {/* ── Mode selector ── */}
      <div className="grid grid-cols-2 gap-3">
        {MODES.map(({ id, icon: Icon, label, desc }) => (
          <motion.button
            key={id} type="button" onClick={() => setMode(id)}
            whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
            className={`relative text-left p-4 rounded-lg border transition-all duration-150 ${
              mode === id
                ? 'bg-[hsl(var(--accent-dim))] border-[hsl(var(--accent-line))] shadow-[0_0_16px_-4px_hsl(var(--accent-glow))]'
                : 'panel hover:border-[hsl(var(--line-bright))]'
            }`}
          >
            {mode === id && (
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[hsl(var(--accent))] to-transparent rounded-t-lg" />
            )}
            <div className="flex items-center gap-2 mb-1.5">
              <Icon className={`w-3.5 h-3.5 ${mode === id ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-2))]'}`} />
              <p className={`text-[13px] font-semibold ${mode === id ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text))]'}`}>{label}</p>
            </div>
            <p className="text-[11px] text-[hsl(var(--text-3))] leading-snug">{desc}</p>
          </motion.button>
        ))}
      </div>

      {/* ── URL input ── */}
      <form onSubmit={run}>
        <div className="input-field flex items-center gap-3 px-4">
          <Globe className="w-4 h-4 text-[hsl(var(--text-3))] flex-shrink-0" />
          <input
            type="url" value={url} onChange={e => setUrl(e.target.value)}
            placeholder="https://example.com/article..."
            className="flex-1 bg-transparent py-3 text-[13.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none font-mono"
          />
          {url && (
            <motion.button type="button" onClick={() => setUrl('')}
              initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] text-sm">✕
            </motion.button>
          )}
          <motion.button
            type="submit" disabled={loading || !url.trim()}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
          >
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ArrowRight className="w-3.5 h-3.5" />Lancer</>}
          </motion.button>
        </div>
      </form>

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="bg-[hsl(var(--red)/.1)] border border-[hsl(var(--red)/.25)] rounded-lg p-4 text-[12.5px] font-mono text-[hsl(var(--red))]"
          >
            ERR / {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Skeleton ── */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
            <div className="h-14 skeleton" />
            <div className="h-72 skeleton" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Result ── */}
      <AnimatePresence>
        {result && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            className="space-y-3"
          >
            {/* Meta */}
            <div className="panel-accent p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-[13.5px] font-semibold text-[hsl(var(--text))] truncate">{result.title || 'Sans titre'}</p>
                <a href={result.url} target="_blank" rel="noreferrer"
                  className="text-[11px] font-mono text-[hsl(var(--accent))] hover:underline flex items-center gap-1 mt-1">
                  <ExternalLink className="w-2.5 h-2.5" />{extractDomain(result.url)}
                </a>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {result.engine && <Mono>{result.engine}</Mono>}
                {result.duration_ms && <Mono>{result.duration_ms}ms</Mono>}
                {result.item_id && (
                  <span className="pill pill-green"><Zap className="w-2.5 h-2.5" />Indexé</span>
                )}
              </div>
            </div>

            {/* Digest */}
            {mode === 'digest' && result.markdown && (
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                    <span className="text-[12px] font-semibold text-[hsl(var(--text))]">Digest</span>
                  </div>
                  <motion.button whileTap={{ scale: 0.92 }} onClick={copy}
                    className="flex items-center gap-1.5 text-[11px] font-mono text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] transition-colors border border-[hsl(var(--line))] px-3 py-1 rounded">
                    <AnimatePresence mode="wait">
                      {copied
                        ? <motion.span key="ok" initial={{scale:.7}} animate={{scale:1}} className="flex items-center gap-1 text-[hsl(var(--green))]"><Check className="w-3 h-3"/>ok</motion.span>
                        : <motion.span key="cp" initial={{scale:.7}} animate={{scale:1}} className="flex items-center gap-1"><Copy className="w-3 h-3"/>copier</motion.span>
                      }
                    </AnimatePresence>
                  </motion.button>
                </div>
                <div className="p-5 prose-app"><ReactMarkdown>{result.markdown}</ReactMarkdown></div>
              </div>
            )}

            {/* JSON */}
            {mode === 'digest' && result.json && Object.keys(result.json).length > 0 && (
              <details className="panel overflow-hidden group">
                <summary className="flex items-center gap-2.5 px-4 py-3 cursor-pointer text-[12px] font-mono text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] transition-colors select-none">
                  <span className="text-[hsl(var(--accent))]">{'{ }'}</span> JSON structuré
                </summary>
                <pre className="text-[11px] text-[hsl(var(--text-2))] overflow-auto max-h-64 bg-[hsl(var(--bg))] p-5 font-mono border-t border-[hsl(var(--line))] leading-relaxed">
                  {JSON.stringify(result.json, null, 2)}
                </pre>
              </details>
            )}

            {/* Raw */}
            {mode === 'browse' && result.content && (
              <div className="panel overflow-hidden">
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
                  <span className="text-[12px] font-mono text-[hsl(var(--text-2))]">raw content</span>
                  <Mono>{result.content_length?.toLocaleString()} chars</Mono>
                </div>
                <pre className="text-[11.5px] text-[hsl(var(--text-2))] whitespace-pre-wrap overflow-auto max-h-[500px] p-5 font-mono leading-relaxed">
                  {result.content}
                </pre>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] px-1.5 py-0.5 rounded">
      {children}
    </span>
  )
}
