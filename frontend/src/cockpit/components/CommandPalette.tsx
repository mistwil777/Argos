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

  // Commandes disponibles
  const commands: Command[] = [
    {
      id: 'mode-flux',
      label: 'Ouvrir Flux (Items)',
      description: 'Accéder aux items en attente',
      icon: <FileText className="w-5 h-5" />,
      action: () => {
        setActiveMode('flux');
        onClose();
      },
      keywords: ['flux', 'items', 'pending', 'classification'],
    },
    {
      id: 'mode-production',
      label: 'Ouvrir Production (Docs)',
      description: 'Accéder à la bibliothèque de documents',
      icon: <BookOpen className="w-5 h-5" />,
      action: () => {
        setActiveMode('production');
        onClose();
      },
      keywords: ['production', 'docs', 'documents', 'library'],
    },
    {
      id: 'mode-assistant',
      label: 'Ouvrir Assistant (RAG)',
      description: 'Poser des questions sur vos documents',
      icon: <MessageSquare className="w-5 h-5" />,
      action: () => {
        setActiveMode('assistant');
        onClose();
      },
      keywords: ['assistant', 'rag', 'chat', 'questions'],
    },
    {
      id: 'mode-controle',
      label: 'Ouvrir Contrôle (HITL)',
      description: 'Gérer les décisions HITL et monitoring',
      icon: <Shield className="w-5 h-5" />,
      action: () => {
        setActiveMode('controle');
        onClose();
      },
      keywords: ['controle', 'hitl', 'monitoring', 'health'],
    },
    {
      id: 'classify-all',
      label: 'Classifier tous les items pending',
      description: 'Lancer la classification en batch',
      icon: <Sparkles className="w-5 h-5" />,
      action: () => {
        alert('Classification batch à implémenter');
        onClose();
      },
      keywords: ['classify', 'batch', 'pending', 'all'],
    },
    {
      id: 'reject-all-low',
      label: 'Rejeter tous les items Low importance',
      description: 'Nettoyage des items peu importants',
      icon: <XCircle className="w-5 h-5" />,
      action: () => {
        if (confirm('Rejeter tous les items Low importance ?')) {
          alert('Rejet batch à implémenter');
        }
        onClose();
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

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-50"
        onClick={onClose}
      />

      {/* Palette */}
      <div className="fixed top-1/4 left-1/2 -translate-x-1/2 w-full max-w-2xl z-50">
        <div className="bg-white rounded-lg shadow-2xl overflow-hidden">
          {/* Search Input */}
          <div className="flex items-center px-4 py-3 border-b border-gray-200">
            <Search className="w-5 h-5 text-gray-400 mr-3" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher une commande..."
              className="flex-1 outline-none text-gray-900"
              autoFocus
            />
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100 rounded">
              ⌘K
            </kbd>
          </div>

          {/* Commands List */}
          <div className="max-h-96 overflow-y-auto">
            {filteredCommands.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500">
                Aucune commande trouvée
              </div>
            ) : (
              <div className="py-2">
                {filteredCommands.map((command, index) => (
                  <button
                    key={command.id}
                    onClick={command.action}
                    className={`w-full px-4 py-3 flex items-center space-x-3 transition-colors ${
                      index === selectedIndex
                        ? 'bg-blue-50'
                        : 'hover:bg-gray-50'
                    }`}
                    onMouseEnter={() => setSelectedIndex(index)}
                  >
                    <div className={`flex-shrink-0 ${
                      index === selectedIndex ? 'text-blue-600' : 'text-gray-400'
                    }`}>
                      {command.icon}
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium text-gray-900">{command.label}</p>
                      {command.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{command.description}</p>
                      )}
                    </div>
                    {index === selectedIndex && (
                      <kbd className="px-2 py-1 text-xs font-semibold text-gray-500 bg-gray-100 rounded">
                        ↵
                      </kbd>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center justify-between text-xs text-gray-500">
            <span>Naviguez avec ↑ ↓</span>
            <span>Validez avec ↵</span>
            <span>Fermez avec ESC</span>
          </div>
        </div>
      </div>
    </>
  );
}
