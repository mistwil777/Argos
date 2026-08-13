import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Folder, Users, ChevronRight, Loader2, AlertCircle } from 'lucide-react'
import { api } from '@/services/api'

export default function Projets() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    api.listProjects()
      .then(setProjects)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="h-full overflow-auto px-8 py-7">
      <div className="max-w-4xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[hsl(var(--text))]">Espaces projet</h2>
            <p className="text-[12px] font-mono text-[hsl(var(--text-3))] mt-0.5">
              Projets partagés avec arborescence de sujets dédiée
            </p>
          </div>
          <button
            onClick={() => navigate('/projets/nouveau')}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium
                       bg-[hsl(var(--accent))] text-white hover:brightness-110 transition-all"
          >
            <Plus className="w-4 h-4" />
            Nouveau projet
          </button>
        </div>

        {/* States */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[hsl(var(--text-3))]" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-[hsl(var(--red)/.3)] bg-[hsl(var(--red)/.08)] text-[hsl(var(--red))] text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && projects.length === 0 && (
          <div className="text-center py-20 space-y-3">
            <Folder className="w-10 h-10 mx-auto text-[hsl(var(--text-3))]" />
            <p className="text-[14px] text-[hsl(var(--text-2))]">Aucun projet pour l'instant</p>
            <p className="text-[12px] text-[hsl(var(--text-3))]">
              Créez un projet pour partager une veille dédiée avec votre équipe.
            </p>
          </div>
        )}

        {/* Project cards */}
        <div className="grid gap-3">
          {projects.map((p, i) => (
            <motion.button
              key={p.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18, delay: i * 0.04 }}
              onClick={() => navigate(`/projets/${p.id}`)}
              className="w-full text-left flex items-center justify-between px-5 py-4
                         rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-1))]
                         hover:border-[hsl(var(--accent)/.4)] hover:bg-[hsl(var(--accent)/.04)]
                         transition-all group"
            >
              <div className="flex items-center gap-4 min-w-0">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                     style={{ background: 'hsl(var(--accent)/.15)' }}>
                  <Folder className="w-4.5 h-4.5 text-[hsl(var(--accent))]" style={{ width: 18, height: 18 }} />
                </div>
                <div className="min-w-0">
                  <p className="text-[14px] font-semibold text-[hsl(var(--text))] truncate">{p.name}</p>
                  {p.description && (
                    <p className="text-[12px] text-[hsl(var(--text-3))] truncate mt-0.5">{p.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 ml-4">
                {p.teams_webhook_url && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[hsl(var(--violet)/.12)] text-[hsl(var(--violet))] border border-[hsl(var(--violet)/.2)]">
                    Teams
                  </span>
                )}
                {p.cdc_analysis ? (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[hsl(var(--aqua)/.12)] text-[hsl(var(--aqua))] border border-[hsl(var(--aqua)/.2)]">
                    Calibré
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[hsl(var(--yellow)/.12)] text-[hsl(var(--yellow))] border border-[hsl(var(--yellow)/.2)]">
                    À calibrer
                  </span>
                )}
                <ChevronRight className="w-4 h-4 text-[hsl(var(--text-3))] group-hover:text-[hsl(var(--accent))] transition-colors" />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </div>
  )
}
