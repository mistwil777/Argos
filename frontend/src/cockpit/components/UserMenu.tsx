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
        className="flex items-center space-x-2 px-3 py-1.5 hover:bg-blue-900/20 rounded-lg transition-all border border-transparent hover:border-blue-700/30"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white text-xs font-bold border border-blue-400/30 shadow-lg">
          U
        </div>
        <span className="text-sm font-medium text-gray-200">User</span>
        <svg 
          className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-[#0f1420] border border-blue-900/40 rounded-xl shadow-2xl shadow-black/50 overflow-hidden animate-scaleIn z-50">
          {/* User Info */}
          <div className="px-4 py-3 bg-gradient-to-r from-blue-950/40 to-transparent border-b border-blue-900/30">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center text-white font-bold border border-blue-400/30">
                U
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-100">User</p>
                <p className="text-xs text-gray-400">user@entreprise.com</p>
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-2">
            <button 
              onClick={handleProfile}
              className="w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-blue-900/20 transition-colors text-gray-300 hover:text-blue-300 group"
            >
              <User className="w-4 h-4" />
              <span className="text-sm font-medium">Mon profil</span>
            </button>
            
            <button 
              onClick={handleSettings}
              className="w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-blue-900/20 transition-colors text-gray-300 hover:text-blue-300 group"
            >
              <Settings className="w-4 h-4" />
              <span className="text-sm font-medium">Paramètres</span>
            </button>

            <button 
              onClick={toggleTheme}
              className="w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-blue-900/20 transition-colors text-gray-300 hover:text-blue-300 group"
            >
              {theme === 'dark' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              <span className="text-sm font-medium">
                {theme === 'dark' ? 'Mode sombre' : 'Mode clair'}
              </span>
            </button>

            <button 
              onClick={handleHelp}
              className="w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-blue-900/20 transition-colors text-gray-300 hover:text-blue-300 group"
            >
              <HelpCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Aide & Support</span>
            </button>
          </div>

          {/* Logout */}
          <div className="border-t border-blue-900/30 py-2">
            <button 
              onClick={handleLogout}
              className="w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-red-900/20 transition-colors text-gray-300 hover:text-red-400 group"
            >
              <LogOut className="w-4 h-4" />
              <span className="text-sm font-medium">Déconnexion</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
