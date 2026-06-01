import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Globe, Search, Rss, MessageSquare, Radio,
  Settings, LayoutDashboard, Zap, Activity
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/',          icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/browse',    icon: Globe,           label: 'Browse'    },
  { to: '/search',    icon: Search,          label: 'Recherche' },
  { to: '/feed',      icon: Rss,             label: 'Feed'      },
  { to: '/assistant', icon: MessageSquare,   label: 'Assistant' },
  { to: '/sources',   icon: Radio,           label: 'Sources'   },
  { to: '/settings',  icon: Settings,        label: 'Réglages'  },
]

const META: Record<string, { title: string; badge?: string }> = {
  '/':          { title: 'Dashboard'  },
  '/browse':    { title: 'Browse',    badge: 'Playwright' },
  '/search':    { title: 'Recherche', badge: 'DDG + Bing' },
  '/feed':      { title: 'Feed'       },
  '/assistant': { title: 'Assistant', badge: 'RAG' },
  '/sources':   { title: 'Sources'    },
  '/settings':  { title: 'Réglages'  },
}

export default function AppLayout() {
  const { pathname } = useLocation()
  const meta = META[pathname] ?? { title: 'OpenWebMCP' }

  return (
    <div className="flex h-screen bg-[hsl(var(--bg))] overflow-hidden dark">

      {/* ─── Sidebar ────────────────────────────────────────────────── */}
      <aside className="relative w-52 flex-shrink-0 flex flex-col">
        {/* Dot grid fabric */}
        <div className="absolute inset-0 dot-grid opacity-30 pointer-events-none" />
        {/* right border with accent glow at top */}
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

        {/* Divider */}
        <div className="mx-5 h-px bg-gradient-to-r from-[hsl(var(--accent-line))] to-transparent" />

        {/* Nav */}
        <nav className="relative flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {/* Section label */}
          <p className="text-[9.5px] font-mono text-[hsl(var(--text-3))] uppercase tracking-[.12em] px-2 mb-2">Navigation</p>
          {NAV.map(({ to, icon: Icon, label, end }) => (
            <NavLink key={to} to={to} end={end} className="block">
              {({ isActive }) => (
                <div className={cn('nav-item', isActive && 'active')}>
                  {isActive && (
                    <motion.div
                      layoutId="nav-bg"
                      className="absolute inset-0 rounded-[var(--radius)] bg-[hsl(var(--accent-dim))] border border-[hsl(var(--accent-line))]"
                      transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    />
                  )}
                  <Icon className="w-3.5 h-3.5 flex-shrink-0 relative z-10" strokeWidth={isActive ? 2.5 : 2} />
                  <span className="relative z-10">{label}</span>
                  {isActive && (
                    <motion.div
                      layoutId="nav-dot"
                      className="ml-auto w-1 h-1 rounded-full bg-[hsl(var(--accent))] relative z-10"
                    />
                  )}
                </div>
              )}
            </NavLink>
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
                className="flex items-center gap-3"
              >
                <h1 className="text-[16px] font-bold text-[hsl(var(--text))] tracking-tight leading-none">{meta.title}</h1>
                {meta.badge && (
                  <span className="pill pill-accent">{meta.badge}</span>
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
          {/* Dot grid in content area — subtle */}
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
