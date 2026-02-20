# Feature 1 – Docker + Database + MCP Server 🐳

**Branche** : `feature/docker-database-setup`  
**Date** : 20 février 2026  
**Statut** : ✅ Validé et testé  
**Commit** : `3aab94f`

---

## 🎯 Objectif de la feature

Créer l'infrastructure de base d'AcademiaOps :
- **Docker Compose** pour orchestrer les services (PostgreSQL, n8n, MCP Server)
- **Base de données PostgreSQL** avec schéma complet et données de test
- **Serveur MCP** (Model Context Protocol) avec JSON-RPC 2.0
- **Premier tool** (`hello.world`) pour valider la communication

---

## 📦 Ce qui a été implémenté

### 1. Docker Compose (`docker-compose.yml`)

**Services créés** :
- **PostgreSQL 16** (Alpine) : Base de données principale
  - Port : 5432
  - Database : `academiaops`
  - User : `academiaops_user`
  - Healthcheck intégré
  - Volume persistant : `postgres_data`

- **n8n** (workflow orchestration) : À venir
  - Port : 5678
  - Auth basique (admin/admin à changer)
  - Connecté à PostgreSQL pour stocker les workflows
  - Volume persistant : `n8n_data`

- **MCP Server** (FastAPI + JSON-RPC) :
  - Port : 8000
  - Build depuis `mcp_server/Dockerfile`
  - Connecté à PostgreSQL
  - Volume pour LanceDB : `lancedb_data`
  - Logs persistants dans `./logs`

**Réseau** : `academiaops-network` (bridge)

**Variables d'environnement** : Définies dans `.env` (voir `.env.example`)

---

### 2. Base de données PostgreSQL

#### **Schéma (`database/init.sql`)**

**8 tables créées** :

| Table | Description | Lignes clés |
|-------|-------------|-------------|
| `items` | Items de veille (articles, repos GitHub) | Source, contenu, classification, validation |
| `topics` | Taxonomie (MCP, RAG, Multi-agents, n8n, etc.) | Hiérarchie, compteur d'items |
| `courses` | Cours générés par les agents | 3 niveaux (beginner, intermediate, advanced) |
| `decisions` | Décisions de validation (pour apprentissage) | Feedback utilisateur, override classification |
| `user_progress` | Progression d'apprentissage utilisateur | Pourcentage, timestamps |
| `rag_queries` | Historique des questions RAG | Query, answer, sources, feedback |
| `system_logs` | Logs applicatifs structurés | Level, component, event_type, context JSON |

**Extensions PostgreSQL activées** :
- `uuid-ossp` : Génération d'UUIDs
- `pg_trgm` : Recherche floue (fuzzy text search)

**Triggers** :
- `update_updated_at_column` : Auto-update du champ `updated_at`
- `update_topic_item_count` : Synchronisation du compteur d'items par topic

**Views utilitaires** :
- `pending_items_view` : Items en attente de validation
- `published_courses_view` : Cours publiés avec statistiques

**Indexes** : 20+ indexes pour optimiser les requêtes fréquentes

---

#### **Données de test (`database/seed.sql`)**

**5 items de veille** :
- "Introducing the Model Context Protocol" (MCP, High impact)
- "LangChain: Building applications with LLMs" (Multi-agents, High)
- "n8n workflow automation best practices" (n8n, Medium)
- "New OpenAI Embeddings API" (Embeddings, High)
- "Understanding vector databases" (Embeddings, Medium)

**3 cours** :
- "Introduction au Model Context Protocol" (beginner, published)
- "MCP Avancé: Créer vos propres Tools" (advanced, published)
- "Guide des Embeddings pour le RAG" (intermediate, draft)

**2 décisions utilisateur** :
- Validation d'item (approve)
- Override de classification (modify)

**3 progressions utilisateur** :
- demo@academiaops.com : 2 cours (1 completed, 1 in-progress)
- student@example.com : 1 cours (in-progress)

**2 requêtes RAG** :
- "Comment créer un Tool MCP personnalisé ?"
- "Quelle est la différence entre MCP et LangChain ?"

**4 logs système** :
- Workflow n8n exécuté
- Item classifié
- Cours généré
- Warning rate limit API

---

### 3. Serveur MCP (`mcp_server/`)

#### **Architecture**

```
mcp_server/
├── __init__.py              # Package init
├── config.py                # Configuration (pydantic-settings)
├── server.py                # FastAPI + JSON-RPC 2.0
├── Dockerfile               # Image Docker Python 3.10
├── tools/
│   ├── __init__.py
│   └── hello.py             # Tool hello.world
├── agents/                  # (vide pour l'instant)
└── skills/                  # (vide pour l'instant)
```

---

#### **Configuration (`config.py`)**

**Classe `Settings`** avec validation Pydantic :
- Environment (development/production)
- Database URL (PostgreSQL)
- LanceDB path
- API keys (OpenAI, Anthropic)
- Rate limiting
- Cost tracking (prix par 1k tokens)

**Chargement depuis `.env`** : `Settings()` lit automatiquement `.env`

---

#### **Serveur FastAPI (`server.py`)**

