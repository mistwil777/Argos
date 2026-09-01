import { useEffect, useState, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import { X, ExternalLink, Loader2, BookOpen, Save, Check, FileText } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { api } from '@/services/api'

interface Props {
  itemId: number
  onClose: () => void
  onSaved?: () => void
  onGenerateReport?: (itemId: number, title: string, sujetId?: number) => void
}

// Splits a date+category+title pattern like "ProductJul 24, 2026Opus 5 is..."
// into separate lines so they render cleanly
function splitConcatenated(line: string): string[] {
  // Insert newline before dates like "Jul 24, 2026" or "Jan 1, 2026"
  const withDateBreaks = line.replace(/([A-Z][a-z]{2} \d{1,2}, \d{4})/g, '\n$1')
  // Insert newline before known category words glued to content
  const withCatBreaks = withDateBreaks.replace(/(Product|Announcements|Features|Case Study|Economic Research|News)([A-Z])/g, '$1\n$2')
  return withCatBreaks.split('\n').map(s => s.trim()).filter(Boolean)
}

function formatRawContent(text: string): string[] {
  const lines = text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)

  const result: string[] = []
  for (const line of lines) {
    result.push(...splitConcatenated(line))
  }
  return result
}

// Short line with no sentence-ending punctuation → treat as heading/label
function isHeading(p: string): boolean {
  return p.length < 80 && !p.endsWith('.') && !p.endsWith(',') && !p.endsWith(';') && p.split(' ').length <= 10
}

