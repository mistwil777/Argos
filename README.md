# Argos

Plateforme de veille intelligente pour ingénieurs IA — collecte autonome, classification LLM, RAG conversationnel et briefing quotidien.

## Vision

L'utilisateur décrit son besoin de veille en langage naturel. Le système découvre les sources, collecte chaque nuit, filtre, classe, nettoie, ingère et propose un briefing à la demande. Zéro action manuelle après la configuration initiale.

---

## Pipeline end-to-end

### Mode nuit — alimentation autonome

```
                        ┌─────────────────────────────────────────┐
                        │         SCHEDULER (APScheduler)          │
                        │  job nocturne — toutes les sources       │
                        └───────────────────┬─────────────────────┘
                                            │ déclenche
                        ┌───────────────────▼─────────────────────┐
                        │              COLLECTE                    │
                        │  RSS · GitHub · ArXiv · Web              │
                        │  CollectorService.fetch_from_db_sources()│
                        │  → déduplication par URL                 │
                        └───────────────────┬─────────────────────┘
                                            │ items status="pending"
                                            │ event-driven (immédiat)
                        ┌───────────────────▼─────────────────────┐
                        │            CLASSIFICATION LLM            │
                        │  ClassifierService.classify_batch()      │
                        │  → importance: critical/high/medium/low  │
                        │  → item_type: news/research/tool/…       │
                        │  → keywords[]                            │
                        └───────────────────┬─────────────────────┘
                                            │ si importance = high ou critical
                                            │ event-driven (immédiat)
                        ┌───────────────────▼─────────────────────┐
                        │           SCORING SANS LLM               │
                        │  ScorerService                           │
                        │  · fiabilité domaine   (Tranco rank)     │
                        │  · densité contenu     (textstat)        │
                        │  · nouveauté sémantique(cosine similarity)│
                        │  · validation croisée  (cross-source)    │
                        │  → score 0.0→1.0 par item                │
                        │  → score source mis à jour (decay auto)  │
                        └───────────────────┬─────────────────────┘
                                            │ si score > seuil
                                            │ event-driven (immédiat)
                        ┌───────────────────▼─────────────────────┐
                        │         DIGEST + NETTOYAGE LLM           │
                        │  DigestGenerator.generate_digest()       │
                        │  · extraction contenu (trafilatura)      │
                        │  · fallback SPA/JS    (Playwright)       │
                        │  · résumé structuré   (Claude)           │
                        │  → digest_markdown + digest_json         │
                        └───────────────────┬─────────────────────┘
                                            │ event-driven (immédiat)
                        ┌───────────────────▼─────────────────────┐
                        │           INDEXATION RAG                 │
                        │  RAGService.index_item()                 │
                        │  · embeddings (sentence-transformers)    │
                        │  · stockage LanceDB (hybrid search)      │
                        │  → rag_indexed = true                    │
                        │  → ready_for_briefing = true             │
                        └───────────────────┬─────────────────────┘
                                            │
                        ┌───────────────────▼─────────────────────┐
                        │         BASE DE CONNAISSANCES            │
                        │  PostgreSQL (métadonnées + scores)       │
                        │  LanceDB     (vecteurs + fulltext)       │
                        └─────────────────────────────────────────┘

Délai end-to-end : fréquence collecte (15-30 min) + ~30s traitement par item
```

### Mode demande — réponse temps réel

```
  User : "Quoi de neuf sur Mistral cette semaine ?"
  (texte ou vocal — Web Speech API)
           │
           ▼
  ┌─────────────────────────────────┐
  │         ASSISTANT (RAG)         │
  │  POST /rag/ask                  │
  │  · hybrid search LanceDB        │
  │  · contexte des 5 derniers msgs │
  │  · génération Claude (streaming)│
  └────────────┬────────────────────┘
               │ si aucun résultat récent
               ▼
  ┌─────────────────────────────────┐
  │      VEILLE ON-DEMAND           │
  │  POST /veille/on-demand         │
  │  · SearXNG multi-moteur         │
  │  · digest + classif en parallèle│
  │  → résultats en ~30s            │
  └────────────┬────────────────────┘
               │
               ▼
  Réponse texte + audio (SpeechSynthesis)

  Commandes reconnues :
  "génère un document sur X"     → POST /documents/generate
  "résume le briefing du jour"   → GET  /briefing/today
  "quelles sont les tendances ?" → GET  /stats/trends
```

### Intent → Discovery — création de veille

