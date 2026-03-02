// UserMenu - Menu utilisateur avec dropdown
import { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, HelpCircle, Moon, X, ChevronDown } from 'lucide-react';

type ActiveView = null | 'settings' | 'help' | 'confirm-logout';

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openView = (view: ActiveView) => {
    setIsOpen(false);
    setActiveView(view);
  };

  return (
    <>
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
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-700 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
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
                onClick={() => openView('settings')}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-200"
              >
                <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-xs font-medium">Paramètres</span>
              </button>

              <button
                onClick={() => openView('help')}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-white/[0.04] transition-colors text-zinc-500 hover:text-zinc-200"
              >
                <HelpCircle className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-xs font-medium">Aide & Support</span>
              </button>

              <div className="px-4 py-2 flex items-center gap-3 text-zinc-700 cursor-not-allowed">
                <Moon className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-xs font-medium">Mode sombre (actif)</span>
              </div>
            </div>

            {/* Logout */}
            <div className="border-t border-white/[0.06] py-1.5">
              <button
                onClick={() => openView('confirm-logout')}
                className="w-full px-4 py-2 flex items-center gap-3 hover:bg-red-500/8 transition-colors text-zinc-500 hover:text-red-400"
              >
                <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="text-xs font-medium">Déconnexion</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal Overlay */}
      {activeView && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-6">
          <div className="bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/60 w-full max-w-md">
            {/* Settings Modal */}
            {activeView === 'settings' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold text-zinc-200">Paramètres</h2>
                  </div>
                  <button onClick={() => setActiveView(null)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  <div>
                    <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Affichage</h3>
                    <div className="flex flex-col gap-2">
                      <label className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Thème</span>
                        <span className="text-xs font-medium text-zinc-300 bg-white/[0.06] px-2 py-0.5 rounded">Sombre</span>
                      </label>
                      <label className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Langue</span>
                        <span className="text-xs font-medium text-zinc-300 bg-white/[0.06] px-2 py-0.5 rounded">Français</span>
                      </label>
                    </div>
                  </div>
                  <div>
                    <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Compte</h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Nom</span>
                        <span className="text-xs font-mono text-zinc-300">User</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Email</span>
                        <span className="text-xs font-mono text-zinc-300">user@entreprise.com</span>
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Rôle</span>
                        <span className="text-xs font-medium text-zinc-300 bg-sky-500/10 text-sky-400 px-2 py-0.5 rounded border border-sky-500/20">Administrateur</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-5">
                  <button onClick={() => setActiveView(null)} className="w-full cockpit-btn">Fermer</button>
                </div>
              </>
            )}

            {/* Help Modal */}
            {activeView === 'help' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <HelpCircle className="w-4 h-4 text-zinc-400" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold text-zinc-200">Aide & Raccourcis</h2>
                  </div>
                  <button onClick={() => setActiveView(null)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 flex flex-col gap-4">
                  {[
                    { section: 'Navigation', shortcuts: [['⌘K', 'Ouvrir la palette de commandes'], ['Échap', 'Fermer les modals']] },
                    { section: 'Modes', shortcuts: [['1–5', 'Basculer entre les modes']] },
                    { section: 'Actions', shortcuts: [['⌘S', 'Sauvegarder'], ['⌘↵', 'Approuver (HITL)'], ['⌘⌫', 'Rejeter']] },
                  ].map(({ section, shortcuts }) => (
                    <div key={section}>
                      <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">{section}</h3>
                      <div className="flex flex-col gap-1">
                        {shortcuts.map(([key, desc]) => (
                          <div key={key} className="flex items-center justify-between py-1.5 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                            <span className="text-xs text-zinc-400">{desc}</span>
                            <kbd className="px-2 py-0.5 text-xs font-semibold text-zinc-400 bg-white/[0.06] border border-white/[0.08] rounded font-mono">{key}</kbd>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-zinc-700">Support: <span className="text-sky-500/70">support@entreprise.com</span></p>
                </div>
                <div className="px-5 pb-5">
                  <button onClick={() => setActiveView(null)} className="w-full cockpit-btn">Fermer</button>
                </div>
              </>
            )}

            {/* Logout confirm */}
            {activeView === 'confirm-logout' && (
              <>
                <div className="flex items-center justify-between px-5 py-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <LogOut className="w-4 h-4 text-red-400" strokeWidth={1.5} />
                    <h2 className="text-sm font-semibold text-zinc-200">Déconnexion</h2>
                  </div>
                  <button onClick={() => setActiveView(null)} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5">
                  <p className="text-sm text-zinc-400 mb-5">Êtes-vous sûr de vouloir vous déconnecter ?</p>
                  <div className="flex gap-2">
                    <button onClick={() => setActiveView(null)} className="flex-1 cockpit-btn">Annuler</button>
                    <button
                      onClick={() => {
                        setActiveView(null);
                        // TODO: implement real logout
                        // window.location.href = '/login';
                      }}
                      className="flex-1 cockpit-btn cockpit-btn-danger"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>Déconnecter</span>
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
