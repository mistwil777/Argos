import { NavLink, Outlet } from 'react-router-dom'
import { Globe, Search, Rss, MessageSquare, Radio, Settings, BarChart2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const nav = [
  { to: '/', icon: BarChart2, label: 'Dashboard', end: true },
  { to: '/browse', icon: Globe, label: 'Browse' },
  { to: '/search', icon: Search, label: 'Search' },
  { to: '/feed', icon: Rss, label: 'Feed' },
  { to: '/assistant', icon: MessageSquare, label: 'Assistant' },
  { to: '/sources', icon: Radio, label: 'Sources' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function AppLayout() {
  return (
    <div className="flex h-screen bg-background dark overflow-hidden">
      {/* Sidebar */}
      <aside className="w-14 md:w-52 flex-shrink-0 border-r border-border flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-3 md:px-4 border-b border-border gap-2.5">
          <div className="w-7 h-7 rounded-md bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Globe className="w-4 h-4 text-primary" />
          </div>
          <span className="hidden md:block font-semibold text-sm text-foreground">OpenWebMCP</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 space-y-0.5">
          {nav.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-2 py-2 rounded-md text-sm transition-colors',
                  isActive
                    ? 'bg-primary/15 text-primary font-medium'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )
              }
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              <span className="hidden md:block">{label}</span>
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="p-2 md:p-3 border-t border-border">
          <p className="hidden md:block text-xs text-muted-foreground/50 text-center">v1.0.0</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
