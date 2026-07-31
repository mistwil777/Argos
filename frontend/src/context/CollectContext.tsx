import { createContext, useContext, useRef, useState, useCallback, type ReactNode } from 'react'
import { api } from '@/services/api'

interface CollectJob {
  sourcesAdded: number
  itemsBefore: number
  itemsCollected: number
  message: string
  done: boolean
}

interface CollectContextValue {
  job: CollectJob | null
  startCollect: (sources: any[], sujet_id?: number | null) => Promise<void>
  clearJob: () => void
}

const CollectContext = createContext<CollectContextValue | null>(null)

export function CollectProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<CollectJob | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startCollect = useCallback(async (sources: any[], sujet_id?: number | null) => {
    if (!sources.length) return

    // Snapshot avant collecte
    const before = await api.getStats().then((s: any) => s.total_items ?? 0).catch(() => 0)
    const result = await api.veilleConfirm(sources)
    const added: number = result.created ?? sources.length

    // Rattacher les sources créées au sujet si fourni
    if (sujet_id && result.source_ids?.length) {
      await Promise.allSettled(
        result.source_ids.map((sid: number) => api.assignSourceSujet(sid, sujet_id))
      )
    }

    setJob({ sourcesAdded: added, itemsBefore: before, itemsCollected: 0, message: 'Collecte en cours…', done: false })

    // Poll global — survit à la navigation car ce contexte est monté au-dessus du router
    if (pollRef.current) clearInterval(pollRef.current)
    let elapsed = 0
    const MAX_MS = 5 * 60 * 1000
    pollRef.current = setInterval(async () => {
      elapsed += 5000
      try {
        const stats = await api.getStats()
        const diff = (stats.total_items ?? 0) - before
        if (diff > 0) {
          setJob(j => j ? { ...j, itemsCollected: diff, message: `${diff} article${diff > 1 ? 's' : ''} collecté${diff > 1 ? 's' : ''}`, done: false } : null)
        }
        if (elapsed >= MAX_MS) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setJob(j => j ? { ...j, done: true, message: j.itemsCollected > 0
            ? `${j.itemsCollected} article${j.itemsCollected > 1 ? 's' : ''} collecté${j.itemsCollected > 1 ? 's' : ''}`
            : 'Collecte longue — résultats dans le Briefing' } : null)
        }
      } catch { /* ignore */ }
    }, 5000)
  }, [])

  const clearJob = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    setJob(null)
  }, [])

  return (
    <CollectContext.Provider value={{ job, startCollect, clearJob }}>
      {children}
    </CollectContext.Provider>
  )
}

export function useCollect() {
  const ctx = useContext(CollectContext)
  if (!ctx) throw new Error('useCollect must be used within CollectProvider')
  return ctx
}
