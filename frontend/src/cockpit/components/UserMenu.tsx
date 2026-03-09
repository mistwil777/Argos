// UserMenu - Menu utilisateur avec dropdown
import { useState, useRef, useEffect } from 'react';
import { Settings, LogOut, HelpCircle, Moon, X, ChevronDown, Check, Sun } from 'lucide-react';

type ActiveView = null | 'settings' | 'help' | 'confirm-logout';

// Persistent user preferences stored in localStorage
function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem('userPrefs') || '{}');
  } catch { return {}; }
}
function savePrefs(prefs: Record<string, string>) {
  localStorage.setItem('userPrefs', JSON.stringify(prefs));
}

export function UserMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeView, setActiveView] = useState<ActiveView>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Prefs state
  const [prefs, setPrefs] = useState<Record<string, string>>(() => ({
    name: 'User',
    email: 'user@entreprise.com',
    role: 'Administrateur',
    theme: 'sombre',
    language: 'fr',
    ...loadPrefs(),
  }));
  // Draft state for editing
  const [draft, setDraft] = useState<Record<string, string>>(prefs);
  const [saved, setSaved] = useState(false);

  // Apply theme to document whenever it changes
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);

  const openSettings = () => {
    setDraft({ ...prefs });
    setSaved(false);
    setIsOpen(false);
    setActiveView('settings');
  };

  const handleSave = () => {
    setPrefs(draft);
    savePrefs(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleClose = () => {
    setActiveView(null);
    setSaved(false);
  };

  const initials = (prefs.name || 'U').slice(0, 2).toUpperCase();

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
            {initials}
          </div>
          <span className="text-xs font-medium text-zinc-500">{prefs.name}</span>
          <ChevronDown className={`w-3.5 h-3.5 text-zinc-700 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-56 bg-zinc-900 border border-white/[0.08] rounded-xl shadow-2xl shadow-black/50 overflow-hidden z-50">
            {/* User Info */}
            <div className="px-4 py-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center text-zinc-300 text-sm font-semibold">
                  {initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-200 truncate">{prefs.name}</p>
                  <p className="text-xs text-zinc-600 truncate">{prefs.email}</p>
                </div>
              </div>
            </div>

            {/* Menu Items */}
            <div className="py-1.5">
              <button
                onClick={openSettings}
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
                  <button onClick={handleClose} className="p-1.5 hover:bg-white/[0.06] rounded-lg transition-colors text-zinc-600 hover:text-zinc-300">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-5 flex flex-col gap-5">
                  {/* Affichage */}
                  <div>
                    <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Affichage</h3>
                    <div className="flex flex-col gap-2">
                      {/* Thème toggle */}
                      <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Thème</span>
                        <div className="flex gap-1">
                          {(['sombre', 'clair'] as const).map((t) => (
                            <button
                              key={t}
                              onClick={() => setDraft(d => ({ ...d, theme: t }))}
                              className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-all ${
                                draft.theme === t
                                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                  : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'
                              }`}
                            >
                              {t === 'sombre' ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
                              {t === 'sombre' ? 'Sombre' : 'Clair'}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* Langue toggle */}
                      <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-400">Langue</span>
                        <div className="flex gap-1">
                          {([['fr', 'Français'], ['en', 'English']] as const).map(([code, label]) => (
                            <button
                              key={code}
                              onClick={() => setDraft(d => ({ ...d, language: code }))}
                              className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                                draft.language === code
                                  ? 'bg-sky-500/20 text-sky-400 border border-sky-500/30'
                                  : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Compte */}
                  <div>
                    <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-2">Compte</h3>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3 py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-500 shrink-0">Nom</span>
                        <input
                          type="text"
                          value={draft.name}
                          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                          className="text-xs text-zinc-200 bg-transparent text-right outline-none border-b border-transparent focus:border-sky-500/50 transition-colors min-w-0 flex-1"
                          placeholder="Votre nom"
                        />
                      </div>
                      <div className="flex items-center justify-between gap-3 py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-500 shrink-0">Email</span>
                        <input
                          type="email"
                          value={draft.email}
                          onChange={e => setDraft(d => ({ ...d, email: e.target.value }))}
                          className="text-xs text-zinc-200 bg-transparent text-right outline-none border-b border-transparent focus:border-sky-500/50 transition-colors min-w-0 flex-1 font-mono"
                          placeholder="email@exemple.com"
                        />
                      </div>
                      <div className="flex items-center justify-between py-2 px-3 bg-white/[0.03] rounded-lg border border-white/[0.06]">
                        <span className="text-xs text-zinc-500">Rôle</span>
                        <span className="text-xs font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">{prefs.role}</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="px-5 pb-5 flex gap-2">
                  <button onClick={handleClose} className="flex-1 cockpit-btn">Fermer</button>
                  <button
                    onClick={handleSave}
                    className={`flex-1 flex items-center justify-center gap-2 cockpit-btn transition-all ${
                      saved
                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
                        : 'bg-sky-500/20 border-sky-500/30 text-sky-400 hover:bg-sky-500/30'
                    }`}
                  >
                    {saved ? <><Check className="w-3.5 h-3.5" /> Enregistré</> : 'Enregistrer'}
                  </button>
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