```
  User : "Je veux suivre les nouveautés Claude et Mistral"
           │
           ▼ (1 appel Claude)
  ┌─────────────────────────────────────────┐
  │           INTENT DECOMPOSITION          │
  │  IntentService.decompose(text)          │
  │  → entités   : Anthropic, Mistral AI    │
  │  → thèmes    : LLM API, benchmarks, ... │
  │  → src types : changelog, blog, github  │
  │  → keywords  : claude 3, tool use, ...  │
  └──────────────────┬──────────────────────┘
                     │
                     ▼ (SearXNG + trafilatura, pas de LLM)
  ┌─────────────────────────────────────────┐
  │         DÉCOUVERTE DE SOURCES           │
  │  DiscoveryService.find_sources()        │
  │  · recherche SearXNG par entité/type    │
  │  · find_feed_urls() sur les domaines    │
  │  · score Tranco (fiabilité domaine)     │
  │  · dédup vs sources existantes          │
  └──────────────────┬──────────────────────┘
                     │
                     ▼
  Sources candidates affichées à l'utilisateur
  → confirmation → créées en DB
  → premier collect déclenché immédiatement
```

---

## Architecture technique

```
argos/
├── argos/
│   ├── services/
│   │   ├── scheduler.py          # APScheduler + SQLAlchemyJobStore (PostgreSQL)
│   │   ├── intent_discovery.py   # IntentService + DiscoveryService
│   │   ├── scorer.py             # Scoring pertinence sans LLM
│   │   ├── collector.py          # RSS · GitHub · ArXiv · Web
│   │   ├── classifier.py         # Classification LLM
│   │   ├── digest_generator.py   # LLM → markdown + JSON structuré
│   │   ├── rag.py                # RAG hybride (LanceDB + fulltext)
│   │   ├── site_monitor.py       # Surveillance changements de pages
│   │   ├── web_browser.py        # Playwright stealth
│   │   ├── web_search.py         # SearXNG / DuckDuckGo fallback
│   │   ├── document_extractor.py # PDF · DOCX · images (vision LLM)
│   │   └── llm_provider.py       # Abstraction OpenAI / Anthropic / Bedrock
│   ├── api/
│   │   ├── router.py             # REST API — items, RAG, briefing, ...
│   │   ├── veille.py             # POST /veille/create (intent → sources)
│   │   └── workspaces.py         # Workspaces multi-tenant
│   └── server.py                 # FastAPI app + MCP JSON-RPC
├── frontend/src/pages/
│   ├── Dashboard.tsx             # Stats globales + activité récente
│   ├── Veille.tsx                # Création de veille par intention
│   ├── Feed.tsx                  # Flux d'items avec filtres
│   ├── Assistant.tsx             # Chat RAG + vocal (Web Speech API)
│   ├── Briefing.tsx              # Briefing quotidien
│   ├── Trends.tsx                # Tendances et keywords
│   ├── Library.tsx               # Documents générés
│   ├── Sources.tsx               # Gestion avancée des sources
│   └── Settings.tsx              # Config services + logs
├── database/
│   ├── init.sql                  # Schéma complet PostgreSQL
│   └── seed.sql                  # Données initiales
├── config/searxng/               # Config moteur de recherche auto-hébergé
└── docker-compose.yml
```

### Stack technique

| Composant | Technologie |
|---|---|
| Backend | FastAPI + Python 3.11 |
| Base de données | PostgreSQL 16 |
| Vector store | LanceDB (hybrid search) |
| LLM | Claude API (Anthropic) |
| Embeddings | sentence-transformers (local) |
| Scheduling | APScheduler v3 + job store PostgreSQL |
| Extraction web | trafilatura + Playwright (fallback SPA) |
| Recherche web | SearXNG auto-hébergé |
| Scoring | sklearn · textstat · tldextract · hdbscan |
| Vocal MVP | Web Speech API (natif navigateur) |
| Frontend | React + Vite + shadcn/ui |

### Ports

| Service | Port |
|---|---|
| Backend API + MCP | 8000 |
| Frontend React (dev) | 3000 |
| PostgreSQL | 5432 |
| SearXNG | 8888 |

---

## Démarrage rapide

```bash
# 1. Configuration
cp .env.example .env
# Renseigner : POSTGRES_PASSWORD, ADMIN_TOKEN, ANTHROPIC_API_KEY

# 2. Stack backend
docker compose up -d

# 3. Frontend
cd frontend && npm run dev

# 4. Accès
open http://localhost:3000   # Interface React
open http://localhost:8000   # API FastAPI (docs : /docs)
```

## Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | oui |
| `ADMIN_TOKEN` | Token admin API | oui |
| `ANTHROPIC_API_KEY` | Clé Claude API | oui |
| `LLM_PROVIDER` | `anthropic` · `openai` · `aws` | défaut : `aws` |
| `OPENAI_API_KEY` | Clé OpenAI (si provider=openai) | non |
| `AWS_ACCESS_KEY_ID` | Clé AWS Bedrock (si provider=aws) | non |
| `AWS_SECRET_ACCESS_KEY` | Secret AWS | non |
| `AWS_REGION` | Région AWS | défaut : `us-east-1` |
| `SEARXNG_URL` | URL interne SearXNG | défaut : `http://searxng:8080` |

## Licence

MIT
