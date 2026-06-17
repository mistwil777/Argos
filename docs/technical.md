# Architecture technique Argos

## Vue d'ensemble

```
Frontend (React/Vite :3000)
       ↓ REST + JSON-RPC
MCP Server (FastAPI :8000)
       ↓
PostgreSQL ←→ LanceDB (RAG)
```

## Stack

| Couche | Technologie |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, uvicorn, Python 3.11 |
| Protocole | JSON-RPC 2.0 (MCP) + REST |
| Base de données | PostgreSQL 16 |
| Vector store | LanceDB + embeddings Bedrock Titan V2 |
| Navigation web | Playwright 1.44 + stealth |
| LLM | AWS Bedrock Nova Pro (défaut), OpenAI, Anthropic |
| Containerisation | Docker Compose |

## Services backend

### web_browser.py
Playwright headless avec masquage de l'empreinte d'automatisation :
- User-agent pool (20+ UA navigateurs réels)
- Délais aléatoires humains (0.5–2.5s)
- Masquage `navigator.webdriver`
- Résolution d'écran aléatoire
- Redirection X/Twitter → Nitter automatique
- Fallback `requests` si Playwright indisponible

### web_search.py
Scraping DuckDuckGo Lite (HTML) avec fallback Bing :
- Pas de clé API requise
- Rotation user-agent
- Parse HTML léger (regex)

### digest_generator.py
Pipeline LLM en deux passes :
1. **Markdown** : résumé structuré pour lecture humaine (2-3 phrases + points clés)
2. **JSON** : extraction d'entités, tags, importance, date pour ingestion RAG

Fallback sans LLM si non configuré (extrait les 500 premiers caractères).

### rag.py
Recherche hybride :
- Sémantique : LanceDB + embeddings Titan V2 (1024 dimensions)
- Lexicale : Tantivy full-text
- Fusion RRF (Reciprocal Rank Fusion)

## Schéma DB (tables principales)

| Table | Rôle |
|---|---|
| `items` | Contenus collectés (URL, titre, digest_markdown, digest_json) |
| `sources` | Sources configurées (RSS, website, GitHub) |
| `browse_sessions` | Log des appels `web.browse` |
| `search_sessions` | Log des appels `web.search` |
| `rag_queries` | Historique des questions RAG |
| `workspaces` | Isolation multi-tenant |
| `llm_usage` | Tracking des coûts LLM |

## Anti-détection

Argos implémente plusieurs techniques pour éviter la détection :

1. **User-agent réaliste** : pool de 20+ UA navigateurs récents (Chrome, Firefox, Safari)
2. **Fingerprint masqué** : suppression de `navigator.webdriver`, plugins factices
3. **Délais humains** : attentes aléatoires entre 0.5 et 2.5 secondes
4. **Résolution aléatoire** : entre 1280×800 et 1920×1080
5. **Locale française** : `fr-FR` pour paraître européen
6. **Nitter pour X/Twitter** : instances publiques, pas de login requis
7. **old.reddit.com** : interface HTML sans JavaScript

## Coûts LLM estimés

| Opération | Modèle | Coût approximatif |
|---|---|---|
| Digest (markdown + JSON) | Nova Pro | ~0.001€ / page |
| RAG query | Nova Pro | ~0.0005€ / question |
| 1000 digests/mois | Nova Pro | ~1€/mois |

## Ports

| Service | Port |
|---|---|
| Frontend | 3000 |
| MCP Server API | 8000 |
| PostgreSQL | 5432 |
