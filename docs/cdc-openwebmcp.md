# Cahier des Charges Fonctionnel & Technique — OpenWebMCP

**Version :** 1.0  
**Date :** 1 juin 2026  
**Statut :** Production

---

## 1. Présentation du projet

### 1.1 Contexte

OpenWebMCP est une infrastructure web pour agents IA, forkée de VeilleOps/AcademiaOps en juin 2026. L'objectif est de donner aux agents IA un accès web économique, furtif et sans APIs officielles coûteuses (X/Twitter, Reddit, etc.).

### 1.2 Problème résolu

Les agents IA ont besoin d'informations fraîches. Les APIs officielles sont soit coûteuses (Twitter API : $100+/mois), soit indisponibles, soit limitées. OpenWebMCP résout cela en exposant des outils MCP (Model Context Protocol) qui naviguent comme un humain avec Playwright stealth.

### 1.3 Objectifs principaux

- Accès web headless sans API key (DuckDuckGo, Bing, Playwright)
- Anti-détection : rotation User-Agent, délais humains, Nitter pour Twitter
- Génération de digests markdown + JSON structuré via LLM
- RAG hybride sur le corpus collecté (LanceDB + BM25)
- Surveillance de pages (hash SHA-256, détection de changement)
- Exposition via JSON-RPC 2.0 (protocole MCP standard)

---

## 2. Architecture système

### 2.1 Stack technique

**Backend :**
- Python 3.10+ avec FastAPI
- JSON-RPC 2.0 pour le protocole MCP
- PostgreSQL 16 (données relationnelles)
- LanceDB (index vectoriel RAG)
- Playwright (navigation headless)
- AWS Bedrock / OpenAI / Anthropic (LLM configurable)

**Frontend :**
- React 18 + Vite 7
- TypeScript
- Tailwind CSS (dark mode)
- shadcn/ui components

**Infrastructure :**
- Docker Compose (PostgreSQL + MCP Server)
- Port 8000 : API FastAPI + JSON-RPC
- Port 3000 : Interface React (développement)

### 2.2 Architecture des services

```
openwebmcp/
├── mcp_server/
│   ├── server.py              # FastAPI app + ToolRegistry + JSON-RPC
│   ├── config.py              # Settings (pydantic-settings)
│   ├── database.py            # DatabaseManager (psycopg2)
│   ├── api/
│   │   ├── router.py          # REST endpoints (/api/v1/*)
│   │   └── workspaces.py      # Workspace CRUD
│   ├── services/
│   │   ├── web_browser.py     # Playwright stealth + fallback requests
│   │   ├── web_search.py      # DuckDuckGo Lite + Bing scraping
│   │   ├── digest_generator.py # LLM → markdown + JSON structuré
│   │   ├── collector.py       # RSS, GitHub, website collector
│   │   ├── classifier.py      # LLM classification d'items
│   │   ├── rag.py             # RAG Service (hybride)
│   │   ├── vector_store.py    # LanceDB abstraction
│   │   ├── vector_store_singleton.py # Instance partagée
│   │   ├── site_monitor.py    # Surveillance hash SHA-256
│   │   ├── llm_provider.py    # Provider factory (OpenAI/AWS/Anthropic)
│   │   └── document_extractor.py # PDF/image extraction
│   └── tools/
│       ├── web_tools.py       # 5 outils MCP web exposés
│       ├── rag_tools.py       # Outils RAG
│       ├── collector.py       # Outils collecteur
│       └── classifier.py      # Outils classification
├── frontend/src/
│   ├── pages/
│   │   ├── Dashboard.tsx      # Statistiques globales
│   │   ├── Browse.tsx         # Navigation headless
│   │   ├── WebSearch.tsx      # Recherche web
│   │   ├── Feed.tsx           # Contenus collectés
│   │   ├── Assistant.tsx      # Chatbot RAG
│   │   ├── Sources.tsx        # Gestion des sources
│   │   └── Settings.tsx       # Statut services + RAG
│   └── services/api.ts        # Client HTTP/JSON-RPC
└── database/
    └── init.sql               # Schéma PostgreSQL complet
```

---

## 3. Outils MCP exposés (JSON-RPC)

### 3.1 web.browse

Fetch une URL avec Playwright (rendu JavaScript, anti-détection).

**Paramètres :**
- `url` (string, requis) : URL à visiter
- `use_playwright` (bool, défaut: true) : utiliser Playwright vs requests
- `timeout_ms` (int, défaut: 30000) : timeout en ms
- `workspace_id` (int, optionnel) : isolation multi-tenant

