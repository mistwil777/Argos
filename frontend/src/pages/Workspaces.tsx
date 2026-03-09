import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import {
  FolderOpen, Plus, Edit2, Trash2, Database, Briefcase,
  FileText, Code, Scale, TrendingUp, Clock, X, Rss, Github,
  Sparkles, Check, ChevronRight, Link2, Loader2, PlayCircle
} from 'lucide-react';
import type { Workspace, WorkspaceCreate } from '../types';
import { sourcesApi } from '../services/api';

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

const WORKSPACE_COLORS = [
  '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B',
  '#EF4444', '#06B6D4', '#EC4899', '#6366F1',
];

// Curated source suggestions by domain keyword
const DOMAIN_SOURCES: Record<string, SuggestedSource[]> = {
  tech: [
    { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', type: 'rss', category: 'tech', description: 'Actualités tech et startups' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', category: 'tech', description: 'Actualités technologie grand public' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/', type: 'rss', category: 'tech', description: 'Startups et innovation' },
    { name: 'MIT Technology Review', url: 'https://www.technologyreview.com/feed/', type: 'rss', category: 'tech', description: 'Recherche et technologie avancée' },
  ],
  ia: [
    { name: 'ArXiv AI', url: 'http://export.arxiv.org/rss/cs.AI', type: 'rss', category: 'ia', description: 'Prépublications en IA' },
    { name: 'Toward Data Science', url: 'https://towardsdatascience.com/feed', type: 'rss', category: 'ia', description: 'Articles ML et data science' },
    { name: 'Google AI Blog', url: 'https://ai.googleblog.com/feeds/posts/default', type: 'rss', category: 'ia', description: 'Recherche IA de Google' },
    { name: 'OpenAI News', url: 'https://openai.com/news/rss/', type: 'rss', category: 'ia', description: 'Annonces OpenAI' },
  ],
  ml: [
    { name: 'Papers With Code', url: 'https://paperswithcode.com/rss', type: 'rss', category: 'ml', description: 'Papers ML avec code' },
    { name: 'ArXiv ML', url: 'http://export.arxiv.org/rss/cs.LG', type: 'rss', category: 'ml', description: 'Machine Learning prépublications' },
    { name: 'Hugging Face Blog', url: 'https://huggingface.co/blog/feed.xml', type: 'rss', category: 'ml', description: 'Modèles et NLP' },
  ],
  finance: [
    { name: 'Les Echos', url: 'https://www.lesechos.fr/rss/rss_finance.xml', type: 'rss', category: 'finance', description: 'Actualités financières françaises' },
    { name: 'Financial Times', url: 'https://www.ft.com/rss/home/uk', type: 'rss', category: 'finance', description: 'Finance internationale' },
    { name: 'Bloomberg', url: 'https://feeds.bloomberg.com/markets/news.rss', type: 'rss', category: 'finance', description: 'Marchés financiers' },
  ],
  legal: [
    { name: 'Dalloz Actualité', url: 'https://www.dalloz-actualite.fr/rss.xml', type: 'rss', category: 'legal', description: 'Actualité juridique française' },
    { name: 'Legifrance', url: 'https://www.legifrance.gouv.fr/rss/', type: 'rss', category: 'legal', description: 'Textes officiels français' },
    { name: 'Europe droit', url: 'https://eur-lex.europa.eu/widget/rss.do?type=recent', type: 'rss', category: 'legal', description: 'Droit européen' },
  ],
  science: [
    { name: 'Nature', url: 'https://www.nature.com/nature.rss', type: 'rss', category: 'science', description: 'Recherche scientifique multidisciplinaire' },
    { name: 'Science Daily', url: 'https://www.sciencedaily.com/rss/all.xml', type: 'rss', category: 'science', description: 'Actualités scientifiques' },
    { name: 'ArXiv Physics', url: 'http://export.arxiv.org/rss/physics', type: 'rss', category: 'science', description: 'Physique prépublications' },
  ],
  dev: [
    { name: 'GitHub Trending', url: 'https://github.com/trending', type: 'github', category: 'dev', description: 'Repositories GitHub tendance' },
    { name: "Dev.to", url: 'https://dev.to/feed', type: 'rss', category: 'dev', description: 'Articles développeurs' },
    { name: 'CSS-Tricks', url: 'https://css-tricks.com/feed/', type: 'rss', category: 'dev', description: 'Développement web frontal' },
    { name: 'Smashing Magazine', url: 'https://www.smashingmagazine.com/feed/', type: 'rss', category: 'dev', description: 'Web design et développement' },
  ],
  default: [
    { name: 'Hacker News', url: 'https://news.ycombinator.com/rss', type: 'rss', category: 'tech', description: 'Actualités tech et culture' },
    { name: 'ArXiv AI', url: 'http://export.arxiv.org/rss/cs.AI', type: 'rss', category: 'ia', description: 'Recherche en intelligence artificielle' },
    { name: 'The Verge', url: 'https://www.theverge.com/rss/index.xml', type: 'rss', category: 'tech', description: 'Technologie grand public' },
    { name: 'Dev.to', url: 'https://dev.to/feed', type: 'rss', category: 'dev', description: 'Articles développeurs' },
  ],
};

interface SuggestedSource {
  name: string;
  url: string;
  type: 'rss' | 'github' | 'api';
  category: string;
  description: string;
}

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

function getSuggestedSources(name: string, domain: string): SuggestedSource[] {
  const keywords = `${name} ${domain}`.toLowerCase();
  const results: SuggestedSource[] = [];
  const seen = new Set<string>();

  for (const [key, sources] of Object.entries(DOMAIN_SOURCES)) {
    if (key === 'default') continue;
    if (keywords.includes(key)) {
      for (const s of sources) {
        if (!seen.has(s.url)) {
          seen.add(s.url);
          results.push(s);
        }
      }
    }
  }

  if (results.length === 0) {
    for (const s of DOMAIN_SOURCES.default) {
      if (!seen.has(s.url)) {
        seen.add(s.url);
        results.push(s);
      }
    }
  }

  return results.slice(0, 6);
}

// Main Component
export function Workspaces() {
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [modalStep, setModalStep] = useState<1 | 2>(1);
  const [formData, setFormData] = useState<WorkspaceCreate>({
    name: '',
    description: '',
    domain: '',
    icon: 'folder',
    color: '#3B82F6',
  });
  const [suggestedSources, setSuggestedSources] = useState<SuggestedSource[]>([]);
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set());
  const [customUrl, setCustomUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [customSources, setCustomSources] = useState<SuggestedSource[]>([]);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState(false);

  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: fetchWorkspaces,
  });

  const createMutation = useMutation({
    mutationFn: createWorkspace,
    onSuccess: async (newWorkspace) => {
      // Create selected sources linked to this workspace
      const sourcesToCreate = [
        ...suggestedSources.filter(s => selectedSuggestions.has(s.url)),
        ...customSources,
      ];
      for (const source of sourcesToCreate) {
        try {
          await sourcesApi.create({
            name: source.name,
            url: source.url,
            type: source.type,
            category: source.category,
            description: source.description,
            active: false,
            workspace_id: newWorkspace.id,
          });
        } catch (e) {
          console.error('Failed to create source:', source.name, e);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      queryClient.invalidateQueries({ queryKey: ['sources'] });
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

  const resetForm = () => {
    setFormData({ name: '', description: '', domain: '', icon: 'folder', color: '#3B82F6' });
    setEditingWorkspace(null);
    setModalStep(1);
    setSuggestedSources([]);
    setSelectedSuggestions(new Set());
    setCustomSources([]);
    setCustomUrl('');
    setCustomName('');
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

  const handleStep1Submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingWorkspace) {
      updateMutation.mutate({ id: editingWorkspace.id, update: formData });
      return;
    }
    // Load suggestions and go to step 2
    setIsLoadingSuggestions(true);
    setModalStep(2);
    await new Promise(r => setTimeout(r, 600)); // Brief artificial loading for UX
    const suggestions = getSuggestedSources(formData.name, formData.domain || '');
    setSuggestedSources(suggestions);
    // Pre-select first 3
    setSelectedSuggestions(new Set(suggestions.slice(0, 3).map(s => s.url)));
    setIsLoadingSuggestions(false);
  };

  const handleStep2Submit = () => {
    createMutation.mutate(formData);
  };

  const toggleSuggestion = (url: string) => {
    setSelectedSuggestions(prev => {
      const s = new Set(prev);
      if (s.has(url)) s.delete(url);
      else s.add(url);
      return s;
    });
  };

  const addCustomSource = () => {
    const url = customUrl.trim();
    const name = customName.trim();
    if (!url) return;
    const type: 'rss' | 'github' | 'api' = url.includes('github.com') ? 'github' : 'rss';
    const newSource: SuggestedSource = {
      name: name || url,
      url,
      type,
      category: formData.domain || 'général',
      description: 'Source ajoutée manuellement',
    };
    setCustomSources(prev => [...prev, newSource]);
    setCustomUrl('');
    setCustomName('');
  };

  const removeCustomSource = (url: string) => {
    setCustomSources(prev => prev.filter(s => s.url !== url));
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

  const getSourceIcon = (type: string) => {
    if (type === 'rss') return <Rss className="h-4 w-4 text-orange-500" />;
    if (type === 'github') return <Github className="h-4 w-4 text-gray-700" />;
    return <Link2 className="h-4 w-4 text-blue-500" />;
  };

  const totalSelectedSources = selectedSuggestions.size + customSources.length;

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
            Créez votre espace, ajoutez des sources, activez-les — les items arrivent classifiés automatiquement.
          </p>
        </div>
        <Button onClick={() => handleOpenModal()}>
          <Plus className="h-4 w-4 mr-2" />
          Nouvel Espace
        </Button>
      </div>

      {/* Workflow hint */}
      <div className="bg-gradient-to-r from-primary-50 to-purple-50 border border-primary-100 rounded-xl p-4 flex items-center gap-4 text-sm text-gray-700">
        <div className="flex items-center gap-2 font-medium text-primary-700">
          <div className="h-6 w-6 rounded-full bg-primary-600 text-white flex items-center justify-center text-xs font-bold">1</div>
          Créer un espace
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <div className="flex items-center gap-2 font-medium text-purple-700">
          <div className="h-6 w-6 rounded-full bg-purple-500 text-white flex items-center justify-center text-xs font-bold">2</div>
          Ajouter des sources
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <div className="flex items-center gap-2 font-medium text-green-700">
          <div className="h-6 w-6 rounded-full bg-green-500 text-white flex items-center justify-center text-xs font-bold">3</div>
          Activer une source
        </div>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <div className="flex items-center gap-2 font-medium text-gray-600">
          <div className="h-6 w-6 rounded-full bg-gray-400 text-white flex items-center justify-center text-xs font-bold">4</div>
          Items avec résumé dans le flux
        </div>
      </div>

      {/* Workspaces Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workspaces?.map((workspace) => {
          const IconComponent = getIconComponent(workspace.icon);
          return (
            <Card key={workspace.id} className="hover:shadow-lg transition-shadow">
              <div className="flex flex-col h-full">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-3 rounded-lg" style={{ backgroundColor: `${workspace.color}20` }}>
                      <IconComponent className="h-6 w-6" style={{ color: workspace.color }} />
                    </div>
                    <div>
                      <h3 className="font-semibold text-lg text-gray-900">{workspace.name}</h3>
                      {workspace.domain && (
                        <span className="text-xs text-gray-500 uppercase">{workspace.domain}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => handleOpenModal(workspace)} className="p-1 hover:bg-gray-100 rounded" title="Modifier">
                      <Edit2 className="h-4 w-4 text-gray-500" />
                    </button>
                    {workspace.id !== 1 && (
                      <button onClick={() => handleDelete(workspace.id)} className="p-1 hover:bg-red-100 rounded" title="Supprimer">
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </button>
                    )}
                  </div>
                </div>

                {workspace.description && (
                  <p className="text-sm text-gray-600 mb-4 line-clamp-2">{workspace.description}</p>
                )}

                {workspace.stats && (
                  <div className="mt-auto pt-4 border-t border-gray-200">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <div className="text-2xl font-bold text-gray-900">{workspace.stats.sources_count}</div>
                        <div className="text-xs text-gray-500">Sources</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-900">{workspace.stats.items_count}</div>
                        <div className="text-xs text-gray-500">Items</div>
                      </div>
                      <div>
                        <div className="text-2xl font-bold text-gray-900">{workspace.stats.knowledge_items_count}</div>
                        <div className="text-xs text-gray-500">Documents</div>
                      </div>
                    </div>
                    {workspace.stats.latest_item_date && (
                      <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                        <Clock className="h-3 w-3" />
                        <span>Dernière activité : {new Date(workspace.stats.latest_item_date).toLocaleDateString('fr-FR')}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            {/* Modal header */}
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-xl font-bold text-gray-900">
                  {editingWorkspace ? "Modifier l'Espace" : (modalStep === 1 ? 'Nouvel Espace de Travail' : 'Sources suggérées')}
                </h2>
                {!editingWorkspace && (
                  <div className="flex items-center gap-2 mt-1">
                    <div className={`h-2 rounded-full transition-all ${modalStep >= 1 ? 'bg-primary-500 w-8' : 'bg-gray-200 w-4'}`} />
                    <div className={`h-2 rounded-full transition-all ${modalStep >= 2 ? 'bg-primary-500 w-8' : 'bg-gray-200 w-4'}`} />
                    <span className="text-xs text-gray-500">Étape {modalStep}/2</span>
                  </div>
                )}
              </div>
              <button onClick={() => { setShowModal(false); resetForm(); }} className="p-1 hover:bg-gray-100 rounded">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* STEP 1: Workspace info */}
            {modalStep === 1 && (
              <form onSubmit={handleStep1Submit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom de l'espace *</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Ex: Veille IA, Droit numérique, Finance ESG..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Décrivez l'objectif de cet espace..."
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Domaine</label>
                  <input
                    type="text"
                    value={formData.domain}
                    onChange={(e) => setFormData({ ...formData, domain: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Ex: ia, tech, legal, finance, science, dev..."
                  />
                  <p className="text-xs text-gray-500 mt-1">Utilisé pour suggérer des sources pertinentes</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Icône</label>
                  <div className="grid grid-cols-4 gap-2">
                    {WORKSPACE_ICONS.map((iconConfig) => {
                      const IconComp = iconConfig.icon;
                      return (
                        <button
                          key={iconConfig.name}
                          type="button"
                          onClick={() => setFormData({ ...formData, icon: iconConfig.name })}
                          className={`p-3 rounded-lg border-2 flex flex-col items-center gap-1 hover:bg-gray-50 transition-colors ${
                            formData.icon === iconConfig.name ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
                          }`}
                        >
                          <IconComp className="h-5 w-5" />
                          <span className="text-xs">{iconConfig.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Couleur</label>
                  <div className="flex gap-2">
                    {WORKSPACE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className={`w-9 h-9 rounded-lg border-2 transition-all ${
                          formData.color === color ? 'border-gray-900 scale-110' : 'border-gray-200'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-3 pt-4">
                  <Button type="button" variant="secondary" onClick={() => { setShowModal(false); resetForm(); }} className="flex-1">
                    Annuler
                  </Button>
                  {editingWorkspace ? (
                    <Button type="submit" className="flex-1" disabled={updateMutation.isPending}>
                      Modifier
                    </Button>
                  ) : (
                    <Button type="submit" className="flex-1" disabled={!formData.name.trim()}>
                      Suivant : Sources suggérées
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  )}
                </div>
              </form>
            )}

            {/* STEP 2: Source suggestions */}
            {modalStep === 2 && (
              <div className="space-y-4">
                {isLoadingSuggestions ? (
                  <div className="flex flex-col items-center py-10 gap-3">
                    <Sparkles className="h-8 w-8 text-purple-500 animate-pulse" />
                    <p className="text-sm text-gray-600">Analyse du sujet et sélection des sources...</p>
                  </div>
                ) : (
                  <>
                    <div className="bg-purple-50 border border-purple-100 rounded-lg p-3 flex items-start gap-2">
                      <Sparkles className="h-4 w-4 text-purple-600 mt-0.5 flex-shrink-0" />
                      <p className="text-sm text-purple-800">
                        Sources suggérées pour <strong>{formData.name}</strong>. Sélectionnez celles qui vous conviennent — elles seront ajoutées à votre espace (désactivées par défaut, à activer quand vous le souhaitez).
                      </p>
                    </div>

                    {/* Suggested sources */}
                    <div className="space-y-2">
                      {suggestedSources.map((source) => (
                        <button
                          key={source.url}
                          onClick={() => toggleSuggestion(source.url)}
                          className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                            selectedSuggestions.has(source.url)
                              ? 'border-primary-400 bg-primary-50'
                              : 'border-gray-200 hover:border-gray-300 bg-white'
                          }`}
                        >
                          <div className={`h-5 w-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                            selectedSuggestions.has(source.url) ? 'border-primary-500 bg-primary-500' : 'border-gray-300'
                          }`}>
                            {selectedSuggestions.has(source.url) && <Check className="h-3 w-3 text-white" />}
                          </div>
                          <div className="flex-shrink-0">{getSourceIcon(source.type)}</div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm text-gray-900">{source.name}</div>
                            <div className="text-xs text-gray-500 truncate">{source.description}</div>
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${
                            source.type === 'rss' ? 'bg-orange-100 text-orange-700' :
                            source.type === 'github' ? 'bg-gray-100 text-gray-700' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {source.type.toUpperCase()}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Custom source addition */}
                    <div className="border-t pt-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Ajouter une source personnalisée</h4>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                          placeholder="Nom (optionnel)"
                        />
                        <input
                          type="url"
                          value={customUrl}
                          onChange={(e) => setCustomUrl(e.target.value)}
                          className="flex-[2] px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-primary-500"
                          placeholder="https://example.com/feed.xml"
                          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustomSource(); } }}
                        />
                        <Button type="button" size="sm" variant="secondary" onClick={addCustomSource} disabled={!customUrl.trim()}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Custom sources list */}
                    {customSources.length > 0 && (
                      <div className="space-y-2">
                        {customSources.map((source) => (
                          <div key={source.url} className="flex items-center gap-3 p-3 rounded-lg border border-green-200 bg-green-50">
                            <Check className="h-4 w-4 text-green-600 flex-shrink-0" />
                            {getSourceIcon(source.type)}
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900">{source.name}</div>
                              <div className="text-xs text-gray-500 truncate">{source.url}</div>
                            </div>
                            <button onClick={() => removeCustomSource(source.url)} className="p-1 hover:bg-red-100 rounded">
                              <X className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                      <Button type="button" variant="secondary" onClick={() => setModalStep(1)} className="flex-1">
                        ← Retour
                      </Button>
                      <Button
                        type="button"
                        className="flex-1"
                        onClick={handleStep2Submit}
                        disabled={createMutation.isPending}
                      >
                        {createMutation.isPending ? (
                          <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Création...</>
                        ) : (
                          <>
                            <PlayCircle className="h-4 w-4 mr-2" />
                            Créer avec {totalSelectedSources > 0 ? `${totalSelectedSources} source${totalSelectedSources > 1 ? 's' : ''}` : 'aucune source'}
                          </>
                        )}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}


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
