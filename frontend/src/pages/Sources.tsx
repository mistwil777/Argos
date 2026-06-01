import { useEffect, useState } from 'react'
import { Plus, Radio, Globe, Rss, Github, Trash2, ToggleLeft, ToggleRight, Eye } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'

const TYPE_ICON: Record<string, any> = {
  rss: Rss, website: Globe, github: Github, api: Radio,
}
const TYPE_COLOR: Record<string, string> = {
  rss: 'text-orange-400', website: 'text-blue-400', github: 'text-purple-400', api: 'text-green-400',
}

export default function Sources() {
  const [sources, setSources] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', url: '', type: 'website', interval: 60, monitor: true })

  useEffect(() => { loadSources() }, [])

  async function loadSources() {
    setLoading(true)
    try {
      const data = await api.getSources()
      setSources(data.sources || [])
    } finally {
      setLoading(false)
    }
  }

  async function addSource() {
    if (!form.url.trim()) return
    try {
      await api.addSource({
        name: form.name || form.url,
        url: form.url,
        type: form.type,
        monitor_enabled: form.monitor,
        check_interval_minutes: form.interval,
      })
      setShowForm(false)
      setForm({ name: '', url: '', type: 'website', interval: 60, monitor: true })
      await loadSources()
    } catch (err: any) {
      alert(err.message)
    }
  }

  async function toggleSource(id: number) {
    try { await api.toggleSource(id); await loadSources() } catch {}
  }

  async function deleteSource(id: number) {
    if (!confirm('Supprimer cette source ?')) return
    try { await api.deleteSource(id); setSources(prev => prev.filter(s => s.id !== id)) } catch {}
  }

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Sources</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Flux RSS, pages surveillées, APIs</p>
        </div>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4" />
          Ajouter
        </Button>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3 animate-slideUp">
          <p className="text-sm font-medium text-foreground">Nouvelle source</p>
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Nom (optionnel)"
              className="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
            <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
              className="bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground outline-none">
              <option value="website">Website</option>
              <option value="rss">RSS Feed</option>
              <option value="github">GitHub</option>
              <option value="api">API</option>
            </select>
          </div>
          <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            placeholder="https://..."
            className="w-full bg-secondary border border-border rounded px-3 py-2 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary" />
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={form.monitor}
                onChange={e => setForm(f => ({ ...f, monitor: e.target.checked }))} />
              Surveiller les changements
            </label>
            {form.monitor && (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                Intervalle :
                <input type="number" min={5} value={form.interval}
                  onChange={e => setForm(f => ({ ...f, interval: +e.target.value }))}
                  className="w-16 bg-secondary border border-border rounded px-2 py-1 text-sm outline-none" />
                min
              </label>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={addSource}>Ajouter</Button>
            <Button size="sm" variant="ghost" onClick={() => setShowForm(false)}>Annuler</Button>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {loading && (
          <div className="p-4 flex justify-center">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {!loading && sources.length === 0 && (
          <p className="text-sm text-muted-foreground p-6 text-center">Aucune source configurée.</p>
        )}
        {sources.map(source => {
          const Icon = TYPE_ICON[source.type] || Globe
          const colorClass = TYPE_COLOR[source.type] || 'text-muted-foreground'
          return (
            <div key={source.id} className="flex items-center gap-3 p-3 hover:bg-accent/20 transition-colors">
              <Icon className={`w-4 h-4 flex-shrink-0 ${colorClass}`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{source.name}</p>
                <p className="text-xs text-muted-foreground truncate">{source.url}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 text-xs text-muted-foreground">
                {source.monitor_enabled && (
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{source.check_interval_minutes}min</span>
                )}
                {source.last_checked_at && <span>{timeAgo(source.last_checked_at)}</span>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => toggleSource(source.id)} className="p-1.5 rounded hover:bg-accent transition-colors">
                  {source.active
                    ? <ToggleRight className="w-4 h-4 text-primary" />
                    : <ToggleLeft className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button onClick={() => deleteSource(source.id)}
                  className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
