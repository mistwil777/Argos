// ControleMode - Mode HITL + Monitoring (décisions humaines + health)
import { useState } from 'react';
import { Shield, AlertTriangle, CheckCircle, XCircle, TrendingUp, Activity, ExternalLink } from 'lucide-react';
import { usePendingDecisions, useMakeDecision } from '../../hooks/useApi';
import { Preloader } from '../components/Preloader';
import { useCockpit } from '../context/CockpitContext';

interface HITLDecision {
  id: number;
  item_id: number;
  item_title: string;
  item_url?: string;
  decision_type: 'classification' | 'rejection' | 'generation';
  ai_suggestion: string;
  confidence: number;
  created_at: string;
}

export function ControleMode() {
  const [activeTab, setActiveTab] = useState<'hitl' | 'health'>('hitl');
  const [selectedDecision, setSelectedDecision] = useState<HITLDecision | null>(null);
  const [comment, setComment] = useState('');
  
  const { data: pendingData } = usePendingDecisions();
  const makeDecisionMutation = useMakeDecision();

  const { setActiveMode, setSelectedItemId, setInspectorOpen } = useCockpit();

  // Convert items to HITLDecision format
  const pendingDecisions: HITLDecision[] = pendingData?.items.map((item: any) => ({
    id: item.id,
    item_id: item.id,
    item_title: item.title || 'Sans titre',
    item_url: item.url,
    decision_type: 'classification',
    ai_suggestion: item.importance ? `${item.importance} importance - ${item.classification || 'Classifié'}` : 'En attente de classification',
    confidence: item.confidence_score ?? 0,
    created_at: item.created_at,
  })) || [];

  const handleApprove = () => {
    if (!selectedDecision) return;
    
    makeDecisionMutation.mutate({
      type: selectedDecision.decision_type,
      id: selectedDecision.item_id,
      decision: `approve:${comment}`,
    }, {
      onSuccess: () => {
        setSelectedDecision(null);
        setComment('');
      }
    });
  };

  const handleReject = () => {
    if (!selectedDecision) return;
    
    makeDecisionMutation.mutate({
      type: selectedDecision.decision_type,
      id: selectedDecision.item_id,
      decision: `reject:${comment}`,
    }, {
      onSuccess: () => {
        setSelectedDecision(null);
        setComment('');
      }
    });
  };

  const handleBatchApprove = (ids: number[]) => {
    ids.forEach(id => {
      makeDecisionMutation.mutate({ type: 'classification', id, decision: 'approve:batch' });
    });
  };

  const handleBatchReject = (ids: number[]) => {
    ids.forEach(id => {
      makeDecisionMutation.mutate({ type: 'classification', id, decision: 'reject:batch' });
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* Tabs */}
      <div className="h-12 bg-zinc-950 border-b border-white/[0.06] flex items-center px-4 gap-1">
        <button
          onClick={() => setActiveTab('hitl')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
            activeTab === 'hitl'
              ? 'bg-sky-500/12 text-sky-400'
              : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400'
          }`}
        >
          <Shield className="w-3.5 h-3.5" strokeWidth={activeTab === 'hitl' ? 2 : 1.5} />
          <span>HITL Queue ({pendingDecisions.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('health')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-1.5 ${
            activeTab === 'health'
              ? 'bg-emerald-500/10 text-emerald-400'
              : 'text-zinc-600 hover:bg-white/[0.04] hover:text-zinc-400'
          }`}
        >
          <Activity className="w-3.5 h-3.5" strokeWidth={activeTab === 'health' ? 2 : 1.5} />
          <span>Health Monitor</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'hitl' ? (
          <HITLQueue 
            decisions={pendingDecisions} 
            onSelect={setSelectedDecision}
            selectedDecision={selectedDecision}
            comment={comment}
            setComment={setComment}
            onApprove={handleApprove}
            onReject={handleReject}
            onBatchApprove={handleBatchApprove}
            onBatchReject={handleBatchReject}
            isProcessing={makeDecisionMutation.isPending}
            onViewItem={(decision) => {
              setActiveMode('flux');
              setSelectedItemId(decision.item_id);
              setInspectorOpen(true);
            }}
          />
        ) : (
          <HealthMonitor />
        )}
      </div>

      {/* Loading Animation */}
      {makeDecisionMutation.isPending && <Preloader message="Décision HITL en cours" />}
    </div>
  );
}

// HITL Queue Component
interface HITLQueueProps {
  decisions: HITLDecision[];
  onSelect: (decision: HITLDecision) => void;
  selectedDecision: HITLDecision | null;
  comment: string;
  setComment: (comment: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onBatchApprove: (ids: number[]) => void;
  onBatchReject: (ids: number[]) => void;
  isProcessing: boolean;
  onViewItem: (decision: HITLDecision) => void;
}

function HITLQueue({ decisions, onSelect, selectedDecision, comment, setComment, onApprove, onReject, onBatchApprove, onBatchReject, isProcessing, onViewItem }: HITLQueueProps) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [batchIds, setBatchIds] = useState<Set<number>>(new Set());
  const selected = selectedId ? decisions.find(d => d.id === selectedId) : selectedDecision;

