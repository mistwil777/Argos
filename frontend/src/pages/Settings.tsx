import { useState, useEffect } from 'react'
import { RefreshCw, Server, Database } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/services/api'

export default function Settings() {
  const [health, setHealth] = useState<any>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.healthCheck().then(setHealth).catch(() => setHealth({ status: 'error' }))
  }, [])

  async function rebuildIndex() {
    setLoading(true)
    try {
      await api.rebuildRagIndex()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Settings</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Configuration et administration</p>
      </div>

      {/* Status */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Statut des services</span>
        </div>
        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">API MCP</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              health?.status === 'ok' ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'
            }`}>
              {health?.status === 'ok' ? 'En ligne' : 'Hors ligne'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Base de données</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              health?.database === 'ok' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
            }`}>
              {health?.database === 'ok' ? 'Connectée' : 'Vérification...'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">Playwright</span>
            <span className={`text-xs px-2 py-0.5 rounded-full ${
              health?.playwright === 'ok' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'
            }`}>
              {health?.playwright === 'ok' ? 'Disponible' : 'Non installé'}
            </span>
          </div>
        </div>
      </div>

      {/* RAG */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">Index RAG</span>
        </div>
        <p className="text-xs text-muted-foreground">
          L'index vectoriel permet à l'assistant de répondre à des questions sur les contenus collectés
          et sur la documentation OpenWebMCP.
        </p>
        <Button variant="outline" size="sm" onClick={rebuildIndex} disabled={loading}>
          {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          Reconstruire l'index
        </Button>
      </div>

      {/* API endpoint info */}
      <div className="bg-card border border-border rounded-lg p-4 space-y-2">
        <p className="text-sm font-medium text-foreground">Endpoint MCP</p>
        <code className="text-xs bg-secondary rounded px-2 py-1 text-muted-foreground font-mono block">
          POST http://localhost:8000/rpc
        </code>
        <p className="text-xs text-muted-foreground">
          Utilisable par n'importe quel agent IA compatible JSON-RPC 2.0.
          Outils disponibles : <code className="font-mono text-primary">web.browse</code>,{' '}
          <code className="font-mono text-primary">web.search</code>,{' '}
          <code className="font-mono text-primary">web.digest</code>,{' '}
          <code className="font-mono text-primary">web.watch</code>,{' '}
          <code className="font-mono text-primary">rag.ask</code>.
        </p>
      </div>
    </div>
  )
}
