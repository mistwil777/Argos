import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useItems, useClassifyItem, useDeleteItem, useGenerateCourse } from '../hooks/useApi';
import { workspacesApi } from '../services/api';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  CheckCircle, Clock, FileText, Trash2, ExternalLink, Sparkles,
  Brain, BookOpen, CheckSquare, Square, X, FolderOpen, FileDown,
  ChevronRight, Zap, AlertCircle
} from 'lucide-react';

interface ItemsProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number) => string;
  removeToast?: (id: string) => void;
}

const CONTENT_TYPES = [
  { value: 'course', label: 'Cours pédagogique', icon: BookOpen, desc: 'Formation structurée 180+ min' },
  { value: 'synthesis', label: 'Synthèse Markdown', icon: FileText, desc: 'Résumé structuré exportable' },
  { value: 'report', label: 'Rapport PDF', icon: FileDown, desc: 'Document exportable au format PDF' },
];

export default function Items({ addToast, removeToast }: ItemsProps) {
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [generatingItemId, setGeneratingItemId] = useState<number | null>(null);
  const [selectedItems, setSelectedItems] = useState<Set<number>>(new Set());
  const [activeItem, setActiveItem] = useState<any | null>(null);
  const [contentType, setContentType] = useState('course');

  const workspaceId = workspaceFilter !== 'all' ? Number(workspaceFilter) : undefined;
  const { data: items, isLoading, error } = useItems({
    status: statusFilter,
    source: sourceFilter,
    workspace_id: workspaceId,
  });
  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  });
  const classifyMutation = useClassifyItem();
  const deleteMutation = useDeleteItem();
  const generateCourseMutation = useGenerateCourse();

  const getWorkspaceName = (wsId?: number) => {
    if (!wsId || !workspaces) return null;
    return workspaces.find(w => w.id === wsId)?.name ?? null;
  };

  const toggleSelectItem = (itemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedItems(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemId)) newSet.delete(itemId);
      else newSet.add(itemId);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items?.items.length) setSelectedItems(new Set());
    else setSelectedItems(new Set(items?.items.map(i => i.id) || []));
  };

  const handleAutoClassifyPending = async () => {
    const pendingItems = items?.items.filter(i => i.classification_status === 'pending') ?? [];
    if (pendingItems.length === 0) return;
    const toastId = addToast?.(`Classification automatique de ${pendingItems.length} items...`, 'loading', 0);
    let successCount = 0;
    for (const item of pendingItems) {
      try {
        await classifyMutation.mutateAsync(item.id);
        successCount++;
      } catch (error) {
        console.error(error);
      }
    }
    if (toastId && removeToast) removeToast(toastId);
    addToast?.(
      `${successCount}/${pendingItems.length} items classifiés`,
      successCount === pendingItems.length ? 'success' : 'info',
      5000
    );
  };

  const handleGenerateDocument = async () => {
    if (!activeItem || generatingItemId !== null) return;
    setGeneratingItemId(activeItem.id);
    const toastId = addToast?.('Génération du document en cours...', 'loading', 0);
    try {
      const result = await generateCourseMutation.mutateAsync({ itemId: activeItem.id, contentType });
      if (toastId && removeToast) removeToast(toastId);
      const action = result.updated ? 'mis à jour' : 'généré';
      addToast?.(`Document ${action} ! ($${result.cost.toFixed(4)})`, 'success', 6000);
    } catch (error: any) {
      if (toastId && removeToast) removeToast(toastId);
      addToast?.(`Erreur : ${error?.response?.data?.detail || 'Erreur inconnue'}`, 'error');
    } finally {
      setGeneratingItemId(null);
    }
  };

  const handleDelete = async (itemId: number) => {
    try {
      await deleteMutation.mutateAsync(itemId);
      addToast?.('Item supprimé', 'success');
      if (activeItem?.id === itemId) setActiveItem(null);
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
    if (toastId && removeToast) removeToast(toastId);
    addToast?.(`${selectedItems.size} items supprimés`, 'success');
    if (activeItem && selectedItems.has(activeItem.id)) setActiveItem(null);
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

  const pendingCount = items?.items.filter(i => i.classification_status === 'pending').length ?? 0;

  return (
    <div className="flex gap-6 h-full animate-fadeIn">
      {/* LEFT: Items list */}
      <div className={`flex flex-col space-y-4 transition-all ${activeItem ? 'w-[55%]' : 'w-full'}`}>

        {/* Header + Filters */}
        <div className="flex items-center justify-between flex-wrap gap-3 animate-fadeIn stagger-1">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent">
            Flux de veille
          </h1>
          <div className="flex gap-2 flex-wrap">
            <select
              value={workspaceFilter}
              onChange={(e) => setWorkspaceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white shadow-sm"
            >
              <option value="all">Tous les espaces</option>
              {workspaces?.map(ws => (
                <option key={ws.id} value={ws.id}>{ws.name}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white shadow-sm"
            >
              <option value="all">Tous les statuts</option>
              <option value="classified">Classifiés</option>
              <option value="pending">En traitement</option>
            </select>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white shadow-sm"
            >
              <option value="all">Toutes les sources</option>
              <option value="rss">RSS</option>
              <option value="github">GitHub</option>
              <option value="manual">Manuel</option>
            </select>
          </div>
        </div>

        {/* Pending items auto-classify banner */}
        {pendingCount > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between animate-fadeInScale">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <span className="text-sm text-amber-800 font-medium">
                {pendingCount} item{pendingCount > 1 ? 's' : ''} en attente de classification automatique
              </span>
            </div>
            <Button size="sm" variant="secondary" onClick={handleAutoClassifyPending} className="btn-press">
              <Brain className="h-4 w-4 mr-1" />
              Classifier maintenant
            </Button>
          </div>
        )}

        {/* Select All + Bulk Actions */}
        {items && items.items.length > 0 && (
          <div className="flex items-center gap-3">
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
            {selectedItems.size > 0 && (
              <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 animate-fadeInScale">
                <span className="text-sm font-medium text-blue-800">
                  {selectedItems.size} sélectionné{selectedItems.size > 1 ? 's' : ''}
                </span>
                <Button variant="danger" size="sm" onClick={handleBulkDelete} className="btn-press">
                  <Trash2 className="h-3 w-3 mr-1" /> Supprimer
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedItems(new Set())} className="btn-press">
                  Annuler
                </Button>
              </div>
            )}
          </div>
        )}

        {/* Items */}
        {items && items.items.length === 0 ? (
          <Card className="animate-fadeInScale">
            <div className="text-center py-12">
              <FileText className="mx-auto h-16 w-16 text-gray-300 animate-pulse-slow" />
              <h3 className="mt-4 text-lg font-semibold text-gray-900">Aucun item</h3>
              <p className="mt-2 text-sm text-gray-500">
                Créez un espace de travail, ajoutez des sources et activez-les pour voir les items apparaître ici.
              </p>
            </div>
          </Card>
        ) : (
          <div className="space-y-2">
            {items?.items.map((item, index) => (
              <div
                key={item.id}
                onClick={() => setActiveItem(item)}
                className={`bg-white rounded-xl border transition-all cursor-pointer hover:shadow-md animate-fadeInScale stagger-${Math.min(index + 1, 6)} ${
                  activeItem?.id === item.id
                    ? 'border-primary-400 shadow-md ring-2 ring-primary-200'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <div className="p-4 flex items-start gap-3">
                  {/* Checkbox */}
                  <button
                    onClick={(e) => toggleSelectItem(item.id, e)}
                    className="mt-0.5 flex-shrink-0"
                    title="Sélectionner cet item"
                  >
                    {selectedItems.has(item.id) ? (
                      <CheckSquare className="h-4 w-4 text-primary-600" />
                    ) : (
                      <Square className="h-4 w-4 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>

                  {/* Status icon */}
                  <div className="mt-0.5 flex-shrink-0">
                    {item.classification_status === 'classified' ? (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    ) : (
                      <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-gray-900 line-clamp-1 mb-1">{item.title}</h3>
                    {item.summary && (
                      <p className="text-sm text-gray-500 line-clamp-2 mb-2">{item.summary}</p>
                    )}
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {getWorkspaceName(item.workspace_id) && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                          <FolderOpen className="h-3 w-3" />
                          {getWorkspaceName(item.workspace_id)}
                        </span>
                      )}
                      {item.subject && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {item.subject}
                        </span>
                      )}
                      {item.importance && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          item.importance === 'High' ? 'bg-red-100 text-red-800' :
                          item.importance === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                          'bg-green-100 text-green-800'
                        }`}>
                          {item.importance}
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        {item.source_type}
                      </span>
                    </div>
                  </div>

                  <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0 mt-1" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* RIGHT: Item Detail Panel */}
      {activeItem && (
        <div className="w-[45%] min-w-[360px] flex-shrink-0 sticky top-0 h-fit animate-fadeInScale">
          <Card className="border-primary-100 shadow-lg">
            {/* Panel header */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                {activeItem.classification_status === 'classified' ? (
                  <>
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm font-medium text-green-700">Classifié</span>
                  </>
                ) : (
                  <>
                    <Clock className="h-4 w-4 text-amber-500 animate-pulse" />
                    <span className="text-sm font-medium text-amber-700">En traitement</span>
                  </>
                )}
              </div>
              <button
                onClick={() => setActiveItem(null)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>

            {/* Title */}
            <h2 className="text-lg font-semibold text-gray-900 mb-3 leading-snug">{activeItem.title}</h2>

            {/* Badges */}
            <div className="flex flex-wrap gap-2 mb-4">
              {getWorkspaceName(activeItem.workspace_id) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
                  <FolderOpen className="h-3 w-3" />
                  {getWorkspaceName(activeItem.workspace_id)}
                </span>
              )}
              {activeItem.subject && (
                <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                  {activeItem.subject}
                </span>
              )}
              {activeItem.importance && (
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                  activeItem.importance === 'High' ? 'bg-red-100 text-red-800' :
                  activeItem.importance === 'Medium' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-green-100 text-green-800'
                }`}>
                  {activeItem.importance === 'High' ? '🔴 Haute priorité' :
                   activeItem.importance === 'Medium' ? '🟡 Priorité moyenne' : '🟢 Faible priorité'}
                </span>
              )}
            </div>

            {/* Summary */}
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Résumé</h4>
              {activeItem.summary ? (
                <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-lg p-3">
                  {activeItem.summary}
                </p>
              ) : (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm text-amber-700">
                    Classification automatique en cours. Le résumé sera disponible sous peu.
                  </p>
                </div>
              )}
            </div>

            {/* Meta */}
            <div className="flex flex-col gap-1.5 text-xs text-gray-500 mb-4">
              <a
                href={activeItem.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary-600 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="h-3 w-3" />
                Voir la source originale
              </a>
              {activeItem.published_at && (
                <span>Publié le {new Date(activeItem.published_at).toLocaleDateString('fr-FR')}</span>
              )}
              {activeItem.created_at && (
                <span>Collecté le {new Date(activeItem.created_at).toLocaleDateString('fr-FR')}</span>
              )}
            </div>

            {/* Generate Document — only for classified items */}
            {activeItem.classification_status === 'classified' && (
              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  Générer un document
                </h4>
                <div className="space-y-2 mb-4">
                  {CONTENT_TYPES.map(ct => (
                    <button
                      key={ct.value}
                      onClick={() => setContentType(ct.value)}
                      className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        contentType === ct.value
                          ? 'border-primary-500 bg-primary-50'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}
                    >
                      <ct.icon className={`h-5 w-5 flex-shrink-0 ${contentType === ct.value ? 'text-primary-600' : 'text-gray-400'}`} />
                      <div>
                        <div className="text-sm font-medium text-gray-800">{ct.label}</div>
                        <div className="text-xs text-gray-500">{ct.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <Button
                  variant="primary"
                  className="w-full btn-press ripple"
                  onClick={handleGenerateDocument}
                  isLoading={generatingItemId === activeItem.id}
                  disabled={generatingItemId !== null}
                >
                  <Zap className="h-4 w-4 mr-2" />
                  {generatingItemId === activeItem.id ? 'Génération en cours...' : 'Générer'}
                </Button>
              </div>
            )}

            {/* Delete */}
            <div className={`${activeItem.classification_status === 'classified' ? 'border-t border-gray-100 pt-3 mt-3' : 'mt-4'}`}>
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                onClick={() => handleDelete(activeItem.id)}
                isLoading={deleteMutation.isPending}
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Supprimer cet item
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