**Retour :**
```json
{
  "success": true,
  "url": "https://...",
  "final_url": "https://...",
  "title": "Titre de la page",
  "content": "Texte extrait...",
  "content_length": 12450,
  "links": ["https://..."],
  "engine": "playwright",
  "via_nitter": false,
  "duration_ms": 1234
}
```

**Comportement anti-détection :**
- Rotation automatique du User-Agent (liste de 10 UA réels)
- Délais aléatoires entre actions (100-500ms)
- Pour les URLs Twitter/X : redirection automatique vers Nitter
- Fallback sur requests si Playwright échoue

### 3.2 web.search

Recherche web sans clé API via DuckDuckGo Lite ou Bing.

**Paramètres :**
- `query` (string, requis)
- `engine` (string, défaut: "duckduckgo") : "duckduckgo" | "bing" | "auto"
- `max_results` (int, défaut: 10, max: 50)
- `workspace_id` (int, optionnel)

**Retour :**
```json
{
  "success": true,
  "query": "...",
  "engine": "duckduckgo",
  "results": [
    {"title": "...", "url": "...", "snippet": "..."}
  ],
  "results_count": 10,
  "duration_ms": 890
}
```

### 3.3 web.digest

Browse une URL et génère un digest markdown + JSON structuré via LLM. Sauvegarde optionnelle en DB pour indexation RAG.

**Paramètres :**
- `url` (string, requis)
- `save_item` (bool, défaut: true) : sauvegarde en DB
- `workspace_id` (int, optionnel)

**Retour :**
```json
{
  "success": true,
  "url": "...",
  "title": "...",
  "markdown": "# Titre\n\n## Résumé\n...",
  "json": {
    "summary": "...",
    "key_points": ["..."],
    "tags": ["ia", "llm"],
    "importance": "high",
    "content_type": "research"
  },
  "item_id": 42
}
```

### 3.4 web.watch

Enregistre une URL pour surveillance périodique (détection de changement par hash SHA-256).

**Paramètres :**
- `url` (string, requis)
- `name` (string, optionnel)
- `interval_minutes` (int, défaut: 60, min: 5)
- `workspace_id` (int, optionnel)

### 3.5 web.watched_pages

Liste toutes les URLs surveillées avec leur dernier statut de vérification.

### 3.6 Outils RAG

- `rag.ask` : Q&A sur le corpus indexé (recherche hybride)
- `rag.search` : Recherche vectorielle pure
- `rag.index_item` : Indexe un item en RAG
- `rag.rebuild_index` : Reconstruit l'index complet
- `rag.stats` : Statistiques de l'index

### 3.7 Outils collecteur

- `collector.fetch_rss` : Collecte des flux RSS configurés
- `collector.fetch_apis` : Collecte GitHub/ArXiv
- `collector.fetch_all` : Collecte toutes les sources
- `collector.list_sources` : Liste les sources DB

### 3.8 Outils classifieur

- `classifier.classify` : Classification LLM d'un item
- `classifier.classify_batch` : Classification en batch
- `classifier.stats` : Statistiques de classification

---

## 4. Endpoints REST (/api/v1/)

### 4.1 Statistiques
- `GET /stats/global` — Vue globale (browses, searches, items, coûts LLM)
- `GET /stats/timeline?days=7` — Évolution temporelle
- `GET /stats/topics?limit=10` — Sujets les plus fréquents
- `GET /stats/costs?period=month` — Coûts LLM par jour

### 4.2 Items (contenus collectés)
- `GET /items` — Liste avec filtres (status, source, workspace, limit, offset)
- `GET /items/{id}` — Détail d'un item
- `POST /items` — Création manuelle
- `DELETE /items/{id}` — Suppression
- `POST /items/{id}/classify` — Classification LLM
- `POST /items/batch/classify` — Classification batch

### 4.3 Sources
- `GET /sources` — Liste (filtres: type, active, workspace)
- `POST /sources` — Création (name, url, type, category, workspace_id)
- `PATCH /sources/{id}/toggle` — Activer/désactiver
- `DELETE /sources/{id}` — Suppression
- `POST /sources/{id}/collect` — Collecte manuelle

### 4.4 Web (nouveaux endpoints)
- `POST /web/browse` — Browse REST
- `POST /web/search` — Search REST
- `POST /web/digest` — Digest REST
- `GET /web/browse/history` — Historique browses
- `GET /web/search/history` — Historique recherches

