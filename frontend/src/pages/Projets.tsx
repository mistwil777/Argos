import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Plus, Folder, ChevronRight, Loader2, AlertCircle, Trash2, CheckSquare, Square } from 'lucide-react'
import { api } from '@/services/api'

export default function Projets() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [deleting, setDeleting] = useState<number | 'batch' | null>(null)
  const navigate = useNavigate()

  const allSelected = projects.length > 0 && selected.size === projects.length

  function toggleSelect(id: number) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(projects.map(p => p.id)))
  }

  async function handleDeleteOne(id: number) {
    if (!window.confirm('Supprimer ce projet ? Cette action est irréversible.')) return
    setDeleting(id)
    try {
      await api.deleteProject(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      setSelected(prev => { const n = new Set(prev); n.delete(id); return n })
    } catch (e: any) { setError(e.message) }
    finally { setDeleting(null) }
  }

  async function handleDeleteSelected() {
    if (!window.confirm(`Supprimer ${selected.size} projet${selected.size > 1 ? 's' : ''} ? Cette action est irréversible.`)) return
    setDeleting('batch')
    try {
      await Promise.all([...selected].map(id => api.deleteProject(id)))
      setProjects(prev => prev.filter(p => !selected.has(p.id)))
      setSelected(new Set())
    } catch (e: any) { setError(e.message) }
    finally { setDeleting(null) }
  }

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

        {/* Project list */}
        {projects.length > 0 && (
          <div className="grid gap-3">
            {/* Select-all row */}
            <div className="flex items-center gap-3 px-2">
              <button
                onClick={toggleSelectAll}
                className="w-5 h-5 flex items-center justify-center rounded border flex-shrink-0 transition-all
                           border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]"
              >
                {allSelected
                  ? <CheckSquare className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
                  : <Square className="w-3.5 h-3.5" />
                }
              </button>
              <span className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                {selected.size > 0
                  ? <>{selected.size} sélectionné{selected.size > 1 ? 's' : ''} — <button onClick={handleDeleteSelected} disabled={deleting === 'batch'} className="text-[hsl(var(--red))] hover:underline">
                      {deleting === 'batch' ? 'Suppression…' : 'Supprimer la sélection'}
                    </button></>
                  : 'Tout sélectionner'
                }
              </span>
            </div>

            {projects.map((p, i) => {
              const isSelected = selected.has(p.id)
              return (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.18, delay: i * 0.04 }}
                  className={`flex items-center gap-3 px-5 py-4 rounded-xl border transition-all group
                    ${isSelected
                      ? 'border-[hsl(var(--accent-line))] bg-[hsl(var(--accent-dim))]'
                      : 'border-[hsl(var(--line))] bg-[hsl(var(--bg-1))] hover:border-[hsl(var(--line-bright))]'
                    }`}
                >
                  {/* Checkbox */}
                  <button
                    onClick={() => toggleSelect(p.id)}
                    className={`w-5 h-5 flex items-center justify-center rounded border flex-shrink-0 transition-all
                      ${isSelected
                        ? 'bg-[hsl(var(--accent))] border-[hsl(var(--accent))] text-white'
                        : 'border-[hsl(var(--line))] text-transparent hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))]'
                      }`}
                  >
                    <CheckSquare className="w-3 h-3" />
                  </button>

                  {/* Card body — clickable to navigate */}
                  <button
                    onClick={() => navigate(`/projets/${p.id}`)}
                    className="flex-1 flex items-center justify-between min-w-0 text-left"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                           style={{ background: 'hsl(var(--accent)/.15)' }}>
                        <Folder style={{ width: 18, height: 18 }} className="text-[hsl(var(--accent))]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[14px] font-semibold text-[hsl(var(--text))] truncate">{p.name}</p>
                        {p.description && (
                          <p className="text-[12px] text-[hsl(var(--text-3))] truncate mt-0.5">{p.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0 ml-4">
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
                  </button>

                  {/* Trash */}
                  <button
                    onClick={() => handleDeleteOne(p.id)}
                    disabled={deleting === p.id}
                    className="w-7 h-7 flex items-center justify-center rounded-md flex-shrink-0
                               text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] hover:bg-[hsl(var(--red)/.08)]
                               transition-all opacity-0 group-hover:opacity-100 disabled:opacity-50"
                  >
                    {deleting === p.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />
                    }
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}

      </div>
    </div>
  )
}
