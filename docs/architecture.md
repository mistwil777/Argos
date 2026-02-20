# Architecture du Projet - AcademiaOps
## Arborescence Complète et Explications

**Version** : 1.0 MVP  
**Date** : 20 février 2026  

---

## 📋 Table des matières

1. [Vue d'ensemble](#1-vue-densemble)
2. [Arborescence complète](#2-arborescence-complète)
3. [Détail par dossier](#3-détail-par-dossier)
4. [Conventions de nommage](#4-conventions-de-nommage)
5. [Ordre d'implémentation recommandé](#5-ordre-dimplémentation-recommandé)

---

## 1. Vue d'ensemble

Le projet est organisé en **composants indépendants** qui communiquent via des interfaces claires :

```
┌─────────────────────────────────────────────────────────┐
│                    RACINE DU PROJET                      │
│                       academiaops/                       │
└─────────────────────────────────────────────────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
    ┌───▼────┐      ┌──────▼──────┐     ┌──────▼─────┐
    │  docs/ │      │ mcp_server/ │     │ dashboard/ │
    │        │      │  (Python)   │     │ (Next.js)  │
    └────────┘      └─────────────┘     └────────────┘
                            │
        ┌───────────────────┼────────────────────┐
        │                   │                    │
    ┌───▼────┐      ┌──────▼───────┐    ┌──────▼─────┐
    │ tools/ │      │   agents/    │    │ database/  │
    │  (MCP) │      │   (Agno)     │    │ (DB logic) │
    └────────┘      └──────────────┘    └────────────┘
```

**Principe** : Chaque composant peut être compris, testé et déployé indépendamment.

---

## 2. Arborescence complète

```
academiaops/
│
├── .env                           # Variables d'environnement (SECRETS, NE PAS COMMIT)
├── .env.example                   # Template des variables d'environnement
├── .gitignore                     # Fichiers à ignorer par Git
├── README.md                      # Documentation principale du projet
├── docker-compose.yml             # Orchestration de tous les services
├── LICENSE                        # Licence du projet (MIT suggérée)
│
├── docs/                          # 📚 Documentation complète
│   ├── README.md                  # Index de la documentation
│   ├── cahier_des_charges_fonctionnel.md
│   ├── cahier_des_charges_technique.md
│   ├── architecture.md            # Ce fichier
│   ├── mcp_guide.md               # Guide pédagogique sur MCP (à créer)
│   ├── agno_guide.md              # Guide pédagogique sur Agno (à créer)
│   ├── n8n_guide.md               # Guide pédagogique sur n8n (à créer)
│   ├── diagrams/                  # Diagrammes d'architecture (Mermaid, Draw.io)
│   │   ├── architecture_globale.mmd
│   │   ├── flux_veille.mmd
│   │   └── flux_generation_cours.mmd
│   └── api/                       # Documentation API MCP
│       └── mcp_tools_reference.md
│
├── database/                      # 🗄️ Scripts et schémas de base de données
│   ├── README.md                  # Documentation du modèle de données
│   ├── init.sql                   # Script d'initialisation PostgreSQL
│   ├── migrations/                # Migrations de schéma (sqitch, alembic, ou SQL brut)
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_add_user_progress.sql
│   │   └── README.md
│   └── seeds/                     # Données de test
│       ├── topics.sql             # Taxonomie des sujets
│       └── sources.sql            # Sources de veille par défaut
│
├── mcp_server/                    # 🧠 Serveur MCP + Agents Agno (cœur du système)
│   ├── README.md                  # Documentation du serveur MCP
│   ├── Dockerfile                 # Image Docker pour le serveur
│   ├── requirements.txt           # Dépendances Python
│   ├── pyproject.toml             # Configuration Python (Black, Flake8, etc.)
│   ├── server.py                  # 🚀 Point d'entrée principal (FastAPI + MCP)
│   ├── config.py                  # Configuration centralisée (env vars)
│   │
│   ├── tools/                     # 🔧 Tous les tools MCP exposés
│   │   ├── README.md              # Documentation des tools
│   │   ├── __init__.py            # Enregistrement de tous les tools
│   │   ├── base.py                # Classe de base Tool abstraite
│   │   ├── classification.py      # Tool: batch_classify_items
│   │   ├── validation.py          # Tools: get_pending_items, validate_item
│   │   ├── generation.py          # Tool: generate_course
│   │   ├── search.py              # Tools: search_courses, search_knowledge_base
│   │   ├── comparison.py          # Tool: compare_with_stack
│   │   └── stats.py               # Tool: get_stats
│   │
│   ├── agents/                    # 🤖 Agents Agno (multi-agents)
│   │   ├── README.md              # Documentation des agents
│   │   ├── __init__.py
│   │   ├── base.py                # Classe de base Agent abstraite
│   │   ├── classifier.py          # Agent: Classifier
│   │   ├── comparer.py            # Agent: Comparer
│   │   ├── pedago.py              # Agent: Pédago
│   │   ├── course_builder.py     # Agent: CourseBuilder
│   │   ├── qa_reviewer.py        # Agent: QA Reviewer
│   │   ├── rag_responder.py      # Agent: RAG Responder
│   │   └── team.py                # Orchestration d'équipes d'agents
│   │
│   ├── database/                  # 💾 Accès aux bases de données
│   │   ├── README.md
│   │   ├── __init__.py
│   │   ├── postgres.py            # SQLAlchemy models + CRUD operations
│   │   ├── lancedb_client.py     # Client LanceDB (vecteurs)
│   │   └── models.py              # ORM models (SQLAlchemy)
│   │
│   ├── utils/                     # 🛠️ Utilitaires
│   │   ├── __init__.py
│   │   ├── logger.py              # Logger structuré (JSON)
│   │   ├── embeddings.py          # Génération d'embeddings
│   │   ├── chunking.py            # Découpage de texte
│   │   ├── llm_client.py          # Clients LLM (Anthropic, OpenAI)
│   │   ├── cache.py               # Cache Redis ou in-memory
│   │   └── validators.py          # Validateurs Pydantic
│   │
│   ├── prompts/                   # 📝 Prompts LLM (templates)
│   │   ├── README.md
│   │   ├── classification.txt
│   │   ├── comparison.txt
│   │   ├── course_generation.txt
│   │   └── qa_review.txt
│   │
│   └── tests/                     # ✅ Tests unitaires et d'intégration
│       ├── __init__.py
│       ├── conftest.py            # Fixtures pytest
│       ├── test_tools/
│       │   ├── test_classification.py
│       │   └── test_generation.py
│       ├── test_agents/
│       │   ├── test_classifier.py
│       │   └── test_course_builder.py
│       └── test_database/
│           └── test_postgres.py
│
├── n8n_workflows/                 # 🔄 Workflows n8n (exportés en JSON)
│   ├── README.md                  # Documentation des workflows
│   ├── 01_veille_quotidienne.json
│   ├── 02_generation_cours.json
│   ├── 03_monitoring.json
│   └── 04_backup.json
│
├── dashboard/                     # 🎨 Frontend Next.js (interface utilisateur)
│   ├── README.md                  # Documentation du dashboard
│   ├── Dockerfile                 # Image Docker (si hébergé sur VPS)
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.js             # Configuration Next.js
│   ├── tsconfig.json              # Configuration TypeScript
│   ├── tailwind.config.ts         # Configuration Tailwind CSS
│   ├── postcss.config.js
│   │
│   ├── public/                    # Fichiers statiques
│   │   ├── favicon.ico
│   │   └── logo.svg
│   │
│   ├── src/
│   │   ├── app/                   # App Router Next.js 14
│   │   │   ├── layout.tsx         # Layout principal
│   │   │   ├── page.tsx           # Page d'accueil (dashboard)
│   │   │   ├── validation/        # Page de validation des items
│   │   │   │   └── page.tsx
│   │   │   ├── courses/           # Page de consultation des cours
│   │   │   │   ├── page.tsx       # Liste des cours
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx   # Détail d'un cours
│   │   │   ├── chat/              # Page chatbot RAG
│   │   │   │   └── page.tsx
│   │   │   ├── stats/             # Page de statistiques
│   │   │   │   └── page.tsx
│   │   │   └── api/               # API Routes (proxy MCP)
│   │   │       ├── mcp/
│   │   │       │   └── route.ts   # Proxy vers MCP server
│   │   │       └── auth/
│   │   │           └── [...nextauth]/
│   │   │               └── route.ts
│   │   │
│   │   ├── components/            # Composants React réutilisables
│   │   │   ├── ui/                # Composants UI (shadcn/ui)
│   │   │   │   ├── button.tsx
│   │   │   │   ├── card.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   └── ...
│   │   │   ├── ItemCard.tsx       # Card pour afficher un item de veille
│   │   │   ├── CourseCard.tsx     # Card pour afficher un cours
│   │   │   ├── ChatInterface.tsx  # Interface de chatbot
│   │   │   ├── StatsChart.tsx     # Graphiques de stats
│   │   │   └── NavBar.tsx         # Barre de navigation
│   │   │
│   │   ├── lib/                   # Utilitaires
│   │   │   ├── mcp-client.ts      # Client pour appeler le serveur MCP
│   │   │   ├── utils.ts           # Helpers divers
│   │   │   └── constants.ts       # Constantes
│   │   │
│   │   ├── hooks/                 # Custom hooks React
│   │   │   ├── useMCP.ts          # Hook pour appeler des tools MCP
│   │   │   └── useItems.ts        # Hook pour gérer les items
│   │   │
│   │   └── types/                 # Types TypeScript
│   │       ├── mcp.ts             # Types pour MCP (tools, responses)
│   │       ├── item.ts            # Type Item
│   │       └── course.ts          # Type Course
│   │
│   └── .env.local                 # Variables d'env locales (dev)
│
├── scripts/                       # 🔨 Scripts utilitaires
│   ├── README.md
│   ├── deploy.sh                  # Script de déploiement automatisé
│   ├── backup.sh                  # Backup manuel PostgreSQL + LanceDB
│   ├── restore.sh                 # Restauration depuis backup
│   ├── seed_data.py               # Remplir la DB avec données de test
│   └── test_mcp_tools.py          # Tester manuellement les tools MCP
│
└── .github/                       # 🤖 GitHub Actions (CI/CD optionnel)
    └── workflows/
        ├── tests.yml              # Lancer les tests sur push
        └── deploy.yml             # Déploiement automatique sur VPS
```

---

## 3. Détail par dossier

### 3.1 `/docs` - Documentation

**Rôle** : Contenir toute la documentation du projet (fonctionnelle, technique, guides pédagogiques).

**Pourquoi important** : 
- C'est un projet **pédagogique** : la doc est aussi importante que le code
- Permet de comprendre l'architecture sans lire tout le code
- Facilite l'onboarding (même si c'est un projet solo pour le MVP)

**Fichiers clés** :
- `cahier_des_charges_fonctionnel.md` : Le "QUOI" (besoins métier, cas d'usage)
- `cahier_des_charges_technique.md` : Le "COMMENT" (choix techno, architecture)
- `mcp_guide.md` : Guide pédagogique sur MCP (à créer ensemble, avec exemples concrets du projet)
- `agno_guide.md` : Guide pédagogique sur Agno (concepts, patterns, exemples)
- `n8n_guide.md` : Guide pédagogique sur n8n (workflows, bonnes pratiques)

**Structure des guides pédagogiques** (proposition) :
```markdown
# Guide MCP pour AcademiaOps

## 1. Qu'est-ce que MCP ?
- Définition simple
- Problème résolu
- Analogie (ex : MCP = "menu de restaurant" pour les LLM)

## 2. Architecture MCP
- Host, Server, Client
- JSON-RPC 2.0 (expliqué simplement)
- Diagramme de séquence

## 3. Concepts clés
- Tools (fonctions exposées)
- Resources (données exposées)
- Prompts (prompts paramétrables)

## 4. Dans AcademiaOps
- Comment on utilise MCP (n8n appelle MCP, dashboard appelle MCP)
- Exemple concret : le tool `batch_classify_items` décortiqué
- Code commenté ligne par ligne

## 5. Exercice pratique
- Créer un nouveau tool simple : `get_course_by_id`
- Solution commentée

## 6. Aller plus loin
- Optimisations (batching, streaming)
- Sécurité
- Liens ressources officielles
```

---

### 3.2 `/database` - Schémas et migrations

**Rôle** : Stocker les scripts SQL pour initialiser et faire évoluer la base de données.

**Pourquoi séparé du code Python** : 
- Le schéma DB est **indépendant** du langage (pourrait être utilisé par n8n, un script bash, etc.)
- Facilite les migrations (histoire claire de l'évolution du schéma)
- Permet de versionner les changements de structure

**init.sql** : Script d'initialisation complet
```sql
-- Ce fichier crée toutes les tables, indexes, vues, fonctions
-- Il est exécuté automatiquement au premier démarrage de PostgreSQL (docker-entrypoint-initdb.d)

-- Étape 1 : Créer l'extension pour JSONB (si nécessaire)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Étape 2 : Créer les tables (cf. cahier des charges technique)
CREATE TABLE topics (...);
CREATE TABLE sources (...);
-- etc.

-- Étape 3 : Créer les indexes pour performances
CREATE INDEX ...;

-- Étape 4 : Créer les vues pour simplifier les requêtes
CREATE VIEW pending_items_summary AS ...;

-- Étape 5 : Insérer les données de seed (topics, sources)
\i /docker-entrypoint-initdb.d/seeds/topics.sql
\i /docker-entrypoint-initdb.d/seeds/sources.sql
```

**migrations/** : Pour les évolutions futures
```
migrations/
├── 001_initial_schema.sql         # Le schéma initial (duplicata de init.sql)
├── 002_add_user_progress.sql      # Ajout de la table user_progress
└── 003_add_course_versioning.sql  # Ajout du système de versioning
```

**seeds/** : Données de départ
```sql
-- seeds/topics.sql
INSERT INTO topics (name, description) VALUES
    ('MCP', 'Model Context Protocol'),
    ('RAG', 'Retrieval-Augmented Generation'),
    ('Multi-agents', 'Systèmes multi-agents (LangGraph, Agno, CrewAI)'),
    ('n8n', 'Automatisation et workflows'),
    ('Embeddings', 'Embeddings et bases vectorielles'),
    ('Fine-tuning', 'Fine-tuning et RLHF'),
    ('Autre', 'Autres sujets liés à l''IA');
```

---

### 3.3 `/mcp_server` - Cœur du système

**Rôle** : C'est le **cerveau** du système. Il expose des tools MCP, orchestre les agents Agno, et gère l'accès aux bases de données.

**Pourquoi Python** : 
- Écosystème IA mature (LangChain, Agno, transformers)
- Rapidité de développement
- Tu le maîtrises déjà

**Architecture interne** :
```
mcp_server/
├── server.py              # 🚀 Point d'entrée (FastAPI + MCP protocol handler)
├── config.py              # Configuration (charge .env, définit constantes)
├── tools/                 # Tools MCP (= API publique du serveur)
├── agents/                # Agents Agno (= logique métier)
├── database/              # Accès DB (PostgreSQL, LanceDB)
├── utils/                 # Helpers (embeddings, chunking, etc.)
├── prompts/               # Templates de prompts LLM
└── tests/                 # Tests unitaires
```

#### 3.3.1 `server.py` - Point d'entrée

**Rôle** : 
1. Démarrer un serveur HTTP (FastAPI)
2. Exposer un endpoint POST `/mcp/v1/tools/execute` (JSON-RPC 2.0)
3. Router les appels vers les tools appropriés
4. Gérer les erreurs et la logging

**Structure** :
```python
# mcp_server/server.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import logging
from tools import TOOLS_REGISTRY

# Configuration du logger
logger = logging.getLogger("academiaops")

# Initialisation FastAPI
app = FastAPI(title="AcademiaOps MCP Server", version="1.0.0")

# Modèles Pydantic pour JSON-RPC 2.0
class MCPRequest(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    method: str
    params: dict

class MCPResponse(BaseModel):
    jsonrpc: str = "2.0"
    id: str
    result: dict | None = None
    error: dict | None = None

@app.post("/mcp/v1/tools/execute")
async def execute_tool(request: MCPRequest) -> MCPResponse:
    """
    Endpoint principal MCP.
    
    Reçoit une requête JSON-RPC 2.0, la route vers le bon tool,
    et retourne la réponse au format JSON-RPC.
    
    Logique :
    1. Valider la requête (Pydantic fait ça automatiquement)
    2. Extraire le nom du tool (request.params["tool"])
    3. Chercher le tool dans le registry
    4. Appeler le tool avec les inputs
    5. Retourner le résultat ou une erreur
    """
    try:
        if request.method != "tools/execute":
            raise ValueError(f"Méthode non supportée : {request.method}")
        
        tool_name = request.params.get("tool")
        tool_input = request.params.get("input", {})
        
        if tool_name not in TOOLS_REGISTRY:
            raise ValueError(f"Tool inconnu : {tool_name}")
        
        tool_func = TOOLS_REGISTRY[tool_name]
        result = await tool_func(tool_input)
        
        return MCPResponse(id=request.id, result=result)
    
    except Exception as e:
        logger.error(f"Erreur lors de l'exécution du tool : {e}")
        return MCPResponse(
            id=request.id,
            error={
                "code": -32603,  # Internal error (JSON-RPC)
                "message": str(e)
            }
        )

@app.get("/health")
async def health():
    """Health check pour Docker"""
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, workers=2)
```

**Explications pédagogiques** :
- **FastAPI** : Framework web moderne Python, async, avec validation automatique (Pydantic)
- **JSON-RPC 2.0** : Protocole simple pour appeler des fonctions à distance. Structure :
  ```json
  Requête:  {"jsonrpc": "2.0", "id": "1", "method": "tools/execute", "params": {...}}
  Réponse:  {"jsonrpc": "2.0", "id": "1", "result": {...}}
  ```
- **TOOLS_REGISTRY** : Un dictionnaire Python qui mappe nom_tool → fonction Python
  ```python
  TOOLS_REGISTRY = {
      "batch_classify_items": batch_classify_items,
      "generate_course": generate_course,
      # ...
  }
  ```

#### 3.3.2 `tools/` - Tools MCP

**Rôle** : Chaque fichier dans ce dossier définit **un ou plusieurs tools MCP**.

**Qu'est-ce qu'un tool MCP** :
- C'est une **fonction** que les clients MCP peuvent appeler
- Elle a un **schéma d'input** (quels paramètres elle accepte)
- Elle a un **schéma d'output** (ce qu'elle retourne)
- Elle a une **description** (pour que le LLM comprenne quand l'utiliser)

**Exemple : `tools/classification.py`**

```python
# mcp_server/tools/classification.py
"""
Tool MCP : batch_classify_items

Rôle : Classifier plusieurs items de veille en un seul appel optimisé.

Stratégie :
- Regroupe tous les items en un seul prompt (batching)
- Appelle le LLM une seule fois (vs N appels)
- Parse le résultat JSON
- Met à jour la DB

Économies : 
- 20 items × 0.002$ = 0.04$ (mode naïf)
- 1 appel × 0.005$ = 0.005$ (mode batch) 
- Gain : 8x
"""

from pydantic import BaseModel, Field
from typing import List, Dict
from agents.classifier import ClassifierAgent
from database.postgres import get_db
from utils.llm_client import get_llm_client
import logging

logger = logging.getLogger("academiaops")

# ============================================
# Schémas d'input/output (contrat du tool)
# ============================================

class ItemToClassify(BaseModel):
    """Un item à classifier"""
    id: int = Field(description="ID de l'item en base")
    title: str = Field(description="Titre de l'article")
    url: str = Field(description="URL source")
    content: str = Field(description="Contenu extrait (peut être vide)")

class ClassificationResult(BaseModel):
    """Résultat de classification pour un item"""
    id: int
    subject: str = Field(description="Sujet (MCP, RAG, Agents, n8n, etc.)")
    impact: str = Field(description="High, Medium ou Low")
    relevance: int = Field(description="Score 0-10")
    summary: str = Field(description="Résumé en français (150 mots max)")
    keywords: List[str] = Field(description="5 mots-clés techniques")

class BatchClassifyInput(BaseModel):
    """Input du tool"""
    items: List[ItemToClassify] = Field(description="Liste des items à classifier")
    context: str = Field(default="", description="Contexte utilisateur (mon stack actuel)")

class BatchClassifyOutput(BaseModel):
    """Output du tool"""
    results: List[ClassificationResult]
    tokens_used: int
    cost_usd: float
    errors: List[str] = Field(default=[], description="Erreurs éventuelles")

# ============================================
# Implémentation du tool
# ============================================

async def batch_classify_items(input_data: dict) -> dict:
    """
    Tool MCP : Classifier plusieurs items en batch.
    
    Flux :
    1. Récupérer les items depuis input
    2. Construire un prompt structuré avec tous les items
    3. Appeler l'agent Classifier (qui appelle le LLM)
    4. Parser les résultats
    5. Mettre à jour la DB (PostgreSQL)
    6. Retourner les résultats + métadonnées (tokens, coût)
    
    Args:
        input_data: Dict conforme à BatchClassifyInput
    
    Returns:
        Dict conforme à BatchClassifyOutput
    """
    try:
        # 1. Valider et parser l'input
        input_validated = BatchClassifyInput(**input_data)
        items = input_validated.items
        context = input_validated.context
        
        logger.info(f"Classification de {len(items)} items en batch")
        
        # 2. Initialiser l'agent Classifier
        llm_client = get_llm_client("gpt-3.5-turbo")  # Modèle économique pour classification
        classifier_agent = ClassifierAgent(llm=llm_client)
        
        # 3. Appeler l'agent (logique métier dans agents/classifier.py)
        classification_results = await classifier_agent.classify_batch(
            items=[item.dict() for item in items],
            context=context
        )
        
        # 4. Mettre à jour la DB
        db = get_db()
        for result in classification_results:
            db.update_item_classification(
                item_id=result["id"],
                subject=result["subject"],
                impact=result["impact"],
                relevance=result["relevance"],
                summary=result["summary"],
                keywords=result["keywords"],
                status="pending_validation"
            )
        
        # 5. Calculer les métriques
        tokens_used = classifier_agent.last_tokens_used
        cost_usd = classifier_agent.last_cost
        
        logger.info(f"Classification terminée : {tokens_used} tokens, {cost_usd:.4f}$")
        
        # 6. Retourner le résultat
        return BatchClassifyOutput(
            results=[ClassificationResult(**r) for r in classification_results],
            tokens_used=tokens_used,
            cost_usd=cost_usd,
            errors=[]
        ).dict()
    
    except Exception as e:
        logger.error(f"Erreur dans batch_classify_items : {e}")
        return BatchClassifyOutput(
            results=[],
            tokens_used=0,
            cost_usd=0.0,
            errors=[str(e)]
        ).dict()

# ============================================
# Enregistrement du tool dans le registry
# ============================================

TOOL_INFO = {
    "name": "batch_classify_items",
    "description": "Classifie plusieurs items de veille en un seul appel optimisé (batching)",
    "input_schema": BatchClassifyInput.schema(),
    "output_schema": BatchClassifyOutput.schema(),
    "function": batch_classify_items
}
```

**Points pédagogiques** :
- **Pydantic** : Définit les schémas de données avec validation automatique
- **Batching** : Optimisation cruciale pour réduire les coûts LLM
- **Séparation des responsabilités** :
  - Tool = **interface** (validation input/output, orchestration)
  - Agent = **logique métier** (prompts, appels LLM, parsing)
  - Database = **persistance**

---

#### 3.3.3 `agents/` - Agents Agno

**Rôle** : Contient la logique métier des agents (prompts, appels LLM, traitement des réponses).

**Qu'est-ce qu'un agent Agno** :
- Une **entité autonome** avec un rôle spécifique
- Elle a des **skills** (capacités, ex : "extraire des mots-clés", "générer un résumé")
- Elle utilise des **outils** (LLM, bases de données, APIs externes)
- Elle peut **collaborer** avec d'autres agents (team)

**Exemple : `agents/classifier.py`**

```python
# mcp_server/agents/classifier.py
"""
Agent Agno : Classifier

Rôle : Classifier des items de veille par sujet, impact, pertinence.

Skills :
- extract_keywords : Extraire les mots-clés techniques d'un texte
- map_to_taxonomy : Mapper les mots-clés à la taxonomie prédéfinie
- assess_impact : Évaluer l'importance (High/Medium/Low)
- calculate_relevance : Calculer la pertinence pour le stack utilisateur (0-10)

Stratégie :
- Utilise un prompt structuré pour obtenir un JSON
- Mode "JSON mode" du LLM pour garantir la structure
- Gestion d'erreurs (retry si parse échoue)
"""

from agno import Agent, Skill
from typing import List, Dict
import json
import logging

logger = logging.getLogger("academiaops.agents.classifier")

class ClassifierAgent(Agent):
    """Agent spécialisé dans la classification de contenus techniques"""
    
    def __init__(self, llm):
        super().__init__(
            name="Classifier",
            role="Classifier des articles techniques par sujet, impact, pertinence",
            llm=llm
        )
        self.last_tokens_used = 0
        self.last_cost = 0.0
    
    async def classify_batch(self, items: List[Dict], context: str = "") -> List[Dict]:
        """
        Classifie plusieurs items en un seul appel LLM (batching).
        
        Args:
            items: Liste de dict avec {id, title, url, content}
            context: Contexte utilisateur (stack actuel)
        
        Returns:
            Liste de dict avec {id, subject, impact, relevance, summary, keywords}
        """
        logger.info(f"Classification de {len(items)} items")
        
        # 1. Construire le prompt (template depuis prompts/classification.txt)
        prompt = self._build_batch_prompt(items, context)
        
        # 2. Appeler le LLM avec JSON mode
        response = await self.llm.chat(
            messages=[
                {"role": "system", "content": self._get_system_prompt()},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},  # Force JSON
            temperature=0.3  # Faible température pour cohérence
        )
        
        # 3. Parser la réponse
        try:
            results = json.loads(response.content)["classifications"]
            self.last_tokens_used = response.usage.total_tokens
            self.last_cost = self._calculate_cost(response.usage.total_tokens)
            return results
        except (json.JSONDecodeError, KeyError) as e:
            logger.error(f"Erreur de parsing : {e}")
            # Retry avec un prompt plus explicite (ou retourner erreur)
            raise
    
    def _get_system_prompt(self) -> str:
        """Prompt système définissant le rôle de l'agent"""
        return """
Tu es un expert en veille technologique IA.
Ton rôle est de classifier des articles/repos/posts techniques.

Taxonomie des sujets (CHOISIR UN SEUL) :
- MCP (Model Context Protocol)
- RAG (Retrieval-Augmented Generation)
- Multi-agents (LangGraph, Agno, CrewAI, etc.)
- n8n (automatisation, workflows)
- Embeddings (sentence-transformers, bases vectorielles)
- Fine-tuning (RLHF, LoRA, etc.)
- Autre

Impact (CHOISIR UN) :
- High : Innovation majeure, change la façon de travailler
- Medium : Intéressant, amélioration incrémentale
- Low : Marginal, niche

Pertinence (0-10) :
- 10 = directement applicable à mon stack actuel
- 5 = intéressant mais pas prioritaire
- 0 = hors scope

Tu dois retourner un JSON avec cette structure EXACTE :
{
  "classifications": [
    {
      "id": 123,
      "subject": "MCP",
      "impact": "High",
      "relevance": 9,
      "summary": "Description en français, 150 mots max",
      "keywords": ["mot1", "mot2", "mot3", "mot4", "mot5"]
    },
    ...
  ]
}
"""
    
    def _build_batch_prompt(self, items: List[Dict], context: str) -> str:
        """Construit le prompt utilisateur avec tous les items"""
        items_text = "\n\n".join([
            f"ID: {item['id']}\n"
            f"Titre: {item['title']}\n"
            f"URL: {item['url']}\n"
            f"Contenu: {item['content'][:500]}..."  # Limiter à 500 chars
            for item in items
        ])
        
        context_text = f"\n\nCONTEXTE UTILISATEUR :\n{context}" if context else ""
        
        return f"""
Classifie les {len(items)} articles suivants.

{items_text}
{context_text}

Retourne un JSON avec la structure demandée.
"""
    
    def _calculate_cost(self, tokens: int) -> float:
        """Calcule le coût en USD (modèle GPT-3.5-turbo)"""
        # Prix GPT-3.5-turbo : $0.0005 / 1K tokens (input) + $0.0015 / 1K tokens (output)
        # Approximation : 70% input, 30% output
        input_cost = (tokens * 0.7) / 1000 * 0.0005
        output_cost = (tokens * 0.3) / 1000 * 0.0015
        return input_cost + output_cost
```

**Points pédagogiques** :
- **Agno Agent** : Hérite de la classe `Agent` fournie par Agno
- **JSON mode** : Force le LLM à retourner du JSON valide (feature d'OpenAI et compatible)
- **Batching** : Un seul prompt avec tous les items, vs N appels séparés
- **Température** : 0.3 = peu créatif, plus déterministe (bien pour classification)
- **Gestion des coûts** : Tracking des tokens pour monitoring

---

#### 3.3.4 `database/` - Accès aux bases de données

**Rôle** : Abstraire l'accès aux bases de données (PostgreSQL, LanceDB).

**Pourquoi séparer** :
- **Réutilisabilité** : Plusieurs agents/tools peuvent utiliser les mêmes fonctions
- **Testabilité** : Plus facile de mocker la DB dans les tests
- **Maintenabilité** : Changement de DB = changement localisé

**Exemple : `database/postgres.py`**

```python
# mcp_server/database/postgres.py
"""
Module d'accès à PostgreSQL avec SQLAlchemy.

Stratégie :
- ORM SQLAlchemy pour les modèles (tables = classes Python)
- CRUD operations centralisées ici
- Gestion des sessions (context manager)
"""

from sqlalchemy import create_engine, Column, Integer, String, Text, TIMESTAMP, Boolean, ARRAY
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from config import POSTGRES_URL
import logging

logger = logging.getLogger("academiaops.database")

# ====================================
# Configuration SQLAlchemy
# ====================================

engine = create_engine(POSTGRES_URL, pool_size=5, max_overflow=10)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# ====================================
# Modèles ORM
# ====================================

class Item(Base):
    """Table: items"""
    __tablename__ = "items"
    
    id = Column(Integer, primary_key=True)
    source_id = Column(Integer, nullable=False)
    title = Column(Text, nullable=False)
    url = Column(Text, unique=True, nullable=False)
    content = Column(Text)
    author = Column(String(200))
    published_at = Column(TIMESTAMP)
    
    # Classification
    topic_id = Column(Integer)
    subject = Column(String(100))
    impact = Column(String(20))
    relevance = Column(Integer)
    summary = Column(Text)
    keywords = Column(ARRAY(Text))
    
    # État
    status = Column(String(50), default="pending_classification")
    
    # Métadonnées
    tokens_used = Column(Integer, default=0)
    cost_usd = Column(Integer, default=0)  # Stocké en centimes
    
    # Timestamps
    collected_at = Column(TIMESTAMP)
    classified_at = Column(TIMESTAMP)
    validated_at = Column(TIMESTAMP)

# Autres modèles : Course, Topic, Decision, etc.

# ====================================
# CRUD Operations
# ====================================

def get_db():
    """Retourne une session DB (context manager)"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_pending_items(limit: int = 50):
    """Récupère les items en attente de validation"""
    db = next(get_db())
    return db.query(Item).filter(
        Item.status == "pending_validation"
    ).order_by(Item.relevance.desc()).limit(limit).all()

def update_item_classification(
    item_id: int,
    subject: str,
    impact: str,
    relevance: int,
    summary: str,
    keywords: list[str],
    status: str = "pending_validation"
):
    """Met à jour la classification d'un item"""
    db = next(get_db())
    try:
        item = db.query(Item).filter(Item.id == item_id).first()
        if not item:
            raise ValueError(f"Item {item_id} introuvable")
        
        item.subject = subject
        item.impact = impact
        item.relevance = relevance
        item.summary = summary
        item.keywords = keywords
        item.status = status
        item.classified_at = func.now()
        
        db.commit()
        logger.info(f"Item {item_id} classifié : {subject} / {impact}")
    except Exception as e:
        db.rollback()
        logger.error(f"Erreur update item {item_id} : {e}")
        raise

# Autres fonctions CRUD : create_course, get_course_by_id, etc.
```

**Points pédagogiques** :
- **SQLAlchemy ORM** : Mapper tables SQL → classes Python
- **Session management** : Context manager pour garantir fermeture des connexions
- **CRUD pattern** : Create, Read, Update, Delete = opérations de base

---

### 3.4 `/n8n_workflows` - Workflows d'automatisation

**Rôle** : Stocker les workflows n8n exportés en JSON (versioning, backup, portabilité).

**Pourquoi stocker les workflows en JSON** :
- **Versioning** : Git track les changements
- **Backup** : Pas de perte si n8n crashe
- **Portabilité** : Réinstallation rapide sur un autre serveur

**Workflow 1 : `01_veille_quotidienne.json`**

Structure (simplifié) :
```json
{
  "name": "Veille Quotidienne",
  "nodes": [
    {
      "name": "Cron Trigger",
      "type": "n8n-nodes-base.cron",
      "parameters": {
        "rule": {
          "cronExpression": "0 8 * * *"
        }
      }
    },
    {
      "name": "Fetch HackerNews",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "https://hacker-news.firebaseio.com/v0/topstories.json",
        "method": "GET"
      }
    },
    {
      "name": "Transform Data",
      "type": "n8n-nodes-base.function",
      "parameters": {
        "functionCode": "// Code JS pour transformer les données"
      }
    },
    {
      "name": "Insert PostgreSQL",
      "type": "n8n-nodes-base.postgres",
      "parameters": {
        "operation": "insert",
        "table": "items"
      }
    },
    {
      "name": "Call MCP Classify",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://mcp-server:8000/mcp/v1/tools/execute",
        "method": "POST",
        "body": {
          "jsonrpc": "2.0",
          "method": "tools/execute",
          "params": {
            "tool": "batch_classify_items"
          }
        }
      }
    },
    {
      "name": "Send Telegram Notification",
      "type": "n8n-nodes-base.telegram",
      "parameters": {
        "text": "🔔 {{$json.count}} nouveautés à valider !"
      }
    }
  ],
  "connections": {}
}
```

**Comment importer** :
1. Ouvrir n8n (http://localhost:5678)
2. Cliquer "Import from File"
3. Sélectionner le JSON
4. Activer le workflow

---

### 3.5 `/dashboard` - Interface utilisateur

**Rôle** : Interface web pour interagir avec le système (validation, consultation, chatbot).

**Pourquoi Next.js** :
- **React** : Composants réutilisables
- **Server Components** : Performances optimales (rendu serveur)
- **API Routes** : Pas besoin d'un backend séparé pour le proxy MCP
- **Déploiement facile** : Vercel gratuit, ou Docker

**Structure** :
```
dashboard/
├── src/app/                 # App Router (Next.js 14)
│   ├── layout.tsx           # Layout racine (nav, footer)
│   ├── page.tsx             # Page d'accueil (dashboard général)
│   ├── validation/page.tsx  # Page de validation des items
│   ├── courses/page.tsx     # Liste des cours
│   ├── chat/page.tsx        # Chatbot RAG
│   └── api/                 # API Routes (proxy MCP)
│       └── mcp/route.ts     # POST handler qui appelle mcp-server
├── src/components/          # Composants React
│   ├── ItemCard.tsx
│   ├── CourseCard.tsx
│   └── ChatInterface.tsx
└── src/lib/                 # Utils
    └── mcp-client.ts        # Client pour appeler le serveur MCP
```

**Exemple : `src/lib/mcp-client.ts`**

```typescript
// dashboard/src/lib/mcp-client.ts
/**
 * Client MCP pour appeler le serveur depuis le frontend.
 * 
 * Stratégie :
 * - Appelle l'API Route Next.js (/api/mcp)
 * - L'API Route fait le vrai appel au serveur MCP (côté serveur)
 * - Retourne les résultats au frontend
 * 
 * Pourquoi ne pas appeler directement mcp-server ?
 * - Sécurité : Pas d'exposition du MCP server au navigateur
 * - Secrets : Les API keys restent côté serveur
 */

export interface MCPRequest {
  tool: string;
  input: Record<string, any>;
}

export interface MCPResponse<T = any> {
  result?: T;
  error?: {
    code: number;
    message: string;
  };
}

export async function callMCPTool<T = any>(
  tool: string,
  input: Record<string, any>
): Promise<T> {
  const response = await fetch("/api/mcp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      tool,
      input,
    } as MCPRequest),
  });

  if (!response.ok) {
    throw new Error(`HTTP error ${response.status}`);
  }

  const data: MCPResponse<T> = await response.json();

  if (data.error) {
    throw new Error(`MCP error: ${data.error.message}`);
  }

  return data.result as T;
}

// Helpers typés pour chaque tool

export async function getPendingItems(limit: number = 50) {
  return callMCPTool<{ items: Item[] }>("get_pending_items", { limit });
}

export async function validateItem(
  itemId: number,
  decision: "yes" | "no" | "later",
  notes?: string
) {
  return callMCPTool("validate_item", { item_id: itemId, decision, notes });
}

// etc.
```

---

### 3.6 `/scripts` - Scripts utilitaires

**Rôle** : Scripts pour faciliter le déploiement, le backup, les tests, etc.

**Exemples** :

**`deploy.sh`** : Déploiement automatisé
```bash
#!/bin/bash
# Script de déploiement sur VPS Scaleway

set -e  # Arrêter si erreur

echo "🚀 Déploiement AcademiaOps..."

# 1. Pull dernières modifications
git pull origin main

# 2. Rebuild les images Docker
docker-compose build

# 3. Arrêter les services
docker-compose down

# 4. Démarrer les services
docker-compose up -d

# 5. Vérifier le statut
docker-compose ps

# 6. Health check
sleep 10
curl -f http://localhost:8000/health || exit 1

echo "✅ Déploiement terminé !"
```

**`test_mcp_tools.py`** : Tester manuellement les tools
```python
#!/usr/bin/env python3
"""Script pour tester manuellement les tools MCP"""

import requests
import json

MCP_SERVER_URL = "http://localhost:8000/mcp/v1/tools/execute"

def call_tool(tool: str, input_data: dict):
    """Appeler un tool MCP"""
    payload = {
        "jsonrpc": "2.0",
        "id": "test_1",
        "method": "tools/execute",
        "params": {
            "tool": tool,
            "input": input_data
        }
    }
    
    response = requests.post(MCP_SERVER_URL, json=payload)
    return response.json()

# Test 1 : batch_classify_items
print("Test : batch_classify_items")
result = call_tool("batch_classify_items", {
    "items": [
        {
            "id": 1,
            "title": "Anthropic releases Model Context Protocol",
            "url": "https://...",
            "content": "MCP is a new standard..."
        }
    ]
})
print(json.dumps(result, indent=2))
```

---

## 4. Conventions de nommage

### 4.1 Python (backend)

- **Fichiers** : `snake_case.py`
- **Classes** : `PascalCase` (ex : `ClassifierAgent`, `ItemCard`)
- **Fonctions** : `snake_case` (ex : `batch_classify_items`, `get_pending_items`)
- **Constantes** : `UPPER_SNAKE_CASE` (ex : `POSTGRES_URL`, `MAX_TOKENS`)
- **Variables privées** : `_prefixé` (ex : `_build_prompt`)

### 4.2 TypeScript (frontend)

- **Fichiers** : `PascalCase.tsx` pour composants, `kebab-case.ts` pour utils
- **Composants React** : `PascalCase` (ex : `ItemCard`, `ChatInterface`)
- **Fonctions** : `camelCase` (ex : `callMCPTool`, `getPendingItems`)
- **Interfaces** : `PascalCase` (ex : `MCPRequest`, `Item`)
- **Constantes** : `UPPER_SNAKE_CASE`

### 4.3 SQL

- **Tables** : `snake_case`, pluriel (ex : `items`, `courses`, `user_progress`)
- **Colonnes** : `snake_case` (ex : `created_at`, `item_id`)
- **Indexes** : `idx_{table}_{colonnes}` (ex : `idx_items_status`)
- **Vues** : `{nom}_summary` ou `{nom}_catalog` (ex : `pending_items_summary`)

---

## 5. Ordre d'implémentation recommandé

### 🎯 Phase 1 : Fondations (2-3 jours)

**Objectif** : Avoir un serveur MCP minimal qui répond.

1. ✅ Créer la structure de dossiers
2. ✅ Écrire `docker-compose.yml`
3. ✅ Écrire `database/init.sql` (schéma complet)
4. ✅ Écrire `mcp_server/server.py` (FastAPI + endpoint MCP)
5. ✅ Ajouter un tool "hello world" (`tools/hello.py`)
6. ✅ Tester : `curl -X POST http://localhost:8000/mcp/v1/tools/execute`

**Validation** : Réponse JSON valide pour "hello world"

---

### 🎯 Phase 2 : Veille et classification (4-5 jours)

**Objectif** : Collecter et classifier automatiquement des items.

1. ✅ Implémenter `agents/classifier.py` (Agent Agno)
2. ✅ Implémenter `tools/classification.py` (Tool MCP)
3. ✅ Implémenter `database/postgres.py` (CRUD operations)
4. ✅ Créer le workflow n8n de collecte RSS (`n8n_workflows/01_veille_quotidienne.json`)
5. ✅ Tester end-to-end : n8n → PostgreSQL → MCP → Classification

**Validation** : 100 items réels collectés et classifiés

---

### 🎯 Phase 3 : Génération de cours (5-7 jours)

**Objectif** : Générer des cours à partir des items validés.

1. ✅ Implémenter `agents/pedago.py` (Agent Pédago)
2. ✅ Implémenter `agents/course_builder.py` (Agent CourseBuilder)
3. ✅ Implémenter `agents/qa_reviewer.py` (Agent QA Reviewer)
4. ✅ Implémenter `tools/generation.py` (Tool MCP)
5. ✅ Implémenter `utils/chunking.py` + `database/lancedb_client.py` (RAG)
6. ✅ Tester : Générer 1 cours complet (3 niveaux) pour MCP

**Validation** : Cours de qualité, cohérent, indexé dans LanceDB

---

### 🎯 Phase 4 : Dashboard (5-7 jours)

**Objectif** : Interface web pour validation et consultation.

1. ✅ Créer le projet Next.js (`dashboard/`)
2. ✅ Implémenter l'API Route proxy MCP (`src/app/api/mcp/route.ts`)
3. ✅ Implémenter la page de validation (`src/app/validation/page.tsx`)
4. ✅ Implémenter la page de consultation des cours (`src/app/courses/`)
5. ✅ Implémenter le chatbot RAG (`src/app/chat/page.tsx`)
6. ✅ Déployer sur Vercel ou VPS

**Validation** : Dashboard accessible, fonctionnel, responsive

---

### 🎯 Phase 5 : Optimisations et monitoring (3-4 jours)

**Objectif** : Réduire les coûts, monitorer, alerter.

1. ✅ Implémenter le caching des embeddings (`utils/cache.py`)
2. ✅ Optimiser les prompts (réduire les tokens)
3. ✅ Implémenter les stats système (`tools/stats.py`)
4. ✅ Créer le workflow n8n de monitoring (`n8n_workflows/03_monitoring.json`)
5. ✅ Configurer les alertes Telegram
6. ✅ Mettre en place les backups automatiques

**Validation** : Coûts LLM < 5€/mois, alertes fonctionnelles

---

## 📝 Conclusion

Cette architecture est conçue pour être :
- **Modulaire** : Chaque composant est indépendant
- **Pédagogique** : Code commenté, documentation riche
- **Scalable** : Facile d'ajouter des sources, agents, tools
- **Maintenable** : Conventions claires, tests, logs structurés

**Prochaine étape** : Commencer l'implémentation avec la Phase 1 (Fondations).

Tu peux me demander d'implémenter n'importe quel fichier de cette arborescence, et je te fournirai :
- Le code complet et commenté
- Les explications pédagogiques
- Un README pour le dossier concerné

**Prêt à démarrer ? 🚀**
