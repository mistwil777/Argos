import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Loader2, ExternalLink, Globe, BookOpen, ArrowRight } from 'lucide-react'
import { api } from '@/services/api'
import { extractDomain } from '@/lib/utils'

type Engine = 'duckduckgo' | 'bing' | 'auto'
const ENGINES: Engine[] = ['duckduckgo', 'bing', 'auto']

export default function WebSearch() {
  const [query, setQuery]       = useState('')
  const [engine, setEngine]     = useState<Engine>('duckduckgo')
  const [loading, setLoading]   = useState(false)
  const [results, setResults]   = useState<any[]>([])
  const [meta, setMeta]         = useState<{ engine?: string; duration_ms?: number; count?: number } | null>(null)
  const [error, setError]       = useState<string | null>(null)
  const [digesting, setDigesting] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true); setError(null)
    try {
      const d = await api.search(query, engine)
      setResults(d.results || [])
      setMeta({ engine: d.engine, duration_ms: d.duration_ms, count: d.results_count })
    } catch (e: any) { setError(e.message || 'Erreur'); setResults([]) }
    finally { setLoading(false) }
  }

  async function digestResult(url: string) {
    setDigesting(url)
    try { await api.digest(url) } catch {} finally { setDigesting(null) }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">

      {/* ── Input ── */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="input-field flex items-center gap-3 px-4">
          <Search className="w-4 h-4 text-[hsl(var(--text-3))] flex-shrink-0" />
          <input type="text" value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Rechercher sur le web..."
            className="flex-1 bg-transparent py-3 text-[13.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none" />
          <motion.button type="submit" disabled={loading || !query.trim()}
            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] text-[12.5px] font-bold disabled:opacity-40">
            {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <><ArrowRight className="w-3.5 h-3.5" />Go</>}
          </motion.button>
        </div>

        {/* Engine pills */}
        <div className="flex items-center gap-1.5">
          <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] mr-1">moteur:</p>
          {ENGINES.map(e => (
            <motion.button key={e} type="button" onClick={() => setEngine(e)}
              whileTap={{ scale: 0.95 }}
              className={`pill transition-all ${engine === e ? 'pill-accent' : 'pill-muted'}`}>
              {e}
            </motion.button>
          ))}
        </div>
      </form>

      {/* ── Meta ── */}
      <AnimatePresence>
        {meta && !loading && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-3 text-[11px] font-mono text-[hsl(var(--text-3))]">
            <span className="text-[hsl(var(--text))] font-bold text-sm">{meta.count}</span> résultats
            <span className="w-1 h-1 rounded-full bg-[hsl(var(--line-bright))]" />
            {meta.engine}
            <span className="w-1 h-1 rounded-full bg-[hsl(var(--line-bright))]" />
            {meta.duration_ms}ms
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error ── */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="bg-[hsl(var(--red)/.1)] border border-[hsl(var(--red)/.25)] rounded-lg p-4 text-[12.5px] font-mono text-[hsl(var(--red))]">
            ERR / {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Skeleton ── */}
      {loading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }} className="h-[88px] skeleton" />
          ))}
        </div>
      )}

      {/* ── Results ── */}
      <AnimatePresence>
        {results.length > 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-2">
            {results.map((r, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 280, damping: 26 }}
                whileHover={{ y: -1 }}
                className="panel group hover:border-[hsl(var(--line-bright))] transition-colors overflow-hidden"
              >
                {/* top accent line on hover */}
                <div className="h-[1px] w-0 group-hover:w-full bg-gradient-to-r from-[hsl(var(--accent))] to-transparent transition-all duration-300" />
                <div className="p-4 flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <Globe className="w-3 h-3 text-[hsl(var(--text-3))] flex-shrink-0" />
                      <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{extractDomain(r.url)}</span>
                    </div>
                    <a href={r.url} target="_blank" rel="noreferrer"
                      className="text-[13.5px] font-semibold text-[hsl(var(--text))] hover:text-[hsl(var(--accent))] block transition-colors">
                      {r.title}
                    </a>
                    {r.snippet && (
                      <p className="text-[12px] text-[hsl(var(--text-2))] mt-1.5 line-clamp-2 leading-relaxed">{r.snippet}</p>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => digestResult(r.url)} disabled={digesting === r.url}
                    className="flex-shrink-0 flex items-center gap-1.5 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] border border-[hsl(var(--line))] hover:border-[hsl(var(--accent-line))] px-2.5 py-1.5 rounded transition-all opacity-0 group-hover:opacity-100 bg-[hsl(var(--bg-2))]"
                  >
                    {digesting === r.url ? <Loader2 className="w-3 h-3 animate-spin" /> : <BookOpen className="w-3 h-3" />}
                    digest
                  </motion.button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
