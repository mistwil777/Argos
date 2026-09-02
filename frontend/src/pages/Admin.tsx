import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, TrendingUp, DollarSign, AlertTriangle, Loader2, RefreshCw, BarChart3 } from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Bar,
} from 'recharts'

const STORAGE_KEY = 'argos_admin_token'
const TABS = ['Qualité', 'Coûts'] as const
type Tab = typeof TABS[number]

function ScoreChip({ score }: { score: number }) {
  const cls = score >= 4
    ? 'text-[hsl(var(--success,142_70%_50%))]'
    : score >= 3
    ? 'text-[hsl(var(--warning,38_92%_52%))]'
    : 'text-[hsl(var(--danger,0_72%_60%))]'
  return <span className={`font-bold tabular-nums ${cls}`}>{score.toFixed(2)}/5</span>
}

function KpiCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-4">
      <p className="text-[10px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-1">{label}</p>
      <div className="text-2xl font-bold text-[hsl(var(--text))]">{value}</div>
    </div>
  )
}

export default function Admin() {
  const [tab, setTab] = useState<Tab>('Qualité')
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(STORAGE_KEY) || '')
  const [editingToken, setEditingToken] = useState(!localStorage.getItem(STORAGE_KEY))
  const [days, setDays] = useState(30)
  const [quality, setQuality] = useState<any>(null)
  const [costs, setCosts] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(token = adminToken) {
    if (!token) return
    setLoading(true)
    setError(null)
    try {
      const headers = { 'X-Admin-Token': token }
      const [q, c] = await Promise.all([
        fetch(`/api/v1/admin/quality-metrics?days=${days}`, { headers }).then(r => r.json()),
        fetch(`/api/v1/admin/cost-metrics?days=${days}`, { headers }).then(r => r.json()),
      ])
      if (q.detail) throw new Error(q.detail)
      localStorage.setItem(STORAGE_KEY, token)
      setQuality(q)
      setCosts(c)
      setEditingToken(false)
    } catch (e: any) {
      setError(e.message || 'Token invalide ou serveur inaccessible')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (adminToken && !editingToken) load() }, [])
  useEffect(() => { if (adminToken && !editingToken && quality) load() }, [days])

  const globalStat = quality?.by_model?.[0]
  const hasQualityData = quality && (quality.by_model?.length > 0 || quality.trend?.length > 0)
  const hasCostData = costs && (costs.by_operation?.length > 0 || costs.trend?.length > 0)

  return (
    <div className="min-h-screen bg-[hsl(var(--bg))] text-[hsl(var(--text))] p-8">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-[hsl(var(--accent))]" />
            <h1 className="text-[20px] font-bold tracking-tight">Admin — Monitoring</h1>
          </div>
          <div className="flex items-center gap-2">
            <select value={days} onChange={e => setDays(Number(e.target.value))}
              className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded-lg px-3 py-1.5 text-[12px] text-[hsl(var(--text-2))] focus:outline-none">
              {[7, 14, 30, 90].map(d => <option key={d} value={d}>{d} jours</option>)}
            </select>
            <button onClick={() => load()} disabled={loading || !adminToken}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[hsl(var(--line))] text-[12px] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] disabled:opacity-40 transition-colors">
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Actualiser
            </button>
            <button onClick={() => setEditingToken(t => !t)}
              className="text-[11px] text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors px-2">
              {editingToken ? 'Annuler' : '• token'}
            </button>
          </div>
        </div>

        {/* Saisie token (masquée après validation) */}
        {editingToken && (
          <div className="mb-6 flex gap-2 items-center">
            <input type="password" autoFocus placeholder="Token admin (ADMIN_TOKEN dans .env)"
              value={adminToken} onChange={e => setAdminToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') load(adminToken) }}
              className="bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] rounded-lg px-4 py-2 text-[13px] w-80 focus:outline-none focus:border-[hsl(var(--accent-line))] text-[hsl(var(--text))]" />
            <button onClick={() => load(adminToken)} disabled={!adminToken || loading}
              className="px-4 py-2 rounded-lg bg-[hsl(var(--accent))] text-white text-[13px] font-medium disabled:opacity-50">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Charger'}
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-[12px]">
            {error}
          </div>
        )}

        {loading && !quality && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--accent))]" />
          </div>
        )}

        {(quality || costs) && (
          <>
            {/* Tabs */}
            <div className="flex gap-px mb-6 p-1 bg-[hsl(var(--bg-2))] rounded-xl border border-[hsl(var(--line))] w-fit">
              {TABS.map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`px-5 py-1.5 rounded-lg text-[13px] font-medium transition-colors ${
                    tab === t
                      ? 'bg-[hsl(var(--accent))] text-white'
                      : 'text-[hsl(var(--text-2))] hover:text-[hsl(var(--text))]'
                  }`}>
                  {t}
                </button>
              ))}
            </div>

            {/* ── Qualité ── */}
            {tab === 'Qualité' && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                {!hasQualityData ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-[hsl(var(--text-3))]">
                    <BarChart3 className="w-10 h-10 opacity-20" />
                    <p className="text-[13px] font-mono">Aucun score disponible sur cette période</p>
                    <p className="text-[11px] text-center max-w-xs">
                      Les scores sont générés automatiquement après chaque ingest.<br />
                      Lancez le pipeline sur une source pour alimenter ces métriques.
                    </p>
                  </div>
                ) : (
                  <>
                    {globalStat && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <KpiCard label="Score global" value={<ScoreChip score={globalStat.avg_global} />} />
                        <KpiCard label="Fidélité" value={<ScoreChip score={globalStat.avg_fidelity} />} />
                        <KpiCard label="Complétude" value={<ScoreChip score={globalStat.avg_completeness} />} />
                        <KpiCard label="Pertinence" value={<ScoreChip score={globalStat.avg_relevance} />} />
                      </div>
                    )}
                    {quality.trend?.length > 0 && (
                      <div className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-5">
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-4 flex items-center gap-2">
                          <TrendingUp className="w-3.5 h-3.5" /> Évolution score global
                        </p>
                        <ResponsiveContainer width="100%" height={180}>
                          <LineChart data={quality.trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--text-3))' }} />
                            <YAxis domain={[1, 5]} tick={{ fontSize: 10, fill: 'hsl(var(--text-3))' }} />
                            <Tooltip contentStyle={{ background: 'hsl(var(--bg-2))', border: '1px solid hsl(var(--line))', borderRadius: 8, fontSize: 12 }} />
                            <Line type="monotone" dataKey="avg_global" stroke="hsl(var(--accent))" dot={false} strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {quality.low_quality_items?.length > 0 && (
                      <div className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-5">
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-3 flex items-center gap-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400" /> Digests avec score faible (&lt; 3)
                        </p>
                        <div className="space-y-2">
                          {quality.low_quality_items.map((item: any) => (
                            <div key={item.item_id} className="flex items-start gap-3 p-3 rounded-lg bg-[hsl(var(--bg))] border border-[hsl(var(--line))]">
                              <ScoreChip score={item.score} />
                              <div className="flex-1 min-w-0">
                                <p className="text-[13px] font-medium text-[hsl(var(--text))] truncate">{item.title}</p>
                                <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">{item.rationale}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}

            {/* ── Coûts ── */}
            {tab === 'Coûts' && (
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                {!hasCostData ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3 text-[hsl(var(--text-3))]">
                    <DollarSign className="w-10 h-10 opacity-20" />
                    <p className="text-[13px] font-mono">Aucun coût enregistré sur cette période</p>
                    <p className="text-[11px] text-center max-w-xs">
                      Les coûts LLM s'accumulent à chaque classification, digest et évaluation.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-5 flex items-center gap-4">
                      <DollarSign className="w-7 h-7 text-green-400 shrink-0" />
                      <div>
                        <p className="text-[10px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">Total {days} derniers jours</p>
                        <p className="text-2xl font-bold text-[hsl(var(--text))]">${costs.total_cost_usd.toFixed(4)}</p>
                      </div>
                    </div>
                    {costs.by_operation?.length > 0 && (
                      <div className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-5">
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-4">Par opération</p>
                        <ResponsiveContainer width="100%" height={Math.max(120, costs.by_operation.length * 36)}>
                          <BarChart data={costs.by_operation} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" horizontal={false} />
                            <XAxis type="number" tick={{ fontSize: 10, fill: 'hsl(var(--text-3))' }} />
                            <YAxis dataKey="operation_type" type="category" tick={{ fontSize: 10, fill: 'hsl(var(--text-3))' }} width={110} />
                            <Tooltip contentStyle={{ background: 'hsl(var(--bg-2))', border: '1px solid hsl(var(--line))', borderRadius: 8, fontSize: 12 }} />
                            <Bar dataKey="cost_usd" fill="hsl(var(--accent))" radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {costs.trend?.length > 0 && (
                      <div className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] p-5">
                        <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-4">Évolution des coûts ($/jour)</p>
                        <ResponsiveContainer width="100%" height={160}>
                          <LineChart data={costs.trend}>
                            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--line))" />
                            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'hsl(var(--text-3))' }} />
                            <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--text-3))' }} />
                            <Tooltip contentStyle={{ background: 'hsl(var(--bg-2))', border: '1px solid hsl(var(--line))', borderRadius: 8, fontSize: 12 }} />
                            <Line type="monotone" dataKey="cost_usd" stroke="#1baf7a" dot={false} strokeWidth={2} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