export default function ItemReaderModal({ itemId, onClose, onSaved, onGenerateReport }: Props) {
  const [meta, setMeta]             = useState<any>(null)
  const [paragraphs, setParagraphs] = useState<string[]>([])
  const [loading, setLoading]       = useState(true)
  const [saving, setSaving]         = useState(false)
  const [saved, setSaved]           = useState(false)
  const [error, setError]           = useState<string | null>(null)
  const [source, setSource]         = useState<'raw' | 'digest'>('raw')
  const [readPct, setReadPct]       = useState(0)
  const [translating, setTranslating] = useState(false)
  const [translatedLang, setTranslatedLang] = useState<string>('')
  const scrollRef                   = useRef<HTMLDivElement>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const pct = Math.round((el.scrollTop / Math.max(1, el.scrollHeight - el.clientHeight)) * 100)
    setReadPct(Math.min(100, pct))
  }, [])

  useEffect(() => {
    setLoading(true)
    setError(null)

    // Try raw content first
    fetch(`/api/v1/items/${itemId}/raw-content`)
      .then(r => r.json())
      .then(data => {
        const pages = data.pages || []
        const fullText = pages.map((p: any) => p.content || '').join('\n\n').trim()

        const MIN_CONTENT = 150

        if (fullText.length >= MIN_CONTENT) {
          setSource('raw')
          setParagraphs(formatRawContent(fullText))
          setMeta({ title: pages[0]?.title || data.title, url: data.url, item_id: data.item_id })
        } else {
          // Fallback to digest
          return fetch(`/api/v1/items/${itemId}/content`).then(r => r.json()).then(d => {
            const digestText = (d.digest_markdown || d.summary || '').trim()
            if (digestText.length >= MIN_CONTENT) {
              setSource('digest')
              setParagraphs(formatRawContent(digestText))
            } else {
              setSource('raw')
              setParagraphs([
                '_Contenu non disponible — cette page nécessite un rendu JavaScript ou pointe vers une page de catégorie sans article._\n\nOuvrez le lien source pour accéder à l\'article original.',
              ])
            }
            setMeta({ title: d.title, url: d.source_url, item_id: d.id, created_at: d.created_at })
          })
        }

        // Also fetch meta (title, date) from content endpoint
        return fetch(`/api/v1/items/${itemId}/content`).then(r => r.json()).then(d => {
          setMeta((prev: any) => ({ ...prev, created_at: d.created_at, importance: d.importance }))
        })
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [itemId])

  // Auto-traduction après chargement
  useEffect(() => {
    if (loading || paragraphs.length === 0) return
    api.me().then((u: any) => {
      const lang = u?.preferences?.reading_language || ''
      if (!lang) return
      setTranslating(true)
      api.translateItem(itemId, lang)
        .then((t: any) => {
          if (t?.translated) {
            setParagraphs(formatRawContent(t.translated))
            setTranslatedLang(lang)
          }
        })
        .catch(() => {})
        .finally(() => setTranslating(false))
    }).catch(() => {})
  }, [loading])

  async function saveToLibrary() {
    if (!paragraphs.length || !meta) return
    setSaving(true)
    try {
      await api.saveDocument({
        title: meta.title || `Article #${itemId}`,
        doc_type: 'fiche',
        content_markdown: paragraphs.join('\n\n'),
        source_item_ids: [itemId],
        source_prompt: '',
        sujet_id: null,
      })
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
        className="w-full max-w-3xl max-h-[90vh] flex flex-col panel overflow-hidden"
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
                <ExternalLink className="w-2.5 h-2.5" />
                {hostname}
              </a>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {source === 'digest' && !loading && (
              <span className="text-[10px] font-mono text-[hsl(var(--amber))] border border-yellow-500/30 px-1.5 py-0.5 rounded">
                résumé · contenu brut indisponible
              </span>
            )}
            <div className="flex items-center gap-1 text-[10px] font-mono text-[hsl(var(--text-3))]">
              <FileText className="w-3 h-3" />
              {source === 'raw' ? 'article brut' : 'résumé'}
            </div>
            <button onClick={onClose} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Barre de progression lecture */}
        <div className="h-0.5 bg-[hsl(var(--bg-3))] flex-shrink-0">
          <div className="h-full bg-[hsl(var(--accent))] transition-all duration-300"
            style={{ width: `${readPct}%` }} />
        </div>

        {/* Content */}
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 overflow-auto px-6 py-5 space-y-3">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--text-3))]" />
            </div>
          )}
          {translating && !loading && (
            <div className="flex items-center gap-2 py-2 text-[11px] font-mono text-[hsl(var(--text-3))]">
              <Loader2 className="w-3 h-3 animate-spin" />
              Traduction en cours…
            </div>
          )}
          {translatedLang && !translating && (
            <div className="text-[10.5px] font-mono text-[hsl(var(--accent))] border border-[hsl(var(--accent-line))] rounded px-2 py-1 mb-2 w-fit">
              Traduit en {translatedLang}
            </div>
          )}
          {error && (
            <p className="text-[12.5px] text-[hsl(var(--red))]">{error}</p>
          )}
          {!loading && !error && (
            <div className="prose prose-sm max-w-none text-[hsl(var(--text-2))] [&_h1]:text-[14px] [&_h1]:font-bold [&_h1]:text-[hsl(var(--text))] [&_h2]:text-[13px] [&_h2]:font-semibold [&_h2]:text-[hsl(var(--text))] [&_h3]:text-[13px] [&_h3]:font-semibold [&_h3]:text-[hsl(var(--text-2))] [&_p]:text-[13px] [&_p]:leading-relaxed [&_li]:text-[13px] [&_a]:text-[hsl(var(--accent))] [&_a]:no-underline [&_strong]:text-[hsl(var(--text))] [&_code]:text-[11px] [&_code]:bg-[hsl(var(--bg-3))] [&_code]:px-1 [&_code]:rounded">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {paragraphs.join('\n\n')}
              </ReactMarkdown>
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
              onClick={saveToLibrary}
              disabled={saving || saved || loading || !!error}
              whileTap={{ scale: 0.95 }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded text-[12px] font-bold text-white disabled:opacity-40 transition-all ${
                saved ? 'bg-[hsl(var(--green))]' : 'bg-[hsl(var(--accent))]'
              }`}
            >
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : saved ? <Check className="w-3.5 h-3.5" />
                : <Save className="w-3.5 h-3.5" />}
              {saved ? 'Sauvegardé !' : saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  )
}
