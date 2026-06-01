import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCw, Server, Database, Terminal, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { api } from '@/services/api'

type Status = 'ok' | 'error' | 'not_installed' | string

function StatusDot({ status }: { status: Status }) {
  const isOk = status === 'ok'
  const isWarn = status === 'not_installed'
  return (
    <div className="flex items-center gap-2">
      <motion.div
        animate={isOk ? { opacity: [1, 0.3, 1] } : {}}
        transition={{ repeat: Infinity, duration: 2 }}
        className={`w-1.5 h-1.5 rounded-full ${isOk ? 'bg-[hsl(var(--green))]' : isWarn ? 'bg-[hsl(var(--amber))]' : 'bg-[hsl(var(--red))]'}`}
      />
      <span className={`text-[12px] font-mono ${
        isOk ? 'text-[hsl(var(--green))]' : isWarn ? 'text-[hsl(var(--amber))]' : 'text-[hsl(var(--red))]'
      }`}>
        {isOk ? 'online' : isWarn ? 'not_installed' : 'offline'}
      </span>
    </div>
  )
}

const TOOLS = ['web.browse','web.search','web.digest','web.watch','web.watched_pages','rag.ask','rag.search','rag.index_item','collector.fetch_rss','classifier.classify']

export default function Settings() {
  const [health, setHealth]     = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [indexing, setIndexing] = useState(false)
  const [indexMsg, setIndexMsg] = useState<string | null>(null)

  function fetchHealth() {
    setLoading(true)
    api.healthCheck().then(setHealth).catch(() => setHealth({ status: 'error' })).finally(() => setLoading(false))
  }
  useEffect(() => { fetchHealth() }, [])

  async function rebuildIndex() {
    setIndexing(true); setIndexMsg(null)
    try { const r = await api.rebuildRagIndex(); setIndexMsg(`✓  ${r.message || 'Index reconstruit'}`) }
    catch (e: any) { setIndexMsg(`ERR / ${e.message}`) }
    finally { setIndexing(false) }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-5">

      {/* ── Services ── */}
      <Panel title="Services" icon={Server}
        action={
          <motion.button whileHover={{ rotate: 180 }} transition={{ duration: 0.4 }} onClick={fetchHealth} disabled={loading}
            className="w-7 h-7 flex items-center justify-center rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[hsl(var(--text-2))] transition-colors">
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </motion.button>
        }
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              {['Service', 'Statut', 'Info'].map(h => (
                <th key={h} className="text-left px-4 py-2.5 text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em] font-normal">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--line))]">
            {[
              { label: 'API MCP',         status: health?.status,     info: `http://localhost:8000` },
              { label: 'Base de données', status: health?.database,   info: 'PostgreSQL 16' },
              { label: 'Playwright',      status: health?.playwright, info: 'Browser stealth engine' },
            ].map(({ label, status, info }) => (
              <tr key={label} className="hover:bg-[hsl(var(--bg-2))] transition-colors">
                <td className="px-4 py-3.5 text-[13px] font-semibold text-[hsl(var(--text))]">{label}</td>
                <td className="px-4 py-3.5">
                  {loading
                    ? <div className="h-5 w-16 skeleton" />
                    : <StatusDot status={status ?? 'error'} />
                  }
                </td>
                <td className="px-4 py-3.5 text-[11px] font-mono text-[hsl(var(--text-3))]">{info}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {health?.tools_registered && (
          <div className="px-4 py-2.5 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
            <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
              <span className="text-[hsl(var(--accent))]">{health.tools_registered}</span> outils enregistrés ·{' '}
              env: <span className="text-[hsl(var(--text-2))]">{health.environment}</span>
            </p>
          </div>
        )}
      </Panel>

      {/* ── RAG ── */}
      <Panel title="Index RAG" icon={Database}>
        <div className="px-4 py-4 space-y-3">
          <p className="text-[12.5px] text-[hsl(var(--text-2))] leading-relaxed">
            Reconstruit le vecteur store LanceDB depuis les items digests. À lancer après ingestion de nouveaux contenus.
          </p>
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.95 }} onClick={rebuildIndex} disabled={indexing}
              className="flex items-center gap-2 px-4 py-2 rounded border border-[hsl(var(--line))] hover:border-[hsl(var(--line-bright))] text-[12.5px] font-mono text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))] disabled:opacity-50 transition-all">
              {indexing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
              rebuild_index()
            </motion.button>
            <AnimatePresence>
              {indexMsg && (
                <motion.p initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className={`text-[11.5px] font-mono ${indexMsg.startsWith('ERR') ? 'text-[hsl(var(--red))]' : 'text-[hsl(var(--green))]'}`}>
                  {indexMsg}
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Panel>

      {/* ── MCP Endpoint ── */}
      <Panel title="Endpoint MCP" icon={Terminal}>
        <div className="px-4 py-4 space-y-4">
          <div className="bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg p-4 font-mono text-[12px]">
            <span className="text-[hsl(var(--text-3))]">POST </span>
            <span className="text-[hsl(var(--accent))]">http://localhost:8000</span>
            <span className="text-[hsl(var(--text-2))]">/rpc</span>
            <div className="mt-2 text-[hsl(var(--text-3))]">
              {'{ "jsonrpc": "2.0", "method": "<tool>", "params": {...} }'}
            </div>
          </div>
          <div>
            <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em] mb-2">outils disponibles</p>
            <div className="flex flex-wrap gap-1.5">
              {TOOLS.map((t, i) => (
                <motion.span key={t}
                  initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  className="pill pill-accent">
                  {t}
                </motion.span>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function Panel({ title, icon: Icon, children, action }: {
  title: string; icon: any; children: React.ReactNode; action?: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
      <div className="flex items-center justify-between px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
        <div className="flex items-center gap-2.5">
          <Icon className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
          <span className="text-[13.5px] font-bold text-[hsl(var(--text))] tracking-tight">{title}</span>
        </div>
        {action}
      </div>
      <div className="relative">
        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent opacity-0" />
        {children}
      </div>
    </motion.div>
  )
}
