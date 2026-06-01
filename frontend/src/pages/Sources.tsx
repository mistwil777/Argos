import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Globe, Rss, Github, Radio, Trash2, ToggleLeft, ToggleRight, Eye, X, Loader2 } from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'

const TYPE_ICON: Record<string, any> = { rss: Rss, website: Globe, github: Github, api: Radio }
const TYPE_STYLE: Record<string, string> = {
  rss:     'text-orange-400 bg-orange-500/10 border-orange-500/25',
  website: 'text-blue-400 bg-blue-500/10 border-blue-500/25',
  github:  'text-purple-400 bg-purple-500/10 border-purple-500/25',
  api:     'text-emerald-400 bg-emerald-500/10 border-emerald-500/25',
}
const INIT = { name: '', url: '', type: 'website', category: 'general', interval: 60, monitor: false }

export default function Sources() {
  const [sources, setSources]   = useState<any[]>([])
  const [loading, setLoading]   = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm]         = useState(INIT)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  useEffect(() => { loadSources() }, [])

  async function loadSources() {
    setLoading(true)
    try { const d = await api.getSources(); setSources(d.sources || []) }
    finally { setLoading(false) }
  }

  async function addSource() {
    if (!form.url.trim()) return
    setSaving(true); setError(null)
    try {
      await api.addSource({ name: form.name || form.url, url: form.url, type: form.type, category: form.category, monitor_enabled: form.monitor, check_interval_minutes: form.interval, workspace_id: 1 })
      setShowForm(false); setForm(INIT); await loadSources()
    } catch (e: any) { setError(e.message) }
    finally { setSaving(false) }
  }

  async function toggle(id: number) {
    try { await api.toggleSource(id); await loadSources() } catch {}
  }
  async function del(id: number) {
    if (!confirm('Supprimer cette source ?')) return
    try { await api.deleteSource(id); setSources(s => s.filter(x => x.id !== id)) } catch {}
  }

  const inp = "w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-3 py-2 text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] focus:shadow-[0_0_0_3px_hsl(var(--accent-dim))] placeholder:text-[hsl(var(--text-3))] transition-all"

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[12px] font-mono text-[hsl(var(--text-3))]">
          <span className="text-[hsl(var(--text))] font-bold">{sources.length}</span> source{sources.length !== 1 ? 's' : ''} configurée{sources.length !== 1 ? 's' : ''}
        </p>
        <motion.button whileTap={{ scale: 0.95 }} onClick={() => setShowForm(v => !v)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-[12.5px] font-bold transition-all border ${
            showForm
              ? 'border-[hsl(var(--line))] text-[hsl(var(--text-2))] bg-transparent'
              : 'border-[hsl(var(--accent-line))] text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))]'
          }`}>
          <motion.div animate={{ rotate: showForm ? 45 : 0 }} transition={{ duration: 0.2 }}>
            <Plus className="w-3.5 h-3.5" />
          </motion.div>
          {showForm ? 'Annuler' : 'Ajouter'}
        </motion.button>
      </div>

      {/* Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="panel-accent p-5 space-y-3">
              <p className="text-[13px] font-bold text-[hsl(var(--text))] tracking-tight">Nouvelle source</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Nom (optionnel)" className={inp} />
                <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className={inp}>
                  <option value="website">Website</option>
                  <option value="rss">RSS Feed</option>
                  <option value="github">GitHub</option>
                  <option value="api">API</option>
                </select>
              </div>
              <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
                placeholder="https://..." className={inp} />
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-[12.5px] text-[hsl(var(--text-2))] cursor-pointer select-none font-mono">
                  <input type="checkbox" checked={form.monitor} onChange={e => setForm(f => ({ ...f, monitor: e.target.checked }))} />
                  surveiller les changements
                </label>
                {form.monitor && (
                  <label className="flex items-center gap-2 text-[12px] font-mono text-[hsl(var(--text-3))]">
                    interval:
                    <input type="number" min={5} value={form.interval}
                      onChange={e => setForm(f => ({ ...f, interval: +e.target.value }))}
                      className="w-14 bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded px-2 py-1 text-[12px] outline-none text-center" />
                    min
                  </label>
                )}
              </div>
              {error && <p className="text-[12px] font-mono text-[hsl(var(--red))]">ERR / {error}</p>}
              <div className="flex gap-2">
                <motion.button whileTap={{ scale: 0.95 }} onClick={addSource} disabled={saving}
                  className="flex items-center gap-2 px-4 py-1.5 rounded bg-[hsl(var(--accent))] text-[hsl(var(--primary-foreground))] text-[12.5px] font-bold disabled:opacity-50">
                  {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Ajouter
                </motion.button>
                <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setShowForm(false); setError(null) }}
                  className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[hsl(var(--text-2))] text-[12.5px] font-mono hover:border-[hsl(var(--line-bright))] transition-colors">
                  annuler
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="panel overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[auto_1fr_100px_80px] gap-3 items-center px-4 py-2.5 bg-[hsl(var(--bg-2))] border-b border-[hsl(var(--line))]">
          <div className="w-7" />
          <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em]">Source</p>
          <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em]">Monitor</p>
          <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.08em]">Actions</p>
        </div>

        {loading && [...Array(3)].map((_, i) => <div key={i} className="h-[52px] skeleton border-b border-[hsl(var(--line))] last:border-0" />)}

        {!loading && sources.length === 0 && (
          <div className="py-14 text-center font-mono text-[hsl(var(--text-3))] text-[12px]">— aucune source —</div>
        )}

        <AnimatePresence>
          {sources.map((src, i) => {
            const Icon  = TYPE_ICON[src.type] || Globe
            const style = TYPE_STYLE[src.type] || 'text-[hsl(var(--text-2))] bg-[hsl(var(--bg-3))] border-[hsl(var(--line))]'
            return (
              <motion.div key={src.id}
                initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8, height: 0 }}
                transition={{ delay: i * 0.04, type: 'spring', stiffness: 280, damping: 28 }}
                className={`grid grid-cols-[auto_1fr_100px_80px] gap-3 items-center px-4 py-3.5 hover:bg-[hsl(var(--bg-2))] transition-colors ${i > 0 ? 'border-t border-[hsl(var(--line))]' : ''}`}
              >
                <div className={`w-7 h-7 rounded flex items-center justify-center border ${style}`}>
                  <Icon className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-[hsl(var(--text))] truncate leading-snug">{src.name}</p>
                  <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] truncate mt-0.5">{src.url}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {src.monitor_enabled && (
                    <span className="pill pill-muted font-mono"><Eye className="w-2.5 h-2.5" />{src.check_interval_minutes}m</span>
                  )}
                  {src.last_checked_at && !src.monitor_enabled && (
                    <span className="text-[10px] font-mono text-[hsl(var(--text-3))]">{timeAgo(src.last_checked_at)}</span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <motion.button whileTap={{ scale: 0.9 }} onClick={() => toggle(src.id)}
                    className="p-1 rounded hover:bg-[hsl(var(--bg-3))] transition-colors">
                    {src.active
                      ? <ToggleRight className="w-4 h-4 text-[hsl(var(--accent))]" />
                      : <ToggleLeft className="w-4 h-4 text-[hsl(var(--text-3))]" />}
                  </motion.button>
                  <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => del(src.id)}
                    className="p-1 rounded text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] hover:bg-[hsl(var(--red)/.08)] transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </motion.button>
                </div>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </div>
  )
}
