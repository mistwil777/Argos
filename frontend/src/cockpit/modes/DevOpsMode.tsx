// DevOpsMode — Admin-only: codebase RAG ingestion + auto-diagnostic
import { useState, useRef, useEffect } from 'react';
import { Terminal, RefreshCw, Send, FileCode, Layers, Zap, ChevronRight, AlertTriangle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

const ADMIN_TOKEN_KEY = 'veilleops_admin_token';

function getAdminToken(): string {
  return localStorage.getItem(ADMIN_TOKEN_KEY) ?? '';
}
function saveAdminToken(t: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, t);
}

// ─── API helpers ───────────────────────────────────────────────────────────────
async function fetchCodebaseStats(token: string) {
  const r = await fetch('/api/v1/admin/codebase-stats', {
    headers: { 'X-Admin-Token': token },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function triggerIngestion(token: string) {
  const r = await fetch('/api/v1/admin/ingest-codebase', {
    method: 'POST',
    headers: { 'X-Admin-Token': token },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function ragDiag(token: string, query: string): Promise<{ answer: string; sources: any[] }> {
  const r = await fetch('/api/v1/admin/rag-diag', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': token },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

// ─── Suggested queries ────────────────────────────────────────────────────────
const SUGGESTED: string[] = [
  'Liste tous les endpoints API avec leur méthode HTTP et leur route',
  'Comment fonctionne le pipeline RAG de bout en bout ?',
  'Quels services backend existent et quel est leur rôle ?',
  'Y a-t-il des bugs ou des TODOs dans le code ?',
  'Comment est gérée l\'authentification admin ?',
  'Explique l\'architecture du vector store LanceDB',
  'Quels sont les modèles de données (tables SQL) ?',
];

// ─── Chat message ─────────────────────────────────────────────────────────────
interface Msg {
  role: 'user' | 'assistant';
  content: string;
  sources?: any[];
  error?: boolean;
}

// ─── Gate — PIN input ──────────────────────────────────────────────────────────
function AdminGate({ onUnlock }: { onUnlock: (token: string) => void }) {
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError('');
    try {
      // Validate token against the backend
      await fetchCodebaseStats(pin.trim());
      saveAdminToken(pin.trim());
      onUnlock(pin.trim());
    } catch {
      setError('Token invalide ou serveur inaccessible');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
        <Terminal className="w-7 h-7 text-amber-400" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <h2 className="text-base font-semibold text-zinc-200 mb-1">Accès administrateur</h2>
        <p className="text-xs text-zinc-600 max-w-xs">
          Cette section est réservée. Entrez le token admin défini dans la variable d'environnement <code className="text-amber-400/80">ADMIN_TOKEN</code>.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 w-72">
        <div className="relative">
          <input
            type={showPin ? 'text' : 'password'}
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            placeholder="Token admin…"
            className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 pr-10 text-sm text-zinc-200 placeholder-zinc-700 focus:outline-none focus:border-amber-500/40 transition-colors"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPin(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 transition-colors"
            tabIndex={-1}
          >
            {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {error && (
          <p className="text-xs text-red-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3 shrink-0" />{error}
          </p>
        )}
        <button
          type="submit"
          disabled={loading || !pin.trim()}
          className="w-full py-2.5 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 transition-all disabled:opacity-40"
        >
          {loading ? 'Vérification…' : 'Accéder'}
        </button>
      </form>
    </div>
  );
}

// ─── Main DevOpsMode ────────────────────────────────────────────────────────────
export function DevOpsMode() {
  const [token, setToken] = useState(getAdminToken);
  const [isVerified, setIsVerified] = useState(false);
  const [tab, setTab] = useState<'ingestion' | 'diag'>('ingestion');

  // Ingestion state
  const [stats, setStats] = useState<{ chunks: number; files: number; file_list: string[] } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [ingesting, setIngesting] = useState(false);
  const [ingestMsg, setIngestMsg] = useState('');

  // Diagnostic chat state
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [answering, setAnswering] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Verify stored token on mount
  useEffect(() => {
    if (!token) return;
    fetchCodebaseStats(token)
      .then((s) => { setStats(s); setIsVerified(true); })
      .catch(() => { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(''); });
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleUnlock = (t: string) => {
    setToken(t);
    setIsVerified(true);
    loadStats(t);
  };

  const loadStats = async (t = token) => {
    setStatsLoading(true);
    try {
      const s = await fetchCodebaseStats(t);
      setStats(s);
    } catch (e: any) {
      setIngestMsg(`Erreur stats: ${e.message}`);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleIngest = async () => {
    setIngesting(true);
    setIngestMsg('');
    try {
      const r = await triggerIngestion(token);
      setIngestMsg(r.message ?? 'Ingestion lancée en arrière-plan');
      // Poll stats after a few seconds
      setTimeout(() => loadStats(), 8000);
    } catch (e: any) {
      setIngestMsg(`Erreur: ${e.message}`);
    } finally {
      setIngesting(false);
    }
  };

  const handleSend = async (query?: string) => {
    const q = (query ?? input).trim();
    if (!q || answering) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: q }]);
    setAnswering(true);
    try {
      const res = await ragDiag(token, q);
      setMessages((m) => [...m, { role: 'assistant', content: res.answer, sources: res.sources }]);
    } catch (e: any) {
      setMessages((m) => [...m, { role: 'assistant', content: e.message, error: true }]);
    } finally {
      setAnswering(false);
    }
  };

  if (!isVerified) {
    return (
      <div className="h-full flex flex-col bg-zinc-950">
        <AdminGate onUnlock={handleUnlock} />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-5 pb-4 border-b border-white/[0.05] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
          <Terminal className="w-4 h-4 text-amber-400" strokeWidth={1.5} />
        </div>
        <div>
          <h1 className="text-sm font-semibold text-zinc-200 leading-none flex items-center gap-2">
            DevOps
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 font-semibold tracking-wider">ADMIN</span>
          </h1>
          <p className="text-[11px] text-zinc-600 mt-0.5">Auto-diagnostic &amp; ingestion du code source</p>
        </div>
        <div className="ml-auto">
          <button
            onClick={() => { localStorage.removeItem(ADMIN_TOKEN_KEY); setToken(''); setIsVerified(false); }}
            className="text-[10px] text-zinc-700 hover:text-zinc-400 transition-colors"
          >
            Déconnexion
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-5 py-2 border-b border-white/[0.04] shrink-0">
        {(['ingestion', 'diag'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${tab === t ? 'bg-white/[0.08] text-zinc-200' : 'text-zinc-600 hover:text-zinc-400 hover:bg-white/[0.04]'}`}
          >
            {t === 'ingestion' ? 'Ingestion codebase' : 'Diagnostic RAG'}
          </button>
        ))}
      </div>

      {/* ── Ingestion tab ─────────────────────────────────────────────────────── */}
      {tab === 'ingestion' && (
        <div className="flex-1 overflow-y-auto scrollable p-6 flex flex-col gap-5">
          {/* Stats cards */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Fichiers indexés</p>
              <p className="text-2xl font-bold text-zinc-200 font-mono">{statsLoading ? '…' : (stats?.files ?? '—')}</p>
            </div>
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06]">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest mb-1">Chunks RAG</p>
              <p className="text-2xl font-bold text-zinc-200 font-mono">{statsLoading ? '…' : (stats?.chunks ?? '—')}</p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/15 transition-all disabled:opacity-50"
            >
              <Zap className={`w-4 h-4 ${ingesting ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              {ingesting ? 'Ingestion en cours…' : 'Ingérer le code source'}
            </button>
            <button
              onClick={() => loadStats()}
              disabled={statsLoading}
              className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-medium text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.04] border border-white/[0.06] transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${statsLoading ? 'animate-spin' : ''}`} strokeWidth={1.5} />
              Rafraîchir
            </button>
          </div>

          {ingestMsg && (
            <div className={`flex items-center gap-2 text-xs px-4 py-3 rounded-xl border ${ingestMsg.startsWith('Erreur') ? 'bg-red-500/[0.06] border-red-500/20 text-red-400' : 'bg-emerald-500/[0.06] border-emerald-500/20 text-emerald-400'}`}>
              {ingestMsg.startsWith('Erreur') ? <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
              {ingestMsg}
            </div>
          )}

          {/* File list */}
          {stats && stats.file_list.length > 0 && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <div className="px-4 py-3 bg-white/[0.02] border-b border-white/[0.04] flex items-center gap-2">
                <FileCode className="w-3.5 h-3.5 text-zinc-600" strokeWidth={1.5} />
                <span className="text-[11px] font-semibold text-zinc-500 uppercase tracking-wider">Fichiers indexés</span>
              </div>
              <div className="max-h-64 overflow-y-auto scrollable divide-y divide-white/[0.03]">
                {stats.file_list.map((f) => (
                  <div key={f} className="flex items-center gap-2 px-4 py-2">
                    <Layers className="w-2.5 h-2.5 text-zinc-700 shrink-0" />
                    <span className="text-[11px] text-zinc-500 font-mono truncate">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats?.chunks === 0 && (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
              <FileCode className="w-10 h-10 text-zinc-800" strokeWidth={1} />
              <p className="text-sm text-zinc-700">Aucun fichier indexé</p>
              <p className="text-xs text-zinc-800">Cliquez sur "Ingérer le code source" pour démarrer</p>
            </div>
          )}
        </div>
      )}

      {/* ── Diagnostic tab ────────────────────────────────────────────────────── */}
      {tab === 'diag' && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Suggested queries */}
          {messages.length === 0 && (
            <div className="p-5 flex flex-col gap-3 overflow-y-auto scrollable">
              <p className="text-[10px] font-semibold text-zinc-600 uppercase tracking-widest">Requêtes suggérées</p>
              <div className="flex flex-col gap-2">
                {SUGGESTED.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="flex items-center gap-2.5 text-left px-4 py-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-amber-500/20 hover:bg-amber-500/[0.03] transition-all group"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-zinc-700 group-hover:text-amber-400 transition-colors shrink-0" />
                    <span className="text-xs text-zinc-500 group-hover:text-zinc-300 transition-colors">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.length > 0 && (
            <div className="flex-1 overflow-y-auto scrollable p-5 flex flex-col gap-4">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-amber-500/10 text-amber-200 border border-amber-500/20'
                      : msg.error
                        ? 'bg-red-500/[0.06] text-red-400 border border-red-500/20'
                        : 'bg-white/[0.03] text-zinc-300 border border-white/[0.06]'
                  }`}>
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                    {msg.sources && msg.sources.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-col gap-1">
                        {msg.sources.slice(0, 4).map((src: any, j: number) => (
                          <span key={j} className="text-[10px] text-zinc-600 font-mono truncate">
                            [{j + 1}] {src.title ?? src.source_url ?? '—'}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {answering && (
                <div className="flex justify-start">
                  <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse [animation-delay:200ms]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse [animation-delay:400ms]" />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>
          )}

          {/* Input */}
          <div className="px-5 py-4 border-t border-white/[0.05] shrink-0">
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="flex items-end gap-3 bg-white/[0.03] border border-white/[0.07] rounded-xl px-4 py-3 focus-within:border-amber-500/30 transition-colors"
            >
              <textarea
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder="Diagnostiquer, explorer ou corriger le code…"
                className="flex-1 bg-transparent resize-none focus:outline-none text-sm text-zinc-300 placeholder-zinc-700 leading-relaxed"
                style={{ minHeight: '24px', maxHeight: '120px' }}
              />
              <button
                type="submit"
                disabled={!input.trim() || answering}
                className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/20 transition-all disabled:opacity-40 flex items-center justify-center shrink-0"
              >
                <Send className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
