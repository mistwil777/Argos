import { Card } from '../components/ui/Card';
import { Settings, Database, Rss, Github, Server } from 'lucide-react';

export default function Admin() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Administration</h1>
        <p className="text-gray-600">Gérez les paramètres et la configuration du système</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Database className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Base de données</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">État</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                Connecté
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Type</span>
              <span className="text-gray-900 font-medium">PostgreSQL 16</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Nom</span>
              <span className="text-gray-900 font-medium">veilleops</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Server className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Serveur</h3>
          </div>
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">État</span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                En ligne
              </span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Version</span>
              <span className="text-gray-900 font-medium">0.1.0</span>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Environnement</span>
              <span className="text-gray-900 font-medium">Development</span>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Rss className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Sources RSS</h3>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-4">Gérez les sources de veille automatique</p>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Aucune source configurée</p>
            </div>
          </div>
        </Card>

        <Card>
          <div className="flex items-center gap-3 mb-4">
            <Github className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">GitHub</h3>
          </div>
          <div className="space-y-2">
            <p className="text-sm text-gray-600 mb-4">Configuration de l'intégration GitHub</p>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Non configuré</p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Settings className="h-6 w-6 text-primary-600" />
            <h3 className="text-lg font-semibold text-gray-900">Paramètres système</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-medium text-gray-900 mb-3">LLM</h4>
              <div className="space-y-2">
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Provider</span>
                  <span className="text-sm text-gray-900 font-medium">OpenAI</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Modèle</span>
                  <span className="text-sm text-gray-900 font-medium">GPT-4</span>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium text-gray-900 mb-3">Vector Database</h4>
              <div className="space-y-2">
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Type</span>
                  <span className="text-sm text-gray-900 font-medium">LanceDB</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-sm text-gray-600">Dimension</span>
                  <span className="text-sm text-gray-900 font-medium">384</span>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Actions système</h3>
        <p className="text-sm text-gray-600 mb-4">Ces actions permettent de maintenir et optimiser le système</p>
        <div className="flex flex-wrap gap-3">
          <button 
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            title="Efface les fichiers temporaires et caches applicatifs"
          >
            🗑️ Vider le cache
          </button>
          <button 
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            title="Reconstruit l'index vectoriel RAG pour améliorer la recherche sémantique"
          >
            🔄 Réindexer les vecteurs
          </button>
          <button 
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            title="Exporte tous les items et cours au format JSON pour sauvegarde"
          >
            📦 Exporter les données
          </button>
          <button 
            className="px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
            title="⚠️ ATTENTION: Supprime les items et cours non validés (action irréversible)"
          >
            🧹 Nettoyer la base de données
          </button>
        </div>
        
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h4 className="font-semibold text-blue-900 mb-2">ℹ️ Guide des actions système</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li><strong>Vider le cache</strong> - Libère de l'espace disque en supprimant les fichiers temporaires</li>
            <li><strong>Réindexer les vecteurs</strong> - Améliore la qualité des recherches RAG après l'ajout de nouveaux contenus</li>
            <li><strong>Exporter les données</strong> - Crée une sauvegarde complète en JSON pour backup ou migration</li>
            <li><strong>Nettoyer la BD</strong> - Supprime les brouillons et items en attente pour gagner de l'espace</li>
          </ul>
        </div>
      </Card>
    </div>
  );
}
