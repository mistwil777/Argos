# OpenWebMCP

Infrastructure d'accès web pour agents IA — navigation headless, recherche sans API, digests automatiques et RAG.

## Pourquoi OpenWebMCP ?

Les agents IA ont besoin d'accéder à des informations fraîches sur le web. Les APIs officielles (X, Reddit, etc.) sont coûteuses, limitées et complexes. OpenWebMCP résout ce problème en exposant des outils MCP (Model Context Protocol) qui permettent à n'importe quel agent de naviguer sur le web comme un humain, sans clé API.

## Fonctionnalités

| Outil MCP | Description |
|---|---|
| `web.browse(url)` | Fetch une URL avec Playwright (rendu JS, anti-détection) |
| `web.search(query)` | Recherche web via DuckDuckGo ou Bing, sans API key |
| `web.digest(url)` | Génère un digest markdown + JSON structuré depuis une URL |
| `web.watch(url)` | Surveille une page pour détecter les changements |
| `web.watched_pages()` | Liste les pages surveillées |
| `rag.ask(query)` | Q&A sur le corpus indexé |

## Démarrage rapide

### Prérequis
- Docker & Docker Compose
- Python 3.11+ (développement local)

### Lancement

```bash
# 1. Copier le fichier d'environnement
cp .env.example .env
# Renseigner POSTGRES_PASSWORD et au moins une clé LLM

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
openwebmcp/
├── mcp_server/          # Backend FastAPI + JSON-RPC MCP
│   ├── services/
│   │   ├── web_browser.py      # Playwright stealth
│   │   ├── web_search.py       # DuckDuckGo / Bing
│   │   ├── digest_generator.py # LLM → markdown + JSON
│   │   ├── rag.py              # RAG hybride (LanceDB)
│   │   └── collector.py        # RSS / GitHub / web
│   └── tools/
│       └── web_tools.py        # Outils MCP exposés
├── frontend/            # React + Vite + shadcn/ui (dark mode)
├── database/            # PostgreSQL schema + migrations
└── docker-compose.yml
```

## Intégration avec un agent Claude

```python
import anthropic

client = anthropic.Anthropic()

tools = [
    {
        "name": "web_browse",
        "description": "Fetch une URL et retourne le contenu",
        "input_schema": {
            "type": "object",
            "properties": {"url": {"type": "string"}},
            "required": ["url"]
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
| `LLM_PROVIDER` | `aws`, `openai`, `anthropic` | `aws` |
| `AWS_BEDROCK_MODEL` | Modèle Bedrock | `us.amazon.nova-pro-v1:0` |
| `OPENAI_API_KEY` | Clé OpenAI (optionnel) | — |
| `ANTHROPIC_API_KEY` | Clé Anthropic (optionnel) | — |
| `ADMIN_TOKEN` | Token admin API | requis |

## Documentation

- [Guide utilisateur](docs/user-guide.md)
- [Référence technique](docs/technical.md)
- [Outils MCP](docs/mcp-tools.md)

L'assistant intégré (page Assistant) répond à toutes vos questions sur l'utilisation de l'outil.

## Licence

MIT
