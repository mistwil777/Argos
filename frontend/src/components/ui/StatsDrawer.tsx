import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Copy, Check, ExternalLink, Loader2, ChevronDown, Play, Pencil, Code, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'

type DrawerType = 'tools' | 'items' | 'browses' | 'rag' | 'digests' | 'costs' | 'watched' | null

interface Props {
  type: DrawerType
  onClose: () => void
}

const TOOL_CATEGORIES: Record<string, { label: string; desc: string }> = {
  hello:      { label: 'Santé',         desc: 'Health check du serveur' },
  collector:  { label: 'Collecteur',    desc: 'Collecte automatique de contenus (RSS, GitHub, APIs)' },
  classifier: { label: 'Classificateur',desc: 'Classification des items par importance et type via LLM' },
  rag:        { label: 'RAG',           desc: 'Recherche et génération augmentée (questions sur la base de connaissances)' },
  web:        { label: 'Web',           desc: 'Browsing, digest et surveillance de pages web' },
  other:      { label: 'Autre',         desc: 'Outils divers' },
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1200) }}
      className="p-1 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
      {copied ? <Check className="w-3 h-3 text-[hsl(var(--green))]" /> : <Copy className="w-3 h-3" />}
    </button>
  )
}

function buildDefaultParams(schema: any): string {
  if (!schema?.properties) return '{}'
  const obj: any = {}
  for (const [k, v] of Object.entries(schema.properties as Record<string, any>)) {
    if (schema.required?.includes(k)) {
      obj[k] = v.default ?? (v.type === 'string' ? '' : v.type === 'boolean' ? true : v.type === 'integer' ? 0 : null)
    }
  }
  return JSON.stringify(obj, null, 2)
}

