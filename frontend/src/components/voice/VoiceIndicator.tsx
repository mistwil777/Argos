/**
 * VoiceIndicator — pastille flottante indiquant l'état de l'écoute Argos.
 * Visible sur toutes les pages, coin bas-gauche.
 */

import { motion, AnimatePresence } from 'framer-motion'
import { Mic, Volume2 } from 'lucide-react'
import { useVoice } from '@/context/VoiceContext'

export default function VoiceIndicator() {
  const { listening, speaking, ttsEnabled, setTtsEnabled, stopSpeaking } = useVoice()

  const label = speaking
    ? 'Argos parle…'
    : listening
    ? 'Argos écoute'
    : 'En veille'

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2">
      {/* Pastille état */}
      <motion.div
        className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono
                    border backdrop-blur-sm transition-colors ${
          speaking
            ? 'bg-violet-950/80 border-violet-700/50 text-violet-300'
            : listening
            ? 'bg-[hsl(var(--accent-dim))] border-[hsl(var(--accent-line))] text-[hsl(var(--accent))]'
            : 'bg-[hsl(var(--bg-2))] border-[hsl(var(--line))] text-[hsl(var(--text-3))]'
        }`}
        animate={listening ? { scale: [1, 1.02, 1] } : {}}
        transition={{ repeat: Infinity, duration: 2 }}
      >
        {/* Point pulsant */}
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          {(listening || speaking) && (
            <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${
              speaking ? 'bg-violet-400' : 'bg-[hsl(var(--accent))]'
            }`} />
          )}
          <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${
            speaking ? 'bg-violet-400' : listening ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--text-3))]'
          }`} />
        </span>

        <Mic className="w-3 h-3 flex-shrink-0" />
        <span>{label}</span>
      </motion.div>

      {/* Bouton TTS */}
      <AnimatePresence>
        {speaking && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
            onClick={stopSpeaking}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[11px] font-mono
                       bg-violet-950/80 border border-violet-700/50 text-violet-300 hover:text-white transition-colors"
          >
            <Volume2 className="w-3 h-3" /> Couper
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  )
}
