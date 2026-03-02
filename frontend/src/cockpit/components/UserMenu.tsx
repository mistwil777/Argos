// UserMenu - Menu utilisateur avec dropdown
import { useState, useRef, useEffect } from 'react';
import { User, Settings, LogOut, HelpCircle, Moon, Sun } from 'lucide-react';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleProfile = () => {
    setIsOpen(false);
    alert('Profil utilisateur\n\nNom: User\nEmail: user@entreprise.com\nRôle: Administrateur');
  };

  const handleSettings = () => {
    setIsOpen(false);
    alert('Paramètres\n\nCette section permettra de configurer:\n- Préférences d\'affichage\n- Notifications\n- Langue\n- Raccourcis clavier');
  };

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    // Apply theme change to document
    if (newTheme === 'light') {
      document.documentElement.classList.remove('dark');
      alert('Mode clair activé\n\n⚠️ Le thème clair sera implémenté dans une prochaine version.');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  const handleHelp = () => {
    setIsOpen(false);
    const helpText = `Aide & Raccourcis\n\n
Navigation:
⌘K - Ouvrir la palette de commandes
Échap - Fermer les modals

Modes:
1-5 - Basculer entre les modes

Actions:
⌘S - Sauvegarder
⌘Enter - Approuver (HITL)
⌘Backspace - Rejeter

Support: support@entreprise.com`;
    alert(helpText);
  };

  const handleLogout = () => {
    setIsOpen(false);
    if (confirm('Êtes-vous sûr de vouloir vous déconnecter ?')) {
      // TODO: Implémenter la déconnexion réelle
      alert('Déconnexion...\n\n✅ Session terminée avec succès');
      // window.location.href = '/login';
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* User Button */}
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-white/[0.04] rounded-lg transition-all border border-transparent hover:border-white/[0.08]"
      >
        <div className="w-7 h-7 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-zinc-300 text-xs font-semibold">
          U
        </div>
        <span className="text-xs font-medium text-zinc-500">User</span>
        <svg 
          className={`w-3.5 h-3.5 text-zinc-700 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
          {/* User Info */}
          <div className="px-4 py-3 border-b border-white/[0.06]">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-zinc-300 text-sm font-semibold">
                U
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-200">User</p>
                <p className="text-xs text-zinc-600">user@entreprise.com</p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1.5">
            <button 
              onClick={handleProfile}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-200"
            >
              <User className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="text-xs font-medium">Mon profil</span>
            </button>
            
            <button 
              onClick={handleSettings}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-200"
            >
              <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="text-xs font-medium">Paramètres</span>
            </button>

            <button 
              onClick={toggleTheme}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-200"
            >
              {theme === 'dark' ? <Moon className="w-3.5 h-3.5" strokeWidth={1.5} /> : <Sun className="w-3.5 h-3.5" strokeWidth={1.5} />}
              <span className="text-xs font-medium">
                {theme === 'dark' ? 'Mode sombre' : 'Mode clair'}
              </span>
            </button>

            <button 
              onClick={handleHelp}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-200"
            >
              <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="text-xs font-medium">Aide & Support</span>
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-white/[0.06] py-1.5">
            <button 
              onClick={handleLogout}
              className="w-full px-4 py-2 flex items-center gap-3 hover:bg-red-500/8 transition-colors text-zinc-500 hover:text-red-400"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="text-xs font-medium">Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
