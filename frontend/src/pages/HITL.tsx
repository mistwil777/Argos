import { usePendingDecisions, useMakeDecision, useBotStatus } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { CheckCircle, XCircle, Users, AlertCircle } from 'lucide-react';

export default function HITL() {
  const { data: pendingItems, isLoading } = usePendingDecisions();
  const { data: botStatus } = useBotStatus();
  const decideMutation = useMakeDecision();

  const handleDecision = async (itemId: number, decision: 'approve' | 'reject') => {
    const confirmMessage = decision === 'approve' 
      ? 'Approuver cet item ?' 
      : 'Rejeter cet item ?';
    
    if (confirm(confirmMessage)) {
      await decideMutation.mutateAsync({ type: 'item_validation', id: itemId, decision });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Human-in-the-Loop</h1>
        <p className="text-gray-600">Validez ou rejetez les items classifiés</p>
      </div>

      {/* Bot Status Card */}
      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">Telegram Bot</h3>
            <p className="text-sm text-gray-600">
              Recevez les notifications de validation sur Telegram
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              botStatus?.running 
                ? 'bg-green-100 text-green-800' 
                : 'bg-gray-100 text-gray-800'
            }`}>
              <div className={`h-2 w-2 rounded-full ${
                botStatus?.running ? 'bg-green-600' : 'bg-gray-400'
              }`}></div>
              {botStatus?.running ? 'Actif' : 'Inactif'}
            </div>
          </div>
        </div>
      </Card>

      {/* Pending Items */}
      {pendingItems && pendingItems.items.length === 0 ? (
        <Card>
          <div className="text-center py-12">
            <Users className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">Aucune décision en attente</h3>
            <p className="mt-1 text-sm text-gray-500">
              Tous les items classifiés ont été validés.
            </p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {pendingItems?.items.map((item) => (
            <Card key={item.id}>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                    <h3 className="text-lg font-semibold text-gray-900">{item.title}</h3>
                  </div>
                  
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
                        Importance: {item.importance}
                      </span>
                    )}
                    {item.source_type && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        {item.source_type}
                      </span>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="hover:text-primary-600 underline"
                    >
                      Voir la source
                    </a>
                    {item.created_at && (
                      <span>Collecté le {new Date(item.created_at).toLocaleDateString('fr-FR')}</span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleDecision(item.id, 'approve')}
                      isLoading={decideMutation.isPending}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Approuver
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDecision(item.id, 'reject')}
                      isLoading={decideMutation.isPending}
                    >
                      <XCircle className="h-4 w-4 mr-1" />
                      Rejeter
                    </Button>
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
