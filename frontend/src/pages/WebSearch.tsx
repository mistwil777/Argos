import { useState } from 'react'
import { Search, Loader2, ExternalLink, Globe } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/services/api'
import { extractDomain } from '@/lib/utils'

type Engine = 'duckduckgo' | 'bing' | 'auto'

export default function WebSearch() {
  const [query, setQuery] = useState('')
  const [engine, setEngine] = useState<Engine>('duckduckgo')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<any[]>([])
  const [meta, setMeta] = useState<{ engine?: string; duration_ms?: number; count?: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setLoading(true)
    setError(null)
    try {
      const data = await api.search(query, engine)
      setResults(data.results || [])
      setMeta({ engine: data.engine, duration_ms: data.duration_ms, count: data.results_count })
    } catch (err: any) {
      setError(err.message || 'Erreur de recherche')
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  async function digestResult(url: string) {
    try {
      await api.digest(url)
    } catch {}
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Recherche web</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Sans clé API — DuckDuckGo ou Bing</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-card border border-border rounded-lg px-3 focus-within:ring-1 focus-within:ring-primary">
            <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Rechercher..."
              className="flex-1 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <Button type="submit" disabled={loading || !query.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Chercher'}
          </Button>
        </div>

        {/* Engine selector */}
        <div className="flex gap-1 bg-secondary p-0.5 rounded-md w-fit">
          {(['duckduckgo', 'bing', 'auto'] as Engine[]).map(e => (
            <button key={e} type="button" onClick={() => setEngine(e)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors capitalize ${
                engine === e ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {e}
            </button>
          ))}
        </div>
      </form>

      {/* Meta */}
      {meta && !loading && (
        <p className="text-xs text-muted-foreground">
          {meta.count} résultats via <span className="font-medium">{meta.engine}</span> en {meta.duration_ms}ms
        </p>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">{error}</div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="space-y-2 animate-slideUp">
          {results.map((r, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 hover:border-primary/30 transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Globe className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    <span className="text-xs text-muted-foreground">{extractDomain(r.url)}</span>
                  </div>
                  <a href={r.url} target="_blank" rel="noreferrer"
                     className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 group">
                    {r.title}
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </a>
                  {r.snippet && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.snippet}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" onClick={() => digestResult(r.url)}
                  className="flex-shrink-0 text-xs">
                  Digest
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
