// AssistantMode - Interface RAG (chat avec recherche)
import { useState } from 'react';
import { useRAGAsk } from '../../hooks/useApi';
import { Send, Settings, Sparkles, X, ExternalLink } from 'lucide-react';
import { Preloader } from '../components/Preloader';
import { useCockpit } from '../context/CockpitContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Array<{
    course_id: number;
    title: string;
    chunk_text: string;
    _distance?: number;
  }>;
}

export function AssistantMode() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [selectedCourseId, setSelectedCourseId] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  
  const ragMutation = useRAGAsk();
  const { setActiveMode, setSelectedDocId, setInspectorOpen } = useCockpit();

  const openSource = (courseId: number) => {
    setSelectedDocId(courseId);
    setActiveMode('production');
    setInspectorOpen(true);
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');

    try {
      const response = await ragMutation.mutateAsync({
        query: input,
        useHybridSearch: true,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.answer || 'Aucune réponse disponible.',
        sources: response.sources,
      };
      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      const errorMessage: Message = {
        role: 'assistant',
        content: 'Désolé, une erreur est survenue.',
      };
      setMessages(prev => [...prev, errorMessage]);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-full flex">
      {/* Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat toolbar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-white/[0.04] shrink-0">
          <span className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">Chat RAG</span>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition-all ${
              showSettings
                ? 'bg-sky-500/12 text-sky-400'
                : 'text-zinc-600 hover:text-zinc-300 hover:bg-white/[0.05]'
            }`}
            title="Paramètres RAG"
          >
            {showSettings ? <X className="w-3.5 h-3.5" /> : <Settings className="w-3.5 h-3.5" strokeWidth={1.5} />}
          </button>
        </div>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto scrollable p-5 flex flex-col gap-5">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-zinc-600" strokeWidth={1.5} />
              </div>
              <div className="text-center">
                <h2 className="text-sm font-medium text-zinc-400 mb-1">Chat RAG</h2>
                <p className="text-xs text-zinc-700 max-w-sm leading-relaxed">
                  Posez des questions sur vos documents. L'assistant utilise la recherche sémantique
                  pour vous fournir les réponses les plus pertinentes.
                </p>
              </div>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${ msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[80%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-sky-500/15 text-zinc-200 border border-sky-500/20'
                      : 'bg-white/[0.04] text-zinc-300 border border-white/[0.06]'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-white/[0.06] flex flex-col gap-1.5">
                      <p className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">
                        Sources ({msg.sources.length})
                      </p>
                      {msg.sources.map((source, sidx) => (
                        <button
                          key={sidx}
                          onClick={() => openSource(source.course_id)}
                          className="text-left p-2 bg-white/[0.03] rounded-lg border border-white/[0.06] hover:border-sky-500/30 hover:bg-sky-500/[0.04] transition-colors group"
                        >
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <ExternalLink className="w-3 h-3 text-zinc-700 group-hover:text-sky-500/70 shrink-0" strokeWidth={1.5} />
                            <p className="text-xs font-medium text-zinc-300 group-hover:text-sky-300 truncate">{source.title}</p>
                          </div>
                          <p className="text-xs text-zinc-600 line-clamp-2">{source.chunk_text}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {ragMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl px-4 py-3">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse" />
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse [animation-delay:0.1s]" />
                  <div className="w-1.5 h-1.5 bg-zinc-600 rounded-full animate-pulse [animation-delay:0.2s]" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-white/[0.06]">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Posez votre question..."
                rows={2}
                className="w-full px-4 py-3 bg-white/[0.04] border border-white/[0.08] rounded-xl resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 text-sm text-zinc-200 placeholder-zinc-700 transition-colors"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || ragMutation.isPending}
              className="cockpit-btn cockpit-btn-primary px-4 py-3 self-end"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Settings */}
      {showSettings && (
        <div className="w-72 bg-zinc-950 border-l border-white/[0.06] p-5 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider">Paramètres RAG</h3>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">
              Document spécifique
            </label>
            <select
              value={selectedCourseId || ''}
              onChange={(e) => setSelectedCourseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            >
              <option value="">Tous les documents</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">
              Mode de recherche
            </label>
            <div className="flex flex-col gap-1.5">
              <label className="flex items-center gap-2 text-sm text-zinc-500">
                <input type="checkbox" defaultChecked className="accent-sky-500" />
                Recherche hybride
              </label>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600 mb-2">
              Nombre de sources (top_k)
            </label>
            <input
              type="number"
              defaultValue={5}
              min={1}
              max={10}
              className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-sky-500/50"
            />
          </div>
        </div>
      )}

      {/* Loading Animation */}
      {ragMutation.isPending && <Preloader message="Recherche en cours" />}
    </div>
  );
}
