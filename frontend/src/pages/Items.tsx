import { useState } from 'react';
import { useItems, useClassifyItem, useDeleteItem, useGenerateCourse } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CheckCircle, Clock, FileText, Trash2, ExternalLink, Sparkles, Brain, BookOpen, CheckSquare, Square } from 'lucide-react';

interface ItemsProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number) => string;
  removeToast?: (id: string) => void;
}

export default function Items({ addToast, removeToast }: ItemsProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [generatingItemId, setGeneratingItemId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  
  const { data: items, isLoading, error } = useItems({ status: statusFilter, source: sourceFilter });
  const classifyMutation = useClassifyItem();
  const deleteMutation = useDeleteItem();
  const generateCourseMutation = useGenerateCourse();

  const toggleSelectItem = (itemId: number) => {
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) {
        newSet.delete(itemId);
      } else {
        newSet.add(itemId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items?.items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items?.items.map(i => i.id) || []));
    }
  };

  const handleClassify = async (itemId: number) => {
    try {
      await classifyMutation.mutateAsync(itemId);
      addToast?.('Item classifié avec succès !', 'success', 4000);
    } catch (error) {
      addToast?.('Erreur lors de la classification', 'error');
    }
  };

  const handleBulkClassify = async () => {
    if (selectedItems.size === 0) return;
    
    const toastId = addToast?.(`Classification de ${selectedItems.size} items...`, 'loading', 0);
    let successCount = 0;

    for (const itemId of selectedItems) {
      try {
        await classifyMutation.mutateAsync(itemId);
        successCount++;
      } catch (error) {
        console.error(error);
      }
    }

    // Remove loading toast before showing result
    if (toastId && removeToast) {
      removeToast(toastId);
    }

    addToast?.(
      `${successCount}/${selectedItems.size} items classifiés`,
      successCount === selectedItems.size ? 'success' : 'info',
      5000
    );
    setSelectedItems(new Set());
  };

  const handleGenerateCourse = async (itemId: number) => {
    if (generatingItemId !== null) {
      addToast?.('Une génération est déjà en cours', 'info');
      return;
    }
    
    setGeneratingItemId(itemId);
    const toastId = addToast?.('Génération du cours (60s)...', 'loading', 0);
    
    try {
      const result = await generateCourseMutation.mutateAsync({ itemId });
      
      // Remove loading toast before showing success
      if (toastId && removeToast) {
        removeToast(toastId);
      }
      
      const action = result.updated ? 'mis à jour' : 'créé';
      addToast?.(
        `Cours ${action} ! ($${result.cost.toFixed(4)})`,
        'success',
        6000
      );
    } catch (error: any) {
      // Remove loading toast before showing error
      if (toastId && removeToast) {
        removeToast(toastId);
      }
      
      addToast?.(`Erreur : ${error?.response?.data?.detail || 'Erreur inconnue'}`, 'error');
    } finally {
      setGeneratingItemId(null);
    }
  };

  const handleBulkGenerate = async () => {
    if (selectedItems.size === 0) return;
    
    const toastId = addToast?.(`Génération de ${selectedItems.size} cours...`, 'loading', 0);
    let successCount = 0;

    for (const itemId of selectedItems) {
      try {
        await generateCourseMutation.mutateAsync({ itemId });
        successCount++;
      } catch (error) {
        console.error(error);
      }
    }

    // Remove loading toast before showing result
    if (toastId && removeToast) {
      removeToast(toastId);
    }

    addToast?.(
      `${successCount}/${selectedItems.size} cours générés`,
      successCount === selectedItems.size ? 'success' : 'info',
      5000
    );
    setSelectedItems(new Set());
  };

  const handleDelete = async (itemId: number) => {
    try {
      await deleteMutation.mutateAsync(itemId);
      addToast?.('Item supprimé', 'success');
    } catch (error) {
      addToast?.('Erreur lors de la suppression', 'error');
    }
  };

  const handleBulkDelete = async () => {
    if (selectedItems.size === 0) return;

    const toastId = addToast?.(`Suppression de ${selectedItems.size} items...`, 'loading', 0);

    for (const itemId of selectedItems) {
      try {
        await deleteMutation.mutateAsync(itemId);
      } catch (error) {
        console.error(error);
      }
    }

    // Remove loading toast before showing result
    if (toastId && removeToast) {
      removeToast(toastId);
    }

    addToast?.(`${selectedItems.size} items supprimés`, 'success');
    setSelectedItems(new Set());
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="relative">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-200"></div>
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-primary-600 border-t-transparent absolute top-0 left-0"></div>
        </div>
        <div className="flex gap-2">
          <span className="loading-dot bg-primary-600"></span>
          <span className="loading-dot bg-primary-600"></span>
          <span className="loading-dot bg-primary-600"></span>
        </div>
        <p className="text-gray-600 text-sm animate-pulse-slow">Chargement des items...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 animate-fadeInScale">
        <p className="text-red-800">⚠️ Erreur lors du chargement des items</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Workflow Guide */}
      <div className="glass-effect rounded-xl p-5 shadow-lg border border-white/50 animate-fadeInScale">
        <div className="flex items-center gap-3 mb-3">
          <Sparkles className="h-5 w-5 text-purple-600 animate-bounce-slow" />
          <h2 className="text-lg font-semibold text-gray-900">Workflow automatisé</h2>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-700">
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-100 rounded-lg transition-smooth hover:bg-yellow-200">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="font-medium">1. Collecter</span>
          </div>
          <span className="text-gray-400">→</span>
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-100 rounded-lg transition-smooth hover:bg-blue-200">
            <Brain className="h-4 w-4 text-blue-600" />
            <span className="font-medium">2. Classifier (IA)</span>
          </div>
          <span className="text-gray-400">→</span>
          <div className="flex items-center gap-2 px-3 py-2 bg-green-100 rounded-lg transition-smooth hover:bg-green-200">
            <BookOpen className="h-4 w-4 text-green-600" />
            <span className="font-medium">3. Générer le cours</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center animate-fadeIn stagger-1">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">Items collectés</h1>
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-smooth hover:border-primary-400 bg-white shadow-sm"
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="classified">Classifiés</option>
          </select>
          
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 transition-smooth hover:border-primary-400 bg-white shadow-sm"
          >
            <option value="all">Toutes les sources</option>
            <option value="rss">RSS</option>
            <option value="github">GitHub</option>
            <option value="manual">Manuel</option>
          </select>
        </div>
      </div>

      {/* Select All Button */}
      {items && items.items.length > 0 && (
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary-600 transition-smooth btn-press px-3 py-2 rounded-lg hover:bg-gray-50"
        >
          {selectedItems.size === items.items.length ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {selectedItems.size === items.items.length ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      )}

      {/* Bulk Actions Bar */}
      {selectedItems.size > 0 && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-4 flex items-center justify-between shadow-md animate-fadeInScale glow-effect">
          <span className="text-sm font-semibold text-blue-900">
            ✨ {selectedItems.size} élément{selectedItems.size > 1 ? 's' : ''} sélectionné{selectedItems.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            {items?.items.some(item => selectedItems.has(item.id) && item.status === 'pending') && (
              <Button variant="primary" size="sm" onClick={handleBulkClassify} className="btn-press">
                <Brain className="h-4 w-4 mr-1" />
                Classifier tout
              </Button>
            )}
            {items?.items.some(item => selectedItems.has(item.id) && item.status === 'classified') && (
              <Button variant="success" size="sm" onClick={handleBulkGenerate} className="btn-press">
                <BookOpen className="h-4 w-4 mr-1" />
                Générer tout
              </Button>
            )}
            <Button variant="danger" size="sm" onClick={handleBulkDelete} className="btn-press">
              <Trash2 className="h-4 w-4 mr-1" />
              Supprimer
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedItems(new Set())} className="btn-press">
              Annuler
            </Button>
          </div>
        </div>
      )}

      {items && items.items.length === 0 ? (
        <Card className="animate-fadeInScale">
          <div className="text-center py-12">
            <FileText className="mx-auto h-16 w-16 text-gray-300 animate-pulse-slow" />
            <h3 className="mt-4 text-lg font-semibold text-gray-900">Aucun item</h3>
            <p className="mt-2 text-sm text-gray-500">
              Aucun item ne correspond aux filtres sélectionnés.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {items?.items.map((item, index) => (
            <Card key={item.id} className={`card-hover animate-fadeInScale stagger-${Math.min(index + 1, 6)}`}>
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                <button
                  onClick={() => toggleSelectItem(item.id)}
                  className="mt-1 flex-shrink-0"
                  title="Sélectionner cet item"
                >
                  {selectedItems.has(item.id) ? (
                    <CheckSquare className="h-5 w-5 text-primary-600" />
                  ) : (
                    <Square className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>

                <div className="flex items-start justify-between flex-1">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      {item.status === 'classified' ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : (
                        <Clock className="h-5 w-5 text-yellow-600" />
                      )}
                      <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                    </div>
                    
                    {item.summary && (
                      <p className="text-gray-600 mb-3 line-clamp-2">{item.summary}</p>
                    )}
                    
                    <div className="flex flex-wrap gap-2 mb-3">
                      {item.subject && (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {item.subject}
                        </span>
                      )}
                      {item.importance && (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          item.importance === 'High' ? 'bg-red-100 text-red-800' :
                          item.importance === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.importance}
                        </span>
                      )}
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {item.source_type}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-500">
                      <a 
                        href={item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-primary-600"
                      >
                        <ExternalLink className="h-4 w-4" />
                        Voir la source
                      </a>
                      {item.published_at && (
                        <span>Publié le {new Date(item.published_at).toLocaleDateString('fr-FR')}</span>
                      )}
                      {item.created_at && (
                        <span>Collecté le {new Date(item.created_at).toLocaleDateString('fr-FR')}</span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-col gap-2 ml-4">
                    {item.status === 'pending' ? (
                      <div className="flex gap-2">
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => handleClassify(item.id)}
                          isLoading={classifyMutation.isPending}
                          title="Analyser avec l'IA pour extraire le sujet et l'importance"
                          className="btn-press ripple"
                        >
                          <Brain className="h-4 w-4 mr-1" />
                          Classifier
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          isLoading={deleteMutation.isPending}
                          title="Supprimer cet item"
                          className="btn-press"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <Button
                          variant="success"
                          size="sm"
                          onClick={() => handleGenerateCourse(item.id)}
                          isLoading={generatingItemId === item.id}
                          disabled={generatingItemId !== null && generatingItemId !== item.id}
                          title="Générer un cours pédagogique complet de 5000+ mots avec RAG"
                          className={`btn-press ripple ${generatingItemId === item.id ? 'progress-bar-animated glow-effect' : ''}`}
                        >
                          <BookOpen className={`h-4 w-4 mr-1 ${generatingItemId === item.id ? 'animate-pulse' : ''}`} />
                          {generatingItemId === item.id ? 'Génération...' : 'Générer le cours'}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleDelete(item.id)}
                          isLoading={deleteMutation.isPending}
                          title="Supprimer cet item"
                          className="btn-press"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
