import { useState, lazy, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, Network, Loader2 } from 'lucide-react'

const LibraryContent  = lazy(() => import('@/pages/Library'))
const KGContent       = lazy(() => import('@/pages/KnowledgeGraph'))

const TABS = [
  { id: 'documents', label: 'Documents',       icon: BookOpen },
  { id: 'kg',        label: 'Knowledge Graph', icon: Network  },
]

export default function Librairie() {
  const [tab, setTab] = useState('documents')

  return (
    <div className="flex flex-col h-full">
      {/* Onglets */}
      <div className="flex gap-1 px-4 pt-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-1))]">
        {TABS.map(t => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-[12px] font-medium border-b-2 transition-all -mb-px ${
                isActive
                  ? 'border-[hsl(var(--accent))] text-[hsl(var(--accent))]'
                  : 'border-transparent text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))]'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          )
        })}
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            exit={{ opacity: 0 }} transition={{ duration: 0.15 }} className="h-full">
            <Suspense fallback={
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-5 h-5 animate-spin text-[hsl(var(--accent))]" />
              </div>
            }>
              {tab === 'documents' && <LibraryContent />}
              {tab === 'kg'        && <KGContent />}
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
