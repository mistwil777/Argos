import { useEffect, useState } from 'react'
import { Globe, Search, Rss, MessageSquare, TrendingUp, Clock, Radio } from 'lucide-react'
import { api } from '@/services/api'
import { timeAgo } from '@/lib/utils'

interface Stats {
  items_total: number
  items_today: number
  browse_sessions_total: number
  search_sessions_total: number
  rag_queries_total: number
  watched_pages: number
  digests_generated: number
  llm_cost_month: number
}

function StatCard({ icon: Icon, label, value, sub }: { icon: any; label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-start gap-3 animate-slideUp">
      <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentItems, setRecentItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([api.getStats(), api.getItems({ limit: 5 })])
      .then(([s, items]) => {
        setStats(s)
        setRecentItems(items.items || [])
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-full">
      <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Vue d'ensemble de l'activité OpenWebMCP</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard icon={Globe} label="Pages crawlées" value={stats?.browse_sessions_total ?? 0} sub="total" />
        <StatCard icon={Search} label="Recherches" value={stats?.search_sessions_total ?? 0} sub="total" />
        <StatCard icon={Rss} label="Items collectés" value={stats?.items_total ?? 0} sub={`+${stats?.items_today ?? 0} aujourd'hui`} />
        <StatCard icon={Radio} label="Pages surveillées" value={stats?.watched_pages ?? 0} sub="actives" />
        <StatCard icon={TrendingUp} label="Digests générés" value={stats?.digests_generated ?? 0} sub="indexés RAG" />
        <StatCard icon={MessageSquare} label="Queries RAG" value={stats?.rag_queries_total ?? 0} sub="total" />
        <StatCard icon={Clock} label="Coût LLM" value={`${(stats?.llm_cost_month ?? 0).toFixed(2)}€`} sub="ce mois" />
      </div>

      <div>
        <h2 className="text-sm font-medium text-foreground mb-3">Derniers contenus collectés</h2>
        <div className="bg-card border border-border rounded-lg divide-y divide-border">
          {recentItems.length === 0 && (
            <p className="text-sm text-muted-foreground p-4 text-center">Aucun contenu collecté pour le moment.</p>
          )}
          {recentItems.map((item) => (
            <div key={item.id} className="p-3 flex items-start gap-3 hover:bg-accent/30 transition-colors">
              <div className={`w-1.5 h-1.5 rounded-full mt-1.5 flex-shrink-0 ${
                item.importance === 'critical' ? 'bg-red-400' :
                item.importance === 'high' ? 'bg-orange-400' :
                item.importance === 'medium' ? 'bg-yellow-400' : 'bg-muted-foreground'
              }`} />
              <div className="flex-1 min-w-0">
                <a href={item.url} target="_blank" rel="noreferrer"
                   className="text-sm font-medium text-foreground hover:text-primary truncate block">
                  {item.title}
                </a>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{item.summary}</p>
              </div>
              <span className="text-xs text-muted-foreground flex-shrink-0">{timeAgo(item.created_at)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