### 4.5 RAG
- `POST /rag/ask` — Q&A ({query, workspace_id, use_hybrid_search})
- `POST /rag/index-all-items` — Réindexation complète
- `GET /rag/stats` — Statistiques index
- `GET /rag/history` — Historique queries
- `DELETE /rag/history` — Effacer l'historique
- `POST /rag/extract-document` — Extraction PDF/image

### 4.6 Monitor
- `PATCH /sources/{id}/monitor` — Config surveillance
- `POST /sources/{id}/check-monitor` — Vérification manuelle
- `POST /monitors/check-all` — Vérification globale

### 4.7 Admin
- `POST /admin/ingest-codebase` — Indexation code source dans RAG (header X-Admin-Token)
- `GET /admin/codebase-stats` — Stats d'indexation code
- `POST /admin/rag-diag` — RAG scopé au codebase

---

## 5. Schéma de base de données

### Tables principales

**workspaces** — Multi-tenant
- id, name, slug, description, domain, is_active

**sources** — Sources de contenu
- id, name, url, type (rss/website/github/api), category
- active, workspace_id
- content_hash, last_checked_at, check_interval_minutes, monitor_enabled

**items** — Contenus collectés
- id, source_type, source_url, url, title, summary
- importance (critical/high/medium/low), item_type, keywords
- classification_status (pending/classified/rejected)
- digest_markdown, digest_json, digest_generated_at
- rag_indexed, workspace_id

**browse_sessions** — Log web.browse()
- id, url, status, title, content_length, engine, duration_ms

**search_sessions** — Log web.search()
- id, query, engine, results_count, results (JSONB)

**rag_queries** — Historique Q&A
- id, query, answer, sources (JSONB), confidence_score

**llm_usage** — Suivi coûts LLM
- id, operation_type, model, tokens_used, cost_usd

**topics** — Taxonomie (AI/LLM, MCP, Web, Security, Data, Open Source)
**items_topics** — Relation M2M items ↔ topics
**api_keys** — Authentification API

---

## 6. Configuration (.env)

Variables clés :
```bash
POSTGRES_USER=academiaops
POSTGRES_PASSWORD=...
POSTGRES_DB=academiaops
DATABASE_URL=postgresql://...

LLM_PROVIDER=aws          # aws | openai | anthropic
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL=us.amazon.nova-pro-v1:0

ENVIRONMENT=development
LOG_LEVEL=INFO
ADMIN_TOKEN=...
```

---

## 7. Intégration agent IA (exemple Python)

```python
import httpx

MCP_URL = "http://localhost:8000/rpc"

def call_tool(method: str, params: dict) -> dict:
    resp = httpx.post(MCP_URL, json={
        "jsonrpc": "2.0", "id": 1,
        "method": method, "params": params
    })
    data = resp.json()
    if "error" in data:
        raise Exception(data["error"]["message"])
    return data["result"]

# Naviguer
page = call_tool("web.browse", {"url": "https://old.reddit.com/r/MachineLearning"})
print(page["content"][:500])

# Chercher
results = call_tool("web.search", {"query": "Claude 4 benchmark", "max_results": 5})
for r in results["results"]:
    print(r["title"], r["url"])

# Générer un digest
digest = call_tool("web.digest", {"url": "https://arxiv.org/abs/2506.01234", "save_item": True})
print(digest["markdown"])

# Q&A RAG
answer = call_tool("rag.ask", {"query": "Quels sont les derniers papers sur les LLMs ?"})
print(answer["answer"])
```

---

## 8. Démarrage rapide

```bash
# 1. Cloner et configurer
git clone <repo> openwebmcp && cd openwebmcp
cp .env.example .env
# Remplir POSTGRES_PASSWORD et clés LLM

# 2. Démarrer PostgreSQL
docker compose up postgres -d

# 3. Démarrer le backend (dev)
source venv/bin/activate
uvicorn mcp_server.server:app --reload --port 8000

# 4. Démarrer le frontend
cd frontend && npm run dev

# 5. Accéder
open http://localhost:3000
```

---

## 9. Points d'attention / Known issues

- Le venv doit avoir Playwright installé (`playwright install chromium`)
- La table `courses` a été supprimée (fork depuis VeilleOps) — ne pas l'utiliser
- L'index RAG nécessite un rebuild après ajout de digests (`/api/v1/rag/index-all-items`)
- L'ingestion du codebase dans RAG se fait via `POST /api/v1/admin/ingest-codebase` (header `X-Admin-Token`)
- Le site monitor utilise SHA-256 sur le contenu texte extrait
