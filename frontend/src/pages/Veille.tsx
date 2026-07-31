import { useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Sparkles, Loader2, Check,
  Folder, Plus, X,
} from 'lucide-react'
import { api } from '@/services/api'

const DossiersContent = lazy(() => import('@/pages/Dossiers'))

// ─── Thèmes suggérés par domaine ─────────────────────────────────────────────

const DOMAIN_THEMES: Record<string, { label: string; desc: string; icon: string; sources_hint: string }[]> = {
  'Intelligence Artificielle': [
    { label: 'LLMs & Modèles de langage', desc: 'GPT, Claude, Gemini, Llama — avancées et benchmarks', icon: '🧠', sources_hint: 'arxiv, huggingface, openai blog' },
    { label: 'Agents IA & Systèmes multi-agents', desc: 'AutoGPT, CrewAI, LangGraph, architectures agentiques', icon: '🤖', sources_hint: 'github, arxiv, lmsys' },
    { label: 'RAG & Bases vectorielles', desc: 'LanceDB, Weaviate, Pinecone, patterns de retrieval', icon: '🔍', sources_hint: 'github, blog.llamaindex.ai' },
    { label: 'MLOps & Infrastructure IA', desc: 'MLflow, Ray, déploiement de modèles, monitoring', icon: '⚙️', sources_hint: 'mlflow.org, ray.io, neptune.ai' },
    { label: 'Vision par ordinateur', desc: 'Diffusion, CLIP, détection d\'objets, génération d\'images', icon: '👁️', sources_hint: 'arxiv, paperswithcode' },
    { label: 'IA & Réglementation', desc: 'EU AI Act, gouvernance, éthique IA, conformité', icon: '⚖️', sources_hint: 'europa.eu, nist.gov' },
    { label: 'IA générative appliquée', desc: 'Cas d\'usage enterprise, outils no-code, ROI', icon: '✨', sources_hint: 'a16z, sequoiacap, techcrunch' },
  ],
  'Développement logiciel': [
    { label: 'Frontend & UI moderne', desc: 'React, Vue, Svelte, design systems', icon: '🎨', sources_hint: 'github, dev.to, smashingmagazine' },
    { label: 'Backend & APIs', desc: 'FastAPI, Node, Rust, architecture microservices', icon: '🔌', sources_hint: 'github, medium, hacker news' },
    { label: 'DevOps & Cloud', desc: 'Kubernetes, Docker, Terraform, AWS/GCP/Azure', icon: '☁️', sources_hint: 'github, cncf.io, cloudnative.news' },
    { label: 'Sécurité applicative', desc: 'OWASP, vulnérabilités, bonnes pratiques', icon: '🔒', sources_hint: 'owasp.org, cve.mitre.org' },
  ],
  'Data & Analytics': [
    { label: 'Data Engineering', desc: 'dbt, Spark, Airflow, pipelines de données', icon: '🔧', sources_hint: 'github, dbtlabs.com, apache.org' },
    { label: 'Business Intelligence', desc: 'Tableau, Metabase, Superset, visualisation', icon: '📊', sources_hint: 'github, analyticsvidhya' },
    { label: 'Bases de données', desc: 'PostgreSQL, DuckDB, nouvelles BDD vectorielles', icon: '🗄️', sources_hint: 'github, postgresql.org, duckdb.org' },
  ],
}

// ─── Composant de cadrage ─────────────────────────────────────────────────────

