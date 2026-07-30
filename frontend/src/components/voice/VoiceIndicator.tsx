import { motion, AnimatePresence } from 'framer-motion'
import { Volume2 } from 'lucide-react'
import { useVoice } from '@/context/VoiceContext'

// Affiché uniquement quand Argos parle (TTS actif) — bouton pour couper
export default function VoiceIndicator() {
  const { speaking, stopSpeaking } = useVoice()

  return (
    <AnimatePresence>
      {speaking && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          className="fixed bottom-4 left-4 z-50 flex items-center gap-2"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-mono
                          bg-violet-950/80 border border-violet-700/50 text-violet-300 backdrop-blur-sm">
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-violet-400" />
            </span>
            <Volume2 className="w-3 h-3 flex-shrink-0" />
            <span>Argos parle…</span>
          </div>
          <button
            onClick={stopSpeaking}
            className="px-2.5 py-1.5 rounded-full text-[11px] font-mono
                       bg-violet-950/80 border border-violet-700/50 text-violet-300 hover:text-white transition-colors"
          >
            Couper
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
