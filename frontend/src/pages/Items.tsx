import { useState } from 'react';
import { useItems, useClassifyItem, useDeleteItem } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CheckCircle, Clock, FileText, Trash2, ExternalLink } from 'lucide-react';

export default function Items() {
  const [statusFilter, setStatusFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  
  const { data: items, isLoading, error } = useItems({ status: statusFilter, source: sourceFilter });
  const classifyMutation = useClassifyItem();
  const deleteMutation = useDeleteItem();

  const handleClassify = async (itemId: number) => {
    if (confirm('Classifier cet item ?')) {
      await classifyMutation.mutateAsync(itemId);
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
                
                <div className="flex gap-2 ml-4">
                  {item.status === 'pending' && (
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleClassify(item.id)}
                      isLoading={classifyMutation.isPending}
                    >
                      Classifier
                    </Button>
                  )}
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => handleDelete(item.id)}
                    isLoading={deleteMutation.isPending}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
