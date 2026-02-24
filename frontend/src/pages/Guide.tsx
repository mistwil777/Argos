import React, { useState } from 'react';
import { BookOpen, Layers, Brain, Workflow, Database, Zap, CheckCircle, Info, AlertCircle, Code, PlayCircle } from 'lucide-react';

export default function Guide() {
  const [activeSection, setActiveSection] = useState<string>('introduction');

  const sections = [
    { id: 'introduction', label: 'Introduction', icon: BookOpen },
    { id: 'architecture', label: 'Architecture', icon: Layers },
    { id: 'workflow', label: 'Workflow', icon: Workflow },
    { id: 'sources', label: 'Gérer les Sources', icon: Database },
    { id: 'classification', label: 'Classification', icon: Brain },
    { id: 'courses', label: 'Génération de Cours', icon: Zap },
    { id: 'rag', label: 'RAG & Q/A', icon: Brain },
    { id: 'api', label: 'API & Intégrations', icon: Code },
  ];

  return (
    <div className="flex gap-6 h-[calc(100vh-8rem)]">
      {/* Sidebar Navigation */}
      <div className="w-64 flex-shrink-0">
        <div className="bg-white rounded-lg shadow p-4 sticky top-6">
          <h2 className="text-lg font-bold text-gray-900 mb-4">📘 Sommaire</h2>
          <nav className="space-y-1">
            {sections.map((section) => {
              const Icon = section.icon;
              return (
                <button
                  key={section.id}
                  onClick={() => setActiveSection(section.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    activeSection === section.id
                      ? 'bg-primary-100 text-primary-900'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {section.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="bg-white rounded-lg shadow p-8">
          {activeSection === 'introduction' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">
                🎓 Guide d'Utilisation - AcademiaOps
              </h1>
              
              <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-blue-700 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-blue-900">Bienvenue !</h3>
                    <p className="mt-1 text-sm text-blue-800">
                      AcademiaOps est une plateforme de veille technologique intelligente qui automatise
                      la collecte, l'analyse et la transformation de contenus techniques en cours pédagogiques.
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🎯 Objectifs</h2>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span><strong>Automatiser la veille</strong> : Collecter automatiquement les dernières actualités IA/RAG via RSS, GitHub, APIs</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span><strong>Classifier intelligemment</strong> : Utiliser des LLMs pour évaluer la pertinence et l'importance des contenus</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span><strong>Générer des cours</strong> : Transformer automatiquement les contenus classifiés en cours pédagogiques complets</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span><strong>Assistant RAG</strong> : Interroger les cours générés via un système de Q/A intelligent</span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span><strong>HITL</strong> : Valider et affiner les décisions IA avec intervention humaine</span>
                </li>
              </ul>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🏗️ Technologies</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Backend</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• FastAPI (Python)</li>
                    <li>• PostgreSQL 16</li>
                    <li>• LanceDB (Vector DB)</li>
                    <li>• OpenAI / Claude APIs</li>
                  </ul>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Frontend</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• React 18 + TypeScript</li>
                    <li>• TailwindCSS</li>
                    <li>• TanStack Query</li>
                    <li>• ReactMarkdown</li>
                  </ul>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">Automation</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• n8n (Workflows)</li>
                    <li>• RSS Parsing</li>
                    <li>• GitHub API</li>
                    <li>• Cron Jobs</li>
                  </ul>
                </div>
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">AI/ML</h3>
                  <ul className="text-sm text-gray-700 space-y-1">
                    <li>• LangChain</li>
                    <li>• RAG System</li>
                    <li>• Embeddings</li>
                    <li>• MCP Protocol</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'architecture' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">🏗️ Architecture du Système</h1>
              
              <div className="bg-gray-900 text-gray-100 p-6 rounded-lg font-mono text-sm mb-6 overflow-x-auto">
                <pre>{`
┌─────────────────────────────────────────────────────────────┐
│                      📱 INTERFACE WEB                       │
│              React + TypeScript + TailwindCSS               │
└────────────────────┬────────────────────────────────────────┘
                     │ REST API (http://localhost:8000)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                    🔧 BACKEND FASTAPI                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  API Router  │  │  HITL Module │  │  RAG Module  │     │
│  │  /api/v1/*   │  │  Validation  │  │  LanceDB     │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                 │                  │              │
│         └─────────────────┴──────────────────┘              │
│                           │                                 │
└───────────────────────────┼─────────────────────────────────┘
                            ▼
         ┌──────────────────────────────────────┐
         │      💾 POSTGRESQL DATABASE          │
         │  ┌────────┐  ┌────────┐  ┌────────┐ │
         │  │ Items  │  │Courses │  │Decision│ │
         │  │Sources │  │RAG Docs│  │  Cost  │ │
         │  └────────┘  └────────┘  └────────┘ │
         └──────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  🤖 AI/LLM INTEGRATION                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ OpenAI   │  │ Claude   │  │Embeddings│  │ LangChain│   │
│  │ GPT-4    │  │ API      │  │ Models   │  │   RAG    │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  🔄 AUTOMATION (n8n)                        │
│  ┌──────────────────┐  ┌──────────────────┐               │
│  │  RSS Collection  │  │ GitHub Monitoring│               │
│  │  Auto-Classify   │  │  API Polling     │               │
│  └──────────────────┘  └──────────────────┘               │
└─────────────────────────────────────────────────────────────┘
                `}</pre>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">📊 Flux de Données</h2>
              
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-gray-900">1. Collecte</h3>
                  <p className="text-sm text-gray-700">Sources RSS/GitHub → n8n → API → Database</p>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <h3 className="font-semibold text-gray-900">2. Classification</h3>
                  <p className="text-sm text-gray-700">Items → LLM Analysis → Subject/Importance → HITL Validation</p>
                </div>
                <div className="border-l-4 border-purple-500 pl-4">
                  <h3 className="font-semibold text-gray-900">3. Génération</h3>
                  <p className="text-sm text-gray-700">Classified Items → Course Generator → Pedagogical Content → QA Scoring</p>
                </div>
                <div className="border-l-4 border-orange-500 pl-4">
                  <h3 className="font-semibold text-gray-900">4. RAG</h3>
                  <p className="text-sm text-gray-700">Courses → Embeddings → LanceDB → Semantic Search → Q/A Interface</p>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'workflow' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">🔄 Workflow Complet</h1>
              
              <div className="bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Pipeline Automatisé</h2>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-bold text-sm">1</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Collecte automatique</p>
                      <p className="text-sm text-gray-600">n8n interroge les sources RSS/GitHub toutes les heures</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-green-500 text-white flex items-center justify-center font-bold text-sm">2</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Classification IA</p>
                      <p className="text-sm text-gray-600">GPT-4 analyse le contenu et détermine le sujet + importance</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-yellow-500 text-white flex items-center justify-center font-bold text-sm">3</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Validation HITL</p>
                      <p className="text-sm text-gray-600">Un humain vérifie et corrige les classifications si nécessaire</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-purple-500 text-white flex items-center justify-center font-bold text-sm">4</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Génération de cours</p>
                      <p className="text-sm text-gray-600">LLM crée un cours pédagogique complet (5000+ mots)</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-orange-500 text-white flex items-center justify-center font-bold text-sm">5</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Indexation RAG</p>
                      <p className="text-sm text-gray-600">Cours découpé et indexé dans la base vectorielle</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center font-bold text-sm">6</div>
                    <div className="flex-1">
                      <p className="font-medium text-gray-900">Q/A disponible</p>
                      <p className="text-sm text-gray-600">Les utilisateurs peuvent poser des questions sur les cours</p>
                    </div>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">⚙️ Configuration</h2>
              <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                <h3 className="font-semibold text-gray-900 mb-2">Variables d'environnement requises</h3>
                <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-xs overflow-x-auto">
                  <pre>{`# .env
DATABASE_URL=postgresql://academiaops:devpassword123@localhost:5432/academiaops
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
LANCEDB_PATH=./data/lancedb
N8N_WEBHOOK_URL=http://localhost:5678/webhook/...`}</pre>
                </div>
              </div>
            </div>
          )}

          {activeSection === 'sources' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">📚 Gérer les Sources</h1>
              
              <div className="bg-orange-50 border-l-4 border-orange-500 p-4 mb-6">
                <div className="flex items-start gap-3">
                  <Info className="h-5 w-5 text-orange-700 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-medium text-orange-900">25 sources pré-configurées</h3>
                    <p className="mt-1 text-sm text-orange-800">
                      Le système inclut déjà des sources curées sur IA, RAG, n8n, MCP, vector databases, etc.
                    </p>
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🎯 Page Sources</h2>
              <p className="text-gray-700 mb-4">
                Accédez à <strong>Dashboard → Sources</strong> pour gérer vos sources de données :
              </p>

              <div className="space-y-4">
                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <Rss className="h-5 w-5 text-orange-600" />
                    Sources RSS
                  </h3>
                  <ul className="text-sm text-gray-700 space-y-1 ml-7">
                    <li>• Blogs techniques (LangChain, LlamaIndex, n8n)</li>
                    <li>• Newsletters IA (The Batch, Papers with Code)</li>
                    <li>• Posts Medium (Towards Data Science)</li>
                  </ul>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <Code className="h-5 w-5 text-gray-700" />
                    Repositories GitHub
                  </h3>
                  <ul className="text-sm text-gray-700 space-y-1 ml-7">
                    <li>• Frameworks RAG (LangChain, LlamaIndex, Haystack)</li>
                    <li>• Vector DBs (ChromaDB, LanceDB, Qdrant, Weaviate)</li>
                    <li>• Agents AI (AutoGPT, AgentGPT)</li>
                    <li>• MCP (Model Context Protocol)</li>
                  </ul>
                </div>

                <div className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-2">
                    <Code className="h-5 w-5 text-blue-600" />
                    APIs
                  </h3>
                  <ul className="text-sm text-gray-700 space-y-1 ml-7">
                    <li>• OpenAI API (GPT-4, embeddings)</li>
                    <li>• Anthropic Claude API</li>
                    <li>• Hugging Face Inference API</li>
                    <li>• LangSmith (monitoring)</li>
                  </ul>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">➕ Ajouter une Source</h2>
              <ol className="space-y-3">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">1.</span>
                  <span>Cliquez sur <strong>"Ajouter une source"</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">2.</span>
                  <span>Remplissez les champs : nom, URL, type (RSS/GitHub/API), catégorie, description</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">3.</span>
                  <span>Ajoutez des tags pour faciliter la recherche</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">4.</span>
                  <span>Activez/désactivez la source selon vos besoins</span>
                </li>
              </ol>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mt-6">
                <h3 className="font-semibold text-blue-900 mb-2">💡 Astuce</h3>
                <p className="text-sm text-blue-800">
                  Utilisez les filtres par type et catégorie pour organiser vos sources.
                  Les sources inactives ne seront pas interrogées par n8n.
                </p>
              </div>
            </div>
          )}

          {activeSection === 'classification' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">🧠 Classification Intelligente</h1>
              
              <p className="text-gray-700 mb-6">
                La classification automatique analyse chaque item collecté et détermine son sujet et son importance.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">📋 Processus</h2>
              <div className="space-y-4">
                <div className="bg-white border-l-4 border-blue-500 p-4 shadow-sm">
                  <h3 className="font-semibold text-blue-900">1. Analyse LLM</h3>
                  <p className="text-sm text-gray-700 mt-1">
                    GPT-4 ou Claude analyse le titre, la description et l'URL de l'item
                  </p>
                </div>
                <div className="bg-white border-l-4 border-green-500 p-4 shadow-sm">
                  <h3 className="font-semibold text-green-900">2. Extraction</h3>
                  <p className="text-sm text-gray-700 mt-1">
                    Le modèle extrait : <strong>Subject</strong> (ex: "Large Language Models"), 
                    <strong> Importance</strong> (High/Medium/Low), <strong>Reasoning</strong>
                  </p>
                </div>
                <div className="bg-white border-l-4 border-purple-500 p-4 shadow-sm">
                  <h3 className="font-semibold text-purple-900">3. Coût tracking</h3>
                  <p className="text-sm text-gray-700 mt-1">
                    Tokens utilisés et coût calculés pour chaque classification
                  </p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">⚖️ Importance</h2>
              <div className="grid grid-cols-3 gap-4 mt-4">
                <div className="border-2 border-red-300 rounded-lg p-4 bg-red-50">
                  <h3 className="font-bold text-red-900 text-center mb-2">🔴 High</h3>
                  <p className="text-xs text-gray-700 text-center">
                    Breakthrough, nouvelle architecture, paper majeur
                  </p>
                </div>
                <div className="border-2 border-yellow-300 rounded-lg p-4 bg-yellow-50">
                  <h3 className="font-bold text-yellow-900 text-center mb-2">🟡 Medium</h3>
                  <p className="text-xs text-gray-700 text-center">
                    Amélioration, tutoriel avancé, cas d'usage
                  </p>
                </div>
                <div className="border-2 border-gray-300 rounded-lg p-4 bg-gray-50">
                  <h3 className="font-bold text-gray-900 text-center mb-2">⚪ Low</h3>
                  <p className="text-xs text-gray-700 text-center">
                    News générale, article d'opinion, recap
                  </p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">✅ Validation HITL</h2>
              <p className="text-gray-700 mb-4">
                Accédez à <strong>HITL Review</strong> pour valider ou corriger les classifications :
              </p>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                  <span>Approuvez les bonnes classifications</span>
                </li>
                <li className="flex items-start gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <span>Modifiez le sujet ou l'importance si nécessaire</span>
                </li>
                <li className="flex items-start gap-2">
                  <Zap className="h-5 w-5 text-purple-600 mt-0.5" />
                  <span>Le feedback est utilisé pour améliorer le modèle</span>
                </li>
              </ul>
            </div>
          )}

          {activeSection === 'courses' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">⚡ Génération de Cours</h1>
              
              <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-6 mb-6">
                <h2 className="text-xl font-bold text-purple-900 mb-2">🎓 Cours Pédagogiques Automatisés</h2>
                <p className="text-gray-700">
                  Le système génère automatiquement des cours complets (5000+ mots, ~180 minutes) 
                  avec progression pédagogique, exemples concrets, exercices et quiz.
                </p>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">📝 Structure des Cours</h2>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">1</div>
                  <span className="font-medium">📋 Table des matières</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">2</div>
                  <span className="font-medium">🌟 Introduction (objectifs, prérequis)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">3</div>
                  <span className="font-medium">🧠 Concepts fondamentaux (définitions, analogies)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">4</div>
                  <span className="font-medium">🏗️ Architectures et techniques</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">5</div>
                  <span className="font-medium">🔬 Applications réelles</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">6</div>
                  <span className="font-medium">🛠️ Outils et frameworks</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">7</div>
                  <span className="font-medium">📝 Exercices pratiques (3 niveaux)</span>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold">8</div>
                  <span className="font-medium">🎯 Quiz final</span>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🎨 Éléments Pédagogiques</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">💡 Définitions</h3>
                  <p className="text-sm text-gray-700">Concepts clés expliqués clairement</p>
                </div>
                <div className="border border-green-200 bg-green-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">🎭 Analogies</h3>
                  <p className="text-sm text-gray-700">Comparaisons concrètes du quotidien</p>
                </div>
                <div className="border border-blue-200 bg-blue-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">💻 Code</h3>
                  <p className="text-sm text-gray-700">Exemples Python commentés</p>
                </div>
                <div className="border border-purple-200 bg-purple-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-2">📊 Diagrammes</h3>
                  <p className="text-sm text-gray-700">Visualisations ASCII/Mermaid</p>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🚀 Générer un Cours</h2>
              <ol className="space-y-3">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">1.</span>
                  <span>Allez dans <strong>Items</strong> et sélectionnez un item classifié "High"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">2.</span>
                  <span>Cliquez sur <strong>"Générer un cours"</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">3.</span>
                  <span>Le LLM génère le contenu (30-60 secondes)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">4.</span>
                  <span>Le cours est sauvegardé en statut "Draft"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">5.</span>
                  <span>Reviewez le contenu dans <strong>Courses</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">6.</span>
                  <span>Publiez le cours pour l'indexer dans le RAG</span>
                </li>
              </ol>

              <div className="bg-green-50 border border-green-200 rounded-lg p-4 mt-6">
                <h3 className="font-semibold text-green-900 mb-2 flex items-center gap-2">
                  <PlayCircle className="h-5 w-5" />
                  Exemple de Qualité
                </h3>
                <p className="text-sm text-green-800">
                  Consultez le cours <strong>"Vision par Ordinateur : Fondamentaux"</strong> pour voir
                  le niveau de qualité attendu (5000 mots, 9 sections, 30+ sous-sections, code, exercices, quiz).
                </p>
              </div>
            </div>
          )}

          {activeSection === 'rag' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">🤖 RAG & Q/A</h1>
              
              <p className="text-gray-700 mb-6">
                Le système RAG (Retrieval-Augmented Generation) permet d'interroger intelligemment
                les cours générés pour obtenir des réponses précises et contextuelles.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">💾 Architecture RAG</h2>
              <div className="bg-gray-900 text-gray-100 p-4 rounded-lg font-mono text-xs mb-6 overflow-x-auto">
                <pre>{`
Question utilisateur
       ↓
   Embedding (OpenAI ada-002)
       ↓
   Recherche sémantique (LanceDB)
       ↓
   Top-K chunks pertinents
       ↓
   Construction du contexte
       ↓
   Prompt LLM (GPT-4/Claude) + Context
       ↓
   Réponse générée avec sources
                `}</pre>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🔍 Utilisation</h2>
              <ol className="space-y-3">
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">1.</span>
                  <span>Allez dans <strong>RAG Q&A</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">2.</span>
                  <span>Tapez votre question (ex: "Comment fonctionne un CNN ?")</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">3.</span>
                  <span>Le système recherche les passages pertinents dans les cours</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">4.</span>
                  <span>GPT-4 génère une réponse basée sur le contexte trouvé</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="font-bold text-primary-600">5.</span>
                  <span>Les sources (cours utilisés) sont affichées</span>
                </li>
              </ol>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">⚡ Optimisations</h2>
              <div className="space-y-4">
                <div className="border-l-4 border-blue-500 pl-4">
                  <h3 className="font-semibold text-gray-900">Chunking intelligent</h3>
                  <p className="text-sm text-gray-700">
                    Cours découpés en sections logiques (500-1000 tokens) avec overlap
                  </p>
                </div>
                <div className="border-l-4 border-green-500 pl-4">
                  <h3 className="font-semibold text-gray-900">Metadata filtering</h3>
                  <p className="text-sm text-gray-700">
                    Filtrage par subject, date, importance pour des résultats précis
                  </p>
                </div>
                <div className="border-l-4 border-purple-500 pl-4">
                  <h3 className="font-semibold text-gray-900">Re-ranking</h3>
                  <p className="text-sm text-gray-700">
                    Les chunks sont re-classés par pertinence avant d'être envoyés au LLM
                  </p>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mt-6">
                <h3 className="font-semibold text-purple-900 mb-2">🎯 Best Practices</h3>
                <ul className="text-sm text-purple-800 space-y-1">
                  <li>• Posez des questions spécifiques plutôt que générales</li>
                  <li>• Mentionnez le sujet si vous cherchez dans un domaine précis</li>
                  <li>• Consultez les sources citées pour approfondir</li>
                  <li>• Donnez du feedback (👍/👎) pour améliorer les réponses</li>
                </ul>
              </div>
            </div>
          )}

          {activeSection === 'api' && (
            <div className="prose prose-sm max-w-none">
              <h1 className="text-3xl font-bold text-gray-900 mb-4">🔌 API & Intégrations</h1>
              
              <p className="text-gray-700 mb-6">
                Le backend expose une API REST complète pour intégrer AcademiaOps dans vos workflows.
              </p>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">📡 Endpoints Principaux</h2>
              
              <div className="space-y-4">
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-mono text-sm font-bold text-green-700 mb-2">
                    GET /api/v1/stats/global
                  </h3>
                  <p className="text-sm text-gray-700">Statistiques globales du système</p>
                  <div className="mt-2 bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono">
                    {`{"total_items": 8, "classified_items": 4, "total_courses": 4, "total_cost": 0.0088}`}
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-mono text-sm font-bold text-blue-700 mb-2">
                    GET /api/v1/items?status=classified&limit=10
                  </h3>
                  <p className="text-sm text-gray-700">Lister les items avec filtres et pagination</p>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-mono text-sm font-bold text-purple-700 mb-2">
                    POST /api/v1/items/{'{item_id}'}/classify
                  </h3>
                  <p className="text-sm text-gray-700">Classifier un item avec LLM</p>
                  <div className="mt-2 bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono">
                    {`{"subject": "Large Language Models", "importance": "High", "reasoning": "..."}`}
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-mono text-sm font-bold text-orange-700 mb-2">
                    POST /api/v1/courses/generate
                  </h3>
                  <p className="text-sm text-gray-700">Générer un cours à partir d'un item</p>
                  <div className="mt-2 bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono">
                    {`{"item_id": 1, "language": "fr", "duration_minutes": 180}`}
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <h3 className="font-mono text-sm font-bold text-red-700 mb-2">
                    POST /api/v1/rag/query
                  </h3>
                  <p className="text-sm text-gray-700">Poser une question au RAG</p>
                  <div className="mt-2 bg-gray-900 text-gray-100 p-2 rounded text-xs font-mono">
                    {`{"query": "Comment fonctionne un CNN ?", "top_k": 5}`}
                  </div>
                </div>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🔗 Webhooks n8n</h2>
              <p className="text-gray-700 mb-4">
                Configurez n8n pour envoyer les items collectés vers l'API :
              </p>
              <div className="bg-gray-900 text-gray-100 p-4 rounded font-mono text-xs overflow-x-auto">
                <pre>{`POST http://localhost:8000/api/v1/items
Content-Type: application/json

{
  "title": "GPT-4 Turbo with Vision",
  "url": "https://...",
  "source": "rss",
  "description": "OpenAI announces...",
  "importance": "Medium"
}`}</pre>
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mt-8 mb-4">🔑 Authentification</h2>
              <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4">
                <p className="text-sm text-yellow-800">
                  <strong>Note :</strong> L'authentification n'est pas encore implémentée.
                  En production, ajoutez un système de tokens API (OAuth2, JWT, etc.)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
