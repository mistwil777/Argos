// AppShell - Layout principal du cockpit
import { useState, useEffect } from 'react';
import { LeftRail } from './LeftRail';
import { TopBar } from './TopBar';
import { CockpitCanvas } from './CockpitCanvas';
import { Inspector } from './Inspector';
import { BottomTray } from './BottomTray';
import { CommandPalette } from '../components/CommandPalette';
import { useCockpit } from '../context/CockpitContext';

export function AppShell() {
  const { inspectorOpen } = useCockpit();
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex h-screen overflow-hidden bg-zinc-950">
      {/* Grain noise — fixed overlay, no scroll repaint */}
      <div
        className="fixed inset-0 z-[998] pointer-events-none"
        style={{
          opacity: 0.018,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      <LeftRail onOpenCommandPalette={() => setCommandPaletteOpen(true)} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar />

        <div className="flex-1 flex overflow-hidden">
          <CockpitCanvas />
          {inspectorOpen && <Inspector />}
        </div>

        <BottomTray />
      </div>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </div>
  );
}

