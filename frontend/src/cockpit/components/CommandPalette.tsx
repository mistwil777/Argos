// CommandPalette - Palette de commandes (⌘K)
import { useEffect, useState } from 'react';
import { Search, FileText, BookOpen, MessageSquare, Shield, Sparkles, XCircle } from 'lucide-react';
import { useCockpit } from '../context/CockpitContext';

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: React.ReactNode;
  action: () => void;
  keywords: string[];
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
  const { setActiveMode } = useCockpit();
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [showConfirmReject, setShowConfirmReject] = useState(false);
  const [showClassifyInfo, setShowClassifyInfo] = useState(false);

  // Commandes disponibles
  const commands: Command[] = [
    {
      id: 'mode-flux',
      label: 'Flux · Items',
      icon: <FileText className="w-3.5 h-3.5" />,
      action: () => {
        setActiveMode('flux');
        onClose();
      },
      keywords: ['flux', 'items', 'pending', 'classification'],
    },
    {
      id: 'mode-production',
      label: 'Production · Docs',
      icon: <BookOpen className="w-3.5 h-3.5" />,
      action: () => {
        setActiveMode('production');
        onClose();
      },
      keywords: ['production', 'docs', 'documents', 'library'],
    },
    {
      id: 'mode-assistant',
      label: 'Assistant · RAG',
      icon: <MessageSquare className="w-3.5 h-3.5" />,
      action: () => {
        setActiveMode('assistant');
        onClose();
      },
      keywords: ['assistant', 'rag', 'chat', 'questions'],
    },
    {
      id: 'mode-controle',
      label: 'Contrôle · HITL',
      icon: <Shield className="w-3.5 h-3.5" />,
      action: () => {
        setActiveMode('controle');
        onClose();
      },
      keywords: ['controle', 'hitl', 'monitoring', 'health'],
    },
    {
      id: 'classify-all',
      label: 'Classifier tous les items pending',
      icon: <Sparkles className="w-3.5 h-3.5" />,
      action: () => {
        setShowClassifyInfo(true);
      },
      keywords: ['classify', 'batch', 'pending', 'all'],
    },
    {
      id: 'reject-all-low',
      label: 'Rejeter tous les items Low importance',
      icon: <XCircle className="w-3.5 h-3.5" />,
      action: () => {
        setShowConfirmReject(true);
      },
      keywords: ['reject', 'low', 'importance', 'cleanup'],
    },
  ];

  // Filtrer les commandes
  const filteredCommands = commands.filter((cmd) => {
    const searchText = query.toLowerCase();
    return (
      cmd.label.toLowerCase().includes(searchText) ||
      cmd.description?.toLowerCase().includes(searchText) ||
      cmd.keywords.some((kw) => kw.includes(searchText))
    );
  });

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const command = filteredCommands[selectedIndex];
        if (command) {
          command.action();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, selectedIndex, filteredCommands, onClose]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  if (showConfirmReject) {
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => { setShowConfirmReject(false); onClose(); }} />
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-full max-w-sm z-50">
          <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 p-6">
            <XCircle className="w-8 h-8 text-red-400 mb-3" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Rejeter tous les items Low importance ?</h3>
            <p className="text-xs text-zinc-600 mb-5">Cette action est irréversible. Tous les items marqués « low importance » seront rejetés.</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowConfirmReject(false); onClose(); }}
                className="flex-1 cockpit-btn"
              >
                Annuler
              </button>
              <button
                onClick={() => {
                  // TODO: implement batch reject
                  setShowConfirmReject(false);
                  onClose();
                }}
                className="flex-1 cockpit-btn cockpit-btn-danger"
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      </>
    );
  }

  if (showClassifyInfo) {
    return (
      <>
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" onClick={() => { setShowClassifyInfo(false); onClose(); }} />
        <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-full max-w-sm z-50">
          <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 p-6">
            <Sparkles className="w-8 h-8 text-sky-400 mb-3" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-zinc-200 mb-2">Classification batch</h3>
            <p className="text-xs text-zinc-600 mb-5">Déclenchez la classification depuis le mode Flux — sélectionnez les items pending et cliquez sur « Classifier tout ».</p>
            <button
              onClick={() => { setShowClassifyInfo(false); setActiveMode('flux'); onClose(); }}
              className="w-full cockpit-btn cockpit-btn-primary"
            >
              Aller au Flux
            </button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed top-[20%] left-1/2 -translate-x-1/2 w-full max-w-sm z-50">
        <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center px-3 py-2.5 border-b border-white/[0.06]">
            <Search className="w-3.5 h-3.5 text-zinc-600 mr-2.5" strokeWidth={1.5} />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Commande..."
              className="flex-1 outline-none bg-transparent text-xs text-zinc-200 placeholder-zinc-700"
              autoFocus
            />
            <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 bg-white/[0.06] border border-white/[0.08] rounded">
              ⌘K
            </kbd>
          </div>

          {/* Commands List */}
          <div className="max-h-80 overflow-y-auto scrollable">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-700">
                Aucune commande trouvée
              </div>
            ) : (
              <div className="py-1">
                {filteredCommands.map((command, index) => (
                  <button
                    key={command.id}
                    onClick={command.action}
                    className={`w-full px-3 py-2 flex items-center gap-2.5 transition-colors ${
                      index === selectedIndex
                        ? 'bg-sky-500/10'
                        : 'hover:bg-white/[0.04]'
                    }`}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <span className={`flex-shrink-0 ${
                      index === selectedIndex ? 'text-sky-400' : 'text-zinc-600'
                    }`}>
                      {command.icon}
                    </span>
                    <span className={`flex-1 text-left text-xs font-medium ${
                      index === selectedIndex ? 'text-zinc-100' : 'text-zinc-400'
                    }`}>{command.label}</span>
                    {index === selectedIndex && (
                      <kbd className="px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 bg-white/[0.06] border border-white/[0.08] rounded">↵</kbd>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[10px] text-zinc-700">
            <span>Naviguez avec ↑ ↓</span>
            <span>Validez avec ↵</span>
            <span>Fermez avec ESC</span>
          </div>
        </div>
      </div>
    </>
  );
}
