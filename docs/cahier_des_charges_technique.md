# Cahier des Charges Technique - AcademiaOps
## Architecture et Spécifications Techniques

**Version** : 1.0 MVP  
**Date** : 20 février 2026  
**Projet** : AcademiaOps

---

## 📋 Table des matières

1. [Architecture globale](#1-architecture-globale)
2. [Choix technologiques](#2-choix-technologiques)
3. [Composants détaillés](#3-composants-détaillés)
4. [Contraintes d'infrastructure](#4-contraintes-dinfrastructure)
5. [Modèle de données](#5-modèle-de-données)
6. [Sécurité et authentification](#6-sécurité-et-authentification)
7. [Optimisations et performances](#7-optimisations-et-performances)
8. [Déploiement](#8-déploiement)
9. [Monitoring et observabilité](#9-monitoring-et-observabilité)
10. [Roadmap technique](#10-roadmap-technique)

---

## 1. Architecture globale

### 1.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                        INTERNET                                  │
│  (Sources: RSS, APIs GitHub, HackerNews, Reddit, blogs...)       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    VPS SCALEWAY PRO2-XXS                         │
│                   (2 vCPU, 8 Go RAM, 40 Go SSD)                  │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    n8n (Orchestrateur)                   │   │
│  │  - Workflows de collecte (cron)                          │   │
│  │  - Workflows de notification                             │   │
│  │  - Workflows d'intégration                               │   │
│  └──────────────┬──────────────────────────────────────────┘   │
│                 │ HTTP calls                                     │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Serveur MCP "AcademiaOps" (Python)              │   │
│  │  - Exposition de tools (JSON-RPC 2.0)                    │   │
│  │  - Routage vers agents Agno                              │   │
│  │  - Gestion du contexte et de l'état                      │   │
│  └──────────────┬──────────────────────────────────────────┘   │
│                 │ Function calls                                 │
│                 ▼                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │            Agno Multi-Agents System                      │   │
│  │  ┌─────────────────┐  ┌──────────────────┐             │   │
│  │  │  Classifier     │  │  Comparer        │             │   │
│  │  │  Agent          │  │  Agent           │             │   │
│  │  └─────────────────┘  └──────────────────┘             │   │
│  │  ┌─────────────────┐  ┌──────────────────┐             │   │
│  │  │  Pédago         │  │  CourseBuilder   │             │   │
│  │  │  Agent          │  │  Agent           │             │   │
│  │  └─────────────────┘  └──────────────────┘             │   │
│  │  ┌─────────────────┐  ┌──────────────────┐             │   │
│  │  │  QA Reviewer    │  │  RAG Responder   │             │   │
│  │  │  Agent          │  │  Agent           │             │   │
│  │  └─────────────────┘  └──────────────────┘             │   │
│  └──────────────┬──────────────────┬───────────────────────┘   │
│                 │                  │                             │
│                 ▼                  ▼                             │
│  ┌──────────────────────┐  ┌─────────────────────────┐         │
│  │   PostgreSQL         │  │   LanceDB               │         │
│  │   (Métadonnées)      │  │   (Vecteurs / RAG)      │         │
│  │   - items            │  │   - veille_chunks       │         │
│  │   - courses          │  │   - course_chunks       │         │
│  │   - decisions        │  │                         │         │
│  │   - topics           │  │                         │         │
│  └──────────────────────┘  └─────────────────────────┘         │
│                                                                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │         Frontend Dashboard (Next.js)                     │   │
│  │  - Interface de validation                               │   │
│  │  - Consultation des cours                                │   │
│  │  - Chatbot RAG                                           │   │
│  │  - Stats & monitoring                                    │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                   │
└───────────────────────────────────────────────────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │  Utilisateur   │
                    │  (Navigateur)  │
                    └────────────────┘
```

### 1.2 Flux de données principaux

**Flux 1 : Veille automatique**
```
Cron (n8n) → Collecte RSS/API → Déduplication → Insert DB (PostgreSQL) 
→ Appel MCP tool `batch_classify_items` → Agno Classifier Agent → LLM 
→ Update DB avec classification → Notification (Telegram/Email)
```

**Flux 2 : Validation humaine et génération de cours**
```
Dashboard → Lecture items en attente → Décision utilisateur (Oui) 
→ Appel MCP tool `generate_course` → Agno Pédago Agent (structure) 
→ Agno CourseBuilder Agent (génération) → Agno QA Reviewer Agent 
→ Chunking + Insert LanceDB → Insert PostgreSQL → Notification "Cours prêt"
```

**Flux 3 : Recherche RAG**
```
Dashboard (chatbot) → Question utilisateur → Appel MCP tool `search_knowledge_base` 
→ Génération embedding (LanceDB) → Récupération top K chunks 
→ Agno RAG Responder Agent → LLM (avec contexte) → Réponse + sources
```

---

## 2. Choix technologiques

### 2.1 Langage pour le serveur MCP : **Python**

**Justification** :
- ✅ **Écosystème IA mature** : Excellentes librairies (LangChain, Agno, LanceDB)
- ✅ **Expérience utilisateur** : Tu maîtrises déjà Python pour les SMA
- ✅ **Rapidité de développement** : Prototypage rapide pour le MVP
- ✅ **Documentation MCP** : Exemples officiels en Python

**Alternative considérée** : TypeScript (meilleure intégration avec n8n, performances) mais rejeté car courbe d'apprentissage trop importante pour ce projet pédagogique.

**Dépendances principales** :
```python
# MCP
mcp-python==1.0.0

# Multi-agents
agno==0.8.0

# LLM
anthropic==0.25.0
openai==1.30.0  # Pour GlobalGPT compatible API OpenAI

# RAG & Vector DB
lancedb==0.6.0
sentence-transformers==2.5.0

# Base de données
psycopg2-binary==2.9.9
sqlalchemy==2.0.28

# Serveur web (pour exposer MCP)
fastapi==0.110.0
uvicorn==0.27.0

# Utils
pydantic==2.6.0
python-dotenv==1.0.0
```

### 2.2 Orchestration : **n8n**

**Justification** :
- ✅ **Interface visuelle** : Facilite le debugging et la compréhension des workflows
- ✅ **Connecteurs natifs** : RSS, HTTP, PostgreSQL, Webhooks, etc.
- ✅ **Gestion d'erreurs** : Retry, catch, notifications intégrées
- ✅ **Communauté active** : Documentation riche, exemples nombreux
- ✅ **Self-hosted** : Pas de coûts récurrents

**Configuration** :
```yaml
# docker-compose.yml (extrait)
n8n:
  image: n8nio/n8n:latest
  environment:
    - N8N_BASIC_AUTH_ACTIVE=true
    - N8N_BASIC_AUTH_USER=${N8N_USER}
    - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
    - N8N_HOST=localhost
    - N8N_PORT=5678
    - N8N_PROTOCOL=http
    - WEBHOOK_URL=http://localhost:5678/
  volumes:
    - n8n_data:/home/node/.n8n
  ports:
    - "5678:5678"
```

### 2.3 Multi-agents : **Agno**

**Justification** :
- ✅ **Spécialisé multi-agents** : Conçu spécifiquement pour orchestrer des agents
- ✅ **Déterminisme** : Workflows prédictibles (vs LangGraph plus flexible mais complexe)
- ✅ **Simplicité** : API claire pour définir agents, skills, teams
- ✅ **Intégration LLM** : Support natif Claude, GPT, LocalGPT, etc.

**Structure type d'un agent Agno** :
```python
from agno import Agent, Skill

class ClassifierAgent(Agent):
    """Agent spécialisé dans la classification de contenus techniques"""
    
    def __init__(self, llm_client):
        super().__init__(
            name="Classifier",
            role="Classifier des articles techniques par sujet, impact, pertinence",
            llm=llm_client,
            skills=[
                Skill(name="extract_keywords", function=self.extract_keywords),
                Skill(name="assign_category", function=self.assign_category)
            ]
        )
    
    def extract_keywords(self, text: str) -> list[str]:
        # Logique d'extraction
        pass
    
    def assign_category(self, keywords: list[str], text: str) -> dict:
        # Logique de classification
        pass
```

### 2.4 Base de données relationnelle : **PostgreSQL**

**Justification** :
- ✅ **Robustesse** : Standard industriel, ACID
- ✅ **Extensibilité** : pgvector possible si on veut hybrid search plus tard
- ✅ **Intégration n8n** : Node natif PostgreSQL dans n8n
- ✅ **JSON support** : Pour stocker métadonnées flexibles (JSONB)

**Version** : PostgreSQL 16 (dernière stable)

### 2.5 Base de données vectorielle : **LanceDB**

**Justification** :
- ✅ **Embedded** : Pas de serveur séparé, économise les ressources
- ✅ **Open-source** : Gratuit, pas de lock-in
- ✅ **Performant** : Lance format optimisé pour les vecteurs
- ✅ **Python-first** : API simple et intuitive

**Alternative considérée** : ChromaDB (plus populaire) mais rejété car LanceDB plus léger et meilleure gestion de la mémoire.

**Configuration type** :
```python
import lancedb

# Connexion à la base (fichier local)
db = lancedb.connect("/data/lancedb")

# Création d'une table (collection)
table = db.create_table(
    "veille_chunks",
    data=[
        {
            "id": "item_123_chunk_0",
            "text": "Le Model Context Protocol (MCP) est...",
            "vector": [0.1, 0.2, ...],  # 384 dimensions (all-MiniLM-L6-v2)
            "metadata": {
                "item_id": 123,
                "source": "https://...",
                "date": "2026-02-15"
            }
        }
    ]
)
```

### 2.6 Frontend : **Next.js 14 (App Router)**

**Justification** :
- ✅ **React** : Écosystème mature pour les dashboards
- ✅ **Server Components** : Performances optimales
- ✅ **API Routes** : Backend léger pour appeler le serveur MCP
- ✅ **Déploiement flexible** : Vercel (gratuit) ou Docker sur VPS

**Stack frontend** :
- Next.js 14.1+
- TailwindCSS (styling rapide)
- Shadcn/ui (composants accessibles)
- React Query (gestion état serveur)
- Recharts (graphiques pour stats)

### 2.7 LLM : **GlobalGPT (ou similaire) + Claude 4.5**

**Stratégie hybride** :
- **GlobalGPT / GPT-3.5-turbo** (via API OpenAI compatible) pour :
  - Classification (tâche simple, batch possible)
  - Extraction de mots-clés
  - Résumés courts
  - Recherche RAG (réponses simples)
  
- **Claude 4.5 Sonnet** (via API Anthropic) pour :
  - Génération de cours (qualité maximale requise)
  - QA Review (détection d'hallucinations)
  - Comparaisons complexes

**Estimation des coûts** :
```
Classification : 20 items/jour × 500 tokens/item × 0.0005$/1K tokens (GPT-3.5) = 0.15$/mois
Génération cours : 3 cours/semaine × 10K tokens/cours × 0.015$/1K tokens (Claude Sonnet) = 1.8$/mois
RAG : 50 requêtes/semaine × 2K tokens/req × 0.0005$/1K tokens (GPT-3.5) = 0.20$/mois

TOTAL estimé : ~2.5$/mois (large marge avant les 20€)
```

---

## 3. Composants détaillés

### 3.1 Serveur MCP "AcademiaOps"

**Rôle** : Exposer des tools structurés pour que n8n, le dashboard, ou d'autres clients puissent interagir avec la logique métier (agents Agno, bases de données).

**Architecture interne** :
```
mcp_server/
├── server.py              # Point d'entrée FastAPI + MCP protocol handler
├── tools/                 # Tous les tools MCP
│   ├── __init__.py
│   ├── classification.py  # batch_classify_items
│   ├── validation.py      # get_pending_items, validate_item
│   ├── generation.py      # generate_course
│   ├── search.py          # search_courses, search_knowledge_base
│   └── stats.py           # get_stats
├── agents/                # Agents Agno
│   ├── __init__.py
│   ├── classifier.py
│   ├── comparer.py
│   ├── pedago.py
│   ├── course_builder.py
│   ├── qa_reviewer.py
│   └── rag_responder.py
├── database/              # Accès aux bases de données
│   ├── __init__.py
│   ├── postgres.py        # SQLAlchemy models + CRUD
│   └── lancedb.py         # Gestion vecteurs
├── config.py              # Configuration (env vars)
└── utils/                 # Helpers
    ├── embeddings.py      # Génération embeddings
    ├── chunking.py        # Découpage de texte
    └── llm_client.py      # Clients LLM (Anthropic, OpenAI)
```

**Exemple de tool MCP** :
```python
# tools/classification.py
from mcp import Tool, ToolInput, ToolOutput
from pydantic import BaseModel, Field

class BatchClassifyInput(BaseModel):
    """Input pour classifier plusieurs items en batch"""
    items: list[dict] = Field(description="Liste des items à classifier (id, title, url, content)")
    context: str = Field(default="", description="Contexte additionnel (mon stack actuel)")

class BatchClassifyOutput(BaseModel):
    """Output de la classification"""
    results: list[dict] = Field(description="Résultats par item (id, subject, impact, relevance, summary)")
    tokens_used: int
    cost_usd: float

@Tool(
    name="batch_classify_items",
    description="Classifie plusieurs items de veille en un seul appel LLM optimisé",
    input_schema=BatchClassifyInput,
    output_schema=BatchClassifyOutput
)
async def batch_classify_items(input: BatchClassifyInput) -> BatchClassifyOutput:
    """
    Appelle l'agent Classifier avec batching pour optimiser les coûts.
    
    Logique :
    1. Prépare un prompt structuré avec tous les items
    2. Appelle le LLM une seule fois avec JSON mode
    3. Parse les résultats
    4. Enregistre les classifications en DB
    """
    from agents.classifier import ClassifierAgent
    
    agent = ClassifierAgent(llm_client=get_llm_client("gpt-3.5-turbo"))
    results = await agent.classify_batch(input.items, context=input.context)
    
    return BatchClassifyOutput(
        results=results,
        tokens_used=agent.last_tokens_used,
        cost_usd=agent.last_cost
    )
```

**Protocole MCP** :
- JSON-RPC 2.0 over HTTP
- Endpoint : `POST http://localhost:8000/mcp/v1/tools/execute`
- Format requête :
```json
{
  "jsonrpc": "2.0",
  "id": "req_123",
  "method": "tools/execute",
  "params": {
    "tool": "batch_classify_items",
    "input": {
      "items": [
        {"id": 1, "title": "...", "content": "..."}
      ],
      "context": "Je connais déjà LangChain, RAG, PostgreSQL"
    }
  }
}
```

### 3.2 Agents Agno

**Agent 1 : Classifier**
- **Rôle** : Classifier un item par sujet (MCP, RAG, Agents, n8n, etc.), impact (High/Medium/Low), pertinence (0-10)
- **Skills** :
  - `extract_technical_terms` : Identifie les technologies mentionnées
  - `map_to_taxonomy` : Mappe à une taxonomie prédéfinie (configurable)
  - `assess_impact` : Évalue l'importance (nouveauté, maturité, adoption)
  - `calculate_relevance` : Compare avec le stack utilisateur
- **Prompt système** :
```
Tu es un expert en veille technologique IA. 
Ton rôle est de classifier des articles/repos/posts techniques.

Taxonomie des sujets :
- MCP (Model Context Protocol)
- RAG (Retrieval-Augmented Generation)
- Multi-agents (LangGraph, Agno, CrewAI, etc.)
- n8n (automatisation)
- Embeddings & Vector DBs
- Fine-tuning & RLHF
- Autre

Tu dois retourner :
- subject: l'un des sujets ci-dessus
- impact: High (révolutionnaire), Medium (intéressant), Low (marginal)
- relevance: 0-10 (10 = très pertinent pour mon stack actuel)
- summary: résumé en 150 mots max, en français
- keywords: 5 mots-clés techniques
```

**Agent 2 : Comparer**
- **Rôle** : Comparer une nouvelle techno avec celles déjà utilisées par l'utilisateur
- **Skills** :
  - `identify_alternatives` : Liste les alternatives dans mon stack
  - `compare_features` : Tableau comparatif (fonctionnalités)
  - `highlight_differentiators` : Points forts / faibles
- **Prompt système** :
```
Tu es un architecte solutions IA.
Tu dois comparer une nouvelle technologie avec celles que l'utilisateur utilise déjà.

Format de sortie :
{
  "alternatives_in_stack": ["LangChain", "LangGraph"],
  "comparison_table": {
    "Simplicité": {"new": 8, "LangChain": 6, "LangGraph": 4},
    "Flexibilité": {"new": 6, "LangChain": 9, "LangGraph": 10}
  },
  "differenciators": "MCP standardise les tools, LangGraph donne plus de contrôle sur les graphs",
  "recommendation": "Utiliser MCP pour les tools simples, LangGraph pour orchestration complexe"
}
```

**Agent 3 : Pédago**
- **Rôle** : Analyser un sujet et définir une progression pédagogique (beginner → intermediate → advanced)
- **Skills** :
  - `define_learning_objectives` : Objectifs par niveau
  - `identify_prerequisites` : Pré-requis par niveau
  - `design_curriculum` : Structure de cours (chapitres, durée estimée)
- **Output** :
```json
{
  "topic": "Model Context Protocol (MCP)",
  "levels": {
    "beginner": {
      "duration_hours": 2,
      "objectives": [
        "Comprendre ce qu'est MCP et pourquoi il existe",
        "Identifier les composants (host, server, client)",
        "Utiliser un serveur MCP existant"
      ],
      "prerequisites": ["Connaissances de base en IA", "Notions de HTTP/JSON"],
      "chapters": ["Introduction", "Architecture", "Premier tool", "Conclusion"]
    },
    "intermediate": {
      "duration_hours": 4,
      "objectives": [
        "Créer son propre serveur MCP",
        "Définir des tools avec input/output schemas",
        "Gérer les erreurs et la validation"
      ],
      "prerequisites": ["Niveau beginner validé", "Python ou TypeScript"],
      "chapters": ["Setup projet", "Définition tools", "Gestion état", "Best practices"]
    },
    "advanced": {
      "duration_hours": 6,
      "objectives": [
        "Optimiser les performances (batching, caching)",
        "Implémenter resources et prompts MCP",
        "Intégrer MCP dans une architecture multi-agents"
      ],
      "prerequisites": ["Niveau intermediate validé", "Expérience production"],
      "chapters": ["Optimisations", "Resources & Prompts", "Cas d'usage avancés", "Production"]
    }
  }
}
```

**Agent 4 : CourseBuilder**
- **Rôle** : Générer le contenu concret de chaque niveau
- **Skills** :
  - `generate_introduction` : Intro engageante
  - `explain_concepts` : Explications claires avec analogies
  - `create_examples` : Exemples concrets et testables
  - `design_tp` : Mini-TP progressif
  - `generate_quiz` : QCM avec explications des réponses
- **Template Markdown** :
```markdown
# {topic} - Niveau {level}

## 🎯 Objectifs d'apprentissage
[Liste des objectifs]

## 📚 Prérequis
[Liste des prérequis]

## 🧠 Concepts clés

### 1. {Concept 1}
**Définition** : ...

**Analogie** : Imagine que...

**Exemple** : ...

### 2. {Concept 2}
...

## 💻 Exemples concrets

### Exemple 1 : {Titre}
```python
# Code commenté
```

Explication ligne par ligne...

## 🛠️ Mini-TP : {Titre du TP}

**Objectif** : ...

**Énoncé** : ...

**Solution** : 
```python
# Solution commentée
```

## ✅ Quiz de validation

1. **Question 1** (niveau débutant)
   - [ ] Réponse A
   - [x] Réponse B (correcte)
   - [ ] Réponse C
   
   **Explication** : La réponse B est correcte car...

2. **Question 2** (niveau intermédiaire)
   ...

## 🔗 Ressources complémentaires
- [Lien 1](...)
- [Lien 2](...)

## 📝 Résumé
[Résumé en 3 phrases]
```

**Agent 5 : QA Reviewer**
- **Rôle** : Vérifier la qualité du cours généré
- **Skills** :
  - `check_coherence` : Cohérence entre les 3 niveaux
  - `detect_hallucinations` : Identifier les infos fausses ou non sourcées
  - `verify_code` : Vérifier que le code est syntaxiquement correct
  - `check_progression` : Vérifier que la difficulté augmente bien
- **Output** :
```json
{
  "overall_quality": 8.5,
  "issues": [
    {
      "level": "beginner",
      "chapter": "Exemples concrets",
      "severity": "medium",
      "description": "Le code Python utilise une syntaxe Python 3.12 qui peut être inconnue pour les débutants",
      "suggestion": "Utiliser une syntaxe plus standard (Python 3.9+)"
    }
  ],
  "hallucinations": [],
  "coherence_score": 9.0,
  "recommendation": "Approved with minor revisions"
}
```

**Agent 6 : RAG Responder**
- **Rôle** : Répondre aux questions en s'appuyant sur la base de connaissances (veille + cours)
- **Skills** :
  - `search_relevant_chunks` : Recherche vectorielle dans LanceDB
  - `synthesize_answer` : Génère une réponse contextualisée
  - `cite_sources` : Ajoute les sources (liens vers cours)
- **Prompt système** :
```
Tu es un assistant pédagogique spécialisé en IA.
Tu réponds aux questions en t'appuyant UNIQUEMENT sur la base de connaissances fournie.

Règles :
1. Si l'info n'est pas dans les chunks fournis, dis "Je n'ai pas assez d'information sur ce sujet"
2. Cite toujours tes sources (ex : "D'après le cours MCP niveau intermédiaire...")
3. Sois concis mais complet (max 300 mots)
4. Utilise des analogies si ça aide à la compréhension
5. Propose des liens vers les cours complets pour approfondir
```

### 3.3 Workflows n8n

**Workflow 1 : Collecte veille quotidienne**

Nodes :
```
1. Cron Trigger (tous les jours à 8h)
   ↓
2. HTTP Request (HackerNews API) → récupère top stories
   ↓
3. HTTP Request (Reddit RSS) → récupère r/MachineLearning
   ↓
4. HTTP Request (GitHub Trending) → repos IA du jour
   ↓
5. Merge (combine les 3 sources)
   ↓
6. Function (déduplication par URL)
   ↓
7. PostgreSQL (insert items avec statut pending_classification)
   ↓
8. Wait 5 seconds (laisser les inserts se terminer)
   ↓
9. HTTP Request (POST vers MCP server)
   - Endpoint: http://mcp-server:8000/mcp/v1/tools/execute
   - Body:
     {
       "jsonrpc": "2.0",
       "id": "{{$json.workflow_id}}",
       "method": "tools/execute",
       "params": {
         "tool": "batch_classify_items",
         "input": {
           "items": "{{$json.items}}"
         }
       }
     }
   ↓
10. PostgreSQL (update items avec classification)
   ↓
11. IF (nombre d'items > 0)
   ↓
12. HTTP Request (Telegram API) → notification
    - Message: "🔔 {{$json.count}} nouveautés à valider !"
```

**Workflow 2 : Génération de cours (déclenché par validation humaine)**

Nodes :
```
1. Webhook Trigger 
   - URL: http://n8n:5678/webhook/generate-course
   - Payload: {"item_id": 123}
   ↓
2. HTTP Request (POST vers MCP server)
   - Tool: generate_course
   - Input: {"item_id": 123, "levels": ["beginner", "intermediate", "advanced"]}
   ↓
3. Wait for webhook response (peut prendre 1-2 minutes)
   ↓
4. IF (status === "success")
   ↓
5. HTTP Request (Telegram) → notification "✅ Cours généré pour {topic}"
   ↓
6. ELSE → HTTP Request (Telegram) → "❌ Erreur génération cours"
```

**Workflow 3 : Monitoring quotidien**

Nodes :
```
1. Cron (tous les jours à 20h)
   ↓
2. HTTP Request (GET MCP server/stats)
   ↓
3. Function (formatter les stats en message)
   ↓
4. HTTP Request (Telegram) → rapport quotidien
   - Message:
     📊 Rapport quotidien AcademiaOps
     
     Veille :
     - Items collectés : 15
     - Items validés "Oui" : 2
     - Items archivés : 13
     
     Cours :
     - Cours générés : 2 (MCP, LanceDB)
     - Tokens LLM utilisés : 45K
     - Coût estimé : 0.68€
     
     Système :
     - RAM VPS : 6.2/8 Go
     - CPU : 45%
     - Disk : 12/40 Go
```

---

## 4. Contraintes d'infrastructure

### 4.1 Environnement de développement : Mac Pro (local)

**Contexte** : Développement et tests en local sur un Mac Pro puissant, déploiement futur sur serveur dédié.

**Caractéristiques Mac Pro** :
- **CPU** : Multi-cores (M1/M2/M3 ou Intel i9) - Largement suffisant
- **RAM** : 16 Go minimum (32 Go+ recommandé pour confort)
- **Stockage** : SSD rapide (500 Go+)
- **OS** : macOS (Docker Desktop pour Mac)

**Avantages par rapport au VPS** :
- ✅ Pas de contraintes de ressources pour le MVP
- ✅ Développement rapide (hot reload sans latence réseau)
- ✅ Pas de coûts d'hébergement pendant le développement
- ✅ Debugging facile (logs accessibles immédiatement)

### 4.2 Répartition des ressources (estimation Mac Pro)

| Composant | RAM | CPU (idle) | CPU (peak) | Disk |
|-----------|-----|------------|------------|------|
| PostgreSQL | 512 Mo | 2% | 10% | 2 Go |
| LanceDB (embedded) | 1 Go | 1% | 15% | 5 Go |
| n8n | 300 Mo | 2% | 10% | 500 Mo |
| MCP Server + Agno | 2 Go | 5% | 40% | 1 Go |
| Next.js (local) | 400 Mo | 3% | 15% | 500 Mo |
| Docker Desktop | 1 Go | 5% | - | 2 Go |
| **Total utilisé** | ~5 Go | ~18% | - | ~11 Go |
| **Disponible (16 Go RAM)** | 11 Go | - | - | 489 Go |

**Aucune contrainte de ressources** : Le Mac Pro peut largement supporter tous les services en parallèle.

### 4.3 Stratégies de purge et TTL

**PostgreSQL** :
- **TTL items de veille** : 90 jours (après ça, archivage ou suppression)
- **TTL logs** : 30 jours
- **Soft delete** : Décisions humaines = jamais supprimées (précieuses)

**LanceDB** :
- **TTL vecteurs de veille** : 90 jours (sync avec PostgreSQL)
- **Vecteurs de cours** : Jamais supprimés (ou versioning intelligent)
- **Compaction** : Tous les dimanches (réduire la taille des fichiers)

**Monitoring du disk (Mac)** :
```bash
# Cron quotidien (optionnel en local)
df -h / | tail -1 | awk '{print $5}' | sed 's/%//' > /tmp/disk_usage.txt
if [ $(cat /tmp/disk_usage.txt) -gt 80 ]; then
  # Notification macOS
  osascript -e 'display notification "Disk usage: $(cat /tmp/disk_usage.txt)%" with title "AcademiaOps"'
fi
```

---

## 5. Modèle de données

### 5.1 PostgreSQL - Schéma complet

```sql
-- ========================================
-- TABLE: topics
-- Description: Taxonomie des sujets de veille
-- ========================================
CREATE TABLE topics (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,  -- ex: "MCP", "RAG", "Multi-agents"
    description TEXT,
    parent_id INTEGER REFERENCES topics(id),  -- Hiérarchie possible (ex: "RAG" parent de "RAG optimizations")
    created_at TIMESTAMP DEFAULT NOW()
);

-- Index pour les recherches hiérarchiques
CREATE INDEX idx_topics_parent ON topics(parent_id);

-- ========================================
-- TABLE: sources
-- Description: Sources de veille configurées
-- ========================================
CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,  -- ex: "HackerNews", "r/MachineLearning"
    type VARCHAR(50) NOT NULL,   -- "rss", "api", "github", "scraping"
    url TEXT NOT NULL,
    config JSONB,                -- Configuration spécifique (headers, auth, etc.)
    active BOOLEAN DEFAULT true,
    last_fetch_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- TABLE: items
-- Description: Items de veille collectés
-- ========================================
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL REFERENCES sources(id),
    
    -- Données brutes
    title TEXT NOT NULL,
    url TEXT UNIQUE NOT NULL,    -- Clé de déduplication
    content TEXT,                 -- Contenu extrait (si disponible)
    author VARCHAR(200),
    published_at TIMESTAMP,
    
    -- Classification (rempli par agent Classifier)
    topic_id INTEGER REFERENCES topics(id),
    subject VARCHAR(100),         -- Redondant avec topic, mais plus flexible
    impact VARCHAR(20),           -- "High", "Medium", "Low"
    relevance INTEGER CHECK (relevance >= 0 AND relevance <= 10),
    summary TEXT,                 -- Résumé généré
    keywords TEXT[],              -- Array de mots-clés
    
    -- État et workflow
    status VARCHAR(50) DEFAULT 'pending_classification',  
    -- Valeurs possibles:
    --   - pending_classification
    --   - pending_validation
    --   - validated_yes
    --   - validated_no
    --   - validated_later
    --   - course_generated
    --   - archived
    
    -- Métadonnées techniques
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    
    -- Timestamps
    collected_at TIMESTAMP DEFAULT NOW(),
    classified_at TIMESTAMP,
    validated_at TIMESTAMP
);

-- Index pour performances
CREATE INDEX idx_items_status ON items(status);
CREATE INDEX idx_items_topic ON items(topic_id);
CREATE INDEX idx_items_collected_at ON items(collected_at DESC);
CREATE INDEX idx_items_url_hash ON items USING hash(url);

-- ========================================
-- TABLE: decisions
-- Description: Décisions humaines sur les items
-- ========================================
CREATE TABLE decisions (
    id SERIAL PRIMARY KEY,
    item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
    decision VARCHAR(20) NOT NULL,  -- "yes", "no", "later"
    reason TEXT,                     -- Justification libre (optionnel)
    notes TEXT,                      -- Notes personnelles
    decided_by VARCHAR(100),         -- Pour multi-users futur
    decided_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_decisions_item ON decisions(item_id);

-- ========================================
-- TABLE: courses
-- Description: Cours générés
-- ========================================
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,  -- Peut être NULL si cours créé manuellement
    topic_id INTEGER NOT NULL REFERENCES topics(id),
    
    -- Métadonnées
    title VARCHAR(300) NOT NULL,
    level VARCHAR(50) NOT NULL,      -- "beginner", "intermediate", "advanced"
    language VARCHAR(10) DEFAULT 'fr',
    
    -- Contenu
    content TEXT NOT NULL,            -- Markdown complet
    structure JSONB,                  -- Structure du cours (chapitres, durée, etc.)
    
    -- Métadonnées pédagogiques
    objectives TEXT[],
    prerequisites TEXT[],
    duration_hours DECIMAL(4, 1),
    
    -- QA et qualité
    qa_score DECIMAL(3, 1),           -- Score du QA Reviewer (0-10)
    qa_issues JSONB,                  -- Issues détectées
    
    -- Versioning
    version INTEGER DEFAULT 1,
    parent_id INTEGER REFERENCES courses(id),  -- Lien vers version précédente
    
    -- État
    status VARCHAR(50) DEFAULT 'draft',  -- "draft", "published", "archived"
    
    -- Métadonnées techniques
    tokens_used INTEGER DEFAULT 0,
    cost_usd DECIMAL(10, 6) DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    published_at TIMESTAMP
);

-- Index
CREATE INDEX idx_courses_topic_level ON courses(topic_id, level);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_created ON courses(created_at DESC);
CREATE UNIQUE INDEX idx_courses_unique ON courses(topic_id, level, version) WHERE status = 'published';

-- ========================================
-- TABLE: user_progress (pour futur)
-- Description: Suivi de progression utilisateur
-- ========================================
CREATE TABLE user_progress (
    id SERIAL PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,   -- Pour futur multi-users
    course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    status VARCHAR(50) DEFAULT 'not_started',  -- "not_started", "in_progress", "completed"
    progress_percent INTEGER CHECK (progress_percent >= 0 AND progress_percent <= 100),
    quiz_score DECIMAL(5, 2),        -- Score au quiz (%)
    
    notes TEXT,                       -- Notes personnelles
    
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    last_accessed_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_progress_user_status ON user_progress(user_id, status);

-- ========================================
-- TABLE: system_stats
-- Description: Statistiques système pour monitoring
-- ========================================
CREATE TABLE system_stats (
    id SERIAL PRIMARY KEY,
    date DATE NOT NULL UNIQUE,
    
    -- Stats veille
    items_collected INTEGER DEFAULT 0,
    items_classified INTEGER DEFAULT 0,
    items_validated_yes INTEGER DEFAULT 0,
    items_validated_no INTEGER DEFAULT 0,
    
    -- Stats cours
    courses_generated INTEGER DEFAULT 0,
    
    -- Stats LLM
    total_tokens_used INTEGER DEFAULT 0,
    total_cost_usd DECIMAL(10, 6) DEFAULT 0,
    
    -- Stats système
    avg_ram_usage_mb INTEGER,
    avg_cpu_usage_percent INTEGER,
    disk_usage_gb DECIMAL(6, 2),
    
    created_at TIMESTAMP DEFAULT NOW()
);

-- ========================================
-- VUE: pending_items_summary
-- Description: Vue pour le dashboard (items en attente)
-- ========================================
CREATE VIEW pending_items_summary AS
SELECT 
    i.id,
    i.title,
    i.url,
    i.summary,
    i.subject,
    i.impact,
    i.relevance,
    i.published_at,
    i.classified_at,
    s.name AS source_name,
    t.name AS topic_name
FROM items i
LEFT JOIN sources s ON i.source_id = s.id
LEFT JOIN topics t ON i.topic_id = t.id
WHERE i.status = 'pending_validation'
ORDER BY i.relevance DESC, i.classified_at DESC;

-- ========================================
-- VUE: courses_catalog
-- Description: Vue pour le catalogue de cours
-- ========================================
CREATE VIEW courses_catalog AS
SELECT 
    c.id,
    c.title,
    c.level,
    c.duration_hours,
    c.qa_score,
    c.published_at,
    t.name AS topic_name,
    t.description AS topic_description,
    COALESCE((
        SELECT COUNT(*)
        FROM user_progress up
        WHERE up.course_id = c.id AND up.status = 'completed'
    ), 0) AS completions_count
FROM courses c
LEFT JOIN topics t ON c.topic_id = t.id
WHERE c.status = 'published'
ORDER BY c.published_at DESC;
```

### 5.2 LanceDB - Collections

**Collection 1 : `veille_chunks`**

Structure :
```python
{
    "id": str,                 # Format: "item_{item_id}_chunk_{idx}"
    "text": str,               # Chunk de texte (max 500 tokens)
    "vector": list[float],     # Embedding (384 dimensions, all-MiniLM-L6-v2)
    "metadata": {
        "item_id": int,
        "source_name": str,
        "topic": str,
        "url": str,
        "published_at": str,   # ISO format
        "chunk_index": int,
        "total_chunks": int
    }
}
```

**Collection 2 : `course_chunks`**

Structure :
```python
{
    "id": str,                 # Format: "course_{course_id}_chunk_{idx}"
    "text": str,               # Chunk de cours (max 500 tokens)
    "vector": list[float],     # Embedding
    "metadata": {
        "course_id": int,
        "topic": str,
        "level": str,          # "beginner", "intermediate", "advanced"
        "chapter": str,        # Nom du chapitre
        "chunk_index": int,
        "total_chunks": int
    }
}
```

**Stratégie de chunking** :
- **Taille cible** : 500 tokens (~375 mots)
- **Overlap** : 50 tokens (pour conserver le contexte)
- **Découpage** : Par paragraphes, puis par phrases si nécessaire
- **Préservation** : Blocs de code = jamais coupés

**Embedding model** : `sentence-transformers/all-MiniLM-L6-v2`
- Raison : Léger (80 Mo), rapide, bon compromis qualité/performance
- Dimensions : 384
- Langues supportées : Français + Anglais

---

## 6. Sécurité et authentification

### 6.1 Stratégie MVP (simple)

- **Dashboard** : Basic Auth (login/password via Next-Auth) ou simple auth avec JWT
- **MCP Server** : Pas d'exposition publique (localhost ou réseau Docker interne)
- **n8n** : Basic Auth activé (cf. docker-compose)
- **PostgreSQL** : User dédié avec mot de passe fort, pas d'exposition publique
- **LanceDB** : Fichier local, pas de réseau

### 6.2 Gestion des secrets

**.env (à la racine du projet)** :
```bash
# PostgreSQL
POSTGRES_USER=academiaops
POSTGRES_PASSWORD=<généré avec pwgen 32>
POSTGRES_DB=academiaops
POSTGRES_HOST=postgres
POSTGRES_PORT=5432

# n8n
N8N_USER=admin
N8N_PASSWORD=<généré avec pwgen 32>

# LLM APIs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...  # Ou GlobalGPT endpoint

# Telegram (notifications)
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_CHAT_ID=123456789

# Dashboard
NEXTAUTH_SECRET=<généré avec openssl rand -base64 32>
NEXTAUTH_URL=http://localhost:3000

# MCP Server
MCP_SERVER_HOST=0.0.0.0
MCP_SERVER_PORT=8000
```

**⚠️ Important** : Le `.env` est dans `.gitignore`, fourni un `.env.example` sans valeurs sensibles.

### 6.3 Réseau Docker

```yaml
# docker-compose.yml (extrait)
networks:
  academiaops:
    driver: bridge

services:
  postgres:
    networks:
      - academiaops
    # Pas de ports exposés publiquement
  
  mcp-server:
    networks:
      - academiaops
    ports:
      - "8000:8000"  # Exposition locale seulement (pas de 0.0.0.0)
  
  n8n:
    networks:
      - academiaops
    ports:
      - "5678:5678"  # Mettre derrière Nginx + BasicAuth en prod
```

---

## 7. Optimisations et performances

### 7.1 Optimisation des appels LLM

**Technique 1 : Batching**
```python
# ❌ Mauvais (20 appels LLM)
for item in items:
    result = llm.classify(item)

# ✅ Bon (1 appel LLM)
batch_prompt = f"""
Classifie les {len(items)} articles suivants en JSON array.

Articles:
{json.dumps([{"id": i.id, "title": i.title, "content": i.content} for i in items])}

Format de sortie attendu:
[
  {{"id": 1, "subject": "MCP", "impact": "High", "relevance": 9, "summary": "..."}},
  ...
]
"""
results = llm.classify_batch(batch_prompt)
```

**Économies** : 20 appels × 0.002$ = 0.04$ → 1 appel × 0.005$ = 0.005$ (8x moins cher)

**Technique 2 : Caching**
```python
from functools import lru_cache
import hashlib

@lru_cache(maxsize=100)
def get_embedding_cached(text: str) -> list[float]:
    """Cache les embeddings pour éviter de recalculer les mêmes textes"""
    text_hash = hashlib.sha256(text.encode()).hexdigest()
    # Vérifier en DB si déjà calculé
    cached = db.get_embedding_by_hash(text_hash)
    if cached:
        return cached
    # Calculer et stocker
    embedding = embedding_model.encode(text)
    db.store_embedding(text_hash, embedding)
    return embedding
```

**Technique 3 : Choix du modèle par tâche**
```python
# Matrice de décision
TASK_TO_MODEL = {
    "classification": "gpt-3.5-turbo",      # Simple, rapide, pas cher
    "summarization": "gpt-3.5-turbo",
    "course_generation": "claude-sonnet-4",  # Qualité max
    "qa_review": "claude-sonnet-4",
    "rag_response": "gpt-3.5-turbo",        # Si simple
}

def get_optimal_model(task: str) -> str:
    return TASK_TO_MODEL.get(task, "gpt-3.5-turbo")
```

### 7.2 Optimisation LanceDB

**Technique 1 : Index HNSW**
```python
import lancedb

db = lancedb.connect("/data/lancedb")
table = db.open_table("course_chunks")

# Créer un index HNSW pour recherche rapide
table.create_index(
    metric="cosine",
    num_partitions=256,
    num_sub_vectors=96,
    index_type="IVF_PQ"  # Inverted File with Product Quantization
)
```

**Gains** : Recherche sur 10K vecteurs passe de 200ms à 20ms

**Technique 2 : Limiter les résultats**
```python
# ✅ Bon : limiter à top 5
results = table.search(query_vector).limit(5).to_pandas()

# ❌ Mauvais : récupérer tout puis filter en Python
results = table.search(query_vector).to_pandas()
top5 = results.head(5)
```

### 7.3 Optimisation PostgreSQL

**Indexes créés** : Cf. schéma SQL ci-dessus

**Configuration PostgreSQL** (pour 8 Go RAM) :
```ini
# /etc/postgresql/16/main/postgresql.conf
shared_buffers = 512MB               # 1/16 de la RAM totale
effective_cache_size = 4GB           # 1/2 de la RAM totale
maintenance_work_mem = 128MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1               # SSD
effective_io_concurrency = 200       # SSD
work_mem = 32MB
min_wal_size = 1GB
max_wal_size = 4GB
max_connections = 20                 # Limiter pour économiser RAM
```

**Vacuuming automatique** :
```sql
ALTER TABLE items SET (autovacuum_vacuum_scale_factor = 0.1);
ALTER TABLE courses SET (autovacuum_vacuum_scale_factor = 0.1);
```

---

## 8. Déploiement

### 8.1 Architecture Docker Compose

```yaml
version: '3.8'

services:
  # ===================================
  # PostgreSQL
  # ===================================
  postgres:
    image: postgres:16-alpine
    container_name: academiaops-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./database/init.sql:/docker-entrypoint-initdb.d/init.sql
    networks:
      - academiaops
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 10s
      timeout: 5s
      retries: 5

  # ===================================
  # n8n
  # ===================================
  n8n:
    image: n8nio/n8n:latest
    container_name: academiaops-n8n
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
      - N8N_HOST=localhost
      - N8N_PORT=5678
      - N8N_PROTOCOL=http
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=${POSTGRES_DB}_n8n
      - DB_POSTGRESDB_USER=${POSTGRES_USER}
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}
    volumes:
      - n8n_data:/home/node/.n8n
    ports:
      - "5678:5678"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - academiaops
    restart: unless-stopped

  # ===================================
  # MCP Server + Agno
  # ===================================
  mcp-server:
    build:
      context: ./mcp_server
      dockerfile: Dockerfile
    container_name: academiaops-mcp
    environment:
      - POSTGRES_HOST=postgres
      - POSTGRES_PORT=5432
      - POSTGRES_USER=${POSTGRES_USER}
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=${POSTGRES_DB}
      - LANCEDB_PATH=/data/lancedb
      - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}
      - OPENAI_API_KEY=${OPENAI_API_KEY}
      - LOG_LEVEL=INFO
    volumes:
      - lancedb_data:/data/lancedb
      - ./mcp_server:/app  # Hot reload en dev
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
    networks:
      - academiaops
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  # ===================================
  # Frontend Dashboard (optionnel sur VPS)
  # ===================================
  # Si déployé sur Vercel, commenter cette section
  dashboard:
    build:
      context: ./dashboard
      dockerfile: Dockerfile
    container_name: academiaops-dashboard
    environment:
      - MCP_SERVER_URL=http://mcp-server:8000
      - NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
      - NEXTAUTH_URL=${NEXTAUTH_URL}
    ports:
      - "3000:3000"
    depends_on:
      - mcp-server
    networks:
      - academiaops
    restart: unless-stopped

volumes:
  postgres_data:
  n8n_data:
  lancedb_data:

networks:
  academiaops:
    driver: bridge
```

### 8.2 Dockerfile MCP Server

```dockerfile
# mcp_server/Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Installer les dépendances système
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copier requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copier le code
COPY . .

# Health check script
RUN echo '#!/bin/bash\ncurl -f http://localhost:8000/health || exit 1' > /healthcheck.sh && \
    chmod +x /healthcheck.sh

# Exposer le port
EXPOSE 8000

# Commande de démarrage
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
```

### 8.3 Procédure de déploiement (Mac local)

**1. Préparation du Mac**
```bash
# Installer Docker Desktop pour Mac (si pas déjà fait)
# Télécharger depuis : https://www.docker.com/products/docker-desktop/

# Vérifier l'installation
docker --version
docker-compose --version

# Optionnel : Augmenter les ressources Docker Desktop
# Docker Desktop > Settings > Resources
# RAM : 8 Go minimum, 12 Go recommandé
# CPU : 4 cores minimum
```

**2. Cloner le projet**
```bash
cd ~/Desktop  # ou autre emplacement de ton choix
git clone https://github.com/<user>/academiaops.git
cd academiaops
```

**3. Configurer les variables d'environnement**
```bash
cp .env.example .env
nano .env  # Remplir les secrets
```

**4. Initialiser la base de données**
```bash
docker-compose up -d postgres
docker-compose exec postgres psql -U academiaops -d academiaops -f /docker-entrypoint-initdb.d/init.sql
```

**5. Lancer tous les services**
```bash
docker-compose up -d
docker-compose ps  # Vérifier que tout est "Up"
```

**6. Vérifier les logs**
```bash
docker-compose logs -f mcp-server
```

**7. Importer les workflows n8n**
```bash
# Ouvrir http://<VPS_IP>:5678
# Login avec N8N_USER / N8N_PASSWORD
# Importer les fichiers JSON depuis ./n8n_workflows/
```

### 8.4 Backup et restauration

**Backup PostgreSQL (quotidien)** :
```bash
# Cron job (tous les jours à 3h du matin)
0 3 * * * docker-compose exec -T postgres pg_dump -U academiaops academiaops | gzip > /backups/academiaops_$(date +\%Y\%m\%d).sql.gz

# Conserver seulement les 30 derniers jours
find /backups -name "academiaops_*.sql.gz" -mtime +30 -delete
```

**Backup LanceDB (hebdomadaire)** :
```bash
# Cron job (tous les dimanches à 4h)
0 4 * * 0 tar -czf /backups/lancedb_$(date +\%Y\%m\%d).tar.gz /var/lib/docker/volumes/academiaops_lancedb_data

# Conserver seulement les 8 dernières semaines
find /backups -name "lancedb_*.tar.gz" -mtime +56 -delete
```

**Restauration** :
```bash
# PostgreSQL
gunzip < /backups/academiaops_20260220.sql.gz | docker-compose exec -T postgres psql -U academiaops -d academiaops

# LanceDB
docker-compose down mcp-server
tar -xzf /backups/lancedb_20260220.tar.gz -C /
docker-compose up -d mcp-server
```

---

## 9. Monitoring et observabilité

### 9.1 Logs structurés

**Format JSON** :
```python
# mcp_server/utils/logger.py
import logging
import json
from datetime import datetime

class JSONFormatter(logging.Formatter):
    def format(self, record):
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno
        }
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
        return json.dumps(log_data)

# Usage
logger = logging.getLogger("academiaops")
logger.setLevel(logging.INFO)
handler = logging.StreamHandler()
handler.setFormatter(JSONFormatter())
logger.addHandler(handler)
```

**Centralisation** : Logs Docker → stdout → Docker logs (rotation automatique)

### 9.2 Métriques système

**Script de monitoring (tous les 5 minutes)** :
```python
# mcp_server/utils/system_monitor.py
import psutil
from database.postgres import get_db

def record_system_metrics():
    """Enregistre les métriques système en DB"""
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    # Insérer en DB
    db = get_db()
    db.execute("""
        INSERT INTO system_stats (
            date, 
            avg_cpu_usage_percent, 
            avg_ram_usage_mb, 
            disk_usage_gb
        ) VALUES (
            CURRENT_DATE,
            %s,
            %s,
            %s
        ) ON CONFLICT (date) DO UPDATE SET
            avg_cpu_usage_percent = (system_stats.avg_cpu_usage_percent + EXCLUDED.avg_cpu_usage_percent) / 2,
            avg_ram_usage_mb = (system_stats.avg_ram_usage_mb + EXCLUDED.avg_ram_usage_mb) / 2,
            disk_usage_gb = EXCLUDED.disk_usage_gb
    """, (cpu_percent, memory.used / 1024 / 1024, disk.used / 1024 / 1024 / 1024))
```

### 9.3 Alertes

**Alertes Telegram** (via n8n workflow dédié) :
- ❌ Erreur critique dans MCP server (5xx)
- ⚠️ RAM > 90%
- ⚠️ Disk > 80%
- ⚠️ Coût LLM du mois > 15€

---

## 10. Roadmap technique

### 10.1 Phase 1 : Fondations (Semaine 1-2)

**Objectifs** :
- ✅ Serveur MCP minimal fonctionnel
- ✅ 1 tool "hello world" opérationnel
- ✅ Base PostgreSQL initialisée
- ✅ n8n installé et accessible

**Livrables** :
- Docker Compose up
- Appel MCP `tools/execute` retourne une réponse valide
- PostgreSQL accessible depuis MCP server

**Validation** :
```bash
curl -X POST http://localhost:8000/mcp/v1/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test_1",
    "method": "tools/execute",
    "params": {
      "tool": "hello_world",
      "input": {"name": "World"}
    }
  }'
```

### 10.2 Phase 2 : Veille et classification (Semaine 3-4)

**Objectifs** :
- ✅ n8n workflow de collecte RSS fonctionnel
- ✅ Tool MCP `batch_classify_items` implémenté
- ✅ Agent Agno Classifier opérationnel
- ✅ Stockage des classifications en PostgreSQL

**Livrables** :
- Collecter 100 items réels
- Les classifier automatiquement
- Vérifier la qualité des classifications manuellement

**Validation** :
```sql
SELECT subject, COUNT(*), AVG(relevance) 
FROM items 
WHERE status = 'pending_validation' 
GROUP BY subject;
```

### 10.3 Phase 3 : Génération de cours (Semaine 5-6)

**Objectifs** :
- ✅ Tool MCP `generate_course` implémenté
- ✅ Agents Agno Pédago, CourseBuilder, QA Reviewer opérationnels
- ✅ Chunking et indexation LanceDB fonctionnels

**Livrables** :
- Générer 3 cours complets (1 par niveau) pour 1 sujet test (ex : MCP)
- Valider la qualité du contenu manuellement
- Vérifier l'indexation vectorielle

**Validation** :
```python
# Test de recherche RAG
results = lancedb_table.search(
    embedding_model.encode("Qu'est-ce que MCP ?")
).limit(3).to_pandas()
print(results[["text", "metadata"]])
```

### 10.4 Phase 4 : Dashboard (Semaine 7-8)

**Objectifs** :
- ✅ Interface Next.js déployée (Vercel ou VPS)
- ✅ Page de validation des items
- ✅ Page de consultation des cours
- ✅ Chatbot RAG basique

**Livrables** :
- Dashboard accessible et responsive
- Pouvoir valider un item depuis le dashboard
- Pouvoir lire un cours généré
- Poser une question au chatbot

### 10.5 Phase 5 : Optimisations (Semaine 9-10)

**Objectifs** :
- ✅ Batching des appels LLM opérationnel
- ✅ Caching des embeddings
- ✅ TTL et purge automatique
- ✅ Monitoring et alertes

**Livrables** :
- Réduire les coûts LLM de 50%
- Dashboard stats fonctionnel
- Alertes Telegram configurées
- Documentation complète à jour

---

## 📝 Notes finales

**Ce cahier des charges technique constitue le blueprint pour l'implémentation du projet AcademiaOps.**

**Principes directeurs** :
1. **Pragmatisme** : Choisir la solution la plus simple qui fonctionne
2. **Optimisation prématurée** : Éviter, mais anticiper les gains faciles (batching, caching)
3. **Documentation** : Chaque composant doit être compréhensible par un tiers
4. **Tests** : Au minimum sur les agents critiques (Classifier, CourseBuilder)

**Prochaine étape** : Créer l'arborescence de projet détaillée avec explications par dossier.
