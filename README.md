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
| `collector.fetch_all` | Collecte depuis toutes les sources actives |
| `collector.get_stats` | Statistiques de collecte |
| `classifier.classify(id)` | Classifie un article par LLM |
| `classifier.classify_batch` | Classification par lot |
| `hello.world` | Health check du serveur MCP |

### Interface web (React)

| Page | Route | Description |
|---|---|---|
| Dashboard | `/` | Vue d'ensemble — stats, activité récente, tendances |
| Feed | `/feed` | Flux d'articles collectés avec filtres et lecture |
| Library | `/library` | Bibliothèque RAG — documents ingérés, Q&A, export |
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
open http://localhost:3000

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
│   │   ├── web_browser.py      # Playwright stealth
│   │   ├── web_search.py       # SearXNG / DuckDuckGo / Bing
│   │   ├── digest_generator.py # LLM → markdown + JSON
│   │   ├── rag.py              # RAG hybride (LanceDB)
│   │   ├── document_extractor.py # PDF / HTML extraction
│   │   ├── classifier.py       # Classification LLM
│   │   └── collector.py        # RSS / GitHub / web
│   ├── tools/
│   │   ├── web_tools.py        # Outils web (browse, digest, watch)
│   │   └── rag_tools.py        # Outils RAG
│   ├── api/
│   │   └── router.py           # REST API frontend
│   ├── server.py               # JSON-RPC server + tool registry
│   └── config.py               # Configuration LLM / providers
├── frontend/            # React + Vite + shadcn/ui (dark mode)
│   └── src/pages/       # Dashboard, Feed, Library, Briefing, Trends, …
├── config/
│   └── searxng/         # Configuration SearXNG
├── database/            # PostgreSQL schema + migrations
└── docker-compose.yml
```

### Stack Docker

| Service | Port | Description |
|---|---|---|
| `frontend` | 3000 | Interface React |
| `argos-server` | 8000 | API FastAPI + JSON-RPC |
| `postgres` | 5432 | Base de données principale |
| `searxng` | 8888 | Moteur de recherche agrégateur (auto-hébergé) |

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
| `AWS_REGION` | Région AWS | `us-east-1` |
| `OPENAI_API_KEY` | Clé OpenAI (si `LLM_PROVIDER=openai`) | — |
| `ANTHROPIC_API_KEY` | Clé Anthropic (si `LLM_PROVIDER=anthropic`) | — |
| `SEARXNG_URL` | URL interne SearXNG | `http://searxng:8080` |

## Documentation

- [Guide utilisateur](docs/user-guide.md)
- [Référence technique](docs/technical.md)
- [Outils MCP](docs/mcp-tools.md)

L'assistant intégré (page Assistant) répond à toutes vos questions sur l'utilisation de l'outil.

## Licence

MIT
