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

  // Hotkey ⌘K / Ctrl+K pour ouvrir la command palette
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
    <div className="flex h-screen overflow-hidden relative bg-gradient-to-br from-[#0a0e1a] via-[#0f1420] to-[#1a1e2e] cockpit-scanlines">
      {/* Ambient glow effect */}
      <div className="absolute inset-0 bg-gradient-radial from-blue-900/5 via-transparent to-transparent pointer-events-none"></div>
      
      {/* Left Rail - Navigation minimale */}
      <LeftRail onOpenCommandPalette={() => setCommandPaletteOpen(true)} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative z-10">
        {/* Top Bar */}
        <TopBar />

        {/* Canvas + Inspector */}
        <div className="flex-1 flex overflow-hidden">
          {/* Canvas Principal */}
          <CockpitCanvas />

          {/* Inspector Droit */}
          {inspectorOpen && <Inspector />}
        </div>

        {/* Bottom Tray */}
        <BottomTray />
      </div>

      {/* Command Palette */}
      <CommandPalette 
        isOpen={commandPaletteOpen} 
        onClose={() => setCommandPaletteOpen(false)} 
      />
    </div>
  );
}
