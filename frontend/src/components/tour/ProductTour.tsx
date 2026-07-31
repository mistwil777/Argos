import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import TourOverlay from '@/components/tour/TourOverlay'
import type { TourStep } from '@/components/tour/TourOverlay'

const STEPS: (TourStep & { route: string })[] = [
  { route: '/veille',    targetSelector: 'a[href="/veille"]',    position: 'right', title: 'Veille',    description: 'Définissez ce que vous voulez surveiller. Argos décompose votre domaine en sous-thèmes et configure les sources automatiquement.' },
  { route: '/briefing',  targetSelector: 'a[href="/briefing"]',  position: 'right', title: 'Briefing',  description: 'Votre résumé quotidien de ce qui a changé. Ouvrez l\'assistant intégré pour creuser une question en langage naturel.' },
  { route: '/librairie', targetSelector: 'a[href="/librairie"]', position: 'right', title: 'Librairie', description: 'Vos documents générés — fiches, synthèses, rapports. Le Knowledge Graph est accessible depuis l\'onglet dédié.' },
  { route: '/reglages',  targetSelector: 'a[href="/reglages"]',  position: 'right', title: 'Réglages',  description: 'Connectez Argos à votre IDE, gérez votre équipe et configurez les préférences du briefing.' },
]

export default function ProductTour() {
  const { user, updateOnboardingDone } = useAuth()
  const navigate  = useNavigate()
  const location  = useLocation()
  const [visible, setVisible] = useState(false)
  const [step,    setStep]    = useState(0)

  useEffect(() => {
    if (user && !user.onboarding_done) setTimeout(() => setVisible(true), 800)
  }, [user])

  // Naviguer vers la bonne route à chaque changement d'étape
  useEffect(() => {
    if (!visible) return
    const target = STEPS[step]
    if (target && target.route !== location.pathname) navigate(target.route)
  }, [step, visible]) // eslint-disable-line

  async function finish() {
    setVisible(false)
    await updateOnboardingDone()
  }

  if (!visible || !user || user.onboarding_done) return null

  // Injecte un handler de step change pour permettre la navigation
  const stepsForOverlay: TourStep[] = STEPS.map(s => ({
    title: s.title,
    description: s.description,
    targetSelector: s.targetSelector,
    position: s.position,
  }))

  return (
    <TourOverlay
      steps={stepsForOverlay}
      visible={visible}
      onFinish={finish}
      finishLabel="C'est parti ✓"
      onStepChange={i => setStep(i)}
    />
  )
}
