import { useState } from 'react';
import { useItems, useClassifyItem, useDeleteItem, useGenerateCourse } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CheckCircle, Clock, FileText, Trash2, ExternalLink, Sparkles, Brain, BookOpen } from 'lucide-react';

export default function Items() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  
  const { data: items, isLoading, error } = useItems({ status: statusFilter, source: sourceFilter });
  const classifyMutation = useClassifyItem();
  const deleteMutation = useDeleteItem();
  const generateCourseMutation = useGenerateCourse();

  const handleClassify = async (itemId: number) => {
    if (confirm('Analyser cet item avec l\'IA pour extraire le sujet et l\'importance ?')) {
      try {
        await classifyMutation.mutateAsync(itemId);
        alert('✅ Item classifié avec succès ! Vous pouvez maintenant générer un cours.');
      } catch (error) {
        alert('❌ Erreur lors de la classification');
      }
    }
  };

  const handleGenerateCourse = async (itemId: number) => {
    if (confirm('Générer un cours pédagogique complet (5000+ mots, ~60 secondes) ?')) {
      try {
        const result = await generateCourseMutation.mutateAsync({ itemId });
        alert(`✅ Cours généré avec succès !

ID: ${result.course_id}
Taille: ${result.content_length} caractères
Coût: ${result.cost.toFixed(4)}€`);
      } catch (error) {
        alert('❌ Erreur lors de la génération du cours');
      }
    }
  };

  const handleDelete = async (itemId: number) => {
    if (confirm('Supprimer cet item définitivement ?')) {
      await deleteMutation.mutateAsync(itemId);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800">Erreur lors du chargement des items</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Workflow Guide */}
      <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center gap-3 mb-2">
          <Sparkles className="h-5 w-5 text-purple-600" />
          <h2 className="text-lg font-semibold text-gray-900">Workflow automatisé</h2>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-700">
          <div className="flex items-center gap-1">
            <Clock className="h-4 w-4 text-yellow-600" />
            <span className="font-medium">1. Collecter</span>
          </div>
          <span>→</span>
          <div className="flex items-center gap-1">
            <Brain className="h-4 w-4 text-blue-600" />
            <span className="font-medium">2. Classifier (IA)</span>
          </div>
          <span>→</span>
          <div className="flex items-center gap-1">
            <BookOpen className="h-4 w-4 text-green-600" />
            <span className="font-medium">3. Générer le cours</span>
          </div>
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-gray-900">Items collectés</h1>
        <div className="flex gap-4">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Tous les statuts</option>
            <option value="pending">En attente</option>
            <option value="classified">Classifiés</option>
          </select>
          
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="all">Toutes les sources</option>
            <option value="rss">RSS</option>
            <option value="github">GitHub</option>
            <option value="manual">Manuel</option>
          </select>
        </div>
      </div>

      {items && items.items.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <FileText className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucun item</h3>
            <p className="mt-1 text-sm text-gray-500">
              Aucun item ne correspond aux filtres sélectionnés.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {items?.items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between">
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
                        isLoading={generateCourseMutation.isPending}
                        title="Générer un cours pédagogique complet de 5000+ mots"
                      >
                        <BookOpen className="h-4 w-4 mr-1" />
                        Générer le cours
                      </Button>
                      <Button
                        variant="danger"
                        size="sm"
                        onClick={() => handleDelete(item.id)}
                        isLoading={deleteMutation.isPending}
                        title="Supprimer cet item"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
