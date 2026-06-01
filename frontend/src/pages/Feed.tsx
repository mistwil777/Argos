import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, BookOpen, ExternalLink, ChevronDown, SlidersHorizontal } from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo, extractDomain, truncate } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const IMP_BAR: Record<string, string> = {
  critical: 'bg-red-500',  high: 'bg-orange-500',
  medium:   'bg-yellow-500', low: 'bg-[hsl(var(--bg-3))]',
}
const IMP_PILL: Record<string, string> = {
  critical: 'pill-red', high: 'pill-amber', medium: 'pill-muted', low: 'pill-muted',
}
const TYPE: Record<string, string> = {
  news:'Actu', research:'Recherche', tutorial:'Tuto', tool:'Outil', discussion:'Discus.', other:'Autre',
}
const FILTERS = ['all','critical','high','medium','low']

export default function Feed() {
  const [items, setItems]     = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filter, setFilter]   = useState('all')
  const [page, setPage]       = useState(0)
  const LIMIT = 20

  const load = useCallback(async (reset = false) => {
    setLoading(true)
    try {
      const offset = reset ? 0 : page * LIMIT
      const d = await api.getItems({ limit: LIMIT, offset, ...(filter !== 'all' ? { importance: filter } : {}) })
      if (reset) { setItems(d.items || []); setPage(0) }
      else setItems(prev => [...prev, ...(d.items || [])])
    } finally { setLoading(false) }
  }, [filter, page])

  useEffect(() => { load(true) }, [filter])

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-5">
      {/* ── Toolbar ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
          <div className="seg">
            {FILTERS.map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`seg-item ${filter === f ? 'active' : ''}`}>
                {filter === f && (
                  <motion.div layoutId="feed-seg"
                    className="absolute inset-0 bg-[hsl(var(--bg-2))] rounded-[calc(var(--radius)-2px)] border border-[hsl(var(--line-bright))]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">{f === 'all' ? 'Tous' : f}</span>
              </button>
            ))}
          </div>
        </div>
        <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }}
          onClick={() => load(true)} disabled={loading}
          className="w-8 h-8 flex items-center justify-center rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[hsl(var(--text-2))] transition-colors">
          <RefreshCw className="w-3.5 h-3.5" />
        </motion.button>
      </div>

      {/* ── Items ── */}
      <div className="space-y-2">
        {loading && page === 0 && [...Array(4)].map((_, i) => (
          <motion.div key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }}
            className="h-20 skeleton" />
        ))}

        <AnimatePresence>
          {items.map((item, i) => (
            <motion.div key={item.id}
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              transition={{ delay: i * 0.03, type: 'spring', stiffness: 280, damping: 28 }}
              className="panel overflow-hidden"
            >
              <div className="flex items-stretch">
                {/* Importance bar */}
                <div className={`w-0.5 flex-shrink-0 ${IMP_BAR[item.importance] ?? 'bg-[hsl(var(--bg-3))]'}`} />

                <div className="flex-1 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      {/* Tags row */}
                      <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {item.importance && (
                          <span className={`pill ${IMP_PILL[item.importance] ?? 'pill-muted'} capitalize`}>
                            {item.importance}
                          </span>
                        )}
                        {item.item_type && (
                          <span className="pill pill-muted">{TYPE[item.item_type] || item.item_type}</span>
                        )}
                        <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{extractDomain(item.url)}</span>
                      </div>

                      <a href={item.url} target="_blank" rel="noreferrer"
                        className="text-[13.5px] font-semibold text-[hsl(var(--text))] hover:text-[hsl(var(--accent))] flex items-center gap-1 group transition-colors">
                        {truncate(item.title, 110)}
                        <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
                      </a>
                      {item.summary && (
                        <p className="text-[12px] text-[hsl(var(--text-2))] mt-1.5 line-clamp-2 leading-relaxed">{item.summary}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
                      <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))]">{timeAgo(item.created_at)}</span>
                      {item.digest_markdown && (
                        <motion.button whileTap={{ scale: 0.9 }}
                          onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                          className={`w-7 h-7 flex items-center justify-center rounded border transition-all ${
                            expanded === item.id
                              ? 'bg-[hsl(var(--accent-dim))] border-[hsl(var(--accent-line))] text-[hsl(var(--accent))]'
                              : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--line-bright))] hover:text-[hsl(var(--text-2))]'
                          }`}
                        >
                          <motion.div animate={{ rotate: expanded === item.id ? 180 : 0 }} transition={{ duration: 0.2 }}>
                            <ChevronDown className="w-3.5 h-3.5" />
                          </motion.div>
                        </motion.button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Digest accordion */}
              <AnimatePresence>
                {expanded === item.id && item.digest_markdown && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                    className="overflow-hidden"
                  >
                    <div className="border-t border-[hsl(var(--line))] bg-[hsl(var(--bg))] px-5 py-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BookOpen className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                        <span className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.1em]">digest</span>
                      </div>
                      <div className="prose-app"><ReactMarkdown>{item.digest_markdown}</ReactMarkdown></div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>

        {items.length === 0 && !loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="text-center py-20 text-[hsl(var(--text-3))] font-mono text-[12px]">
            — aucun contenu —
          </motion.div>
        )}
      </div>

      {items.length > 0 && items.length % LIMIT === 0 && (
        <div className="text-center">
          <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
            onClick={() => { setPage(p => p + 1); load() }} disabled={loading}
            className="px-5 py-2 rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[12px] font-mono text-[hsl(var(--text-2))] transition-colors">
            {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin inline" /> : '↓ charger plus'}
          </motion.button>
        </div>
      )}
    </div>
  )
}
