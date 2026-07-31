import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Eye, Newspaper, BookOpen, Settings, Activity, LogOut
} from 'lucide-react'
import { cn } from '@/lib/utils'
import VoiceIndicator from '@/components/voice/VoiceIndicator'
import { useCollect } from '@/context/CollectContext'
import { useAuth } from '@/context/AuthContext'
import ProductTour from '@/components/tour/ProductTour'

const NAV_MAIN = [
  { to: '/veille',   icon: Eye,       label: 'Veille',   tip: 'Cadrer et gérer ce que vous surveillez' },
  { to: '/briefing', icon: Newspaper, label: 'Briefing', tip: 'Résumé quotidien et assistant pour creuser' },
  { to: '/librairie',icon: BookOpen,  label: 'Librairie',tip: 'Documents générés, fiches, synthèses et Knowledge Graph' },
]

const META: Record<string, { title: string; badge?: string; desc?: string }> = {
  '/':           { title: 'Briefing',   desc: 'Ce qui a changé aujourd\'hui dans l\'écosystème surveillé' },
  '/veille':     { title: 'Veille',     desc: 'Cadrez votre périmètre de veille et gérez vos dossiers' },
  '/briefing':   { title: 'Briefing',   desc: 'Ce qui a changé aujourd\'hui dans l\'écosystème surveillé' },
  '/librairie':  { title: 'Librairie',  desc: 'Documents générés depuis votre base de connaissances' },
  '/reglages':   { title: 'Réglages',   desc: 'Général, connexions IDE, équipe et compte' },
}

function NavItem({ to, icon: Icon, label, tip, end }: {
  to: string; icon: any; label: string; tip: string; end?: boolean
}) {
  return (
    <NavLink to={to} end={end} className="block group relative">
      {({ isActive }) => (
        <>
          <div className={cn('nav-item', isActive && 'active')}>
            {isActive && (
              <motion.div
                layoutId="nav-bg"
                className="absolute inset-0 rounded-[var(--radius)] bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]"
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Icon className="w-3.5 h-3.5 flex-shrink-0 relative z-10" strokeWidth={isActive ? 2.5 : 2} />
            <span className="relative z-10 flex-1">{label}</span>
            {isActive && (
              <motion.div
                layoutId="nav-dot"
                className="ml-auto w-1 h-1 rounded-full bg-[hsl(var(--accent))] relative z-10"
              />
            )}
          </div>
          {/* Tooltip */}
          <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-2 z-50
                          opacity-0 group-hover:opacity-100 transition-opacity duration-150">
            <div className="whitespace-nowrap bg-[hsl(var(--bg-2))] border border-[hsl(var(--line-bright))]
                            text-[11px] text-[hsl(var(--text-2))] px-2.5 py-1.5 rounded-md shadow-lg">
              {tip}
              <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent
                              border-r-[hsl(var(--line-bright))]" />
            </div>
          </div>
        </>
      )}
    </NavLink>
  )
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const meta = META[pathname] ?? { title: 'Argos' }
  const { job: collectJob } = useCollect()
  const { user, logout } = useAuth()

  function handleLogout() { logout(); navigate('/login', { replace: true }) }

  return (
    <>
    <div className="flex h-screen bg-[hsl(var(--bg))] overflow-hidden dark">

      {/* ─── Sidebar ────────────────────────────────────────────────── */}
      <aside className="relative w-52 flex-shrink-0 flex flex-col">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-[hsl(var(--accent-line))] via-[hsl(var(--line))] to-transparent" />

        {/* Logo */}
        <div className="relative h-14 flex items-center px-5 gap-3">
          <motion.div
            whileHover={{ scale: 1.1 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="w-7 h-7 flex-shrink-0"
          >
            <img src="/favicon.svg" alt="Argos" className="w-7 h-7" />
          </motion.div>
          <div>
            <p className="text-[13.5px] font-bold tracking-tight text-[hsl(var(--text))] leading-none">Argos</p>
            <p className="text-[9.5px] font-mono text-[hsl(var(--text-3))] mt-0.5 tracking-wider uppercase">v1.0.0</p>
          </div>
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />

        {/* Nav principale */}
        <nav className="relative flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {NAV_MAIN.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Séparateur */}
        <div className="mx-5 h-px bg-gradient-to-r from-transparent via-[hsl(var(--line))] to-transparent" />

        {/* Réglages en bas */}
        <div className="relative px-3 py-3">
          <NavItem to="/reglages" icon={Settings} label="Réglages" tip="Général, connexions IDE, équipe et compte" />
        </div>

        {/* Indicateur collecte en cours */}
        <AnimatePresence>
          {collectJob && !collectJob.done && (
            <motion.div
              initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }}
              className="relative mx-3 mb-2 p-2.5 rounded-lg bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]"
            >
              <div className="flex items-center gap-2">
                <div className="flex gap-0.5">
                  {[0,1,2].map(i => (
                    <motion.div key={i} className="w-0.5 h-3 rounded-full bg-[hsl(var(--accent))]"
                      animate={{ scaleY: [0.3, 1, 0.3] }}
                      transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15 }} />
                  ))}
                </div>
                <p className="text-[10.5px] font-mono text-[hsl(var(--accent))] leading-tight">
                  {collectJob.itemsCollected > 0
                    ? `${collectJob.itemsCollected} articles collectés`
                    : 'Collecte en cours…'}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Status + user */}
        <div className="relative mx-3 mb-3 p-3 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))] space-y-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--green))] opacity-60"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[hsl(var(--green))]"></span>
            </span>
            <p className="text-[11px] font-medium text-[hsl(var(--text-2))] flex-1 truncate">
              {user?.full_name || user?.email || 'Système actif'}
            </p>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono text-[hsl(var(--text-3))]">localhost:8000</p>
            <button onClick={handleLogout} title="Déconnexion"
              className="text-[hsl(var(--text-3))] hover:text-[hsl(var(--red))] transition-colors">
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* ─── Main ────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <header className="relative h-14 flex-shrink-0 flex items-center justify-between px-6 bg-[hsl(var(--bg-1))] border-b border-[hsl(var(--line))]">
          <div className="flex items-center gap-3">
            <AnimatePresence mode="wait">
              <motion.div key={pathname}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.15 }}
              >
                <div className="flex items-center gap-3">
                  <h1 className="text-[16px] font-bold text-[hsl(var(--text))] tracking-tight leading-none">{meta.title}</h1>
                  {meta.badge && <span className="pill pill-accent">{meta.badge}</span>}
                </div>
                {meta.desc && (
                  <p className="text-[11px] font-mono text-[hsl(var(--text-3))] mt-0.5">{meta.desc}</p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-3">
            <Activity className="w-3.5 h-3.5 text-[hsl(var(--text-3))]" />
            <a href="http://localhost:8000/docs" target="_blank" rel="noreferrer"
              className="text-[11px] font-mono text-[hsl(var(--text-3))] hover:text-[hsl(var(--text-2))] transition-colors">
              API docs ↗
            </a>
          </div>
        </header>

        {/* Indicateur vocal global */}
        <VoiceIndicator />

        {/* Content */}
        <main className="flex-1 overflow-auto bg-[hsl(var(--bg))]">
          <div className="fixed inset-0 dot-grid opacity-[0.15] pointer-events-none" style={{ left: 208 }} />
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="relative h-full"
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
    <ProductTour />
    </>
  )
}
