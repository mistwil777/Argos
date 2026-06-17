import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Rss, MessageSquare, Radio,
  Settings, LayoutDashboard, Zap, Activity, Library, Newspaper, TrendingUp
} from 'lucide-react'
import { cn } from '@/lib/utils'

const FLOW = [
  {
    to: '/sources',
    icon: Radio,
    label: 'Sources',
    step: '1',
    tip: 'Configurez vos sources de collecte : RSS, GitHub, APIs',
  },
  {
    to: '/feed',
    icon: Rss,
    label: 'Contenus',
    step: '2',
    tip: 'Parcourez, enrichissez et indexez vos contenus collectés ou ajoutés manuellement',
  },
  {
    to: '/assistant',
    icon: MessageSquare,
    label: 'Assistant',
    step: '3',
    tip: 'Interrogez votre base de connaissances en langage naturel',
  },
]

const TOOLS = [
  { to: '/briefing', icon: Newspaper,       label: 'Briefing',     tip: 'Synthèse quotidienne automatique des signaux importants' },
  { to: '/trends',   icon: TrendingUp,      label: 'Tendances',    tip: 'Évolution des concepts clés — signaux faibles et émergents' },
  { to: '/library',  icon: Library,         label: 'Bibliothèque', tip: 'Vos documents générés — fiches, synthèses, guides, rapports' },
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard',    tip: 'Vue d\'ensemble — métriques et activité récente', end: true },
  { to: '/settings', icon: Settings,        label: 'Réglages',     tip: 'Configuration du système' },
]

const META: Record<string, { title: string; badge?: string; desc?: string }> = {
  '/':          { title: 'Dashboard',    desc: 'Vue d\'ensemble — métriques et activité récente' },
  '/feed':      { title: 'Contenus',     desc: 'Collectez, enrichissez, indexez — depuis des sources ou des URLs manuelles' },
  '/assistant': { title: 'Assistant',    badge: 'RAG',        desc: 'Interrogez votre base de connaissances indexée' },
  '/sources':   { title: 'Sources',      desc: 'Configurez les sources de collecte automatique' },
  '/briefing':  { title: 'Briefing',     desc: 'Synthèse quotidienne automatique des signaux importants de veille' },
  '/trends':    { title: 'Tendances',    desc: 'Évolution des concepts clés détectés dans vos contenus — signaux faibles' },
  '/library':   { title: 'Bibliothèque', desc: 'Vos documents générés — fiches, synthèses, guides, rapports' },
  '/settings':  { title: 'Réglages',     desc: 'Configuration du système et des intégrations' },
}

function NavItem({ to, icon: Icon, label, step, tip, end }: {
  to: string; icon: any; label: string; step?: string; tip: string; end?: boolean
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
            {step && (
              <span className={cn(
                'relative z-10 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold flex-shrink-0',
                isActive
                  ? 'bg-[hsl(var(--accent))] text-white'
                  : 'bg-[hsl(var(--bg-3))] text-[hsl(var(--text-3))]'
              )}>{step}</span>
            )}
            {!step && isActive && (
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
  const meta = META[pathname] ?? { title: 'OpenWebMCP' }

  return (
    <div className="flex h-screen bg-[hsl(var(--bg))] overflow-hidden dark">

      {/* ─── Sidebar ────────────────────────────────────────────────── */}
      <aside className="relative w-52 flex-shrink-0 flex flex-col">
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-px bg-gradient-to-b from-[hsl(var(--accent-line))] via-[hsl(var(--line))] to-transparent" />

        {/* Logo */}
        <div className="relative h-14 flex items-center px-5 gap-3">
          <motion.div
            whileHover={{ scale: 1.1, rotate: 15 }}
            transition={{ type: 'spring', stiffness: 500, damping: 20 }}
            className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]"
          >
            <Zap className="w-3.5 h-3.5 text-[hsl(var(--accent))]" strokeWidth={2.5} />
          </motion.div>
          <div>
            <p className="text-[13.5px] font-bold tracking-tight text-[hsl(var(--text))] leading-none">OpenWebMCP</p>
            <p className="text-[9.5px] font-mono text-[hsl(var(--text-3))] mt-0.5 tracking-wider uppercase">v1.0.0</p>
          </div>
        </div>

        <div className="mx-5 h-px bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />

        {/* Nav */}
        <nav className="relative flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">

          {/* Section flux */}
          <p className="text-[9.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.12em] px-2 mb-2">
            Flux de travail
          </p>
          {FLOW.map(item => (
            <NavItem key={item.to} {...item} />
          ))}

          <div className="mx-2 my-3 h-px bg-[hsl(var(--line))]" />

          {/* Section outils */}
          <p className="text-[9.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.12em] px-2 mb-2">
            Outils
          </p>
          {TOOLS.map(item => (
            <NavItem key={item.to} {...item} />
          ))}
        </nav>

        {/* Status indicator */}
        <div className="relative mx-3 mb-3 p-3 rounded-lg bg-[hsl(var(--bg-2))] border border-[hsl(var(--line))]">
          <div className="flex items-center gap-2">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[hsl(var(--green))] opacity-60"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[hsl(var(--green))]"></span>
            </span>
            <p className="text-[11px] font-medium text-[hsl(var(--text-2))]">Système actif</p>
          </div>
          <p className="text-[10px] font-mono text-[hsl(var(--text-3))] mt-1">localhost:8000</p>
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
  )
}
