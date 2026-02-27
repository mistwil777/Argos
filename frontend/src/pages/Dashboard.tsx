import { FileText, CheckCircle, BookOpen, DollarSign, ArrowRight, Sparkles, Brain, MessageSquare } from 'lucide-react';
import { Card, MetricCard } from '../components/ui/Card';
import { useGlobalStats, useTimelineStats, useTopicsStats } from '../hooks/useApi';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Link } from 'react-router-dom';

export const Dashboard = () => {
  const { data: stats, isLoading: statsLoading } = useGlobalStats();
  const { data: timeline } = useTimelineStats(7);
  const { data: topics } = useTopicsStats(10);
  
  if (statsLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vue d'ensemble de votre système VeilleOps
        </p>
      </div>

      {/* Quick Start Guide */}
      <div className="bg-gradient-to-r from-blue-50 via-purple-50 to-pink-50 border-2 border-blue-200 rounded-xl p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <Sparkles className="h-8 w-8 text-purple-600 flex-shrink-0 mt-1" />
          <div className="flex-1">
            <h2 className="text-xl font-bold text-gray-900 mb-3">🚀 Comment utiliser VeilleOps</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Link to="/items" className="group bg-white rounded-lg p-4 hover:shadow-md transition-shadow border border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-blue-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">1. Items</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Consultez les items collectés et classifiez-les avec l'IA
                </p>
                <div className="flex items-center text-sm text-blue-600 font-medium group-hover:gap-2 transition-all">
                  Voir les items <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Link>

              <Link to="/courses" className="group bg-white rounded-lg p-4 hover:shadow-md transition-shadow border border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <BookOpen className="h-4 w-4 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">2. Cours</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Générez et publiez des cours pédagogiques complets
                </p>
                <div className="flex items-center text-sm text-green-600 font-medium group-hover:gap-2 transition-all">
                  Voir les cours <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Link>

              <Link to="/rag" className="group bg-white rounded-lg p-4 hover:shadow-md transition-shadow border border-gray-200">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center">
                    <MessageSquare className="h-4 w-4 text-purple-600" />
                  </div>
                  <h3 className="font-semibold text-gray-900">3. RAG</h3>
                </div>
                <p className="text-sm text-gray-600 mb-2">
                  Posez des questions sur vos cours avec l'assistant IA
                </p>
                <div className="flex items-center text-sm text-purple-600 font-medium group-hover:gap-2 transition-all">
                  Poser une question <ArrowRight className="h-4 w-4 ml-1" />
                </div>
              </Link>
            </div>
            
            <div className="mt-4 flex items-center gap-2 text-sm text-gray-600 bg-white/50 rounded-lg p-3">
              <Brain className="h-4 w-4 text-blue-600" />
              <span>
                <strong>Workflow automatisé:</strong> Items collectés → Classification IA → Génération de cours → Indexation RAG → Q/A disponible
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Metrics */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          title="Total Items"
          value={stats?.total_items || 0}
          icon={<FileText className="h-6 w-6" />}
        />
        <MetricCard
          title="Items Classifiés"
          value={stats?.classified_items || 0}
          icon={<CheckCircle className="h-6 w-6" />}
        />
        <MetricCard
          title="Cours Publiés"
          value={stats?.published_courses || 0}
          icon={<BookOpen className="h-6 w-6" />}
        />
        <MetricCard
          title="Coût ce mois"
          value={`$${stats?.cost_this_month?.toFixed(2) || '0.00'}`}
          icon={<DollarSign className="h-6 w-6" />}
        />
      </div>
      
      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Timeline Chart */}
        <Card title="Items collectés (7 derniers jours)">
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={timeline}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Line 
                type="monotone" 
                dataKey="items_collected" 
                stroke="#0ea5e9" 
                strokeWidth={2}
                name="Items"
              />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        
        {/* Topics Chart */}
        <Card title="Top 10 Topics">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={topics}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="topic" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="item_count" fill="#0ea5e9" name="Items" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      
      {/* Alerts & Recent Activity */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Alertes">
          <div className="space-y-3">
            {stats && stats.pending_items > 50 && (
              <div className="flex items-start p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-yellow-800">
                    Items en attente
                  </h3>
                  <p className="mt-1 text-sm text-yellow-700">
                    {stats.pending_items} items en attente de classification
                  </p>
                </div>
              </div>
            )}
            
            {stats && stats.draft_courses > 5 && (
              <div className="flex items-start p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-blue-800">
                    Cours en attente de review
                  </h3>
                  <p className="mt-1 text-sm text-blue-700">
                    {stats.draft_courses} cours en mode draft
                  </p>
                </div>
              </div>
            )}
            
            {stats && stats.pending_items < 10 && stats.draft_courses < 3 && (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="mx-auto h-12 w-12 text-green-500 mb-2" />
                <p>Aucune alerte ! Tout est sous contrôle.</p>
              </div>
            )}
          </div>
        </Card>
        
        <Card title="Stats Rapides">
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-sm text-gray-600">Taux de classification</span>
              <span className="text-sm font-semibold text-gray-900">
                {stats ? Math.round((stats.classified_items / stats.total_items) * 100) : 0}%
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-sm text-gray-600">Cours en draft</span>
              <span className="text-sm font-semibold text-gray-900">
                {stats?.draft_courses || 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-sm text-gray-600">Cours publiés</span>
              <span className="text-sm font-semibold text-gray-900">
                {stats?.published_courses || 0}
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-gray-600">Coût total</span>
              <span className="text-sm font-semibold text-gray-900">
                ${stats?.total_cost?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
