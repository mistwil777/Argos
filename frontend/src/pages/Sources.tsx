import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Rss, Github, Code, Filter, Trash2, ExternalLink, Tag, CheckCircle, XCircle, CheckSquare, Square, Plus, X, FolderOpen, Globe, Bell, RefreshCw, Clock } from 'lucide-react';
import { workspacesApi } from '../services/api';

interface Source {
  id?: number;
  name: string;
  url: string;
  type: 'rss' | 'github' | 'api' | 'website';
  category: string;
  description: string;
  tags: string[];
  active: boolean;
  workspace_id?: number;
  createdAt?: string;
  // Monitor fields (website type only)
  monitor_enabled?: boolean;
  check_interval_minutes?: number;
  last_checked_at?: string;
}

interface SourcesProps {
  addToast?: (message: string, type?: 'success' | 'error' | 'info' | 'loading', duration?: number) => string;
}

// API calls
const fetchSources = async (): Promise<Source[]> => {
  const response = await fetch('http://localhost:8000/api/v1/sources');
  if (!response.ok) throw new Error('Failed to fetch sources');
  const data = await response.json();
  return data.sources || [];
};

const addSource = async (source: Omit<Source, 'id' | 'createdAt'>): Promise<{ id: number; message: string }> => {
  const response = await fetch('http://localhost:8000/api/v1/sources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...source, tags: source.tags ?? [] }),
  });
  if (!response.ok) throw new Error('Failed to add source');
  return response.json();
};

const deleteSource = async (id: number): Promise<void> => {
  const response = await fetch(`http://localhost:8000/api/v1/sources/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete source');
};

const toggleSourceActive = async (id: number, active: boolean): Promise<void> => {
  const response = await fetch(`http://localhost:8000/api/v1/sources/${id}/toggle`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active }),
  });
  if (!response.ok) throw new Error('Failed to toggle source');
};

const updateMonitorSettings = async (id: number, data: { monitor_enabled?: boolean; check_interval_minutes?: number }): Promise<void> => {
  const response = await fetch(`http://localhost:8000/api/v1/sources/${id}/monitor`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!response.ok) throw new Error('Failed to update monitor settings');
};

const triggerMonitorCheck = async (id: number): Promise<void> => {
  const response = await fetch(`http://localhost:8000/api/v1/sources/${id}/check-monitor`, {
    method: 'POST',
  });
  if (!response.ok) throw new Error('Failed to trigger monitor check');
};

