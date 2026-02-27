// ContentModal - Modal pour afficher le contenu d'un document en grand
import { X } from 'lucide-react';
import { useEffect } from 'react';

interface ContentModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  content: string;
}

export function ContentModal({ isOpen, onClose, title, content }: ContentModalProps) {
  // Fermer avec Escape
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm animate-fadeIn"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-6xl h-[90vh] m-8 bg-gradient-to-b from-[#0f1420] to-[#1a1e2e] rounded-2xl shadow-2xl border border-blue-900/40 overflow-hidden animate-scaleIn">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-blue-900/40 bg-gradient-to-r from-blue-950/30 to-transparent">
          <h2 className="text-xl font-bold text-gray-100 flex items-center space-x-3">
            <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
            <span>{title}</span>
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-900/20 rounded-lg transition-all border border-transparent hover:border-red-600/30 group"
          >
            <X className="w-6 h-6 text-gray-400 group-hover:text-red-400 transition-colors" />
          </button>
        </div>

        {/* Content */}
        <div className="h-[calc(100%-4rem)] overflow-y-auto p-8">
          <div className="prose prose-invert prose-blue max-w-none">
            <div className="text-gray-200 leading-relaxed whitespace-pre-wrap font-mono text-sm">
              {content || 'Aucun contenu disponible'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
