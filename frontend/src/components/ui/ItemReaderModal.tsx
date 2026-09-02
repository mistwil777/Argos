import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ExternalLink, Loader2, BookOpen, Maximize2, Minimize2, Check, Database } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/services/api'

interface Props {
  itemId: number
  projectId?: number | null
  onClose: () => void
  onSaved?: () => void
  onGenerateReport?: (itemId: number, title: string, sujetId?: number) => void
}

export default function ItemReaderModal({ itemId, projectId, onClose, onSaved, onGenerateReport }: Props) {
  const [meta, setMeta]               = useState<any>(null)
  const [markdown, setMarkdown]       = useState('')
  const [loading, setLoading]         = useState(true)
  const [saving, setSaving]           = useState(false)
  const [saved, setSaved]             = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [translating, setTranslating] = useState(false)
  const [translatedLang, setTranslatedLang] = useState('')
  const [fullscreen, setFullscreen]   = useState(false)
  const [readPct, setReadPct]         = useState(0)
  const scrollRef                     = useRef<HTMLDivElement>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setReadPct(Math.min(100, Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100)))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)
    setMarkdown('')
    setTranslatedLang('')

    api.readerDocument(itemId, projectId)
      .then(async (doc: any) => {
        const md = doc.markdown || ''
        setMarkdown(md)
        setMeta({ title: doc.title, url: doc.url })

        // Fetch created_at
        fetch(`/api/v1/items/${itemId}/content`).then(r => r.json()).then(d => {
          setMeta((prev: any) => ({ ...prev, created_at: d.created_at }))
        }).catch(() => {})

        // Auto-traduction
        const u = await api.me().catch(() => null)
        const lang = u?.preferences?.reading_language || ''
        if (!lang) return
        setTranslating(true)
        try {
          const t = await api.translateItem(itemId, lang, md)
          if (t?.translated) { setMarkdown(t.translated); setTranslatedLang(lang) }
        } catch {}
        finally { setTranslating(false) }
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [itemId, projectId])

  async function saveAndIndex() {
    if (!markdown || !meta) return
    setSaving(true)
    try {
      await api.saveDocument({
        title: meta.title || `Article #${itemId}`,
        doc_type: 'fiche',
        content_markdown: markdown,
        source_item_ids: [itemId],
        source_prompt: '',
        sujet_id: null,
      })
      await api.ingestItemRag(itemId).catch(() => {})
      setSaved(true)
      setTimeout(() => onSaved?.(), 1200)
    } catch (e: any) {
      alert(`Erreur : ${e.message}`)
    } finally {
      setSaving(false)
    }
  }

  const hostname = (() => { try { return new URL(meta?.url || '').hostname } catch { return meta?.url } })()

  return (
    <AnimatePresence>
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
          className={`flex flex-col panel overflow-hidden transition-all duration-200 ${
            fullscreen ? 'fixed inset-4 z-[60] max-w-none' : 'w-full max-w-3xl max-h-[90vh]'
          }`}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0">
            <div className="min-w-0">
              {loading
                ? <div className="h-4 w-48 rounded bg-[hsl(var(--bg-3))] animate-pulse" />
                : <p className="text-[14px] font-bold text-[hsl(var(--text))] leading-snug">{meta?.title}</p>
              }
              {meta?.url && (
                <a href={meta.url} target="_blank" rel="noreferrer"
                  className="inline-flex items-center gap-1 mt-1 text-[10.5px] font-mono text-[hsl(var(--accent))] hover:underline">
                  <ExternalLink className="w-2.5 h-2.5" />{hostname}
                </a>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {translatedLang && !translating && (
                <span className="text-[10px] font-mono text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] px-1.5 py-0.5 rounded">
                  Traduit en {translatedLang}
                </span>
              )}
              <button onClick={() => setFullscreen(f => !f)} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-0.5 bg-[hsl(var(--bg-3))] flex-shrink-0">
            <div className="h-full bg-[hsl(var(--accent))] transition-all duration-300" style={{ width: `${readPct}%` }} />
          </div>

          {/* Content */}
          <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto px-6 py-5">
            {(loading || translating) && (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--text-3))]" />
                <p className="text-[11px] font-mono text-[hsl(var(--text-3))]">
                  {loading ? 'Génération du document…' : 'Traduction en cours…'}
                </p>
              </div>
            )}
            {error && <p className="text-[12.5px] text-[hsl(var(--red))]">{error}</p>}
            {!loading && !error && !translating && (
              <div className="prose-app text-[13px]">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{markdown}</ReactMarkdown>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] flex-shrink-0 gap-3">
            <div className="flex items-center gap-3 text-[10.5px] font-mono text-[hsl(var(--text-3))]">
              {meta?.created_at && new Date(meta.created_at).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
              {readPct > 0 && (
                <span className={readPct === 100 ? 'text-[hsl(var(--green))]' : 'text-[hsl(var(--amber))]'}>
                  {readPct === 100 ? '✓ Terminé' : `${readPct}% lu`}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {onGenerateReport && meta && (
                <button
                  onClick={() => { onGenerateReport(itemId, meta.title, meta.sujet_id); onClose() }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[hsl(var(--line))] text-[11.5px] font-mono text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] hover:text-[hsl(var(--accent))] transition-all"
                >
                  <BookOpen className="w-3 h-3" />
                  Générer un rapport
                </button>
              )}
              <motion.button
                onClick={saveAndIndex}
                disabled={saving || saved || loading || !!error}
                whileTap={{ scale: 0.95 }}
                className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-[12px] font-bold text-white disabled:opacity-40 transition-all ${
                  saved ? 'bg-[hsl(var(--green))]' : 'bg-[hsl(var(--accent))]'
                }`}
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : saved ? <Check className="w-3.5 h-3.5" />
                  : <Database className="w-3.5 h-3.5" />}
                {saved ? 'Indexé !' : saving ? 'Indexation…' : 'Sauvegarder & indexer'}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
