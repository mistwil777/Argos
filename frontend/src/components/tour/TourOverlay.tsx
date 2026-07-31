/**
 * TourOverlay — bulle spotlight générique réutilisable.
 * Utilisé par ProductTour (onboarding global) et par les guides in-page (ex: Connexions).
 */
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, ChevronLeft } from 'lucide-react'

export interface TourStep {
  title: string
  description: string
  /** Sélecteur CSS de l'élément à mettre en surbrillance */
  targetSelector: string
  position?: 'right' | 'left' | 'bottom' | 'top'
}

interface Props {
  steps: TourStep[]
  visible: boolean
  onFinish: () => void
  /** Appelé à chaque changement d'étape (index 0-based) */
  onStepChange?: (index: number) => void
  /** Label du bouton de fin (défaut : "Terminer ✓") */
  finishLabel?: string
}

const PADDING = 8
const BUBBLE_W = 288
const BUBBLE_H = 170
const GAP = 16

function getBoundingBox(selector: string) {
  const el = document.querySelector(selector)
  if (!el) return null
  return el.getBoundingClientRect()
}

function getBubbleStyle(box: DOMRect | null, pos: TourStep['position'] = 'right') {
  if (!box) return { top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }
  const vw = window.innerWidth
  const vh = window.innerHeight
  let top = 0, left = 0

  if (pos === 'right') {
    top  = box.top + box.height / 2 - BUBBLE_H / 2
    left = box.left + box.width + GAP
    // Débordement à droite → passer à gauche
    if (left + BUBBLE_W > vw - 12) left = box.left - BUBBLE_W - GAP
  } else if (pos === 'left') {
    top  = box.top + box.height / 2 - BUBBLE_H / 2
    left = box.left - BUBBLE_W - GAP
    if (left < 12) left = box.left + box.width + GAP
  } else if (pos === 'bottom') {
    top  = box.top + box.height + GAP
    left = box.left + box.width / 2 - BUBBLE_W / 2
  } else {
    top  = box.top - BUBBLE_H - GAP
    left = box.left + box.width / 2 - BUBBLE_W / 2
  }

  // Clamp pour rester dans la viewport
  top  = Math.max(12, Math.min(top,  vh - BUBBLE_H - 12))
  left = Math.max(12, Math.min(left, vw - BUBBLE_W - 12))
  return { top, left }
}

export default function TourOverlay({ steps, visible, onFinish, onStepChange, finishLabel = 'Terminer ✓' }: Props) {
  const [step, setStep] = useState(0)

  function goTo(i: number) {
    setStep(i)
    onStepChange?.(i)
  }
  const [box,  setBox]  = useState<DOMRect | null>(null)
  const total = steps.length
  const current = steps[step]

  // Reset au step 0 quand le tour s'ouvre
  useEffect(() => { if (visible) { setStep(0); onStepChange?.(0) } }, [visible]) // eslint-disable-line

  // Recalculer position lors du changement d'étape ou resize
  useEffect(() => {
    if (!visible) return
    const update = () => setBox(getBoundingBox(current.targetSelector))
    update()
    const t = setTimeout(update, 120)
    window.addEventListener('resize', update)
    return () => { clearTimeout(t); window.removeEventListener('resize', update) }
  }, [step, visible, current.targetSelector])

  const spotlight = box
    ? { top: box.top - PADDING, left: box.left - PADDING, width: box.width + PADDING * 2, height: box.height + PADDING * 2 }
    : null

  if (!visible) return null

  return createPortal(
    <AnimatePresence>
      {visible && (
        <>
          {/* Overlay */}
          <motion.div key="ov" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[9998]"
            style={{ background: 'rgba(0,0,0,0.6)' }}
            onClick={onFinish}
          />

          {/* Spotlight */}
          {spotlight && (
            <motion.div key={`sp-${step}`}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed z-[9999] rounded-lg pointer-events-none"
              style={{
                top: spotlight.top, left: spotlight.left,
                width: spotlight.width, height: spotlight.height,
                boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
                border: '2px solid hsl(var(--accent))',
              }}
            />
          )}

          {/* Bulle */}
          <motion.div key={`bb-${step}`}
            initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.88 }}
            transition={{ type: 'spring', stiffness: 420, damping: 28 }}
            className="fixed z-[10000] rounded-xl border border-[hsl(var(--accent-line))] bg-[hsl(var(--bg-1))] shadow-2xl overflow-hidden"
            style={{ width: BUBBLE_W, ...getBubbleStyle(box, current.position) }}
          >
            <div className="h-[2px] bg-gradient-to-r from-[hsl(var(--accent))] to-[hsl(var(--violet))]" />
            <div className="p-4 space-y-2.5">

              {/* Compteur + fermer */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[hsl(var(--accent))] font-bold tracking-wider">
                  {step + 1} / {total}
                </span>
                <button onClick={onFinish} className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Contenu */}
              <div>
                <p className="text-[14px] font-bold text-[hsl(var(--text))] leading-tight">{current.title}</p>
                <p className="text-[12px] text-[hsl(var(--text-2))] mt-1.5 leading-relaxed">{current.description}</p>
              </div>

              {/* Barre de progression */}
              <div className="h-1 rounded-full bg-[hsl(var(--bg-3))] overflow-hidden">
                <motion.div className="h-full rounded-full bg-[hsl(var(--accent))]"
                  animate={{ width: `${((step + 1) / total) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Navigation */}
              <div className="flex items-center justify-between pt-0.5">
                <button onClick={onFinish}
                  className="text-[10.5px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
                  Passer
                </button>
                <div className="flex items-center gap-2">
                  {step > 0 && (
                    <button onClick={() => goTo(step - 1)}
                      className="w-7 h-7 flex items-center justify-center rounded border border-[hsl(var(--line))] text-[hsl(var(--text-2))] hover:border-[hsl(var(--accent-line))] transition-colors">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  )}
                  {step < total - 1 ? (
                    <button onClick={() => goTo(step + 1)}
                      className="flex items-center gap-1 px-3 py-1.5 rounded bg-[hsl(var(--accent))] text-white text-[11.5px] font-bold hover:opacity-90 transition-opacity">
                      Suivant <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button onClick={onFinish}
                      className="px-3 py-1.5 rounded bg-[hsl(var(--green)/.8)] text-white text-[11.5px] font-bold hover:opacity-90 transition-opacity">
                      {finishLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  )
}