**Endpoints** :

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/` | GET | Informations du serveur |
| `/health` | GET | Healthcheck (pour Docker et monitoring) |
| `/rpc` | POST | **Endpoint JSON-RPC 2.0** (principal) |

**Protocole JSON-RPC 2.0** :

**Request** :
```json
{
  "jsonrpc": "2.0",
  "method": "nom.du.tool",
  "params": {"param1": "value1"},
  "id": 1
}
```

**Response (succès)** :
```json
{
  "jsonrpc": "2.0",
  "result": { ... },
  "error": null,
  "id": 1
}
```

**Response (erreur)** :
```json
{
  "jsonrpc": "2.0",
  "result": null,
  "error": {
    "code": -32601,
    "message": "Method not found: ...",
    "data": { ... }
  },
  "id": 1
}
```

**Codes d'erreur implémentés** :

| Code | Nom | Description |
|------|-----|-------------|
| -32700 | PARSE_ERROR | Erreur de parsing JSON |
| -32600 | INVALID_REQUEST | Requête JSON-RPC invalide |
| -32601 | METHOD_NOT_FOUND | Tool non trouvé |
| -32602 | INVALID_PARAMS | Paramètres invalides |
| -32603 | INTERNAL_ERROR | Erreur interne du serveur |
| -32000 | TOOL_EXECUTION_ERROR | Erreur lors de l'exécution du tool |

---

#### **Tool Registry**

**Classe `ToolRegistry`** :
- Registre dynamique des tools
- Méthode `register()` pour enregistrer un tool
- Méthode `get_tool()` pour récupérer un tool
- Méthode `list_tools()` pour lister tous les tools (avec métadonnées)

**Métadonnées d'un tool** :
- `name` : Nom du tool (ex: "hello.world")
- `description` : Description humaine
- `input_schema` : JSON Schema pour valider les paramètres
- `output_schema` : JSON Schema pour documenter la sortie

---

#### **Méthodes spéciales disponibles**

| Méthode | Description | Exemple de réponse |
|---------|-------------|--------------------|
| `tools.list` | Liste tous les tools disponibles | `[{"name": "hello.world", ...}]` |
| `server.info` | Informations du serveur | `{"version": "0.1.0", "tools_count": 1}` |

---

### 4. Premier Tool : `hello.world`

**Fichier** : `mcp_server/tools/hello.py`

**Function signature** :
```python
def hello_world(name: Optional[str] = "World") -> dict
```

**Input** :
- `name` (string, optionnel) : Nom à saluer (défaut: "World")

**Output** :
```json
{
  "message": "Hello, AcademiaOps!",
  "timestamp": "2026-02-20T10:47:50.052577Z",
  "tool": "hello.world",
  "version": "1.0.0"
}
```

**But** : Valider que le serveur MCP fonctionne correctement (end-to-end test)

---

## ✅ Tests effectués

### 1. Test local du serveur MCP (sans Docker)

**Commande** :
```bash
source venv/bin/activate
uvicorn mcp_server.server:app --host 127.0.0.1 --port 8000
```

**Résultat** : ✅ Serveur démarré avec 1 tool enregistré

---

### 2. Test du healthcheck

**Commande** :
```bash
curl http://127.0.0.1:8000/health
```

**Réponse** :
```json
{
  "status": "healthy",
  "timestamp": "2026-02-20T10:47:44.505581",
  "version": "0.1.0",
  "environment": "development",
  "tools_registered": 1
}
```

**Résultat** : ✅ Health check OK

---

### 3. Test du tool `hello.world` via JSON-RPC

**Commande** :
```bash
curl -X POST http://127.0.0.1:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "hello.world",
    "params": {"name": "AcademiaOps"},
    "id": 1
  }'
```

**Réponse** :
```json
{
  "jsonrpc": "2.0",
  "result": {
    "message": "Hello, AcademiaOps!",
    "timestamp": "2026-02-20T10:47:50.052577Z",
    "tool": "hello.world",
    "version": "1.0.0"
  },
  "error": null,
  "id": 1
}
```

**Résultat** : ✅ Tool exécuté avec succès

---

### 4. Test de la méthode `tools.list`

**Commande** :
```bash
curl -X POST http://127.0.0.1:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools.list",
    "id": 2
  }'
```

**Réponse** :
```json
{
  "jsonrpc": "2.0",
  "result": [
    {
      "name": "hello.world",
      "description": "Simple hello world tool for testing",
      "input_schema": {
        "type": "object",
        "properties": {
          "name": {
            "type": "string",
            "description": "Name to greet"
          }
        }
      },
      "output_schema": { ... }
    }
  ],
  "error": null,
  "id": 2
}
```

**Résultat** : ✅ Liste des tools OK

---

### 5. Test de gestion d'erreur (tool inexistant)

**Commande** :
```bash
curl -X POST http://127.0.0.1:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "non.existent.tool",
    "id": 3
  }'