function CadrageVeille({ onDone }: { onDone: () => void }) {
  const [query, setQuery]               = useState('')
  const [loading, setLoading]           = useState(false)
  const [themes, setThemes]             = useState<typeof DOMAIN_THEMES[string] | null>(null)
  const [selected, setSelected]         = useState<Set<string>>(new Set())
  const [creating, setCreating]         = useState(false)
  const [done, setDone]                 = useState(false)
  const [targetWorkspace, setTargetWorkspace] = useState<{ id: number; name: string } | null>(null)

  function detectDomain(q: string) {
    const lower = q.toLowerCase()
    for (const [domain, items] of Object.entries(DOMAIN_THEMES)) {
      const keywords = domain.toLowerCase().split(/[\s&]+/)
      if (keywords.some(k => lower.includes(k))) return { domain, items }
    }
    for (const [domain, items] of Object.entries(DOMAIN_THEMES)) {
      if (items.some(t => t.label.toLowerCase().split(/\s+/).some(w => w.length > 3 && lower.includes(w)))) {
        return { domain, items }
      }
    }
    return null
  }

  async function handleSearch() {
    if (!query.trim()) return
    setLoading(true)
    setThemes(null)
    setSelected(new Set())
    setTargetWorkspace(null)
    await new Promise(r => setTimeout(r, 600))
    const detected = detectDomain(query)
    const { items } = detected || { domain: '', items: DOMAIN_THEMES['Intelligence Artificielle'] }
    setThemes(items)

    // Cherche si un workspace existant correspond au domaine détecté
    try {
      const data = await api.getWorkspaces()
      const workspaces: { id: number; name: string }[] = data.workspaces || data
      const queryWords = query.toLowerCase().split(/\s+/).filter(w => w.length > 2)
      const match = workspaces.find(ws =>
        queryWords.some(w => ws.name.toLowerCase().includes(w)) ||
        ws.name.toLowerCase().split(/\s+/).some(w => w.length > 2 && query.toLowerCase().includes(w))
      )
      if (match) setTargetWorkspace(match)
    } catch { /* silencieux */ }

    setLoading(false)
  }

  function toggle(label: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(label) ? next.delete(label) : next.add(label)
      return next
    })
  }

  async function createDossiers() {
    if (!selected.size) return
    setCreating(true)
    try {
      if (targetWorkspace) {
        // Ajoute comme sujets dans le workspace existant
        for (const label of selected) {
          await api.createSujet({
            name: label,
            description: themes?.find(t => t.label === label)?.desc || '',
            workspace_id: targetWorkspace.id,
          })
        }
      } else {
        // Crée un nouveau workspace par sélection
        for (const label of selected) {
          await api.createWorkspace({
            name: label,
            description: themes?.find(t => t.label === label)?.desc || '',
            icon: 'folder',
            color: '#6366f1',
          })
        }
      }
      setDone(true)
      setTimeout(() => { setDone(false); setThemes(null); setQuery(''); onDone() }, 1200)
    } catch (e) {
      console.error(e)
    } finally { setCreating(false) }
  }

  return (
    <div className="panel overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />

      {/* Header */}
      <div className="px-5 pt-5 pb-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-[hsl(var(--accent))]" />
          <h2 className="text-[14px] font-bold text-[hsl(var(--text))]">Cadrer votre veille</h2>
        </div>
        <p className="text-[11.5px] text-[hsl(var(--text-3))]">
          Dites ce que vous voulez surveiller — Argos décompose le domaine en sous-thèmes et configure les sources.
        </p>
      </div>

      <div className="p-5 space-y-5">
        {/* Champ de recherche */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[hsl(var(--text-3))]" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSearch()}
              placeholder="Ex : Intelligence Artificielle, DevOps, Data Engineering…"
              className="w-full pl-9 pr-4 py-2.5 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg text-[13px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none focus:border-[hsl(var(--accent-line))] transition-colors"
            />
          </div>
          <motion.button
            onClick={handleSearch}
            whileTap={{ scale: 0.96 }}
            disabled={loading || !query.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-white text-[12.5px] font-bold disabled:opacity-60 transition-opacity"
          style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Analyser
          </motion.button>
        </div>

        {/* Sous-thèmes */}
        <AnimatePresence>
          {themes && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider">
                  Sous-thèmes détectés — cochez ce qui vous intéresse
                </p>
                {targetWorkspace && (
                  <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full border"
                    style={{ color: '#0070AD', borderColor: '#0070AD40', background: '#0070AD08' }}>
                    → sujets dans "{targetWorkspace.name}"
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-2">
                {themes.map(t => {
                  const isOn = selected.has(t.label)
                  return (
                    <motion.button key={t.label} onClick={() => toggle(t.label)}
                      whileTap={{ scale: 0.99 }}
                      className={`flex items-start gap-3 p-3 rounded-lg border text-left transition-all ${
                        isOn
                          ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]'
                          : 'border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] hover:border-[hsl(var(--line-bright))]'
                      }`}>
                      <div className={`w-4 h-4 rounded border-2 flex-shrink-0 mt-0.5 flex items-center justify-center transition-all ${
                        isOn ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--text-3))]'
                      }`}>
                        {isOn && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                      </div>
                      <span className="text-base flex-shrink-0 leading-none mt-0.5">{t.icon}</span>
                      <div className="min-w-0">
                        <p className={`text-[12.5px] font-semibold ${isOn ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text))]'}`}>{t.label}</p>
                        <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">{t.desc}</p>
                        <p className="text-[10px] font-mono text-[hsl(var(--text-3)/.6)] mt-1">Sources : {t.sources_hint}</p>
                      </div>
                    </motion.button>
                  )
                })}
              </div>

              {selected.size > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  onClick={createDossiers}
                  disabled={creating || done}
                  whileTap={{ scale: 0.97 }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-lg bg-[hsl(var(--accent))] text-white text-[13px] font-bold disabled:opacity-80 transition-all"
                >
                  {done ? (
                    <><Check className="w-4 h-4" /> {selected.size} dossier{selected.size > 1 ? 's' : ''} créé{selected.size > 1 ? 's' : ''} ✓</>
                  ) : creating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Création en cours…</>
                  ) : (
                    <><Plus className="w-4 h-4" /> Créer {selected.size} dossier{selected.size > 1 ? 's' : ''} de veille</>
                  )}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Page Veille ──────────────────────────────────────────────────────────────

export default function Veille() {
  const [refresh, setRefresh] = useState(0)
  const [showCadrage, setShowCadrage] = useState(true)

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 space-y-6 max-w-5xl mx-auto">

        {/* Cadrage intelligent */}
        <AnimatePresence>
          {showCadrage && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
              <CadrageVeille onDone={() => setRefresh(r => r + 1)} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toggle cadrage */}
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <Folder className="w-4 h-4 text-[hsl(var(--accent))]" />
            Vos dossiers de veille
          </h3>
          <button onClick={() => setShowCadrage(v => !v)}
            className="flex items-center gap-1.5 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
            {showCadrage
              ? <><X className="w-3 h-3" /> Fermer le cadrage</>
              : <><Plus className="w-3 h-3" /> Ajouter des dossiers</>
            }
          </button>
        </div>

        {/* Dossiers existants */}
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" /></div>}>
          <DossiersContent key={refresh} />
        </Suspense>
      </div>
    </div>
  )
}
