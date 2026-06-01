import { useState } from 'react'
import { Globe, Loader2, ExternalLink, BookOpen, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { api } from '@/services/api'
import { extractDomain } from '@/lib/utils'
import ReactMarkdown from 'react-markdown'

type Mode = 'browse' | 'digest'

export default function Browse() {
  const [url, setUrl] = useState('')
  const [mode, setMode] = useState<Mode>('digest')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!url.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const data = mode === 'digest'
        ? await api.digest(url)
        : await api.browse(url)
      setResult(data)
    } catch (err: any) {
      setError(err.message || 'Erreur lors de la récupération')
    } finally {
      setLoading(false)
    }
  }

  function copyMarkdown() {
    if (result?.markdown) {
      navigator.clipboard.writeText(result.markdown)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Browse</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Accède à n'importe quelle page web — rendu JS, anti-détection inclus</p>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <div className="flex-1 flex items-center gap-2 bg-card border border-border rounded-lg px-3 focus-within:ring-1 focus-within:ring-primary transition-shadow">
            <Globe className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            <input
              type="url"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://example.com/article..."
              className="flex-1 bg-transparent py-2.5 text-sm text-foreground placeholder:text-muted-foreground outline-none"
            />
          </div>
          <Button type="submit" disabled={loading || !url.trim()}>
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Aller'}
          </Button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 bg-secondary p-0.5 rounded-md w-fit">
          {(['digest', 'browse'] as Mode[]).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                mode === m ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {m === 'digest' ? '📋 Digest' : '📄 Contenu brut'}
            </button>
          ))}
        </div>
      </form>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Result */}
      {result && (
        <div className="animate-slideUp space-y-4">
          {/* Meta bar */}
          <div className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground truncate">{result.title || 'Sans titre'}</p>
              <a href={result.url} target="_blank" rel="noreferrer"
                 className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5">
                <ExternalLink className="w-3 h-3" />
                {extractDomain(result.url)}
              </a>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded">
                {result.engine}
              </span>
              {result.via_nitter && (
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded">Nitter</span>
              )}
              {result.duration_ms && (
                <span className="text-xs text-muted-foreground">{result.duration_ms}ms</span>
              )}
            </div>
          </div>

          {/* Digest mode */}
          {mode === 'digest' && result.markdown && (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-primary" />
                  <span className="text-sm font-medium text-foreground">Digest</span>
                </div>
                <Button variant="ghost" size="sm" onClick={copyMarkdown}>
                  {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                  {copied ? 'Copié' : 'Copier'}
                </Button>
              </div>
              <div className="prose-digest">
                <ReactMarkdown>{result.markdown}</ReactMarkdown>
              </div>
            </div>
          )}

          {/* JSON */}
          {mode === 'digest' && result.json && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">JSON structuré (RAG-ready)</p>
              <pre className="text-xs text-muted-foreground overflow-auto max-h-64 bg-secondary/50 rounded p-2">
                {JSON.stringify(result.json, null, 2)}
              </pre>
            </div>
          )}

          {/* Raw content */}
          {mode === 'browse' && result.content && (
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs font-medium text-muted-foreground mb-2">
                Contenu extrait ({result.content_length?.toLocaleString()} caractères)
              </p>
              <pre className="text-xs text-muted-foreground whitespace-pre-wrap overflow-auto max-h-[500px]">
                {result.content}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
