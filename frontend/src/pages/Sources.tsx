import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link2, Rss, Github, Code, Filter, Trash2, ExternalLink, Tag, CheckCircle, XCircle, CheckSquare, Square } from 'lucide-react';

interface Source {
  id?: number;
  name: string;
  url: string;
  type: 'rss' | 'github' | 'api';
  category: string;
  description: string;
  tags: string[];
  active: boolean;
  createdAt?: string;
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

// TODO: Add source creation UI
// const addSource = async (source: Omit<Source, 'id'>): Promise<Source> => {
//   const response = await fetch('http://localhost:8000/api/v1/sources', {
//     method: 'POST',
//     headers: { 'Content-Type': 'application/json' },
//     body: JSON.stringify(source),
//   });
//   if (!response.ok) throw new Error('Failed to add source');
//   return response.json();
// };

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

export default function Sources({ addToast }: SourcesProps) {
  const queryClient = useQueryClient();
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedSources, setSelectedSources] = useState<Set<number>>(new Set());

  const { data: sources = [], isLoading } = useQuery({
    queryKey: ['sources'],
    queryFn: fetchSources,
  });

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
  const types = ['rss', 'github', 'api'];

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
            Gérez vos sources RSS, repositories GitHub et APIs pour la veille technologique
          </p>
        </div>
        {/* <button
          onClick={() => {}}
          className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
        >
          <Plus className="h-5 w-5" />
          Ajouter une source
        </button> */}
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
    </div>
  );
}
