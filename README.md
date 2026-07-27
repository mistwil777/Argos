# Argos

Infrastructure d'accès web pour agents IA — navigation headless, recherche sans API, digests automatiques, RAG et veille automatisée.

## Pourquoi Argos ?

Les agents IA ont besoin d'accéder à des informations fraîches sur le web. Les APIs officielles (X, Reddit, etc.) sont coûteuses, limitées et complexes. Argos résout ce problème en exposant des outils MCP (Model Context Protocol) qui permettent à n'importe quel agent de naviguer sur le web comme un humain, sans clé API.

## Fonctionnalités

### Outils MCP exposés

| Outil MCP | Description |
|---|---|
| `web.browse(url)` | Fetch une URL avec Playwright (rendu JS, anti-détection) |
| `web.digest(url)` | Génère un digest markdown + JSON structuré depuis une URL |
| `web.watch(url)` | Surveille une page pour détecter les changements |
| `web.watched_pages()` | Liste les pages surveillées |
| `rag.ask(query)` | Q&A sur le corpus indexé |
| `rag.search(query)` | Recherche sémantique dans le corpus |
| `rag.index_item(id)` | Indexe un article dans le store vectoriel |
| `rag.rebuild_index()` | Reconstruit l'index RAG complet |
| `rag.stats()` | Statistiques de l'index vectoriel |
| `collector.fetch_rss` | Collecte depuis les sources RSS configurées |
| `collector.fetch_apis` | Collecte depuis les sources API configurées |
| `collector.fetch_all` | Collecte depuis toutes les sources actives |
| `collector.get_stats` | Statistiques de collecte |
| `collector.list_sources` | Liste toutes les sources configurées |
| `classifier.classify(id)` | Classifie un article par LLM |
| `classifier.classify_batch` | Classification par lot |
| `classifier.stats` | Statistiques de classification |
| `classifier.get_unclassified` | Liste les articles non classifiés |
| `hello.world` | Health check du serveur MCP |

### Interface web (React)

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Vue d'ensemble — stats, activité récente, tendances |
| Feed | `/feed` | Flux d'articles collectés avec filtres et lecture |
| Browse | `/browse` | Navigation web headless via Playwright |
| Library | `/library` | Bibliothèque de documents générés — sauvegarde, recherche, édition IA |
| Briefing | `/briefing` | Digest quotidien généré par LLM |
| Trends | `/trends` | Visualisation des tendances et topics sur le temps |
| Assistant | `/assistant` | Chat avec l'assistant IA sur votre corpus |
| Sources | `/sources` | Gestion des sources de veille (RSS, GitHub, web) |
| Settings | `/settings` | Configuration du serveur et des providers LLM |

## Démarrage rapide

### Prérequis
- Docker & Docker Compose
- Python 3.11+ (développement local)

### Lancement

```bash
# 1. Copier le fichier d'environnement
cp .env.example .env
# Renseigner POSTGRES_PASSWORD, ADMIN_TOKEN et au moins une clé LLM

# 2. Démarrer la stack
docker compose up -d

# 3. Accéder à l'interface
open http://localhost:8000   # backend API
open http://localhost:5174   # frontend React (dev)

# 4. Tester un outil MCP
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"web.browse","params":{"url":"https://old.reddit.com/r/MachineLearning"}}'
```

## Architecture

```
argos/
├── argos/               # Backend FastAPI + JSON-RPC
│   ├── services/
│   │   ├── web_browser.py        # Playwright stealth
│   │   ├── web_search.py         # SearXNG / DuckDuckGo / Bing
│   │   ├── digest_generator.py   # LLM → markdown + JSON
│   │   ├── rag.py                # RAG hybride (LanceDB)
│   │   ├── bedrock_embeddings.py # Embeddings via AWS Bedrock Titan
│   │   ├── document_extractor.py # PDF / HTML extraction
│   │   ├── classifier.py         # Classification LLM
│   │   ├── collector.py          # RSS / GitHub / web
│   │   ├── site_monitor.py       # Surveillance de pages (watch)
│   │   └── llm_provider.py       # Abstraction multi-provider LLM
│   ├── tools/
│   │   ├── web_tools.py          # Outils web (browse, digest, watch)
│   │   ├── rag_tools.py          # Outils RAG
│   │   ├── collector.py          # Outils collecte
│   │   └── classifier.py         # Outils classification
│   ├── api/
│   │   ├── router.py             # REST API frontend
│   │   └── workspaces.py         # Gestion des workspaces
│   ├── server.py                 # JSON-RPC server + tool registry
│   └── config.py                 # Configuration LLM / providers
├── mcp_server/          # Serveur MCP (Model Context Protocol)
├── frontend/            # React + Vite + shadcn/ui (dark mode)
│   └── src/pages/       # Dashboard, Feed, Browse, Library, Briefing, Trends, …
├── n8n/                 # Workflows n8n (HITL classification, génération cours)
├── config/
│   └── searxng/         # Configuration SearXNG
├── database/            # PostgreSQL schema + migrations (init.sql, migration_v*.sql)
│   ├── init.sql
│   ├── migration_v1.*.sql
│   └── seed.sql
└── docker-compose.yml
```

