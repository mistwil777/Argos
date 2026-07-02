import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, FileText, BookOpen, Map, BarChart3,
  Loader2, Sparkles, Save, Check, DatabaseZap
} from 'lucide-react'
import { api } from '@/services/api'
import ReactMarkdown from 'react-markdown'

const DOC_TYPES = [
  {
    id: 'fiche',
    icon: FileText,
    label: 'Fiche de veille',
    desc: '1 page · résumé + points clés + importance',
    color: 'text-[hsl(var(--cyan))]',
  },
  {
    id: 'synthese',
    icon: BookOpen,
    label: 'Synthèse thématique',
    desc: '3-5 pages · sections par thème + tendances',
    color: 'text-[hsl(var(--accent))]',
  },
  {
    id: 'guide',
    icon: Map,
    label: 'Guide pratique',
    desc: 'Variable · étapes + exemples + pièges',
    color: 'text-[hsl(var(--violet))]',
  },
  {
    id: 'rapport',
    icon: BarChart3,
    label: 'Rapport de veille',
    desc: '5-10 pages · analyse + tendances + recommandations',
    color: 'text-[hsl(var(--green))]',
  },
]

interface Props {
  itemIds: number[]
  onClose: () => void
  onSaved: () => void
}

export default function DocumentGeneratorModal({ itemIds, onClose, onSaved }: Props) {
  const [docType, setDocType]       = useState('fiche')
  const [title, setTitle]           = useState('')
  const [prompt, setPrompt]         = useState('')
  const [generating, setGenerating] = useState(false)
  const [markdown, setMarkdown]     = useState('')
  const [editedMarkdown, setEditedMarkdown] = useState('')
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [activeTab, setActiveTab]   = useState<'edit' | 'preview'>('preview')
  const [tokensUsed, setTokensUsed] = useState(0)

  async function generate() {
    if (!title.trim() && !prompt.trim()) return
    setGenerating(true)
    try {
      const result = await api.generateDocument(docType, title, prompt, itemIds)
      setMarkdown(result.markdown)
      setEditedMarkdown(result.markdown)
      setTokensUsed(result.tokens_used || 0)
    } catch (e: any) {
      alert(`Erreur génération : ${e.message}`)
    } finally { setGenerating(false) }
  }

  async function save() {
    if (!editedMarkdown.trim() || !title.trim()) return
    setSaving(true)
    try {
      await api.saveDocument({
        title,
        doc_type: docType,
        content_markdown: editedMarkdown,
        source_item_ids: itemIds,
        source_prompt: prompt,
      })
      setSaved(true)
      setTimeout(() => { onSaved(); onClose() }, 800)
    } catch (e: any) {
      alert(`Erreur sauvegarde : ${e.message}`)
    } finally { setSaving(false) }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: 'spring', stiffness: 300, damping: 28 }}
        className="w-full max-w-4xl max-h-[92vh] flex flex-col panel overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
          <div>
            <p className="text-[14px] font-bold text-[hsl(var(--text))]">Générer un document</p>
            <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">
              {itemIds.length} item{itemIds.length > 1 ? 's' : ''} sélectionné{itemIds.length > 1 ? 's' : ''} comme sources
            </p>
          </div>
          <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto">
          {!markdown ? (
            /* ── Étape 1 : configuration ── */
            <div className="p-6 space-y-6">
              {/* Type de document */}
              <div>
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-3">Type de document</p>
                <div className="grid grid-cols-2 gap-3">
                  {DOC_TYPES.map(({ id, icon: Icon, label, desc, color }) => (
                    <motion.button
                      key={id} type="button" onClick={() => setDocType(id)}
                      whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}
                      className={`text-left p-4 rounded-lg border transition-all ${
                        docType === id
                          ? 'bg-[hsl(var(--accent-dim))] border-[hsl(var(--accent-line))]'
                          : 'panel hover:border-[hsl(var(--line-bright))]'
                      }`}
                    >
                      {docType === id && (
                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[hsl(var(--accent))] to-transparent rounded-t-lg" />
                      )}
                      <div className="flex items-center gap-2 mb-1.5">
                        <Icon className={`w-4 h-4 ${color}`} />
                        <p className={`text-[13px] font-semibold ${docType === id ? 'text-[hsl(var(--accent))]' : 'text-[hsl(var(--text))]'}`}>{label}</p>
                      </div>
                      <p className="text-[11px] text-[hsl(var(--text-3))] leading-snug">{desc}</p>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Titre + prompt */}
              <div className="space-y-3">
                <div>
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">Titre du document *</p>
                  <input
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Ex : Guide FastAPI — tutoriels essentiels"
                    className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-3 py-2.5 text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] transition-all"
                  />
                </div>
                <div>
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider mb-2">
                    Thème / instructions <span className="normal-case">(optionnel — oriente la génération)</span>
                  </p>
                  <textarea
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    rows={3}
                    placeholder="Ex : Concentre-toi sur les bonnes pratiques FastAPI pour une API de production. Inclus des exemples de code."
                    className="w-full bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-3 py-2.5 text-[13px] text-[hsl(var(--text))] outline-none focus:border-[hsl(var(--accent-line))] placeholder:text-[hsl(var(--text-3))] resize-none transition-all leading-relaxed"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* ── Étape 2 : preview + édition ── */
            <div className="flex flex-col h-full">
              {/* Onglets */}
              <div className="flex items-center gap-1 px-6 pt-4 pb-0 border-b border-[hsl(var(--line))]">
                {(['preview', 'edit'] as const).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 text-[11.5px] font-mono rounded-t border-b-2 transition-all ${
                      activeTab === tab
                        ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))] bg-[hsl(var(--accent-dim))]'
                        : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'
                    }`}>
                    {tab === 'preview' ? 'Aperçu' : 'Éditer le markdown'}
                  </button>
                ))}
                {tokensUsed > 0 && (
                  <span className="ml-auto text-[10.5px] font-mono text-[hsl(var(--text-3))]">
                    {tokensUsed.toLocaleString()} tokens
                  </span>
                )}
              </div>

              <div className="flex-1 overflow-auto p-6">
                {activeTab === 'preview' ? (
                  <div className="prose-app max-w-none">
                    <ReactMarkdown>{editedMarkdown}</ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    value={editedMarkdown}
                    onChange={e => setEditedMarkdown(e.target.value)}
                    className="w-full h-full min-h-[400px] bg-[hsl(var(--bg-3))] border border-[hsl(var(--line))] rounded-lg px-4 py-3 text-[12.5px] text-[hsl(var(--text-2))] outline-none font-mono leading-relaxed resize-none focus:border-[hsl(var(--accent-line))] transition-all"
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
          <div className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--text-3))]">
            {DOC_TYPES.find(d => d.id === docType)?.label}
            {markdown && <span>· {editedMarkdown.length.toLocaleString()} chars</span>}
          </div>
          <div className="flex items-center gap-2">
            {!markdown ? (
              <>
                <button onClick={onClose}
                  className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[12px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                  Annuler
                </button>
                <motion.button
                  onClick={generate}
                  disabled={generating || (!title.trim() && !prompt.trim())}
                  whileTap={{ scale: 0.95 }}
                  className="flex items-center gap-2 px-5 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[12.5px] font-bold disabled:opacity-40 transition-opacity"
                >
                  {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {generating ? 'Génération…' : 'Générer'}
                </motion.button>
              </>
            ) : (
              <>
                <button onClick={() => { setMarkdown(''); setEditedMarkdown('') }}
                  className="px-4 py-1.5 rounded border border-[hsl(var(--line))] text-[12px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--line-bright))] transition-colors">
                  ↺ Régénérer
                </button>
                <motion.button
                  onClick={save}
                  disabled={saving || saved}
                  whileTap={{ scale: 0.95 }}
                  className={`flex items-center gap-2 px-5 py-1.5 rounded text-white text-[12.5px] font-bold disabled:opacity-40 transition-all ${
                    saved ? 'bg-[hsl(var(--green))]' : 'bg-[hsl(var(--accent))]'
                  }`}
                >
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  {saved ? 'Sauvegardé !' : saving ? 'Sauvegarde…' : 'Sauvegarder dans la bibliothèque'}
                </motion.button>
              </>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
