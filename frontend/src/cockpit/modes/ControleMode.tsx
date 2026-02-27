// ControleMode - Mode HITL + Monitoring (décisions humaines + health)
import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, TrendingUp, Activity } from 'lucide-react';

interface HITLDecision {
  id: number;
  item_id: number;
  item_title: string;
  decision_type: 'classification' | 'rejection' | 'generation';
  ai_suggestion: string;
  confidence: number;
  created_at: string;
}

export function ControleMode() {
  const [activeTab, setActiveTab] = useState<'hitl' | 'health'>('hitl');
  const [selectedDecision, setSelectedDecision] = useState<HITLDecision | null>(null);
  void selectedDecision; // TODO: to be used for detail panel

  // Mock data - À remplacer par useHITLQueue() et useHealthMetrics()
  const pendingDecisions: HITLDecision[] = [
    {
      id: 1,
      item_id: 42,
      item_title: 'Nouvelle approche pour le NLP multilingue',
      decision_type: 'classification',
      ai_suggestion: 'High importance - Machine Learning topic',
      confidence: 0.65,
      created_at: new Date().toISOString(),
    },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 space-x-1">
        <button
          onClick={() => setActiveTab('hitl')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'hitl'
              ? 'bg-purple-100 text-purple-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Shield className="w-4 h-4" />
          <span>HITL Queue ({pendingDecisions.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center space-x-2 ${
            activeTab === 'health'
              ? 'bg-green-100 text-green-700'
              : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Health Monitor</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'hitl' ? (
          <HITLQueue decisions={pendingDecisions} onSelect={setSelectedDecision} />
        ) : (
          <HealthMonitor />
        )}
      </div>
    </div>
  );
}

// HITL Queue Component
interface HITLQueueProps {
  decisions: HITLDecision[];
  onSelect: (decision: HITLDecision) => void;
}

function HITLQueue({ decisions, onSelect }: HITLQueueProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = decisions.find(d => d.id === selectedId);

  return (
    <div className="h-full flex">
      {/* Liste des décisions */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {decisions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <Shield className="w-12 h-12 mb-3 text-gray-300" />
            <p>Aucune décision en attente</p>
          </div>
        ) : (
          decisions.map((decision) => (
            <div
              key={decision.id}
              onClick={() => {
                setSelectedId(decision.id);
                onSelect(decision);
              }}
              className={`p-4 bg-white rounded-lg border cursor-pointer transition-all ${
                selectedId === decision.id
                  ? 'border-purple-400 shadow-md'
                  : 'border-gray-200 hover:border-purple-200'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-gray-900 flex-1">{decision.item_title}</h3>
                <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium ml-2">
                  {decision.decision_type}
                </span>
              </div>
              
              <p className="text-sm text-gray-600 mb-2">{decision.ai_suggestion}</p>
              
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span className={`flex items-center space-x-1 ${
                  decision.confidence >= 0.7 ? 'text-green-600' :
                  decision.confidence >= 0.5 ? 'text-orange-600' :
                  'text-red-600'
                }`}>
                  <TrendingUp className="w-3 h-3" />
                  <span>Confiance: {(decision.confidence * 100).toFixed(0)}%</span>
                </span>
                <span>{new Date(decision.created_at).toLocaleDateString('fr-FR')}</span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Panneau de décision */}
      {selected && (
        <div className="w-96 bg-white border-l border-gray-200 p-6 flex flex-col">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Décision HITL</h2>
          
          <div className="flex-1 space-y-6">
            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Item</h3>
              <p className="text-sm text-gray-900 font-medium">{selected.item_title}</p>
              <button className="text-xs text-blue-600 hover:text-blue-700 underline mt-1">
                Voir l'item complet
              </button>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Suggestion IA</h3>
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-900">{selected.ai_suggestion}</p>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Confiance</h3>
              <div className="flex items-center space-x-3">
                <div className="flex-1">
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        selected.confidence >= 0.7 ? 'bg-green-600' :
                        selected.confidence >= 0.5 ? 'bg-orange-600' :
                        'bg-red-600'
                      }`}
                      style={{ width: `${selected.confidence * 100}%` }}
                    />
                  </div>
                </div>
                <span className="text-sm font-medium text-gray-900">
                  {(selected.confidence * 100).toFixed(0)}%
                </span>
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-gray-500 uppercase mb-2">Votre décision</h3>
              <textarea
                placeholder="Commentaire ou ajustement..."
                rows={4}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2 mt-6">
            <button className="w-full px-4 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors flex items-center justify-center space-x-2">
              <CheckCircle className="w-4 h-4" />
              <span>Approuver</span>
            </button>
            <button className="w-full px-4 py-2.5 bg-red-50 text-red-700 rounded-lg font-medium hover:bg-red-100 transition-colors flex items-center justify-center space-x-2">
              <XCircle className="w-4 h-4" />
              <span>Rejeter</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Health Monitor Component
function HealthMonitor() {
  // Mock data
  const metrics = {
    sources_ok: 15,
    sources_error: 2,
    avg_classification_time: 4.2,
    avg_generation_time: 12.8,
    total_cost_today: 2.45,
    active_jobs: 3,
  };

  return (
    <div className="h-full overflow-y-auto p-6 space-y-6">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Sources actives</span>
            <CheckCircle className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{metrics.sources_ok}</p>
        </div>

        <div className="bg-white rounded-lg border border-red-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Sources en erreur</span>
            <AlertTriangle className="w-5 h-5 text-red-500" />
          </div>
          <p className="text-2xl font-bold text-red-600">{metrics.sources_error}</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Jobs actifs</span>
            <Activity className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-gray-900">{metrics.active_jobs}</p>
        </div>
      </div>

      {/* Performance metrics */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performances</h3>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Temps moyen de classification</span>
              <span className="text-sm font-medium text-gray-900">{metrics.avg_classification_time}s</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-blue-600 h-2 rounded-full" style={{ width: '70%' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-600">Temps moyen de génération</span>
              <span className="text-sm font-medium text-gray-900">{metrics.avg_generation_time}s</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div className="bg-purple-600 h-2 rounded-full" style={{ width: '85%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Cost tracking */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Coûts</h3>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Total aujourd'hui</span>
          <span className="text-2xl font-bold text-gray-900">${metrics.total_cost_today.toFixed(2)}</span>
        </div>
      </div>

      {/* Recent errors */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Erreurs récentes</h3>
        <div className="space-y-3">
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-medium text-red-900">Source ArXiv RSS indisponible</p>
                <p className="text-xs text-red-700 mt-1">Il y a 2 heures</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