### Stack Docker

| Service | Port | Description |
|---|---|---|
| `argos-server` | 8000 | API FastAPI + JSON-RPC |
| `postgres` | 5432 | Base de données principale |
| `searxng` | 8888 | Moteur de recherche agrégateur (auto-hébergé) |

> Le frontend React n'est pas dans Docker en développement. Lancer avec `cd frontend && npm run dev -- --port 5174`.

## Génération de documents

La page Library permet de générer des documents structurés à partir des articles collectés.

| Type | Description | `max_tokens` par défaut |
|---|---|---|
| Fiche de veille | 1 page — résumé + points clés + importance | 1 500 |
| Synthèse thématique | 3-5 pages — sections par thème + tendances | 4 000 |
| Guide pratique | Variable — étapes + exemples + pièges | 8 000 |
| Rapport de veille | 5-10 pages — analyse + tendances + recommandations | 8 000 |

Le champ **Thème / Instructions** accepte des contraintes de longueur en langage naturel (`"au moins 10 pages"`, `"5000 mots"`). Le backend parse ces contraintes et ajuste `max_tokens` dynamiquement — la demande utilisateur est toujours prioritaire sur le défaut.

Le contenu généré est basé sur le vrai contenu des pages fetchées via Playwright, pas uniquement sur les résumés stockés.

## Intégration avec un agent Claude

```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "web_browse",
        "description": "Fetch une URL et retourne le contenu markdown",
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"]
        }
    },
    {
        "name": "rag_ask",
        "description": "Q&A sur le corpus de veille indexé",
        "input_schema": {
            "type": "object",
            "properties": {"query": {"type": "string"}},
            "required": ["query"]
        }
    }
]

response = client.messages.create(
    model="claude-sonnet-4-6",
    max_tokens=1024,
    tools=tools,
    messages=[{"role": "user", "content": "Résume les dernières news IA sur Reddit"}]
)
```

## Variables d'environnement

| Variable | Description | Défaut |
|---|---|---|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | requis |
| `ADMIN_TOKEN` | Token admin API | requis |
| `LLM_PROVIDER` | `aws`, `openai`, `anthropic` | `aws` |
| `AWS_BEDROCK_MODEL` | Modèle Bedrock principal | `us.amazon.nova-pro-v1:0` |
| `DEFAULT_DIGEST_MODEL` | Modèle pour la génération de digests | `us.amazon.nova-pro-v1:0` |
| `DEFAULT_CLASSIFICATION_MODEL` | Modèle pour la classification | `us.amazon.nova-pro-v1:0` |
| `AWS_ACCESS_KEY_ID` | Clé AWS (si `LLM_PROVIDER=aws`) | — |
| `AWS_SECRET_ACCESS_KEY` | Secret AWS (si `LLM_PROVIDER=aws`) | — |
| `AWS_REGION` | Région AWS | `us-west-2` |
| `OPENAI_API_KEY` | Clé OpenAI (si `LLM_PROVIDER=openai`) | — |
| `ANTHROPIC_API_KEY` | Clé Anthropic (si `LLM_PROVIDER=anthropic`) | — |
| `EMBEDDING_PROVIDER` | `bedrock` ou `sentence-transformers` | `bedrock` |
| `BEDROCK_EMBEDDING_DIMENSIONS` | Dimensions des embeddings Bedrock Titan | `1024` |
| `TELEGRAM_BOT_TOKEN` | Token bot Telegram (HITL) | — |
| `TELEGRAM_ADMIN_CHAT_ID` | Chat ID admin Telegram | — |
| `SEARXNG_URL` | URL interne SearXNG | `http://searxng:8080` |

## Documentation

- [Guide utilisateur](docs/user-guide.md)
- [Référence technique](docs/technical.md)
- [Outils MCP](docs/mcp-tools.md)

L'assistant intégré (page Assistant) répond à toutes vos questions sur l'utilisation de l'outil.

## Licence

MIT