  const allChecked = decisions.length > 0 && batchIds.size === decisions.length;
  const someChecked = batchIds.size > 0;

  const toggleBatch = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setBatchIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) setBatchIds(new Set());
    else setBatchIds(new Set(decisions.map(d => d.id)));
  };

  return (
    <div className="h-full flex">
      {/* Liste des décisions */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Batch toolbar */}
        {decisions.length > 0 && (
          <div className="h-10 border-b border-white/[0.06] flex items-center px-4 gap-3 shrink-0">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={allChecked}
                onChange={toggleAll}
                className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
              />
              <span className="text-xs text-zinc-600">
                {someChecked ? `${batchIds.size} sélectionné${batchIds.size > 1 ? 's' : ''}` : 'Tout sélect.'}
              </span>
            </label>
            {someChecked && (
              <>
                <div className="flex-1" />
                <button
                  onClick={() => { onBatchApprove([...batchIds]); setBatchIds(new Set()); }}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/15 transition-all disabled:opacity-50"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  Approuver ({batchIds.size})
                </button>
                <button
                  onClick={() => { onBatchReject([...batchIds]); setBatchIds(new Set()); }}
                  disabled={isProcessing}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/15 transition-all disabled:opacity-50"
                >
                  <XCircle className="w-3.5 h-3.5" />
                  Rejeter ({batchIds.size})
                </button>
              </>
            )}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {decisions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2">
              <Shield className="w-8 h-8 text-zinc-800" strokeWidth={1.5} />
              <p className="text-xs text-zinc-700">Aucune décision en attente</p>
            </div>
          ) : (
            decisions.map((decision) => (
              <div
                key={decision.id}
                onClick={() => {
                  setSelectedId(decision.id);
                  onSelect(decision);
                }}
                className={`cockpit-card rounded-xl p-4 cursor-pointer transition-all ${
                  batchIds.has(decision.id)
                    ? 'border border-sky-500/50 bg-sky-500/[0.04]'
                    : selectedId === decision.id
                    ? 'border border-sky-500/30'
                    : 'hover:border-sky-500/20'
                }`}
              >
                <div className="flex items-start gap-3 mb-2">
                  <div onClick={(e) => toggleBatch(decision.id, e)} className="mt-0.5 shrink-0">
                    <input
                      type="checkbox"
                      checked={batchIds.has(decision.id)}
                      onChange={() => {}}
                      className="w-3.5 h-3.5 accent-sky-500 cursor-pointer"
                    />
                  </div>
                  <div className="flex items-start justify-between flex-1 gap-2">
                    <h3 className="text-sm font-medium text-zinc-200 flex-1 leading-snug">{decision.item_title}</h3>
                    <span className="px-2 py-0.5 bg-sky-500/10 text-sky-400 border border-sky-500/20 rounded text-xs font-medium shrink-0">
                      {decision.decision_type}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-zinc-600 mb-2 leading-relaxed pl-6">{decision.ai_suggestion}</p>

                <div className="flex items-center justify-between text-xs pl-6">
                  <span className={`flex items-center gap-1 ${
                    decision.confidence >= 0.7 ? 'text-emerald-500' :
                    decision.confidence >= 0.5 ? 'text-amber-500' :
                    decision.confidence > 0 ? 'text-red-500' : 'text-zinc-700'
                  }`}>
                    <TrendingUp className="w-3 h-3" />
                    <span className="font-mono">{decision.confidence > 0 ? `${(decision.confidence * 100).toFixed(0)}%` : 'N/A'}</span>
                  </span>
                  <span className="text-zinc-700 font-mono">{new Date(decision.created_at).toLocaleDateString('fr-FR')}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Panneau de décision */}
      {selected && (
        <div className="w-[360px] bg-zinc-950 border-l border-white/[0.06] p-5 flex flex-col shrink-0">
          <h2 className="text-sm font-semibold text-zinc-200 mb-5">Décision HITL</h2>

          <div className="flex-1 flex flex-col gap-4 overflow-y-auto scrollable">
            <div>
              <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Item</h3>
              <p className="text-xs font-medium text-zinc-300">{selected.item_title}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <button
                  onClick={() => onViewItem(selected)}
                  className="flex items-center gap-1 text-xs text-sky-500 hover:text-sky-400 transition-colors"
                >
                  <ExternalLink className="w-3 h-3" />
                  Voir dans Flux
                </button>
                {selected.item_url && (
                  <>
                    <span className="text-zinc-800">·</span>
                    <a
                      href={selected.item_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-zinc-600 hover:text-zinc-400 transition-colors"
                    >
                      Source originale
                    </a>
                  </>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Suggestion IA</h3>
              <div className="p-3 bg-white/[0.04] border border-white/[0.06] rounded-lg">
                <p className="text-xs text-zinc-300 leading-relaxed">{selected.ai_suggestion}</p>
              </div>
            </div>

            <div>
              <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Confiance</h3>
              {selected.confidence > 0 ? (
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="w-full bg-white/[0.08] rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${
                          selected.confidence >= 0.7 ? 'bg-emerald-500' :
                          selected.confidence >= 0.5 ? 'bg-amber-500' :
                          'bg-red-500'
                        }`}
                        style={{ width: `${selected.confidence * 100}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-xs font-mono text-zinc-300">
                    {(selected.confidence * 100).toFixed(0)}%
                  </span>
                </div>
              ) : (
                <p className="text-xs text-zinc-700">Score non disponible</p>
              )}
            </div>

            <div>
              <h3 className="text-[10px] font-semibold text-zinc-700 uppercase tracking-wider mb-1.5">Votre décision</h3>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Commentaire ou ajustement..."
                rows={4}
                className="w-full px-3 py-2 bg-white/[0.04] border border-white/[0.08] rounded-lg resize-none focus:outline-none focus:ring-1 focus:ring-sky-500/50 text-sm text-zinc-300 placeholder-zinc-700"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2 mt-5">
            <button
              onClick={onApprove}
              disabled={isProcessing}
              className="w-full cockpit-btn cockpit-btn-success"
            >
              <CheckCircle className="w-4 h-4" />
              <span>{isProcessing ? 'Approbation...' : 'Approuver'}</span>
            </button>
            <button
              onClick={onReject}
              disabled={isProcessing}
              className="w-full cockpit-btn cockpit-btn-danger"
            >
              <XCircle className="w-4 h-4" />
              <span>{isProcessing ? 'Rejet...' : 'Rejeter'}</span>
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
    <div className="h-full overflow-y-auto scrollable p-5 flex flex-col gap-4">
      {/* Status cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="cockpit-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-600">Sources actives</span>
            <CheckCircle className="w-4 h-4 text-emerald-500" strokeWidth={1.5} />
          </div>
          <p className="text-2xl font-bold text-zinc-200 font-mono">{metrics.sources_ok}</p>
        </div>

        <div className="cockpit-card rounded-xl p-4 border border-red-500/20">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-600">Sources en erreur</span>
            <AlertTriangle className="w-4 h-4 text-red-500" strokeWidth={1.5} />
          </div>
          <p className="text-2xl font-bold text-red-400 font-mono">{metrics.sources_error}</p>
        </div>

        <div className="cockpit-card rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-zinc-600">Jobs actifs</span>
            <Activity className="w-4 h-4 text-sky-500" strokeWidth={1.5} />
          </div>
          <p className="text-2xl font-bold text-zinc-200 font-mono">{metrics.active_jobs}</p>
        </div>
      </div>

      {/* Performance metrics */}
      <div className="cockpit-card rounded-xl p-5">
        <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-4">Performances</h3>
        <div className="flex flex-col gap-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-600">Temps moyen de classification</span>
              <span className="text-xs font-mono text-zinc-300">{metrics.avg_classification_time}s</span>
            </div>
            <div className="w-full bg-white/[0.08] rounded-full h-1.5">
              <div className="bg-sky-500 h-1.5 rounded-full" style={{ width: '70%' }} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-600">Temps moyen de génération</span>
              <span className="text-xs font-mono text-zinc-300">{metrics.avg_generation_time}s</span>
            </div>
            <div className="w-full bg-white/[0.08] rounded-full h-1.5">
              <div className="bg-indigo-500 h-1.5 rounded-full" style={{ width: '85%' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Cost tracking */}
      <div className="cockpit-card rounded-xl p-5">
        <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-3">Coûts</h3>
        <div className="flex items-center justify-between">
          <span className="text-xs text-zinc-600">Total aujourd'hui</span>
          <span className="text-xl font-bold text-zinc-200 font-mono">${metrics.total_cost_today.toFixed(2)}</span>
        </div>
      </div>

      {/* Recent errors */}
      <div className="cockpit-card rounded-xl p-5">
        <h3 className="text-xs font-semibold text-zinc-600 uppercase tracking-wider mb-3">Erreurs récentes</h3>
        <div className="flex flex-col gap-2">
          <div className="p-3 bg-red-500/8 border border-red-500/15 rounded-lg">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" strokeWidth={1.5} />
              <div>
                <p className="text-xs font-medium text-red-400">Source ArXiv RSS indisponible</p>
                <p className="text-xs text-zinc-700 mt-0.5">Il y a 2 heures</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
