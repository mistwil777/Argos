import { useState } from 'react';
import { useRAGAsk, useRAGHistory, useClearRAGHistory } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { MessageSquare, Send, Clock, Trash2 } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface RAGProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number) => string;
}

export default function RAG({ addToast }: RAGProps) {
  const [query, setQuery] = useState('');
  const [hybridSearch, setHybridSearch] = useState(true);
  
  const { data: history } = useRAGHistory();
  const askMutation = useRAGAsk();
  const clearHistoryMutation = useClearRAGHistory();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    
    await askMutation.mutateAsync({ query, useHybridSearch: hybridSearch });
    setQuery('');
  };

  const handleClearHistory = async () => {
    const count = history?.length || 0;
    await clearHistoryMutation.mutateAsync();
    addToast?.(`Historique effacé (${count} entrées)`, 'success');
  };

  return (
    <div className="h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Assistant RAG</h1>
        <p className="text-gray-600">Posez des questions sur le contenu collecté</p>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
        {/* Chat Area */}
        <div className="lg:col-span-2 flex flex-col">
          <Card className="flex-1 flex flex-col">
            <div className="flex-1 overflow-y-auto mb-4 space-y-4">
              {history && history.length > 0 ? (
                history.map((item) => (
                  <div key={item.id} className="space-y-2">
                    {/* User Question */}
                    <div className="flex justify-end">
                      <div className="bg-primary-100 rounded-lg px-4 py-2 max-w-[80%]">
                        <p className="text-gray-900">{item.query}</p>
                        {item.created_at && (
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(item.created_at).toLocaleString('fr-FR')}
                          </p>
                        )}
                      </div>
                    </div>
                    
                    {/* Assistant Answer */}
                    <div className="flex justify-start">
                      <div className="bg-gray-100 rounded-lg px-4 py-2 max-w-[80%]">
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown>{item.answer}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500">
                  <div className="text-center">
                    <MessageSquare className="mx-auto h-12 w-12 text-gray-300 mb-4" />
                    <p>Aucune conversation pour le moment</p>
                    <p className="text-sm mt-2">Posez une question pour commencer</p>
                  </div>
                </div>
              )}
              
              {/* Loading State */}
              {askMutation.isPending && (
                <div className="flex justify-start">
                  <div className="bg-gray-100 rounded-lg px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-600"></div>
                      <span className="text-gray-600">En cours de réflexion...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-2">
              <div className="flex-1 flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Posez votre question..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                  disabled={askMutation.isPending}
                />
                <label className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg cursor-pointer hover:bg-gray-100">
                  <input
                    type="checkbox"
                    checked={hybridSearch}
                    onChange={(e) => setHybridSearch(e.target.checked)}
                    className="rounded text-primary-600 focus:ring-primary-500"
                  />
                  <span className="text-sm text-gray-700">Hybride</span>
                </label>
              </div>
              <Button
                type="submit"
                variant="primary"
                isLoading={askMutation.isPending}
                disabled={!query.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </Card>
        </div>

        {/* Sidebar - Recent Queries */}
        <div className="lg:col-span-1">
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Historique récent</h3>
              {history && history.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearHistory}
                  disabled={clearHistoryMutation.isPending}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <div className="space-y-3">
              {history && history.length > 0 ? (
                history.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                    onClick={() => setQuery(item.query)}
                  >
                    <p className="text-sm text-gray-900 line-clamp-2">{item.query}</p>
                    {item.created_at && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        {new Date(item.created_at).toLocaleDateString('fr-FR')}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-4">
                  Aucun historique
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
