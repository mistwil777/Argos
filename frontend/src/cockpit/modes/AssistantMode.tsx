// AssistantMode - Interface RAG (chat avec recherche)
import { useState } from 'react';
import { useRAGAsk } from '../../hooks/useApi';
import { Send, Settings, Sparkles } from 'lucide-react';

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
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <Sparkles className="w-16 h-16 mb-4 text-blue-300" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">Assistant RAG</h2>
              <p className="text-sm text-center max-w-md">
                Posez des questions sur vos documents. L'assistant utilise la recherche sémantique
                pour vous fournir les réponses les plus pertinentes.
              </p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <div
                key={idx}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-3xl rounded-lg px-4 py-3 ${
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  
                  {/* Sources */}
                  {msg.sources && msg.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                      <p className="text-xs font-semibold text-gray-600 uppercase">
                        Sources ({msg.sources.length})
                      </p>
                      {msg.sources.map((source, sidx) => (
                        <div
                          key={sidx}
                          className="p-2 bg-white rounded border border-gray-200 hover:border-blue-300 transition-colors cursor-pointer"
                        >
                          <p className="text-xs font-medium text-gray-900 mb-1">{source.title}</p>
                          <p className="text-xs text-gray-600 line-clamp-2">{source.chunk_text}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
          {ragMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-gray-100 rounded-lg px-4 py-3">
                <div className="flex items-center space-x-2 text-gray-500">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-100" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse delay-200" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 bg-white border-t border-gray-200">
          <div className="flex items-end space-x-3">
            <div className="flex-1">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Posez votre question..."
                rows={2}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
            </div>
            <button
              onClick={handleSend}
              disabled={!input.trim() || ragMutation.isPending}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Right Sidebar - Settings */}
      {showSettings && (
        <div className="w-80 bg-gray-50 border-l border-gray-200 p-4 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Paramètres</h3>
            <button
              onClick={() => setShowSettings(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Document spécifique
            </label>
            <select
              value={selectedCourseId || ''}
              onChange={(e) => setSelectedCourseId(e.target.value ? Number(e.target.value) : null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Tous les documents</option>
              {/* TODO: charger la liste des cours */}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Mode de recherche
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input type="checkbox" defaultChecked className="mr-2" />
                <span className="text-sm text-gray-700">Recherche hybride</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Nombre de sources (top_k)
            </label>
            <input
              type="number"
              defaultValue={5}
              min={1}
              max={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      )}

      {/* Settings Toggle Button */}
      {!showSettings && (
        <button
          onClick={() => setShowSettings(true)}
          className="absolute top-4 right-4 p-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Settings className="w-5 h-5 text-gray-600" />
        </button>
      )}
    </div>
  );
}
