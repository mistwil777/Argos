import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, Search, CheckCircle, XCircle, Loader2, Globe, Rss, Github, ChevronRight, RotateCcw } from 'lucide-react'
import { api } from '@/services/api'

interface IntentData {
  entities: string[]
  themes: string[]
  source_types: string[]
  search_queries: string[]
  keywords: string[]
}

interface SourceCandidate {
  url: string
  name: string
  type: string
  description?: string
  relevance_score: number
  selected?: boolean
}

type Step = 'input' | 'loading' | 'review' | 'confirming' | 'done'

const TYPE_ICON: Record<string, JSX.Element> = {
  rss:     <Rss size={14} className="text-amber-400" />,
  github:  <Github size={14} className="text-purple-400" />,
  website: <Globe size={14} className="text-blue-400" />,
  api:     <Globe size={14} className="text-green-400" />,
}

export default function Veille() {
  const [step, setStep]           = useState<Step>('input')
  const [description, setDesc]    = useState('')
  const [intent, setIntent]       = useState<IntentData | null>(null)
  const [sources, setSources]     = useState<SourceCandidate[]>([])
  const [error, setError]         = useState('')
  const [createdCount, setCreated] = useState(0)

  async function handleAnalyze() {
    if (!description.trim() || description.length < 10) return
    setStep('loading')
    setError('')
    try {
      const res = await api.post('/veille/create', { description: description.trim() })
      setIntent(res.data.intent)
      setSources(res.data.sources.map((s: SourceCandidate) => ({ ...s, selected: s.relevance_score >= 0.4 })))
      setStep('review')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Erreur lors de l\'analyse')
      setStep('input')
    }
  }

  function toggleSource(url: string) {
    setSources(prev => prev.map(s => s.url === url ? { ...s, selected: !s.selected } : s))
  }

  async function handleConfirm() {
    const selected = sources.filter(s => s.selected)
    if (!selected.length) return
    setStep('confirming')
    try {
      const res = await api.post('/veille/confirm', { sources: selected })
      setCreated(res.data.created)
      setStep('done')
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'Erreur lors de la création')
      setStep('review')
    }
  }

  function reset() {
    setStep('input'); setDesc(''); setIntent(null)
    setSources([]); setError(''); setCreated(0)
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-white flex items-center gap-2">
          <Sparkles size={22} className="text-blue-400" />
          Créer une veille
        </h1>
        <p className="text-sm text-zinc-400 mt-1">
          Décrivez votre besoin en langage naturel — le système découvre et configure les sources automatiquement.
        </p>
      </div>

      {/* Étape 1 — Saisie */}
      <AnimatePresence mode="wait">
        {(step === 'input' || step === 'loading') && (
          <motion.div key="input" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <textarea
              className="w-full bg-zinc-900 border border-zinc-700 rounded-xl p-4 text-sm text-white
                         placeholder-zinc-500 resize-none focus:outline-none focus:border-blue-500
                         transition-colors min-h-[110px]"
              placeholder="Ex : Je veux suivre les nouveautés de l'API Claude et de Mistral, les publications ArXiv sur les LLMs, et les discussions Hacker News sur les agents IA..."
              value={description}
              onChange={e => setDesc(e.target.value)}
              disabled={step === 'loading'}
              onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleAnalyze() }}
            />
            {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
            <div className="flex items-center justify-between mt-3">
              <span className="text-xs text-zinc-500">{description.length} caractères — ⌘↵ pour lancer</span>
              <button
                onClick={handleAnalyze}
                disabled={description.length < 10 || step === 'loading'}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                           text-white text-sm px-4 py-2 rounded-lg transition-colors"
              >
                {step === 'loading'
                  ? <><Loader2 size={15} className="animate-spin" /> Analyse en cours...</>
                  : <><Search size={15} /> Analyser et découvrir</>
                }
              </button>
            </div>
          </motion.div>
        )}

        {/* Étape 2 — Review */}
        {step === 'review' && intent && (
          <motion.div key="review" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">

            {/* Intent décomposé */}
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">Axes de veille détectés</p>
              <div className="flex flex-wrap gap-2">
                {intent.entities.map(e => (
                  <span key={e} className="bg-blue-900/40 text-blue-300 text-xs px-2 py-1 rounded-full border border-blue-800/50">{e}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {intent.themes.map(t => (
                  <span key={t} className="bg-zinc-800 text-zinc-300 text-xs px-2 py-1 rounded-full">{t}</span>
                ))}
              </div>
              <div className="flex flex-wrap gap-1">
                {intent.keywords.map(k => (
                  <span key={k} className="text-zinc-500 text-xs">#{k}</span>
                ))}
              </div>
            </div>

            {/* Sources candidates */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm text-zinc-300 font-medium">
                  {sources.length} sources trouvées —{' '}
                  <span className="text-blue-400">{sources.filter(s => s.selected).length} sélectionnées</span>
                </p>
                <div className="flex gap-2 text-xs">
                  <button onClick={() => setSources(p => p.map(s => ({ ...s, selected: true })))}
                    className="text-zinc-400 hover:text-white transition-colors">Tout sélectionner</button>
                  <span className="text-zinc-700">·</span>
                  <button onClick={() => setSources(p => p.map(s => ({ ...s, selected: false })))}
                    className="text-zinc-400 hover:text-white transition-colors">Tout désélectionner</button>
                </div>
              </div>

              <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                {sources.map(source => (
                  <motion.div
                    key={source.url}
                    onClick={() => toggleSource(source.url)}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors
                      ${source.selected
                        ? 'bg-blue-950/30 border-blue-800/50 hover:bg-blue-950/40'
                        : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700 opacity-60'
                      }`}
                  >
                    <div className="mt-0.5">
                      {source.selected
                        ? <CheckCircle size={16} className="text-blue-400" />
                        : <XCircle size={16} className="text-zinc-600" />
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {TYPE_ICON[source.type] || TYPE_ICON.website}
                        <span className="text-sm text-white truncate">{source.name}</span>
                        <span className="ml-auto text-xs text-zinc-500 shrink-0">
                          score {Math.round(source.relevance_score * 100)}%
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 truncate mt-0.5">{source.url}</p>
                      {source.description && (
                        <p className="text-xs text-zinc-400 mt-1 line-clamp-2">{source.description}</p>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <div className="flex gap-3 pt-2">
              <button onClick={reset}
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-white px-3 py-2 rounded-lg
                           border border-zinc-700 hover:border-zinc-600 transition-colors">
                <RotateCcw size={14} /> Recommencer
              </button>
              <button
                onClick={handleConfirm}
                disabled={!sources.some(s => s.selected)}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40
                           text-white text-sm px-5 py-2 rounded-lg transition-colors ml-auto"
              >
                Créer {sources.filter(s => s.selected).length} sources
                <ChevronRight size={15} />
              </button>
            </div>
          </motion.div>
        )}

        {/* Étape 3 — Confirmation en cours */}
        {step === 'confirming' && (
          <motion.div key="confirming" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="flex items-center gap-3 text-zinc-300 py-8">
            <Loader2 size={18} className="animate-spin text-blue-400" />
            Création des sources et premier collect en cours...
          </motion.div>
        )}

        {/* Étape 4 — Done */}
        {step === 'done' && (
          <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="bg-zinc-900 border border-green-800/40 rounded-xl p-6 text-center space-y-4">
            <CheckCircle size={36} className="text-green-400 mx-auto" />
            <div>
              <p className="text-white font-medium">{createdCount} sources créées avec succès</p>
              <p className="text-zinc-400 text-sm mt-1">
                Le premier collect est en cours. Les items apparaîtront dans le Feed dans quelques minutes.
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <a href="/feed"
                className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-4 py-2 rounded-lg transition-colors">
                Voir le Feed
              </a>
              <button onClick={reset}
                className="text-zinc-400 hover:text-white text-sm px-4 py-2 rounded-lg border
                           border-zinc-700 hover:border-zinc-600 transition-colors">
                Nouvelle veille
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
