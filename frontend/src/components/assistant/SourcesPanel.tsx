/**
 * SourcesPanel — drawer latéral listant les sources sélectionnées par le système
 * avec leur explication littérale et la possibilité de les rejeter.
 */

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, ChevronRight, Globe, Rss, Github, BookOpen,
  ThumbsDown, Check, Info, Loader2,
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
  rss:     <Rss     size={13} className="text-amber-400"  />,
  github:  <Github  size={13} className="text-purple-400" />,
  arxiv:   <BookOpen size={13} className="text-blue-400" />,
  website: <Globe   size={13} className="text-zinc-400"   />,
  blog:    <Globe   size={13} className="text-green-400"  />,
  docs:    <BookOpen size={13} className="text-sky-400"   />,
  news:    <Globe   size={13} className="text-orange-400" />,
}

const RULE_LABELS: Record<string, string> = {
  reject_domain: "Ne plus utiliser ce site",
  reject_type:   "Ne plus utiliser ce type de source",
}

// ─── Composant ────────────────────────────────────────────────────────────────

export default function SourcesPanel({
  open, onClose, sources, intent, flow, onPreferenceSaved,
}: SourcesPanelProps) {
  const [feedback, setFeedback] = useState<Record<string, 'pending' | 'done'>>({})

  async function rejectSource(source: DiscoveredSource, ruleType: 'reject_domain' | 'reject_type') {
    const value = ruleType === 'reject_domain'
      ? new URL(source.url).hostname.replace('www.', '')
      : source.type

    const key = `${ruleType}:${value}`
    setFeedback(prev => ({ ...prev, [key]: 'pending' }))

    try {
      await fetch(`${API_BASE}/assistant/sources/feedback`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: ruleType,
          value,
          reason: `Rejeté depuis le panneau Sources après une demande vocale.`,
        }),
      })
      setFeedback(prev => ({ ...prev, [key]: 'done' }))
      onPreferenceSaved?.()
    } catch {
      setFeedback(prev => { const n = { ...prev }; delete n[key]; return n })
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
            className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-full
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
                  {' · '}{sources.length} sources
                </p>
              </div>
              <button onClick={onClose}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-[hsl(var(--bg-2))] transition-colors text-[hsl(var(--text-3))]">
                <X size={14} />
              </button>
            </div>

            {/* Intent summary */}
            {intent && (flow === 'discovery') && (
              <div className="mx-4 mt-4 p-3 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-[hsl(var(--accent))]">
                  <Info size={11} /> Analyse de votre demande
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
              {sources.map((src, i) => (
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

                  {/* Raison littérale */}
                  {src.reason && (
                    <p className="text-[11.5px] text-[hsl(var(--text-2))] leading-relaxed pl-5">
                      {src.reason}
                    </p>
                  )}

                  {/* Actions de rejet */}
                  <div className="flex gap-2 pl-5 pt-1 flex-wrap">
                    {(['reject_domain', 'reject_type'] as const).map(rule => {
                      const value = rule === 'reject_domain'
                        ? new URL(src.url).hostname.replace('www.', '')
                        : src.type
                      const key = `${rule}:${value}`
                      const state = feedback[key]

                      return (
                        <button
                          key={rule}
                          onClick={() => rejectSource(src, rule)}
                          disabled={state === 'done' || state === 'pending'}
                          className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                            state === 'done'
                              ? 'border-green-800/40 text-green-400 bg-green-950/20'
                              : 'border-[hsl(var(--line))] text-[hsl(var(--text-3))] hover:border-red-800/50 hover:text-red-400'
                          }`}
                        >
                          {state === 'pending'
                            ? <Loader2 size={9} className="animate-spin" />
                            : state === 'done'
                            ? <Check size={9} />
                            : <ThumbsDown size={9} />
                          }
                          {RULE_LABELS[rule]}
                        </button>
                      )
                    })}
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Footer */}
            <div className="px-4 py-3 border-t border-[hsl(var(--line))]">
              <p className="text-[10px] font-mono text-[hsl(var(--text-3))] text-center">
                Vos préférences sont appliquées à toutes les prochaines demandes.
              </p>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