```

**Réponse** :
```json
{
  "jsonrpc": "2.0",
  "result": null,
  "error": {
    "code": -32601,
    "message": "Method not found: non.existent.tool",
    "data": {
      "available_methods": ["hello.world"]
    }
  },
  "id": 3
}
```

**Résultat** : ✅ Gestion d'erreur JSON-RPC correcte

---

## 🐛 Bugs rencontrés et fixes

### Bug #1 : DeprecationWarning FastAPI `on_event`

**Description** : FastAPI affiche un warning de dépréciation pour `@app.on_event("startup")` et `@app.on_event("shutdown")`.

**Message d'erreur** :
```
DeprecationWarning: on_event is deprecated, use lifespan event handlers instead.
```

**Impact** : ⚠️ Warning seulement, n'empêche pas le fonctionnement

**Fix appliqué** : ❌ Non fixé pour l'instant (fonctionnel)

**À faire plus tard** : Migrer vers `@asynccontextmanager` lifespan (FastAPI moderne)

---

### Bug #2 : Docker daemon non démarré

**Description** : Lors du test `docker-compose up -d postgres`, erreur de connexion au daemon Docker.

**Message d'erreur** :
```
Cannot connect to the Docker daemon at unix:///Users/wlerouli/.docker/run/docker.sock.
Is the docker daemon running?
```

**Impact** : 🛑 Bloquant pour les tests Docker

**Fix appliqué** : ✅ **Solution** → Lancer Docker Desktop manuellement sur Mac

**Note** : Sur Mac, Docker Desktop doit être lancé avant d'utiliser `docker` ou `docker-compose`.

---

### Bug #3 : Variables d'environnement non définies

**Description** : Warning lors du `docker-compose up` :
```
WARN[0000] The "OPENAI_API_KEY" variable is not set. Defaulting to a blank string.
WARN[0000] The "ANTHROPIC_API_KEY" variable is not set. Defaulting to a blank string.
```

**Impact** : ⚠️ Warning seulement, Docker Compose utilise des valeurs par défaut

**Fix appliqué** : ❌ Non fixé (normal en dev sans clés API)

**Solution** : Créer un fichier `.env` à la racine :
```bash
cp .env.example .env
# Puis éditer .env avec vos clés API
```

---

## 🚀 Comment démarrer la stack

### Prérequis

- Python 3.10+
- Docker Desktop (pour Mac)
- Git

---

### Étape 1 : Cloner et installer

```bash
git clone https://github.com/mistwil777/academiaOps.git
cd academiaOps
git checkout feature/docker-database-setup

# Créer l'environnement virtuel
python3 -m venv venv
source venv/bin/activate

# Installer les dépendances
pip install -r requirements.txt
```

---

### Étape 2 : Configurer les variables d'environnement

```bash
cp .env.example .env
# Éditer .env avec vos clés API (optionnel pour le moment)
```

---

### Étape 3 : Démarrer Docker Desktop

Sur Mac : Lancer l'application **Docker Desktop**

Vérifier que Docker fonctionne :
```bash
docker --version
```

---

### Étape 4 : Lancer les services Docker

```bash
docker-compose up -d
```

**Services démarrés** :
- PostgreSQL : `localhost:5432`
- n8n : `http://localhost:5678`
- MCP Server : `http://localhost:8000`

**Vérifier les logs** :
```bash
docker-compose logs -f mcp-server
```

---

### Étape 5 : Tester le serveur MCP

**Healthcheck** :
```bash
curl http://localhost:8000/health
```

**Appeler le tool hello.world** :
```bash
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "hello.world",
    "params": {"name": "Votre nom"},
    "id": 1
  }'
```

---

### Étape 6 : Se connecter à PostgreSQL (optionnel)

```bash
docker exec -it academiaops-postgres psql -U academiaops_user -d academiaops
```

**Exemples de requêtes SQL** :
```sql
-- Voir tous les items
SELECT id, title, subject, validation_status FROM items;

-- Voir tous les topics
SELECT * FROM topics;

-- Voir les cours publiés
SELECT * FROM published_courses_view;
```

---

## 📊 Statistiques

- **Fichiers créés** : 9
- **Lignes de code** : ~1 350
- **Tables PostgreSQL** : 8
- **Tools MCP** : 1 (`hello.world`)
- **Endpoints API** : 3 (`/`, `/health`, `/rpc`)
- **Tests effectués** : 5
- **Bugs rencontrés** : 3 (2 mineurs, 1 info)

---

## 🔜 Prochaine feature

**Feature 2** : Agents Agno - Classifier

**Branche** : `feature/agent-classifier`

**Objectifs** :
- Créer l'Agent Classifier avec 3 skills
- Connecter l'agent au serveur MCP
- Créer le tool `classify.item` pour appeler l'agent
- Tester la classification d'un item via JSON-RPC

---

## 📝 Notes

- Le serveur MCP fonctionne en local et prêt pour Docker
- La base de données PostgreSQL a un schéma complet avec données de test
- Le protocole JSON-RPC 2.0 est correctement implémenté
- Le système de registry de tools est extensible
- Les erreurs JSON-RPC suivent le standard

**Cette feature pose les fondations solides pour la suite du développement ! 🎉**

---

[← Retour au README](../README.md) | [Architecture complète](../docs/architecture.md) | [Prochaine feature →](#)
