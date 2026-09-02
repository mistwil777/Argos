import { NavLink, Outlet, useLocation, useNavigate, useMatch, useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, Newspaper, BookOpen, Settings, LogOut, ShieldCheck,
  Folder, Users, FileText, BarChart3, Terminal, ChevronLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'
import VoiceIndicator from '@/components/voice/VoiceIndicator'
import { useCollect } from '@/context/CollectContext'
import { useAuth } from '@/context/AuthContext'
import ProductTour from '@/components/tour/ProductTour'
import { useEffect, useState } from 'react'
import { api } from '@/services/api'

const NAV_PERSO = [
  { to: '/veille',    icon: Eye,      label: 'Veille' },
  { to: '/briefing',  icon: Newspaper, label: 'Briefing' },
  { to: '/librairie', icon: BookOpen,  label: 'Librairie' },
]

const META: Record<string, { title: string; badge?: string; desc?: string }> = {
  '/':           { title: 'Briefing',   desc: 'Ce qui a changé aujourd\'hui dans vos sources surveillées' },
  '/veille':     { title: 'Veille',     desc: 'Cadrez votre périmètre de veille et gérez vos dossiers' },
  '/briefing':   { title: 'Briefing',   desc: 'Ce qui a changé aujourd\'hui dans vos sources surveillées' },
  '/librairie':  { title: 'Librairie',  desc: 'Documents générés depuis votre base de connaissances' },
  '/reglages':   { title: 'Réglages',   desc: 'Général, connexions IDE, équipe et compte' },
  '/projets':    { title: 'Projets',    desc: 'Espaces projet partagés' },
  '/projets/nouveau': { title: 'Nouveau projet', desc: 'Création et calibration d\'un espace projet' },
}

const TAB_META: Record<string, { title: string; desc: string }> = {
  sujets:       { title: 'Sujets',      desc: 'Arborescence des sujets surveillés' },
  propositions: { title: 'Propositions', desc: 'Sources suggérées par le pipeline' },
  briefing:     { title: 'Briefing',    desc: 'Résumé et nouveautés du projet' },
  bibliotheque: { title: 'Bibliothèque', desc: 'Articles indexés dans ce projet' },
  membres:      { title: 'Membres',     desc: 'Gestion de l\'équipe projet' },
  metriques:    { title: 'Métriques',   desc: 'Qualité des digests et coûts LLM' },
  reglages:     { title: 'Réglages projet', desc: 'Configuration de l\'espace projet' },
  ide:          { title: 'Connexion IDE', desc: 'Clés API et configuration IDE' },
}

function CapgeminiMark({ size = 18 }: { size?: number }) {
  return <img src="/capgemini-logo.png" alt="Capgemini" width={size} height={size} style={{ objectFit: 'contain' }} />
}

function NavItem({ to, icon: Icon, label, end }: { to: string; icon: any; label: string; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className="block">
      {({ isActive }) => (
        <div className={cn(
          'flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-all text-[13px] font-medium relative',
          isActive ? 'text-white' : 'text-[#7FA8C8] hover:text-white hover:bg-white/10'
        )}>
          {isActive && (
            <motion.div layoutId="nav-bg" className="absolute inset-0 rounded-md"
              style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
          )}
          <Icon className="w-4 h-4 flex-shrink-0 relative z-10" strokeWidth={isActive ? 2.5 : 2} />
          <span className="relative z-10 flex-1">{label}</span>
        </div>
      )}
    </NavLink>
  )
}

function ProjetNavItem({ projectId, tabId, icon: Icon, label, badge }: {
  projectId: number; tabId: string; icon: any; label: string; badge?: number
}) {
  const [sp] = useSearchParams()
  const currentTab = sp.get('tab') || 'sujets'
  const isActive = currentTab === tabId
  const navigate = useNavigate()

  return (
    <button
      onClick={() => navigate(`/projets/${projectId}?tab=${tabId}`)}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 rounded-md cursor-pointer transition-all text-[13px] font-medium relative text-left',
        isActive ? 'text-white' : 'text-[#7FA8C8] hover:text-white hover:bg-white/10'
      )}
    >
      {isActive && (
        <motion.div layoutId="proj-nav-bg" className="absolute inset-0 rounded-md"
          style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }}
          transition={{ type: 'spring', stiffness: 500, damping: 35 }} />
      )}
      <Icon className="w-4 h-4 flex-shrink-0 relative z-10" strokeWidth={isActive ? 2.5 : 2} />
      <span className="relative z-10 flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="relative z-10 text-[10px] font-bold font-mono bg-white/10 text-[#7FA8C8] rounded px-1.5 py-0.5">
          {badge}
        </span>
      )}
    </button>
  )
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { job: collectJob } = useCollect()
  const { user, logout } = useAuth()
  const [searchParams] = useSearchParams()

  // Detect projet mode
  const projectMatch = useMatch('/projets/:id')
  const projectId = projectMatch?.params?.id ? Number(projectMatch.params.id) : null
  const isProjetMode = !!projectId

  const [projectName, setProjectName] = useState<string>('')
  const [pendingProposals, setPendingProposals] = useState<number>(0)

  useEffect(() => {
    if (!projectId) { setProjectName(''); setPendingProposals(0); return }
    api.getProject(projectId).then((p: any) => setProjectName(p?.name || '')).catch(() => {})
    api.listSourceProposals(projectId).then((data: any) => {
      const list: any[] = Array.isArray(data) ? data : []
      setPendingProposals(list.filter((p: any) => p.status === 'pending').length)
    }).catch(() => {})
  }, [projectId])

  // Title
  const currentTab = searchParams.get('tab') || 'sujets'
  let meta = META[pathname] ?? { title: 'Argos' }
  if (isProjetMode && TAB_META[currentTab]) {
    meta = { title: TAB_META[currentTab].title, desc: TAB_META[currentTab].desc }
  }

  function handleLogout() { logout(); navigate('/login', { replace: true }) }

  return (
    <>
    <div className="flex bg-[hsl(var(--bg))] overflow-hidden" style={{ height: 'calc(100vh - 28px)' }}>

      {/* ─── Sidebar ─────────────────────────────────────────────────── */}
      <aside className="relative w-56 flex-shrink-0 flex flex-col" style={{ background: '#0A1628' }}>

        <div className="absolute top-0 left-0 right-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 100%)' }} />

        {/* Logo */}
        <div className="relative px-5 pt-5 pb-4">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
            <motion.div whileHover={{ scale: 1.05 }} transition={{ type: 'spring', stiffness: 400, damping: 20 }}>
              <img src="/favicon.svg" alt="Argos" className="w-8 h-8" />
            </motion.div>
            <div>
              <p className="text-[17px] font-bold tracking-tight text-white leading-none">Argos</p>
              <p className="text-[9px] text-[#4A7FA0] mt-0.5 tracking-widest uppercase font-mono">Intelligence Platform</p>
            </div>
          </div>
        </div>

        <div className="mx-4 h-px" style={{ background: 'linear-gradient(90deg, #0070AD40, transparent)' }} />

        {isProjetMode ? (
          /* ── Mode Projet ─────────────────────────────────────── */
          <>
            {/* Badge projet actif */}
            <div className="mx-3 mt-3 mb-2 p-3 rounded-lg border border-[#2C3A50] bg-[#141B27]">
              <p className="text-[9.5px] font-mono text-[#5C6E82] uppercase tracking-wider mb-1">Projet actif</p>
              <p className="text-[12px] font-semibold text-white leading-snug truncate">
                {projectName || '…'}
              </p>
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1 mt-2 text-[10.5px] text-[#00B4E1] hover:text-[#00D4FF] transition-colors"
              >
                <ChevronLeft className="w-3 h-3" />
                Changer de projet
              </button>
            </div>

            {/* Nav projet principale */}
            <nav className="relative px-3 pt-1 pb-2 space-y-0.5">
              <ProjetNavItem projectId={projectId!} tabId="sujets"       icon={Folder}   label="Sujets" />
              <ProjetNavItem projectId={projectId!} tabId="propositions" icon={FileText}  label="Propositions" badge={pendingProposals} />
              <ProjetNavItem projectId={projectId!} tabId="briefing"     icon={Newspaper} label="Briefing" />
              <ProjetNavItem projectId={projectId!} tabId="bibliotheque" icon={BookOpen}  label="Bibliothèque" />
            </nav>

            <div className="flex-1" />

            {/* Gestion — en bas */}
            <div className="mx-4 h-px bg-white/10" />
            <div className="px-4 py-1.5">
              <p className="text-[9.5px] font-mono text-[#5C6E82] uppercase tracking-wider">Gestion</p>
            </div>
            <nav className="px-3 pb-2 space-y-0.5">
              <ProjetNavItem projectId={projectId!} tabId="membres"   icon={Users}    label="Membres" />
              <ProjetNavItem projectId={projectId!} tabId="metriques" icon={BarChart3} label="Métriques" />
              <ProjetNavItem projectId={projectId!} tabId="ide"       icon={Terminal}  label="Connexion IDE" />
              <ProjetNavItem projectId={projectId!} tabId="reglages"  icon={Settings}  label="Réglages projet" />
            </nav>
          </>
        ) : (
          /* ── Mode Perso ──────────────────────────────────────── */
          <>
            <nav className="relative px-3 pt-4 pb-2 space-y-1">
              {NAV_PERSO.map(item => <NavItem key={item.to} {...item} />)}
            </nav>
            <div className="flex-1" />
            <div className="mx-4 h-px bg-white/10" />
            <div className="px-3 py-3 space-y-1">
              <NavItem to="/reglages" icon={Settings}   label="Réglages" />
              <NavItem to="/admin"    icon={ShieldCheck} label="Admin" />
            </div>
          </>
        )}

        {/* Collecte en cours */}
        <AnimatePresence>
          {collectJob && !collectJob.done && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="relative mx-3 mb-2 p-2.5 rounded-lg border border-[#00B4E1]/30 bg-[#00B4E1]/10"
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[0,1,2].map(i => (
                    <motion.div key={i} className="w-0.5 h-3 rounded-full bg-[#00B4E1]"
                      animate={{ scaleY: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
                <p className="text-[10.5px] font-mono text-[#00B4E1] leading-tight">
                  {collectJob.itemsCollected > 0 ? `${collectJob.itemsCollected} articles collectés` : 'Collecte en cours…'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* User */}
        <div className="mx-3 mb-3 p-3 rounded-lg bg-white/5 border border-white/10 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
            </span>
            <p className="text-[11.5px] font-medium text-white/80 flex-1 truncate">
              {user?.full_name || user?.email || 'Système actif'}
            </p>
            <button onClick={handleLogout} title="Déconnexion"
              className="text-white/30 hover:text-red-400 transition-colors flex-shrink-0">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[10px] font-mono text-[#4A7FA0]">localhost:8000</p>
        </div>

        {/* Capgemini branding */}
        <div className="px-4 py-3 border-t border-white/10">
          <div className="flex items-center gap-2">
            <CapgeminiMark size={20} />
            <div>
              <p className="text-[9px] text-[#4A7FA0] uppercase tracking-widest font-mono leading-none">Powered by</p>
              <p className="text-[12px] font-bold text-white/70 tracking-tight leading-tight">Capgemini</p>
            </div>
          </div>
        </div>
      </aside>

      {/* ─── Main ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="relative h-14 flex-shrink-0 flex items-center justify-between px-6
                           bg-[hsl(var(--bg-1))] border-b border-[hsl(var(--line))]">
          <div className="absolute bottom-0 left-0 right-0 h-[2px]"
            style={{ background: 'linear-gradient(90deg, #0070AD 0%, #00B4E1 60%, transparent 100%)' }} />
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              <motion.div key={pathname + currentTab}
                initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.15 }}>
                <h1 className="text-[17px] font-bold text-[hsl(var(--text))] tracking-tight leading-none">{meta.title}</h1>
                {meta.desc && <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">{meta.desc}</p>}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-4">
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer"
              className="text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--accent))] transition-colors">
              API docs ↗
            </a>
          </div>
        </header>

        <VoiceIndicator />

        <main className="flex-1 overflow-auto bg-[hsl(var(--bg))]">
          <AnimatePresence mode="wait">
            <motion.div key={pathname + currentTab}
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-full">
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>

    <div className="fixed bottom-0 left-0 right-0 h-[28px] flex items-center justify-center gap-4 z-40 pointer-events-none"
      style={{ background: '#0A1628', borderTop: '1px solid #1E3A5F' }}>
      <CapgeminiMark size={14} />
      <p className="text-[10.5px] font-sans text-[#4A7FA0] select-none tracking-wide">
        Argos — Conceived, designed and built by{' '}
        <span className="text-[#00B4E1] font-semibold">Wilfried Leroulier</span>
        <span className="mx-2 text-[#1E3A5F]">|</span>
        <span className="text-[#4A7FA0]">A Capgemini Initiative</span>
      </p>
    </div>

    <ProductTour />
    </>
  )
}