export default function Sources({ addToast }: SourcesProps) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newSource, setNewSource] = useState<Omit<Source, 'id' | 'createdAt'>>({
    name: '', url: '', type: 'rss', category: '', description: '', tags: [], active: false, workspace_id: undefined,
  });

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
  });

  const { data: workspaces = [] } = useQuery({
    queryKey: ['workspaces'],
    queryFn: workspacesApi.list,
  });

  const getWorkspaceName = (wsId?: number) => {
    if (!wsId) return null;
    return workspaces.find(w => w.id === wsId)?.name ?? null;
  };

  const deleteMutation = useMutation({
    mutationFn: deleteSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      addToast?.('Source supprimée', 'success');
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      toggleSourceActive(id, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      addToast?.('Source mise à jour', 'success');
    },
  });

  const addMutation = useMutation({
    mutationFn: addSource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      addToast?.('Source ajoutée avec succès', 'success');
      setShowAddModal(false);
      setNewSource({ name: '', url: '', type: 'rss', category: '', description: '', tags: [], active: false, workspace_id: undefined, monitor_enabled: false, check_interval_minutes: 60 });
    },
    onError: () => {
      addToast?.("Erreur lors de l'ajout de la source", 'error');
    },
  });

  const monitorMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { monitor_enabled?: boolean; check_interval_minutes?: number } }) =>
      updateMonitorSettings(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] });
      addToast?.('Surveillance mise à jour', 'success');
    },
    onError: () => addToast?.('Erreur mise à jour surveillance', 'error'),
  });

  const checkMonitorMutation = useMutation({
    mutationFn: triggerMonitorCheck,
    onSuccess: () => addToast?.('Vérification lancée en arrière-plan', 'info'),
    onError: () => addToast?.('Erreur déclenchement vérification', 'error'),
  });

  const toggleSelectSource = (sourceId: number) => {
    setSelectedSources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sourceId)) {
        newSet.delete(sourceId);
      } else {
        newSet.add(sourceId);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    const sourceIds = filteredSources.map(s => s.id!).filter(id => id !== undefined);
    if (selectedSources.size === sourceIds.length) {
      setSelectedSources(new Set());
    } else {
      setSelectedSources(new Set(sourceIds));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedSources.size === 0) return;

    addToast?.(`Suppression de ${selectedSources.size} sources...`, 'loading', 0);

    for (const sourceId of selectedSources) {
      try {
        await deleteMutation.mutateAsync(sourceId);
      } catch (error) {
        console.error(error);
      }
    }

    addToast?.(`${selectedSources.size} sources supprimées`, 'success');
    setSelectedSources(new Set());
  };

  const handleBulkToggle = async (active: boolean) => {
    if (selectedSources.size === 0) return;

    addToast?.(`${active ? 'Activation' : 'Désactivation'} de ${selectedSources.size} sources...`, 'loading', 0);

    for (const sourceId of selectedSources) {
      try {
        await toggleMutation.mutateAsync({ id: sourceId, active });
      } catch (error) {
        console.error(error);
      }
    }

    addToast?.(`${selectedSources.size} sources ${active ? 'activées' : 'désactivées'}`, 'success');
    setSelectedSources(new Set());
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'rss':
        return <Rss className="h-5 w-5" />;
      case 'github':
        return <Github className="h-5 w-5" />;
      case 'api':
        return <Code className="h-5 w-5" />;
      case 'website':
        return <Globe className="h-5 w-5" />;
      default:
        return <Link2 className="h-5 w-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'rss':
        return 'bg-orange-100 text-orange-800 border-orange-200';
      case 'github':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'api':
        return 'bg-blue-100 text-blue-800 border-blue-200';
      case 'website':
        return 'bg-violet-100 text-violet-800 border-violet-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const filteredSources = sources.filter((source) => {
    if (selectedType !== 'all' && source.type !== selectedType) return false;
    if (selectedCategory !== 'all' && source.category !== selectedCategory) return false;
    return true;
  });

  const categories = Array.from(new Set(sources.map((s) => s.category)));
  const types = ['rss', 'github', 'api', 'website'];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-gray-600">Chargement des sources...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Sources de Données</h1>
          <p className="mt-2 text-gray-600">
            Gérez vos sources par espace de travail. Activez une source pour déclencher la collecte et la classification automatique.
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Ajouter une source
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Sources</p>
              <p className="mt-2 text-3xl font-bold text-gray-900">{sources.length}</p>
            </div>
            <Link2 className="h-12 w-12 text-gray-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">RSS Feeds</p>
              <p className="mt-2 text-3xl font-bold text-orange-600">
                {sources.filter((s) => s.type === 'rss').length}
              </p>
            </div>
            <Rss className="h-12 w-12 text-orange-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Repositories</p>
              <p className="mt-2 text-3xl font-bold text-gray-600">
                {sources.filter((s) => s.type === 'github').length}
              </p>
            </div>
            <Github className="h-12 w-12 text-gray-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">APIs</p>
              <p className="mt-2 text-3xl font-bold text-blue-600">
                {sources.filter((s) => s.type === 'api').length}
              </p>
            </div>
            <Code className="h-12 w-12 text-blue-400" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Sites surveillés</p>
              <p className="mt-2 text-3xl font-bold text-violet-600">
                {sources.filter((s) => s.type === 'website' && s.monitor_enabled).length}
                <span className="text-sm font-normal text-gray-500">/{sources.filter((s) => s.type === 'website').length}</span>
              </p>
            </div>
            <Bell className="h-12 w-12 text-violet-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-4">
          <Filter className="h-5 w-5 text-gray-400" />
          <div className="flex gap-4 flex-wrap">
            <div className="flex gap-2">
              <span className="text-sm font-medium text-gray-700">Type:</span>
              <button
                onClick={() => setSelectedType('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedType === 'all'
                    ? 'bg-primary-100 text-primary-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Tous
              </button>
              {types.map((type) => (
                <button
                  key={type}
                  onClick={() => setSelectedType(type)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedType === type
                      ? 'bg-primary-100 text-primary-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {type.toUpperCase()}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <span className="text-sm font-medium text-gray-700">Catégorie:</span>
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                  selectedCategory === 'all'
                    ? 'bg-primary-100 text-primary-800'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Toutes
              </button>
              {categories.slice(0, 5).map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    selectedCategory === category
                      ? 'bg-primary-100 text-primary-800'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Select All Button */}
      {filteredSources.length > 0 && (
        <button
          onClick={toggleSelectAll}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-primary-600 transition-colors"
        >
          {selectedSources.size === filteredSources.filter(s => s.id).length ? (
            <CheckSquare className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          {selectedSources.size === filteredSources.filter(s => s.id).length ? 'Tout désélectionner' : 'Tout sélectionner'}
        </button>
      )}

      {/* Bulk Actions Bar */}
      {selectedSources.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
          <span className="text-sm font-medium text-blue-900">
            {selectedSources.size} source{selectedSources.size > 1 ? 's' : ''} sélectionnée{selectedSources.size > 1 ? 's' : ''}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handleBulkToggle(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
            >
              <CheckCircle className="h-4 w-4" />
              Activer tout
            </button>
            <button
              onClick={() => handleBulkToggle(false)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              <XCircle className="h-4 w-4" />
              Désactiver tout
            </button>
            <button
              onClick={handleBulkDelete}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
            <button
              onClick={() => setSelectedSources(new Set())}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors text-sm"
            >
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Sources List */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {filteredSources.map((source) => (
          <div
            key={source.id || source.url}
            className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow border border-gray-200"
          >
            <div className="p-6">
              <div className="flex items-start gap-4">
                {/* Checkbox */}
                {source.id && (
                  <button
                    onClick={() => toggleSelectSource(source.id!)}
                    className="mt-1 flex-shrink-0"
                    title="Sélectionner cette source"
                  >
                    {selectedSources.has(source.id) ? (
                      <CheckSquare className="h-5 w-5 text-primary-600" />
                    ) : (
                      <Square className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                    )}
                  </button>
                )}

                <div className="flex items-start justify-between gap-4 flex-1">
                  <div className="flex items-start gap-3 flex-1">
                    <div
                      className={`p-2 rounded-lg border ${getTypeColor(source.type)}`}
                    >
                      {getIcon(source.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold text-gray-900 truncate">
                        {source.name}
                      </h3>
                      <p className="mt-1 text-sm text-gray-600">{source.description}</p>
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-800"
                      >
                        <ExternalLink className="h-4 w-4" />
                        {source.url.substring(0, 50)}
                        {source.url.length > 50 ? '...' : ''}
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        source.id &&
                        toggleMutation.mutate({ id: source.id, active: !source.active })
                      }
                      className={`p-2 rounded-lg transition-colors ${
                        source.active
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}
                      title={source.active ? 'Actif - Cliquez pour désactiver' : 'Inactif - Cliquez pour activer'}
                    >
                      {source.active ? (
                        <CheckCircle className="h-5 w-5" />
                      ) : (
                        <XCircle className="h-5 w-5" />
                      )}
                    </button>
                    <button
                      onClick={() => source.id && deleteMutation.mutate(source.id)}
                      className="p-2 rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
                      title="Supprimer"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(
                    source.type
                  )}`}
                >
                  {source.type.toUpperCase()}
                </span>
                {getWorkspaceName(source.workspace_id) && (
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                    <FolderOpen className="h-3 w-3" />
                    {getWorkspaceName(source.workspace_id)}
                  </span>
                )}
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
                  {source.category}
                </span>
                {source.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200"
                  >
                    <Tag className="h-3 w-3" />
                    {tag}
                  </span>
                ))}
                {source.tags.length > 3 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                    +{source.tags.length - 3}
                  </span>
                )}
              </div>

              {/* Monitor panel — website type only */}
              {source.type === 'website' && source.id && (
                <div className={`mt-4 rounded-lg border p-3 ${
                  source.monitor_enabled
                    ? 'bg-violet-50 border-violet-200'
                    : 'bg-gray-50 border-gray-200'
                }`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Bell className={`h-4 w-4 ${source.monitor_enabled ? 'text-violet-600' : 'text-gray-400'}`} />
                      <span className="text-xs font-semibold text-gray-700">Surveillance de contenu</span>
                      {source.monitor_enabled && (
                        <span className="px-1.5 py-0.5 rounded text-xs bg-violet-100 text-violet-700 font-medium">Actif</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {source.monitor_enabled && (
                        <button
                          onClick={() => source.id && checkMonitorMutation.mutate(source.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-violet-300 text-violet-700 rounded hover:bg-violet-50 transition-colors"
                          title="Vérifier maintenant"
                          disabled={checkMonitorMutation.isPending}
                        >
                          <RefreshCw className="h-3 w-3" />
                          Vérifier
                        </button>
                      )}
                      <button
                        onClick={() => source.id && monitorMutation.mutate({
                          id: source.id,
                          data: { monitor_enabled: !source.monitor_enabled },
                        })}
                        className={`text-xs px-2 py-1 rounded border transition-colors ${
                          source.monitor_enabled
                            ? 'bg-white border-violet-300 text-violet-700 hover:bg-violet-50'
                            : 'bg-violet-600 border-transparent text-white hover:bg-violet-700'
                        }`}
                      >
                        {source.monitor_enabled ? 'Désactiver' : 'Activer'}
                      </button>
                    </div>
                  </div>
                  {source.monitor_enabled && (
                    <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Intervalle :
                        <select
                          value={source.check_interval_minutes ?? 60}
                          onChange={(e) => source.id && monitorMutation.mutate({
                            id: source.id,
                            data: { check_interval_minutes: Number(e.target.value) },
                          })}
                          className="ml-1 border border-gray-300 rounded px-1 py-0.5 text-xs bg-white"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <option value={15}>15 min</option>
                          <option value={30}>30 min</option>
                          <option value={60}>1h</option>
                          <option value={180}>3h</option>
                          <option value={360}>6h</option>
                          <option value={720}>12h</option>
                          <option value={1440}>24h</option>
                        </select>
                      </div>
                      {source.last_checked_at && (
                        <span>Dernière vérif : {new Date(source.last_checked_at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                      )}
                      {!source.last_checked_at && <span className="italic">Pas encore vérifié</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {filteredSources.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Link2 className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">Aucune source trouvée</h3>
          <p className="mt-2 text-sm text-gray-600">
            Essayez de modifier vos filtres ou ajoutez une nouvelle source.
          </p>
        </div>
      )}

      {/* Add Source Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-5">
                <h2 className="text-xl font-bold text-gray-900">Ajouter une source</h2>
                <button onClick={() => setShowAddModal(false)} className="p-1 hover:bg-gray-100 rounded">
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>

              <form
                onSubmit={(e) => { e.preventDefault(); addMutation.mutate(newSource); }}
                className="space-y-4"
              >
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom *</label>
                  <input
                    type="text"
                    required
                    value={newSource.name}
                    onChange={(e) => setNewSource({ ...newSource, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder="Ex: Hacker News, ArXiv AI..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">URL *</label>
                  <input
                    type="url"
                    required
                    value={newSource.url}
                    onChange={(e) => setNewSource({ ...newSource, url: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder="https://example.com/feed.xml"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type *</label>
                    <select
                      value={newSource.type}
                      onChange={(e) => setNewSource({ ...newSource, type: e.target.value as any })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="rss">RSS</option>
                      <option value="github">GitHub</option>
                      <option value="api">API</option>
                      <option value="website">Site web (surveillance)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Catégorie *</label>
                    <input
                      type="text"
                      required
                      value={newSource.category}
                      onChange={(e) => setNewSource({ ...newSource, category: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                      placeholder="ia, tech, finance..."
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Espace de travail</label>
                  <select
                    value={newSource.workspace_id ?? ''}
                    onChange={(e) => setNewSource({ ...newSource, workspace_id: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                  >
                    <option value="">Aucun espace (global)</option>
                    {workspaces.map(ws => (
                      <option key={ws.id} value={ws.id}>{ws.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newSource.description}
                    onChange={(e) => setNewSource({ ...newSource, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder="Brève description de la source..."
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="active-toggle"
                    checked={newSource.active}
                    onChange={(e) => setNewSource({ ...newSource, active: e.target.checked })}
                    className="h-4 w-4 text-primary-600 rounded border-gray-300"
                  />
                  <label htmlFor="active-toggle" className="text-sm text-gray-700">
                    Activer immédiatement (déclenche la collecte au prochain cycle)
                  </label>
                </div>

                {newSource.type === 'website' && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 space-y-3">
                    <p className="text-xs font-semibold text-violet-800">Surveillance de contenu</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="monitor-toggle"
                        checked={!!newSource.monitor_enabled}
                        onChange={(e) => setNewSource({ ...newSource, monitor_enabled: e.target.checked })}
                        className="h-4 w-4 text-violet-600 rounded border-gray-300"
                      />
                      <label htmlFor="monitor-toggle" className="text-sm text-gray-700">
                        Activer la surveillance (notifie via Teams si nouveau contenu)
                      </label>
                    </div>
                    {newSource.monitor_enabled && (
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Intervalle de vérification</label>
                        <select
                          value={newSource.check_interval_minutes ?? 60}
                          onChange={(e) => setNewSource({ ...newSource, check_interval_minutes: Number(e.target.value) })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-violet-500"
                        >
                          <option value={15}>Toutes les 15 minutes</option>
                          <option value={30}>Toutes les 30 minutes</option>
                          <option value={60}>Toutes les heures</option>
                          <option value={180}>Toutes les 3 heures</option>
                          <option value={360}>Toutes les 6 heures</option>
                          <option value={1440}>Une fois par jour</option>
                        </select>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={addMutation.isPending}
                    className="flex-1 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 text-sm font-medium"
                  >
                    {addMutation.isPending ? 'Ajout...' : 'Ajouter la source'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
