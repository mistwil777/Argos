import { useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, Sparkles, Loader2, Check,
  Folder, Plus,
} from 'lucide-react'
import { api } from '@/services/api'

const DossiersContent = lazy(() => import('@/pages/Dossiers'))

// ─── Thèmes suggérés par domaine ─────────────────────────────────────────────

const DOMAIN_THEMES: Record<string, { label: string; desc: string; icon: string; sources_hint: string }[]> = {
  'Intelligence Artificielle': [
    { label: 'LLMs & Modèles de langage', desc: 'GPT, Claude, Gemini, Llama — avancées et benchmarks', icon: '🧠', sources_hint: 'arxiv, huggingface, openai blog' },
    { label: 'Agents IA & Systèmes multi-agents', desc: 'AutoGPT, CrewAI, LangGraph, architectures agentiques', icon: '🤖', sources_hint: 'github, arxiv, lmsys' },
    { label: 'Machine Learning classique', desc: 'XGBoost, scikit-learn, feature engineering, modèles tabulaires', icon: '📐', sources_hint: 'arxiv, kaggle, scikit-learn.org' },
    { label: 'Deep Learning & Réseaux de neurones', desc: 'Transformers, CNN, RNN, architectures avancées, PyTorch', icon: '🔬', sources_hint: 'arxiv, paperswithcode, pytorch.org' },
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
  const [unknown, setUnknown]           = useState(false)   // domaine non reconnu
  const [wsName, setWsName]             = useState('')      // nom du dossier à créer
  const [freeLabel, setFreeLabel]       = useState('')      // sous-thème libre
  const [freeList, setFreeList]         = useState<string[]>([])
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
    setUnknown(false)
    setFreeList([])
    setSelected(new Set())
    setTargetWorkspace(null)
    await new Promise(r => setTimeout(r, 400))
    const detected = detectDomain(query)
    if (!detected) {
      const q = query.trim()
      // 1. Extraire le domaine principal : ce qui suit "sur", "en", "concernant", "autour de", "dans le domaine de"
      const domainPatterns = [
        /(?:sur|concernant|autour\s+de|dans\s+le\s+domaine\s+de|de\s+la|du|de\s+l[''])\s+(.+?)(?:\s+avec|\s+et\s+|\s+pour\s+|$)/i,
        /(?:veille|suivi|monitoring)\s+(?:sur\s+)?(.+?)(?:\s+avec|\s+et\s+|\s+pour\s+|$)/i,
      ]
      let domainName = ''
      for (const pat of domainPatterns) {
        const m = q.match(pat)
        if (m?.[1]) { domainName = m[1].trim(); break }
      }
      // Fallback : mots significatifs après nettoyage
      if (!domainName) {
        const stopwords = new Set(['je', 'jaimerai', 'jaimerais', 'jaimerais', 'créer', 'une', 'sur', 'la', 'le', 'les', 'de', 'du', 'des', 'avec', 'dans', 'ce', 'domaine', 'veille', 'faire', 'avoir', 'pour', 'un', 'et', 'en', 'par', 'voudrais', 'veux', 'aimerais', 'aimerai', 'faire', 'mes'])
        const words = q.toLowerCase().replace(/['']/g, '').split(/\s+/).filter(w => w.length > 2 && !stopwords.has(w))
        domainName = words.slice(0, 3).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
      }
      // Supprimer les articles en début ("la", "le", "les", "l'", "un", "une", "des")
      domainName = domainName.replace(/^(la|le|les|l['']|un|une|des)\s+/i, '')
      // Capitaliser proprement
      domainName = domainName.charAt(0).toUpperCase() + domainName.slice(1)
      setWsName(domainName)

      // 2. Générer des sous-thèmes suggérés selon le domaine extrait
      const dl = domainName.toLowerCase()
      let suggestions: string[] = []
      if (dl.includes('projet') || dl.includes('équipe') || dl.includes('management')) {
        suggestions = ['Planification & Roadmap', 'Gestion des risques', 'Agilité & Scrum', 'Leadership', 'Communication d\'équipe', 'OKR & KPI']
      } else if (dl.includes('marketing') || dl.includes('communic')) {
        suggestions = ['SEO & Content', 'Réseaux sociaux', 'Growth hacking', 'Branding', 'Email marketing', 'Analytics']
      } else if (dl.includes('finance') || dl.includes('compta')) {
        suggestions = ['Comptabilité', 'Contrôle de gestion', 'Fiscalité', 'Fintech', 'Investissement', 'Trésorerie']
      } else if (dl.includes('juridique') || dl.includes('droit') || dl.includes('legal')) {
        suggestions = ['Droit du travail', 'RGPD & données', 'Contrats', 'Propriété intellectuelle', 'Conformité']
      } else if (dl.includes('cyber') || dl.includes('sécurité')) {
        suggestions = ['Menaces & vulnérabilités', 'Pentest', 'Gouvernance SSI', 'Zero Trust', 'SOC & SIEM']
      } else if (dl.includes('cloud') || dl.includes('infra')) {
        suggestions = ['AWS', 'Azure', 'GCP', 'Kubernetes', 'Terraform', 'FinOps']
      } else {
        // Suggestions génériques
        suggestions = ['Actualités', 'Bonnes pratiques', 'Outils & Méthodes', 'Tendances', 'Cas d\'usage', 'Réglementation']
      }
      setFreeList(suggestions)
      setSelected(new Set())
      setUnknown(true)
      setLoading(false)
      return
    }
    const { domain, items } = detected
    setThemes(items)
    try {
      const data = await api.getWorkspaces()
      const workspaces: { id: number; name: string }[] = data.workspaces || data
      const domainWords = domain.toLowerCase().split(/[\s&]+/).filter(w => w.length > 1)
      const domainAbbrev = domainWords.map(w => w[0]).join('')
      const match = workspaces.find(ws => {
        const wsLow = ws.name.toLowerCase()
        return domainWords.some(w => wsLow.includes(w)) || wsLow === domainAbbrev || wsLow.includes(domainAbbrev)
      })
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

  function addFree() {
    const val = freeLabel.trim()
    if (!val || freeList.includes(val)) return
    setFreeList(prev => [...prev, val])
    setFreeLabel('')
  }

  // Création pour domaine connu (thèmes prédéfinis)
  async function createDossiers() {
    if (!selected.size) return
    setCreating(true)
    try {
      if (targetWorkspace) {
        for (const label of selected) {
          await api.createSujet({ name: label, description: themes?.find(t => t.label === label)?.desc || '', workspace_id: targetWorkspace.id })
        }
      } else {
        for (const label of selected) {
          await api.createWorkspace({ name: label, description: themes?.find(t => t.label === label)?.desc || '', icon: 'folder', color: '#6366f1' })
        }
      }
      setDone(true)
      setTimeout(() => { setDone(false); setThemes(null); setQuery(''); onDone() }, 1200)
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
  }

  // Création pour domaine libre (inconnu)
  async function createFree() {
    if (!wsName.trim()) return
    setCreating(true)
    try {
      const ws = await api.createWorkspace({ name: wsName.trim(), icon: 'folder', color: '#6366f1' })
      for (const label of selected) {
        await api.createSujet({ name: label, workspace_id: ws.id })
      }
      setDone(true)
      setTimeout(() => { setDone(false); setUnknown(false); setFreeList([]); setQuery(''); onDone() }, 1200)
    } catch (e) { console.error(e) }
    finally { setCreating(false) }
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
          {unknown && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Nom du dossier */}
              <div>
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Dossier principal</p>
                <input
                  value={wsName}
                  onChange={e => setWsName(e.target.value)}
                  placeholder="Nom du dossier"
                  className="w-full pl-3 pr-3 py-2.5 bg-[hsl(var(--bg))] border border-[hsl(var(--accent-line))] rounded-lg text-[13px] font-semibold text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none focus:border-[hsl(var(--accent))] transition-colors"
                />
              </div>

              {/* Sous-thèmes suggérés */}
              <div>
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">
                  Sous-dossiers suggérés — cochez ce qui vous intéresse
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {freeList.map(label => {
                    const isOn = selected.has(label)
                    return (
                      <motion.button key={label} onClick={() => toggle(label)}
                        whileTap={{ scale: 0.99 }}
                        className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                          isOn
                            ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]'
                            : 'border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] hover:border-[hsl(var(--line-bright))]'
                        }`}>
                        <div className={`w-4 h-4 rounded border-2 flex-shrink-0 flex items-center justify-center transition-all ${
                          isOn ? 'border-[hsl(var(--accent))] bg-[hsl(var(--accent))]' : 'border-[hsl(var(--text-3))]'
                        }`}>
                          {isOn && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                        </div>
                        <span className={`text-[12.5px] font-medium ${isOn ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text))]'}`}>{label}</span>
                      </motion.button>
                    )
                  })}
                </div>
              </div>

              {/* Ajouter un sous-thème personnalisé */}
              <div className="flex gap-2">
                <input
                  value={freeLabel}
                  onChange={e => setFreeLabel(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addFree()}
                  placeholder="Ajouter un sous-dossier personnalisé…"
                  className="flex-1 pl-3 pr-3 py-2 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded-lg text-[12px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))] outline-none focus:border-[hsl(var(--accent-line))] transition-colors"
                />
                <button onClick={addFree}
                  className="px-3 py-2 rounded-lg text-white"
                  style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              <motion.button
                initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                onClick={createFree}
                disabled={creating || done || !wsName.trim()}
                whileTap={{ scale: 0.97 }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-lg text-white text-[13px] font-bold disabled:opacity-60 transition-all"
                style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}
              >
                {done ? (
                  <><Check className="w-4 h-4" /> Dossier créé ✓</>
                ) : creating ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Création en cours…</>
                ) : (
                  <><Plus className="w-4 h-4" /> Créer "{wsName.trim()}"{selected.size > 0 ? ` + ${selected.size} sous-dossier${selected.size > 1 ? 's' : ''}` : ''}</>
                )}
              </motion.button>
            </motion.div>
          )}
          {themes && themes.length > 0 && (
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
  const [showCadrage] = useState(true)

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

        {/* Titre section dossiers */}
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[hsl(var(--text))] flex items-center gap-2">
            <Folder className="w-4 h-4 text-[hsl(var(--accent))]" />
            Vos dossiers de veille
          </h3>
        </div>

        {/* Dossiers existants */}
        <Suspense fallback={<div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" /></div>}>
          <DossiersContent key={refresh} />
        </Suspense>
      </div>
    </div>
  )
}
