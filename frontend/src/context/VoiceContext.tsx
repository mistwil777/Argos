/**
 * VoiceContext — contexte global de l'assistant vocal Argos
 *
 * Comportement :
 *   - Micro ouvert automatiquement au chargement de l'app
 *   - Écoute continue en arrière-plan sur toutes les pages
 *   - Détection : phrase commençant par "argos" → la suite est la demande
 *   - Exemples : "Argos quelles sont les dernières news ?"
 *                "Argos, lance une recherche sur les LLMs"
 *   - Si on est ailleurs que /assistant → navigation automatique
 *   - TTS : Argos parle, état lisible partout dans l'app
 */

import {
  createContext, useContext, useRef, useState,
  useCallback, useEffect, type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'

// ─── Types ────────────────────────────────────────────────────────────────────

interface VoiceState {
  listening: boolean       // écoute active
  speaking: boolean        // TTS en cours
  ttsEnabled: boolean
  lastTranscript: string   // dernière demande captée
  setTtsEnabled: (v: boolean) => void
  stopSpeaking: () => void
  speak: (text: string, onEnd?: () => void) => void
  // Permet à Assistant.tsx d'enregistrer son handler de demande
  registerHandler: (fn: (transcript: string) => void) => void
}

const VoiceContext = createContext<VoiceState | null>(null)

export function useVoice() {
  const ctx = useContext(VoiceContext)
  if (!ctx) throw new Error('useVoice must be used inside VoiceProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

export function VoiceProvider({ children }: { children: ReactNode }) {
  const navigate   = useNavigate()

  const [listening,   setListening]   = useState(false)
  const [speaking,    setSpeaking]    = useState(false)
  const [ttsEnabled,  setTtsEnabled]  = useState(true)
  const [lastTranscript, setLastTranscript] = useState('')

  const recRef     = useRef<any>(null)
  const handlerRef = useRef<((t: string) => void) | null>(null)
  const loopRef    = useRef(true)   // contrôle la boucle d'écoute

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

  // ── Enregistrement du handler Assistant ──────────────────────────────────────

  const registerHandler = useCallback((fn: (t: string) => void) => {
    handlerRef.current = fn
  }, [])

  // ── Déclenchement d'une demande ───────────────────────────────────────────────

  const handleDemand = useCallback((transcript: string) => {
    setLastTranscript(transcript)
    // Naviguer vers /assistant si on n'y est pas déjà
    if (!window.location.pathname.includes('/assistant')) {
      navigate('/assistant')
    }
    // Délai pour laisser le temps à Assistant.tsx de s'enregistrer si navigation
    setTimeout(() => {
      handlerRef.current?.(transcript)
    }, 150)
  }, [navigate])

  // ── Boucle d'écoute continue ──────────────────────────────────────────────────

  const startLoop = useCallback(() => {
    if (!SpeechRecognitionAPI) return

    const rec = new SpeechRecognitionAPI()
    rec.lang             = 'fr-FR'
    rec.interimResults   = true
    rec.continuous       = false
    rec.maxAlternatives  = 1
    recRef.current = rec

    rec.onstart = () => setListening(true)

    rec.onresult = (e: any) => {
      const isFinal = e.results[e.results.length - 1].isFinal
      const t = Array.from(e.results as any[])
        .map((r: any) => r[0].transcript)
        .join('')
        .trim()

      // Détection : commence par "argos" + au moins 3 autres caractères
      const lower = t.toLowerCase()
      const match = lower.match(/^argos[,.\s]+(.{3,})/)
      if (match && isFinal) {
        const demand = match[1].trim()
        rec.stop()
        handleDemand(demand)
      }
    }

    rec.onend = () => {
      setListening(false)
      // Relancer sauf si le provider a été démonté
      if (loopRef.current) {
        setTimeout(startLoop, 400)
      }
    }

    rec.onerror = (e: any) => {
      // 'no-speech' est normal — on relance silencieusement
      if (e.error !== 'no-speech') {
        console.warn('[VoiceContext] STT error:', e.error)
      }
      setListening(false)
      if (loopRef.current) {
        setTimeout(startLoop, 1000)
      }
    }

    try { rec.start() } catch { /* ignore */ }
  }, [handleDemand])

  // ── Démarrage au montage ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!SpeechRecognitionAPI) return
    loopRef.current = true
    // Petit délai pour laisser le navigateur demander la permission si nécessaire
    const t = setTimeout(startLoop, 800)
    return () => {
      loopRef.current = false
      clearTimeout(t)
      recRef.current?.stop()
    }
  }, [startLoop])

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <VoiceContext.Provider value={{
      listening, speaking, ttsEnabled, lastTranscript,
      setTtsEnabled, stopSpeaking, speak, registerHandler,
    }}>
      {children}
    </VoiceContext.Provider>
  )
}
