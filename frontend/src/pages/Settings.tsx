import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell, Volume2, VolumeX, Check, ChevronDown, RefreshCw, Loader2,
} from 'lucide-react'
import { useVoice } from '@/context/VoiceContext'
import { api } from '@/services/api'

const LS_HOURS   = 'argos:briefing_hours'
const LS_BRIEF_H = 'argos:briefing_time'

function loadHours(): number  { return Number(localStorage.getItem(LS_HOURS)) || 24 }
function loadBriefH(): string { return localStorage.getItem(LS_BRIEF_H) ?? '07:00' }

export default function Settings() {
  const { ttsEnabled, setTtsEnabled } = useVoice()

  const [hours,     setHours]     = useState(loadHours)
  const [briefTime, setBriefTime] = useState(loadBriefH)
  const [saved,     setSaved]     = useState(false)

  const [adminOpen, setAdminOpen] = useState(false)
  const [indexing,  setIndexing]  = useState(false)
  const [indexMsg,  setIndexMsg]  = useState<string | null>(null)

  useEffect(() => {
    const stored = localStorage.getItem('argos:tts_enabled')
    if (stored !== null) setTtsEnabled(stored === 'true')
  }, [setTtsEnabled])

  function save() {
    localStorage.setItem(LS_HOURS,   String(hours))
    localStorage.setItem(LS_BRIEF_H, briefTime)
    localStorage.setItem('argos:tts_enabled', String(ttsEnabled))
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  async function rebuildIndex() {
    setIndexing(true); setIndexMsg(null)
    try {
      const r = await api.rebuildRag()
      setIndexMsg(`✓ ${r.message || 'Index reconstruit'}`)
    } catch (e: any) {
      setIndexMsg(`ERR / ${e.message}`)
    } finally {
      setIndexing(false)
    }
  }

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-5">

      {/* Briefing quotidien */}
      <Panel title="Briefing quotidien" icon={Bell}>
        <div className="px-4 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">
                Fenêtre d'analyse
              </label>
              <select
                value={hours}
                onChange={e => setHours(Number(e.target.value))}
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2
                           text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none
                           focus:border-[hsl(var(--accent-line))] transition-colors"
              >
                <option value={24}>24 heures</option>
                <option value={48}>48 heures</option>
                <option value={72}>72 heures</option>
              </select>
            </div>
            <div>
              <label className="text-[11px] font-mono text-[hsl(var(--text-3))] uppercase tracking-wider block mb-1.5">
                Heure de génération
              </label>
              <input
                type="time"
                value={briefTime}
                onChange={e => setBriefTime(e.target.value)}
                className="w-full bg-[hsl(var(--bg))] border border-[hsl(var(--line))] rounded px-3 py-2
                           text-[12.5px] font-mono text-[hsl(var(--text-2))] outline-none
                           focus:border-[hsl(var(--accent-line))] transition-colors"
              />
            </div>
          </div>
          <p className="text-[11px] text-[hsl(var(--text-3))]">
            Le briefing se génère automatiquement chaque matin. L'heure ici est sauvegardée localement — modifier le scheduler côté serveur nécessite un redémarrage.
          </p>
        </div>
      </Panel>

      {/* Lecture vocale */}
      <Panel title="Lecture vocale" icon={ttsEnabled ? Volume2 : VolumeX}>
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <p className="text-[12.5px] text-[hsl(var(--text-2))]">Lire les réponses à voix haute</p>
            <p className="text-[11px] text-[hsl(var(--text-3))] mt-0.5">Synthèse vocale du navigateur (fr-FR)</p>
          </div>
          <button
            onClick={() => setTtsEnabled(!ttsEnabled)}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              ttsEnabled ? 'bg-[hsl(var(--accent))]' : 'bg-[hsl(var(--bg-3))]'
            }`}
          >
            <motion.div
              animate={{ x: ttsEnabled ? 20 : 2 }}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
              className="absolute top-1 w-4 h-4 rounded-full bg-white shadow"
            />
          </button>
        </div>
      </Panel>

      {/* Enregistrer */}
      <motion.button
        onClick={save}
        whileTap={{ scale: 0.97 }}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg
                   bg-[hsl(var(--accent))] text-white text-[13px] font-bold transition-opacity"
      >
        <AnimatePresence mode="wait">
          {saved ? (
            <motion.span key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }} className="flex items-center gap-2">
              <Check className="w-4 h-4" /> Enregistré
            </motion.span>
          ) : (
            <motion.span key="save" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              exit={{ opacity: 0 }} className="flex items-center gap-2">
              Enregistrer
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Maintenance (replié) */}
      <div>
        <button
          onClick={() => setAdminOpen(v => !v)}
          className="flex items-center gap-2 text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors"
        >
          <motion.div animate={{ rotate: adminOpen ? 0 : -90 }} transition={{ duration: 0.18 }}>
            <ChevronDown className="w-3 h-3" />
          </motion.div>
          Maintenance système
        </button>
        <AnimatePresence>
          {adminOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} className="overflow-hidden mt-3"
            >
              <Panel title="Index RAG" icon={RefreshCw}>
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[11.5px] text-[hsl(var(--text-3))]">
                    Vide LanceDB et réindexe uniquement depuis les digests (résumés structurés). Supprime le contenu brut bruité.
                  </p>
                  <div className="flex items-center gap-3">
                    <button onClick={rebuildIndex} disabled={indexing}
                      className="flex items-center gap-2 px-3 py-1.5 rounded border border-[hsl(var(--line))]
                                 hover:border-[hsl(var(--line-bright))] text-[11.5px] font-mono text-[hsl(var(--text-2))]
                                 hover:text-[hsl(var(--text))] disabled:opacity-50 transition-all">
                      {indexing ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                      Reconstruire l'index
                    </button>
                    {indexMsg && (
                      <span className={`text-[11px] font-mono ${indexMsg.startsWith('ERR') ? 'text-[hsl(var(--red))]' : 'text-[hsl(var(--green))]'}`}>
                        {indexMsg}
                      </span>
                    )}
                  </div>
                </div>
              </Panel>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </div>
  )
}

function Panel({ title, icon: Icon, children }: {
  title: string; icon: any; children: React.ReactNode
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="panel overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[hsl(var(--line))] bg-[hsl(var(--bg-2))]">
        <Icon className="w-3.5 h-3.5 text-[hsl(var(--accent))]" />
        <span className="text-[13.5px] font-bold text-[hsl(var(--text))] tracking-tight">{title}</span>
      </div>
      {children}
    </motion.div>
  )
}
