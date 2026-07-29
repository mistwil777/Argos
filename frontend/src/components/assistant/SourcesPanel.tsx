/**
 * SourcesPanel — drawer latéral listant les sources sélectionnées par le système.
 * L'utilisateur peut exprimer librement pourquoi une source ne lui convient pas.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Globe, Rss, Github, BookOpen,
  ThumbsDown, Check, Info, Loader2, Send,
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DiscoveredSource {
  url: string
  name: string
  type: string
  relevance_score: number
  reason?: string
  selected?: boolean
}

interface SourcesPanelProps {
  open: boolean
  onClose: () => void
  sources: DiscoveredSource[]
  intent?: {
    entities?: string[]
    themes?: string[]
    source_rationale?: string
  } | null
  flow: 'rag_direct' | 'discovery' | null
  onPreferenceSaved?: () => void
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const API_BASE = 'http://localhost:8000/api/v1'

const TYPE_ICON: Record<string, React.ReactNode> = {
  rss:     <Rss      size={13} className="text-amber-400"  />,
  github:  <Github   size={13} className="text-purple-400" />,
  arxiv:   <BookOpen size={13} className="text-blue-400"   />,
  website: <Globe    size={13} className="text-zinc-400"   />,
  blog:    <Globe    size={13} className="text-green-400"  />,
  docs:    <BookOpen size={13} className="text-sky-400"    />,
  news:    <Globe    size={13} className="text-orange-400" />,
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function SourcesPanel({
  open, onClose, sources, intent, flow, onPreferenceSaved,
}: SourcesPanelProps) {
  // État par source : null = pas ouvert, string = texte en cours, 'done' = envoyé
  const [feedbackState, setFeedbackState] = useState<Record<string, {
    open: boolean
    text: string
    status: 'idle' | 'pending' | 'done'
  }>>({})

  function openFeedback(srcUrl: string) {
    setFeedbackState(prev => ({
      ...prev,
      [srcUrl]: { open: true, text: prev[srcUrl]?.text ?? '', status: 'idle' },
    }))
  }

  function updateText(srcUrl: string, text: string) {
    setFeedbackState(prev => ({
      ...prev,
      [srcUrl]: { ...prev[srcUrl], text },
    }))
  }

  async function submitFeedback(source: DiscoveredSource) {
    const state = feedbackState[source.url]
    if (!state || !state.text.trim()) return

    setFeedbackState(prev => ({ ...prev, [source.url]: { ...prev[source.url], status: 'pending' } }))

    // On détermine automatiquement la rule_type selon le contenu du texte
    // (le backend stocke le texte brut — rule_type = 'user_feedback' libre)
    const domain = (() => { try { return new URL(source.url).hostname.replace('www.', '') } catch { return source.url } })()

    try {
      await fetch(`${API_BASE}/assistant/sources/feedback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: 'user_feedback',
          value:     domain,
          reason:    state.text.trim(),
        }),
      })
      setFeedbackState(prev => ({ ...prev, [source.url]: { ...prev[source.url], status: 'done' } }))
      onPreferenceSaved?.()
    } catch {
      setFeedbackState(prev => ({ ...prev, [source.url]: { ...prev[source.url], status: 'idle' } }))
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Fond semi-transparent */}
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-black/40"
          />

          {/* Panneau latéral */}
          <motion.aside
            key="panel"
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 350, damping: 35 }}
            className="fixed right-0 top-0 bottom-0 z-50 w-[440px] max-w-full
                       bg-[hsl(var(--bg-1))] border-l border-[hsl(var(--line))]
                       flex flex-col overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[hsl(var(--line))]">
              <div>
                <p className="text-[13px] font-semibold text-[hsl(var(--text))]">
                  Sources sélectionnées
                </p>
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">
                  {flow === 'rag_direct' ? 'Depuis la base indexée' : 'Nouvelles sources découvertes'}
                  {' · '}{sources.length} source{sources.length > 1 ? 's' : ''}
                </p>
              </div>
              <button onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--bg-2))] transition-colors text-[hsl(var(--text-3))]">
                <X size={14} />
              </button>
            </div>

            {/* Résumé de l'analyse */}
            {intent && flow === 'discovery' && (
              <div className="mx-4 mt-4 p-3 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-[hsl(var(--accent))]">
                  <Info size={11} /> Pourquoi ces sources ?
                </div>
                {intent.source_rationale && (
                  <p className="text-[11.5px] text-[hsl(var(--text-2))] leading-relaxed">
                    {intent.source_rationale}
                  </p>
                )}
                {intent.entities && intent.entities.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {intent.entities.map(e => (
                      <span key={e} className="text-[10px] px-1.5 py-0.5 rounded-full
                        bg-[hsl(var(--accent-dim))] text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))]">
                        {e}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Liste des sources */}
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {sources.length === 0 && (
                <p className="text-[12px] text-[hsl(var(--text-3))] text-center py-8">
                  Aucune source à afficher.
                </p>
              )}

              {sources.map((src, i) => {
                const fb = feedbackState[src.url]
                return (
                  <motion.div
                    key={src.url}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="p-3 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] space-y-2"
                  >
                    {/* Titre + type + score */}
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 flex-shrink-0">
                        {TYPE_ICON[src.type] || TYPE_ICON.website}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12.5px] font-medium text-[hsl(var(--text))] truncate">
                          {src.name || src.url}
                        </p>
                        <p className="text-[10.5px] font-mono text-[hsl(var(--text-3))] truncate">
                          {src.url}
                        </p>
                      </div>
                      <span className="text-[10px] font-mono text-[hsl(var(--text-3))] flex-shrink-0">
                        {Math.round((src.relevance_score ?? 0) * 100)}%
                      </span>
                    </div>

                    {/* Raison littérale du système */}
                    {src.reason && (
                      <p className="text-[11.5px] text-[hsl(var(--text-2))] leading-relaxed pl-5">
                        {src.reason}
                      </p>
                    )}

                    {/* Feedback utilisateur */}
                    <div className="pl-5">
                      {fb?.status === 'done' ? (
                        <div className="flex items-center gap-1.5 text-[11px] text-green-400">
                          <Check size={11} /> Avis enregistré — Argos en tiendra compte.
                        </div>
                      ) : fb?.open ? (
                        <div className="space-y-1.5">
                          <p className="text-[10.5px] text-[hsl(var(--text-3))]">
                            Exprimez librement votre avis sur cette source :
                          </p>
                          <div className="flex gap-2">
                            <input
                              autoFocus
                              type="text"
                              value={fb.text}
                              onChange={e => updateText(src.url, e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') submitFeedback(src) }}
                              placeholder="Ex : trop généraliste, pas assez technique, hors sujet..."
                              className="flex-1 bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-2.5 py-1.5
                                         text-[11.5px] text-[hsl(var(--text))] placeholder:text-[hsl(var(--text-3))]
                                         focus:outline-none focus:border-[hsl(var(--accent-line))] transition-colors"
                            />
                            <button
                              onClick={() => submitFeedback(src)}
                              disabled={!fb.text.trim() || fb.status === 'pending'}
                              className="w-7 h-7 flex items-center justify-center rounded bg-[hsl(var(--accent))]
                                         text-white disabled:opacity-40 flex-shrink-0"
                            >
                              {fb.status === 'pending'
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Send size={11} />
                              }
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => openFeedback(src.url)}
                          className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--text-3))]
                                     hover:text-red-400 transition-colors"
                        >
                          <ThumbsDown size={11} />
                          Cette source ne me convient pas
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-[hsl(var(--line))]">
              <p className="text-[10px] font-mono text-[hsl(var(--text-3))] text-center">
                Vos retours sont mémorisés et appliqués aux prochaines recherches.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
