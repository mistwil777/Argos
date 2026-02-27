import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { 
  FolderOpen, Plus, Edit2, Trash2, Database, Briefcase, 
  FileText, Code, Scale, TrendingUp, Clock, X 
} from 'lucide-react';
import type { Workspace, WorkspaceCreate } from '../types';

// Available icons for workspaces
const WORKSPACE_ICONS = [
  { name: 'folder', icon: FolderOpen, label: 'Dossier' },
  { name: 'database', icon: Database, label: 'Base de données' },
  { name: 'briefcase', icon: Briefcase, label: 'Business' },
  { name: 'file-text', icon: FileText, label: 'Documents' },
  { name: 'code', icon: Code, label: 'Technique' },
  { name: 'scale', icon: Scale, label: 'Juridique' },
  { name: 'trending-up', icon: TrendingUp, label: 'Finance' },
];

// Predefined colors
const WORKSPACE_COLORS = [
  '#3B82F6', // Blue
  '#8B5CF6', // Purple
  '#10B981', // Green
  '#F59E0B', // Orange
  '#EF4444', // Red
  '#06B6D4', // Cyan
  '#EC4899', // Pink
  '#6366F1', // Indigo
];

// API Functions
const fetchWorkspaces = async (): Promise<Workspace[]> => {
  const response = await fetch('http://localhost:8000/api/v1/workspaces?include_stats=true');
  if (!response.ok) throw new Error('Failed to fetch workspaces');
  return response.json();
};

const createWorkspace = async (workspace: WorkspaceCreate): Promise<Workspace> => {
  const response = await fetch('http://localhost:8000/api/v1/workspaces', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(workspace),
  });
  if (!response.ok) throw new Error('Failed to create workspace');
  return response.json();
};

const updateWorkspace = async (id: number, update: Partial<Workspace>): Promise<Workspace> => {
  const response = await fetch(`http://localhost:8000/api/v1/workspaces/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });
  if (!response.ok) throw new Error('Failed to update workspace');
  return response.json();
};

const deleteWorkspace = async (id: number, force: boolean = false): Promise<void> => {
  const response = await fetch(`http://localhost:8000/api/v1/workspaces/${id}?force=${force}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete workspace');
};

// Main Component
export function Workspaces() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [formData, setFormData] = useState<WorkspaceCreate>({
    name: '',
    description: '',
    domain: '',
    icon: 'folder',
    color: '#3B82F6',
  });

  // Queries
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });

  // Mutations
  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setShowModal(false);
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, update }: { id: number; update: Partial<Workspace> }) =>
      updateWorkspace(id, update),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      setShowModal(false);
      setEditingWorkspace(null);
      resetForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteWorkspace(id, false),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
    },
  });

  // Handlers
  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      domain: '',
      icon: 'folder',
      color: '#3B82F6',
    });
    setEditingWorkspace(null);
  };

  const handleOpenModal = (workspace?: Workspace) => {
    if (workspace) {
      setEditingWorkspace(workspace);
      setFormData({
        name: workspace.name,
        description: workspace.description || '',
        domain: workspace.domain || '',
        icon: workspace.icon,
        color: workspace.color,
      });
    } else {
      resetForm();
    }
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWorkspace) {
      updateMutation.mutate({ id: editingWorkspace.id, update: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDelete = (id: number) => {
    if (confirm('Êtes-vous sûr de vouloir désactiver cet espace ?')) {
      deleteMutation.mutate(id);
    }
  };

  const getIconComponent = (iconName: string) => {
    const iconConfig = WORKSPACE_ICONS.find(i => i.name === iconName);
    return iconConfig ? iconConfig.icon : FolderOpen;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Espaces de Travail</h1>
          <p className="text-gray-600 mt-1">
            Organisez votre veille par domaines et projets
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel Espace
        </Button>
      </div>

      {/* Workspaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces?.map((workspace) => {
          const IconComponent = getIconComponent(workspace.icon);
          return (
            <Card key={workspace.id} className="hover:shadow-lg transition-shadow">
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="p-3 rounded-lg"
                      style={{ backgroundColor: `${workspace.color}20` }}
                    >
                      <IconComponent
                        className="h-6 w-6"
                        style={{ color: workspace.color }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">
                        {workspace.name}
                      </h3>
                      {workspace.domain && (
                        <span className="text-xs text-gray-500 uppercase">
                          {workspace.domain}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleOpenModal(workspace)}
                      className="p-1 hover:bg-gray-100 rounded"
                      title="Modifier"
                    >
                      <Edit2 className="h-4 w-4 text-gray-500" />
                    </button>
                    {workspace.id !== 1 && (
                      <button
                        onClick={() => handleDelete(workspace.id)}
                        className="p-1 hover:bg-red-100 rounded"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Description */}
                {workspace.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">
                    {workspace.description}
                  </p>
                )}

                {/* Stats */}
                {workspace.stats && (
                  <div className="mt-auto pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {workspace.stats.sources_count}
                        </div>
                        <div className="text-xs text-gray-500">Sources</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {workspace.stats.items_count}
                        </div>
                        <div className="text-xs text-gray-500">Items</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-900">
                          {workspace.stats.knowledge_items_count}
                        </div>
                        <div className="text-xs text-gray-500">Documents</div>
                      </div>
                    </div>
                    {workspace.stats.latest_item_date && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>
                          Dernière activité:{' '}
                          {new Date(workspace.stats.latest_item_date).toLocaleDateString('fr-FR')}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold">
                {editingWorkspace ? 'Modifier l\'Espace' : 'Nouvel Espace de Travail'}
              </h2>
              <button
                onClick={() => {
                  setShowModal(false);
                  resetForm();
                }}
                className="p-1 hover:bg-gray-100 rounded"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nom de l'espace *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Ex: Veille Juridique"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Décrivez l'objectif de cet espace..."
                />
              </div>

              {/* Domain */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Domaine
                </label>
                <input
                  type="text"
                  value={formData.domain}
                  onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Ex: legal, tech, finance"
                />
              </div>

              {/* Icon */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Icône
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {WORKSPACE_ICONS.map((iconConfig) => {
                    const IconComp = iconConfig.icon;
                    return (
                      <button
                        key={iconConfig.name}
                        type="button"
                        onClick={() => setFormData({ ...formData, icon: iconConfig.name })}
                        className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 hover:bg-gray-50 transition-colors ${
                          formData.icon === iconConfig.name
                            ? 'border-primary-500 bg-primary-50'
                            : 'border-gray-200'
                        }`}
                      >
                        <IconComp className="h-6 w-6" />
                        <span className="text-xs">{iconConfig.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Couleur
                </label>
                <div className="grid grid-cols-8 gap-2">
                  {WORKSPACE_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormData({ ...formData, color })}
                      className={`w-10 h-10 rounded-lg border-2 transition-all ${
                        formData.color === color
                          ? 'border-gray-900 scale-110'
                          : 'border-gray-200'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setShowModal(false);
                    resetForm();
                  }}
                  className="flex-1"
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  className="flex-1"
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editingWorkspace ? 'Modifier' : 'Créer'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