function ToolCard({ tool }: { tool: any }) {
  const [open, setOpen]         = useState(false)
  const [activeTab, setActiveTab] = useState<'params' | 'source'>('params')
  const [editDesc, setEditDesc] = useState(false)
  const [desc, setDesc]         = useState(tool.description || '')
  const [params, setParams]     = useState(() => buildDefaultParams(tool.input_schema))
  const [running, setRunning]   = useState(false)
  const [result, setResult]     = useState<string | null>(null)
  const [paramsError, setParamsError] = useState('')

  const schema = tool.input_schema || {}
  const properties = schema.properties || {}
  const required: string[] = schema.required || []

  async function runTool() {
    setParamsError('')
    let parsedParams: any = {}
    try { parsedParams = JSON.parse(params) } catch { setParamsError('JSON invalide'); return }
    setRunning(true); setResult(null)
    try {
      const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: tool.name, params: parsedParams })
      const resp = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body })
      const data = await resp.json()
      setResult(JSON.stringify(data.result ?? data.error ?? data, null, 2))
    } catch (e: any) { setResult(`Erreur : ${e.message}`) }
    finally { setRunning(false) }
  }

  return (
    <div className={`rounded-lg border transition-all ${open ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--bg-2))]' : 'border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] hover:border-[hsl(var(--line-bright))]'}`}>
      {/* Header */}
      <button className="w-full flex items-center justify-between px-3 py-2.5 text-left" onClick={() => setOpen(v => !v)}>
        <div className="flex items-center gap-2 min-w-0">
          <code className="text-[12px] font-mono text-[hsl(var(--accent))] flex-shrink-0">{tool.name}</code>
          {!open && desc && <p className="text-[11px] text-[hsl(var(--text-3))] truncate">{desc}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
          <CopyButton text={tool.name} />
          <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }}>
            <ChevronDown className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
          </motion.div>
        </div>
      </button>

      {/* Expanded */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="border-t border-[hsl(var(--line))]">
              {/* Description éditable */}
              <div className="px-3 pt-2.5 pb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Description</p>
                  <button onClick={() => setEditDesc(v => !v)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                    <Pencil className="w-3 h-3" />
                  </button>
                </div>
                {editDesc
                  ? <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2}
                      className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--accent-line))] rounded px-2 py-1.5 text-[12px] text-[hsl(var(--text))] outline-none font-mono resize-none" />
                  : <p className="text-[12px] text-[hsl(var(--text-2))] leading-relaxed">{desc || '—'}</p>
                }
              </div>

              {/* Onglets */}
              <div className="flex border-t border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-3))]">
                {[
                  { id: 'params' as const, icon: Play, label: 'Paramètres & Test' },
                  { id: 'source' as const, icon: Code, label: 'Code source' },
                ].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono border-b-2 transition-all ${
                      activeTab === tab.id
                        ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]'
                        : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'
                    }`}>
                    <tab.icon className="w-3 h-3" />{tab.label}
                  </button>
                ))}
              </div>

              <div className="px-3 py-3 space-y-3">
                {activeTab === 'params' && (
                  <>
                    {/* Paramètres */}
                    {Object.keys(properties).length > 0 && (
                      <div>
                        <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1.5">Paramètres</p>
                        <div className="space-y-1 mb-2">
                          {Object.entries(properties).map(([k, v]: [string, any]) => (
                            <div key={k} className="flex items-start gap-2 text-[11px]">
                              <code className={`font-mono flex-shrink-0 ${required.includes(k) ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text-3))]'}`}>
                                {k}{required.includes(k) ? '*' : ''}
                              </code>
                              <span className="text-[hsl(var(--text-3))] font-mono flex-shrink-0">{v.type}</span>
                              {v.description && <span className="text-[hsl(var(--text-3))]">— {v.description}</span>}
                              {v.default !== undefined && <span className="text-[hsl(var(--text-3))] flex-shrink-0">(défaut: {String(v.default)})</span>}
                            </div>
                          ))}
                        </div>
                        <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">Appel JSON — éditable</p>
                        <textarea
                          value={params} onChange={e => setParams(e.target.value)}
                          rows={Math.min(8, params.split('\n').length + 1)}
                          className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] focus:border-[hsl(var(--accent-line))] rounded px-2 py-1.5 text-[11.5px] text-[hsl(var(--text-2))] outline-none font-mono resize-none transition-all"
                        />
                        {paramsError && <p className="text-[11px] text-[hsl(var(--red))] font-mono">{paramsError}</p>}
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <motion.button onClick={runTool} disabled={running} whileTap={{ scale: 0.95 }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[11.5px] font-bold disabled:opacity-50">
                        {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                        {running ? 'Exécution…' : 'Tester'}
                      </motion.button>
                      <CopyButton text={`{"jsonrpc":"2.0","id":1,"method":"${tool.name}","params":${params.replace(/\s+/g,' ')}}`} />
                      <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">copier l'appel complet</span>
                    </div>
                    {result && (
                      <div>
                        <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">Résultat</p>
                        <pre className="text-[10.5px] font-mono text-[hsl(var(--text-2))] bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded p-2 max-h-56 overflow-auto whitespace-pre-wrap">{result}</pre>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'source' && (
                  <div>
                    {tool.source_file && (
                      <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] mb-2">
                        📄 {tool.source_file}
                      </p>
                    )}
                    {tool.source
                      ? (
                        <div className="relative">
                          <pre className="text-[10.5px] font-mono text-[hsl(var(--text-2))] bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded p-3 max-h-[420px] overflow-auto whitespace-pre leading-relaxed">
                            {tool.source}
                          </pre>
                          <div className="absolute top-2 right-2">
                            <CopyButton text={tool.source} />
                          </div>
                        </div>
                      )
                      : <p className="text-[11.5px] font-mono text-[hsl(var(--text-3))]">Code source non disponible (fonction wrappée ou compilée)</p>
                    }
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function ToolsPanel({ data }: { data: any }) {
  return (
    <div className="space-y-5">
      <p className="text-[11.5px] text-[hsl(var(--text-3))] leading-relaxed">
        Les outils MCP sont des fonctions exposées via JSON-RPC 2.0 — appelables par n'importe quel agent IA compatible (Claude, etc.). Cliquez sur un outil pour voir ses paramètres, le tester, ou copier l'appel.
      </p>
      {Object.entries(data.by_category as Record<string, any[]>).map(([cat, tools]) => (
        <div key={cat}>
          <div className="mb-2.5">
            <p className="text-[12.5px] font-bold text-[hsl(var(--text))]">{TOOL_CATEGORIES[cat]?.label ?? cat}</p>
            <p className="text-[11px] text-[hsl(var(--text-3))]">{TOOL_CATEGORIES[cat]?.desc}</p>
          </div>
          <div className="space-y-1.5">
            {tools.map((t: any) => <ToolCard key={t.name} tool={t} />)}
          </div>
        </div>
      ))}
    </div>
  )
}

export default function StatsDrawer({ type, onClose }: Props) {
  const [data, setData]     = useState<any>(null)
  const [loading, setLoading] = useState(true)
  // navigate unused — keeping Link for inline navigation

  useEffect(() => {
    if (!type) return
    setLoading(true); setData(null)
    const loadData = async () => {
      try {
        switch (type) {
          case 'tools':   setData(await api.getToolsList()); break
          case 'browses': setData(await api.getBrowseHistory(30)); break
          case 'rag':     setData(await api.getRagQueries(20)); break
          case 'costs':   setData(await api.getCostsDetail()); break
          case 'items': {
            const d = await api.getItems({ limit: 30 })
            setData(d.items || [])
            break
          }
          case 'digests': {
            const d = await api.getItems({ limit: 30 })
            setData((d.items || []).filter((i: any) => i.digest_markdown))
            break
          }
          case 'watched': {
            const d = await fetch('/rpc', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'web.watched_pages', params: {} }),
            }).then(r => r.json())
            setData(d.result?.pages || [])
            break
          }
        }
      } finally { setLoading(false) }
    }
    loadData()
  }, [type])

  const titles: Record<string, string> = {
    tools:   'Outils MCP actifs',
    browses: 'Historique des browses',
    rag:     'Historique des questions RAG',
    costs:   'Détail des coûts LLM',
    items:   'Items collectés (30 derniers)',
    digests: 'Items avec digest',
    watched: 'Pages surveillées',
  }

  return (
    <AnimatePresence>
      {type && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/50"
          />
          {/* Drawer */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 32 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[520px] flex flex-col bg-[hsl(var(--bg-1))] border-l border-[hsl(var(--line))] shadow-2xl"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
              <p className="text-[14px] font-bold text-[hsl(var(--text))]">{titles[type!] ?? type}</p>
              <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-auto p-5">
              {loading && (
                <div className="flex items-center justify-center h-32 text-[hsl(var(--text-3))]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              {/* ── OUTILS MCP ── */}
              {!loading && type === 'tools' && data && (
                <ToolsPanel data={data} />
              )}

              {/* ── BROWSES ── */}
              {!loading && type === 'browses' && Array.isArray(data) && (
                <div className="space-y-2">
                  {data.length === 0 && <p className="text-[12px] font-mono text-[hsl(var(--text-3))] text-center py-8">— aucun browse —</p>}
                  {data.map((b: any) => (
                    <div key={b.id} className="px-3 py-2.5 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12.5px] font-semibold text-[hsl(var(--text))] truncate">{b.title || b.url}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${b.status === 'success' ? 'text-[hsl(var(--green))] bg-[hsl(var(--green)/.1)]' : 'text-[hsl(var(--red))] bg-[hsl(var(--red)/.1)]'}`}>
                            {b.status}
                          </span>
                          <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{b.engine}</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-1">
                        <a href={b.url} target="_blank" rel="noreferrer"
                          className="text-[10.5px] font-mono text-[hsl(var(--accent))] hover:underline truncate flex items-center gap-1">
                          <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />{b.url}
                        </a>
                        <span className="text-[10px] font-mono text-[hsl(var(--text-3))] flex-shrink-0 ml-2">{timeAgo(b.created_at)}</span>
                      </div>
                      {b.content_length > 0 && (
                        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] mt-0.5">{b.content_length?.toLocaleString()} chars · {b.duration_ms}ms</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── RAG QUERIES ── */}
              {!loading && type === 'rag' && Array.isArray(data) && (
                <div className="space-y-3">
                  {data.length === 0 && <p className="text-[12px] font-mono text-[hsl(var(--text-3))] text-center py-8">— aucune question posée —</p>}
                  {data.map((q: any) => (
                    <div key={q.id} className="rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] overflow-hidden">
                      <div className="px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-3))]">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-[13px] font-semibold text-[hsl(var(--text))]">{q.query}</p>
                          <span className="text-[10px] font-mono text-[hsl(var(--text-3))] flex-shrink-0">{timeAgo(q.created_at)}</span>
                        </div>
                        {q.confidence > 0 && (
                          <div className="flex items-center gap-1.5 mt-1">
                            <div className="h-1 w-16 bg-[hsl(var(--bg-3))] rounded-full overflow-hidden">
                              <div className="h-full bg-[hsl(var(--accent))] rounded-full" style={{ width: `${q.confidence * 100}%` }} />
                            </div>
                            <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">confiance {Math.round(q.confidence * 100)}%</span>
                          </div>
                        )}
                      </div>
                      <div className="px-4 py-3 prose-app text-[12.5px] max-h-48 overflow-auto">
                        <ReactMarkdown>{q.answer}</ReactMarkdown>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ── COÛTS LLM ── */}
              {!loading && type === 'costs' && data && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-4 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                      <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">Ce mois</p>
                      <p className="text-2xl font-bold text-[hsl(var(--text))]">${data.month_total.toFixed(4)}</p>
                    </div>
                    <div className="p-4 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                      <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">Total</p>
                      <p className="text-2xl font-bold text-[hsl(var(--text))]">${data.all_time_total.toFixed(4)}</p>
                    </div>
                  </div>
                  {data.breakdown.length === 0
                    ? <p className="text-[12px] font-mono text-[hsl(var(--text-3))] text-center py-8">— aucune utilisation LLM enregistrée —</p>
                    : (
                      <div>
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Détail par modèle / opération</p>
                        <div className="space-y-1.5">
                          {data.breakdown.map((r: any, i: number) => (
                            <div key={i} className="flex items-center justify-between px-3 py-2 rounded bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                              <div>
                                <p className="text-[12px] font-mono text-[hsl(var(--text))]">{r.model || '—'}</p>
                                <p className="text-[10.5px] text-[hsl(var(--text-3))]">{r.operation} · {r.calls} appels · {(r.tokens / 1000).toFixed(1)}k tokens</p>
                              </div>
                              <p className="text-[12px] font-mono font-bold text-[hsl(var(--text-2))]">${r.cost_usd.toFixed(5)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  }
                </div>
              )}

              {/* ── ITEMS ── */}
              {!loading && (type === 'items' || type === 'digests') && Array.isArray(data) && (
                <div className="space-y-2">
                  {data.length === 0 && (
                    <p className="text-[12px] font-mono text-[hsl(var(--text-3))] text-center py-8">
                      {type === 'digests' ? '— aucun digest généré —' : '— aucun item —'}
                    </p>
                  )}
                  {data.map((item: any) => (
                    <div key={item.id} className="rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] overflow-hidden">
                      <div className="px-3 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                              {item.importance && (
                                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded capitalize ${
                                  item.importance === 'critical' ? 'bg-red-500/15 text-red-400'
                                  : item.importance === 'high' ? 'bg-orange-500/15 text-orange-400'
                                  : item.importance === 'medium' ? 'bg-yellow-500/15 text-yellow-400'
                                  : 'bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))]'
                                }`}>{item.importance}</span>
                              )}
                              {item.item_type && <span className="text-[10px] font-mono text-[hsl(var(--text-3))] bg-[hsl(var(--bg-3))] px-1.5 py-0.5 rounded">{item.item_type}</span>}
                              {item.rag_indexed && <span className="text-[10px] font-mono text-[hsl(var(--green))] bg-[hsl(var(--green)/.1)] px-1.5 py-0.5 rounded">RAG</span>}
                            </div>
                            <p className="text-[12.5px] font-semibold text-[hsl(var(--text))] line-clamp-1">{item.title}</p>
                            {item.summary && (
                              <p className="text-[11.5px] text-[hsl(var(--text-3))] mt-0.5 line-clamp-2 leading-snug">{item.summary}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{timeAgo(item.created_at)}</span>
                            <a href={item.url} target="_blank" rel="noreferrer"
                              className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                        </div>
                        {type === 'digests' && item.digest_markdown && (
                          <details className="mt-2">
                            <summary className="text-[10.5px] font-mono text-[hsl(var(--accent))] cursor-pointer hover:underline flex items-center gap-1">
                              <Eye className="w-3 h-3" /> Voir le digest
                            </summary>
                            <div className="mt-2 prose-app text-[12px] max-h-48 overflow-auto border-t border-[hsl(var(--line))] pt-2">
                              <ReactMarkdown>{item.digest_markdown}</ReactMarkdown>
                            </div>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                  <div className="text-center pt-2">
                    <Link to="/feed" className="text-[11px] font-mono text-[hsl(var(--accent))] hover:underline">
                      Voir tous les contenus →
                    </Link>
                  </div>
                </div>
              )}

              {/* ── PAGES SURVEILLÉES ── */}
              {!loading && type === 'watched' && Array.isArray(data) && (
                <div className="space-y-2">
                  {data.length === 0 && (
                    <div className="text-center py-12 space-y-2">
                      <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">— aucune page surveillée —</p>
                      <Link to="/sources" className="text-[11px] font-mono text-[hsl(var(--accent))] hover:underline block">
                        Ajouter une source à surveiller →
                      </Link>
                    </div>
                  )}
                  {data.map((p: any, i: number) => (
                    <div key={i} className="px-3 py-2.5 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[12.5px] font-semibold text-[hsl(var(--text))] truncate">{p.name || p.url}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${p.status === 'changed' ? 'bg-[hsl(var(--amber)/.15)] text-[hsl(var(--amber))]' : 'bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))]'}`}>
                            {p.status || 'actif'}
                          </span>
                          {p.check_interval_minutes && (
                            <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{p.check_interval_minutes}min</span>
                          )}
                        </div>
                      </div>
                      <a href={p.url} target="_blank" rel="noreferrer"
                        className="text-[10.5px] font-mono text-[hsl(var(--accent))] hover:underline truncate flex items-center gap-1 mt-0.5">
                        <ExternalLink className="w-2.5 h-2.5 flex-shrink-0" />{p.url}
                      </a>
                      {p.last_checked_at && (
                        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] mt-0.5">Vérifié {timeAgo(p.last_checked_at)}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export type { DrawerType }
