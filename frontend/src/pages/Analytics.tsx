import { useGlobalStats, useCostsStats } from '../hooks/useApi';
import { Card } from '../components/ui/Card';
import { DollarSign, TrendingUp, Activity, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function Analytics() {
  const { data: globalStats } = useGlobalStats();
  const { data: costsData } = useCostsStats('month');

  const performanceMetrics = [
    {
      icon: Activity,
      label: 'Coût total',
      value: `$${globalStats?.total_cost?.toFixed(2) || '0.00'}`,
      trend: 0
    },
    {
      icon: DollarSign,
      label: 'Coût ce mois',
      value: `$${globalStats?.cost_this_month?.toFixed(2) || '0.00'}`,
      trend: 0
    },
    {
      icon: TrendingUp,
      label: 'Taux de classification',
      value: globalStats?.total_items && globalStats.total_items > 0
        ? `${Math.round((globalStats.classified_items / globalStats.total_items) * 100)}%`
        : '0%',
      trend: 0
    },
    {
      icon: Zap,
      label: 'Efficacité',
      value: globalStats?.published_courses && globalStats.classified_items > 0
        ? `${Math.round((globalStats.published_courses / globalStats.classified_items) * 100)}%`
        : '0%',
      trend: 0
    }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Analytics</h1>
        <p className="text-gray-600">Analysez les performances et les coûts du système</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {performanceMetrics.map((metric, index) => (
          <Card key={index}>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary-100 rounded-lg">
                <metric.icon className="h-5 w-5 text-primary-600" />
              </div>
              <div>
                <p className="text-sm text-gray-600">{metric.label}</p>
                <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {/* Cost Breakdown */}
      <Card title="Répartition des coûts">
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={costsData || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line 
              type="monotone" 
              dataKey="classifier_cost" 
              stroke="#3b82f6" 
              name="Classifier"
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="course_generator_cost" 
              stroke="#10b981" 
              name="Générateur de cours"
              strokeWidth={2}
            />
            <Line 
              type="monotone" 
              dataKey="rag_cost" 
              stroke="#f59e0b" 
              name="RAG"
              strokeWidth={2}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      {/* Additional Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Statistiques de production">
          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <span className="text-gray-600">Items collectés</span>
              <span className="font-semibold text-gray-900">{globalStats?.total_items || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <span className="text-gray-600">Items classifiés</span>
              <span className="font-semibold text-gray-900">{globalStats?.classified_items || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <span className="text-gray-600">Items en attente</span>
              <span className="font-semibold text-gray-900">{globalStats?.pending_items || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-gray-200">
              <span className="text-gray-600">Cours générés</span>
              <span className="font-semibold text-gray-900">{globalStats?.total_courses || 0}</span>
            </div>
            <div className="flex justify-between items-center py-3">
              <span className="text-gray-600">Cours publiés</span>
              <span className="font-semibold text-gray-900">{globalStats?.published_courses || 0}</span>
            </div>
          </div>
        </Card>

        <Card title="Insights">
          <div className="space-y-4">
            {globalStats?.pending_items && globalStats.pending_items > 50 ? (
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-800">
                  ⚠️ <strong>{globalStats.pending_items} items</strong> en attente de classification.
                  Pensez à lancer le classifier.
                </p>
              </div>
            ) : null}
            
            {globalStats?.draft_courses && globalStats.draft_courses > 5 ? (
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  ℹ️ <strong>{globalStats.draft_courses} cours</strong> en brouillon.
                  Prêts à être publiés ?
                </p>
              </div>
            ) : null}

            {globalStats?.total_cost && globalStats.total_cost > 10 ? (
              <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <p className="text-sm text-purple-800">
                  💡 Coût total: <strong>${globalStats.total_cost.toFixed(2)}</strong>
                  <br />
                  Optimisez vos prompts pour réduire les coûts !
                </p>
              </div>
            ) : null}

            {!globalStats?.pending_items && !globalStats?.draft_courses ? (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-800">
                  ✅ Tout est à jour ! Aucune action requise.
                </p>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </div>
  );
}
