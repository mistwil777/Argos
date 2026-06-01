import { useEffect, useState, useCallback } from 'react'
import { RefreshCw, BookOpen, ExternalLink, Filter } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/services/api'
import { timeAgo, extractDomain, truncate } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

const IMPORTANCE_COLOR: Record<string, string> = {
  critical: 'text-red-400 bg-red-500/10 border-red-500/20',
  high: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  low: 'text-muted-foreground bg-secondary border-border',
}

const TYPE_LABEL: Record<string, string> = {
  news: 'Actualité', research: 'Recherche', tutorial: 'Tutoriel',
  tool: 'Outil', discussion: 'Discussion', other: 'Autre',
}

export default function Feed() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [filter, setFilter] = useState<string>('all')
  const [page, setPage] = useState(0)
  const LIMIT = 20

  const load = useCallback(async (reset = false) => {
    setLoading(true)
    try {
      const offset = reset ? 0 : page * LIMIT
      const data = await api.getItems({
        limit: LIMIT,
        offset,
        ...(filter !== 'all' ? { importance: filter } : {}),
      })
      if (reset) {
        setItems(data.items || [])
        setPage(0)
      } else {
        setItems(prev => [...prev, ...(data.items || [])])
      }
    } finally {
      setLoading(false)
    }
  }, [filter, page])

  useEffect(() => { load(true) }, [filter])

  return (
    <div className="p-6 max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Feed</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Contenus collectés et digests générés</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-3.5 h-3.5 text-muted-foreground" />
        <div className="flex gap-1 bg-secondary p-0.5 rounded-md">
          {['all', 'critical', 'high', 'medium', 'low'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-2.5 py-1 rounded text-xs font-medium capitalize transition-colors ${
                filter === f ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}>
              {f === 'all' ? 'Tous' : f}
            </button>
          ))}
        </div>
      </div>

      {/* Items */}
      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-card border border-border rounded-lg overflow-hidden animate-slideUp">
            <div className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  {/* Tags */}
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    {item.importance && (
                      <span className={`text-xs px-1.5 py-0.5 rounded border capitalize ${IMPORTANCE_COLOR[item.importance] || IMPORTANCE_COLOR.low}`}>
                        {item.importance}
                      </span>
                    )}
                    {item.item_type && (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">
                        {TYPE_LABEL[item.item_type] || item.item_type}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{extractDomain(item.url)}</span>
                  </div>

                  {/* Title */}
                  <a href={item.url} target="_blank" rel="noreferrer"
                     className="text-sm font-medium text-foreground hover:text-primary flex items-center gap-1 group">
                    {truncate(item.title, 120)}
                    <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-100 flex-shrink-0" />
                  </a>

                  {/* Summary */}
                  {item.summary && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                  )}
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">{timeAgo(item.created_at)}</span>
                  {item.digest_markdown && (
                    <Button variant="ghost" size="sm"
                      onClick={() => setExpanded(expanded === item.id ? null : item.id)}>
                      <BookOpen className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Digest accordion */}
            {expanded === item.id && item.digest_markdown && (
              <div className="border-t border-border px-4 py-3 bg-secondary/30 animate-slideUp">
                <div className="prose-digest">
                  <ReactMarkdown>{item.digest_markdown}</ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && !loading && (
          <div className="text-center py-12 text-muted-foreground text-sm">
            Aucun contenu. Utilisez Browse ou ajoutez des sources.
          </div>
        )}
      </div>

      {items.length > 0 && items.length % LIMIT === 0 && (
        <div className="text-center">
          <Button variant="outline" size="sm" onClick={() => { setPage(p => p + 1); load() }} disabled={loading}>
            Charger plus
          </Button>
        </div>
      )}
    </div>
  )
}
