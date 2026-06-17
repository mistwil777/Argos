import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { HelpCircle, X, ChevronRight } from 'lucide-react'

interface Step { title: string; body: string }

interface PageHintProps {
  id: string
  steps: Step[]
}

export default function PageHint({ id, steps }: PageHintProps) {
  const key = `owm_hint_${id}`
  const [visible, setVisible] = useState(() => localStorage.getItem(key) !== 'dismissed')

  function dismiss() {
    localStorage.setItem(key, 'dismissed')
    setVisible(false)
  }

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, y: -8, height: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="overflow-hidden mb-6"
        >
          <div className="panel-accent p-4 flex gap-3">
            <HelpCircle className="w-4 h-4 text-[hsl(var(--accent))] flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0 space-y-2">
              {steps.map((step, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 text-[hsl(var(--accent))] flex-shrink-0 mt-[3px]" />
                  <p className="text-[12.5px] text-[hsl(var(--text-2))] leading-snug">
                    <span className="font-semibold text-[hsl(var(--text))]">{step.title} —</span>{' '}
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
            <button
              onClick={dismiss}
              className="flex-shrink-0 text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors mt-0.5"
              aria-label="Fermer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
