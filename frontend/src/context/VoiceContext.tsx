import {
  createContext, useContext, useRef, useState,
  useCallback, type ReactNode,
} from 'react'

interface VoiceState {
  speaking: boolean
  ttsEnabled: boolean
  setTtsEnabled: (v: boolean) => void
  stopSpeaking: () => void
  speak: (text: string, onEnd?: () => void) => void
  // Dictée manuelle : démarre le micro, appelle onResult avec le texte final,
  // retourne une fonction stop() pour annuler
  startDictation: (onResult: (text: string) => void, onError?: (e: string) => void) => () => void
}

const VoiceContext = createContext<VoiceState | null>(null)

export function useVoice() {
  const ctx = useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider')
  return ctx
}

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function VoiceProvider({ children }: { children: ReactNode }) {
  const [speaking,   setSpeaking]   = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const recRef = useRef<any>(null)

  // ── TTS ──────────────────────────────────────────────────────────────────────

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel()
    setSpeaking(false)
  }, [])

  const speak = useCallback((text: string, onEnd?: () => void) => {
    if (!window.speechSynthesis) { onEnd?.(); return }
    if (!ttsEnabled) { onEnd?.(); return }
    stopSpeaking()
    const clean = text.replace(/[#*`\[\]]/g, '').slice(0, 800)
    const utt   = new SpeechSynthesisUtterance(clean)
    utt.lang = 'fr-FR'; utt.rate = 1.05; utt.pitch = 1.0
    const fr = window.speechSynthesis.getVoices().find(v => v.lang.startsWith('fr'))
    if (fr) utt.voice = fr
    utt.onstart = () => setSpeaking(true)
    utt.onend   = () => { setSpeaking(false); onEnd?.() }
    utt.onerror = () => { setSpeaking(false); onEnd?.() }
    window.speechSynthesis.speak(utt)
  }, [ttsEnabled, stopSpeaking])

  // ── Dictée manuelle (one-shot) ────────────────────────────────────────────────

  const startDictation = useCallback(
    (onResult: (text: string) => void, onError?: (e: string) => void) => {
      if (!SpeechRecognitionAPI) {
        onError?.('not_supported')
        return () => {}
      }

      recRef.current?.stop()

      const rec = new SpeechRecognitionAPI()
      rec.lang            = 'fr-FR'
      rec.interimResults  = false
      rec.continuous      = false
      rec.maxAlternatives = 1
      recRef.current = rec

      rec.onresult = (e: any) => {
        const text = e.results[0]?.[0]?.transcript?.trim() ?? ''
        if (text) onResult(text)
      }

      rec.onerror = (e: any) => {
        if (e.error !== 'no-speech') onError?.(e.error)
      }

      try { rec.start() } catch { onError?.('start_failed') }

      return () => { try { rec.stop() } catch { /* ignore */ } }
    },
    []
  )

  return (
    <VoiceContext.Provider value={{
      speaking, ttsEnabled, setTtsEnabled,
      stopSpeaking, speak, startDictation,
    }}>
      {children}
    </VoiceContext.Provider>
  )
}
