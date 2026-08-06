import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle, Globe, Rss, AlertCircle, Loader2 } from 'lucide-react'

interface DiscoveryEvent {
  task_id: string
  url: string
  name: string
  status: 'pending' | 'probing' | 'rss_found' | 'website_found' | 'not_found' | 'error' | 'complete'
  detail: string
}

interface Props {
  sujetId: number
  onComplete?: () => void
}

export default function SourceDiscoveryStream({ sujetId, onComplete }: Props) {
  const [events, setEvents] = useState<Record<string, DiscoveryEvent>>({})
  const [done, setDone] = useState(false)

  useEffect(() => {
    const es = new EventSource(`/api/sujets/${sujetId}/sources-discovery-stream`)

    es.onmessage = (e) => {
      try {
        const data: DiscoveryEvent = JSON.parse(e.data)
        if (data.status === 'complete') {
          setDone(true)
          es.close()
          onComplete?.()
          return
        }
        setEvents(prev => ({ ...prev, [data.task_id]: data }))
      } catch {
        // ignore malformed
      }
    }

    es.onerror = () => es.close()

    return () => es.close()
  }, [sujetId])

  const items = Object.values(events)
  if (items.length === 0 && !done) return null

  const found = items.filter(e => e.status === 'rss_found' || e.status === 'website_found').length
  const pending = items.filter(e => e.status === 'pending' || e.status === 'probing').length

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-[hsl(var(--line))] bg-[hsl(var(--bg-2))] overflow-hidden"
    >
      <div className="px-4 py-3 border-b border-[hsl(var(--line))] flex items-center justify-between">
        <div className="flex items-center gap-2">
          {done ? (
            <CheckCircle className="w-4 h-4 text-[hsl(var(--aqua))]" />
          ) : (
            <Loader2 className="w-4 h-4 animate-spin text-[hsl(var(--accent))]" />
          )}
          <span className="text-[12.5px] font-bold text-[hsl(var(--text))]">
            {done ? 'Découverte terminée' : 'Découverte des sources en cours…'}
          </span>
        </div>
        {items.length > 0 && (
          <span className="text-[11px] text-[hsl(var(--text-3))]">
            {found} trouvée{found > 1 ? 's' : ''} / {items.length}
            {pending > 0 && ` · ${pending} en cours`}
          </span>
        )}
      </div>

      <div className="divide-y divide-[hsl(var(--line))]">
        <AnimatePresence initial={false}>
          {items.map(item => (
            <motion.div
              key={item.task_id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="flex items-start gap-3 px-4 py-2.5"
            >
              <StatusIcon status={item.status} />
              <div className="flex-1 min-w-0">
                <p className="text-[12.5px] font-semibold text-[hsl(var(--text))] truncate">{item.name}</p>
                <p className="text-[11px] text-[hsl(var(--text-3))] truncate">{item.url}</p>
                {item.detail && (
                  <p className="text-[10.5px] text-[hsl(var(--text-3))] mt-0.5">{item.detail}</p>
                )}
              </div>
              <StatusBadge status={item.status} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function StatusIcon({ status }: { status: DiscoveryEvent['status'] }) {
  switch (status) {
    case 'rss_found':
      return <Rss className="w-4 h-4 flex-shrink-0 mt-0.5 text-[hsl(var(--aqua))]" />
    case 'website_found':
      return <Globe className="w-4 h-4 flex-shrink-0 mt-0.5 text-[hsl(var(--accent))]" />
    case 'not_found':
    case 'error':
      return <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-[hsl(var(--text-3))]" />
    default:
      return <Loader2 className="w-4 h-4 flex-shrink-0 mt-0.5 animate-spin text-[hsl(var(--yellow))]" />
  }
}

function StatusBadge({ status }: { status: DiscoveryEvent['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    probing:      { label: 'Analyse…', cls: 'text-[hsl(var(--yellow))]' },
    rss_found:    { label: 'RSS', cls: 'text-[hsl(var(--aqua))]' },
    website_found:{ label: 'Web', cls: 'text-[hsl(var(--accent))]' },
    not_found:    { label: 'Aucun', cls: 'text-[hsl(var(--text-3))]' },
    error:        { label: 'Erreur', cls: 'text-[hsl(var(--red))]' },
  }
  const entry = map[status]
  if (!entry) return null
  return (
    <span className={`text-[10.5px] font-mono font-bold flex-shrink-0 ${entry.cls}`}>
      {entry.label}
    </span>
  )
}
