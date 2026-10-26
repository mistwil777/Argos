# Argos

Plateforme de veille intelligente et d'apprentissage adaptatif. Argos comprend votre niveau de connaissance réel, collecte et filtre l'information en continu, et vous sert exactement le bon contenu — dans le bon ordre, au bon moment.

---

## Ce qu'Argos fait

**Veille** — Sources validées par profil, collecte nocturne automatique, briefing journalier avec note de pertinence sur chaque article.

**Apprentissage** — Entretien de calibration unique, plan chronologique généré, contenu servi progressivement selon l'avancement réel mesuré par le RAG+KG.

**Projets équipes** — Environnement isolé par mission : CDC analysé par LLM, sources validées par le chef de projet, RAG+KG dédiés, briefing projet avec pertinence contextuelle par item.

**IDE et LLMs** — Serveur MCP exposant la base de connaissance aux assistants IA (VS Code, Cursor, Claude Desktop, ChatGPT).

---

## Les 4 filtres

| Filtre | Mécanisme | Effet |
|---|---|---|
| **① Fiabilité source** | Score Tranco + validation croisée + decay temporel | Tiers officiel / reconnu / communauté / exclu |
| **② Pertinence LLM** | Haiku note 1–5 × profil utilisateur | Score ≤ 3 → ignoré automatiquement |
| **③ Progression** | RAG+KG vs plan pédagogique | Concept verrouillé tant que prérequis non assimilé |
| **④ HITL** | Décision explicite : Intégrer · Sauvegarder · Ignorer | Rétroaction sur les filtres suivants |

---

## Pipeline

```
Sources (RSS · Web · GitHub · ArXiv · PDF)
    │
    ▼  Collecte nocturne (APScheduler + Celery)
    │
    ▼  Classification LLM (importance · type · keywords)
    │
    ▼  Scoring fiabilité (sans LLM — Tranco, cross-source)
    │
    ▼  Digest structuré (Claude Sonnet → markdown + JSON)
    │
    ▼  Tagging auto (veille / apprentissage / projet — Haiku)
    │
    ▼  Filtre pertinence (Haiku 1–5 × profil, ≤3 ignoré)
    │
    ▼  Indexation RAG (sentence-transformers → LanceDB hybrid)
    │
    ▼  Briefing journalier / Décision HITL / Assistant RAG
```

---

## Stack technique

| Composant | Technologie |
|---|---|
| Backend | FastAPI + Python 3.11 |
| Base de données | PostgreSQL 16 |
| Vector store | LanceDB (hybrid search sémantique + fulltext) |
| LLM principal | Claude Sonnet via AWS Bedrock |
| LLM scoring | Claude Haiku (pertinence, tagging) |
| Embeddings | sentence-transformers (local, sans appel externe) |
| Queue | Celery + Redis |
| Scraping | trafilatura + Playwright (fallback SPA/JS) |
| Recherche web | SearXNG auto-hébergé |
| Auth | JWT RS256 + workspaces multi-tenant |
| Frontend | React + Vite + TypeScript + Tailwind CSS |
| IDE/LLM | Serveur MCP JSON-RPC (7 outils exposés) |
| Déploiement | Docker Compose |

---

## Démarrage rapide

```bash
# 1. Configuration
cp .env.example .env
# Renseigner : POSTGRES_PASSWORD, ADMIN_TOKEN, ANTHROPIC_API_KEY (ou AWS Bedrock)

# 2. Stack complète
docker compose up -d

# 3. Frontend (développement)
cd frontend && npm install && npm run dev

# 4. Accès
open http://localhost:3000   # Interface React
open http://localhost:8000   # API FastAPI (docs : /docs)
```

## Variables d'environnement

| Variable | Description | Requis |
|---|---|---|
| `POSTGRES_PASSWORD` | Mot de passe PostgreSQL | oui |
| `ADMIN_TOKEN` | Token admin API | oui |
| `ANTHROPIC_API_KEY` | Clé Claude API (si provider=anthropic) | non |
| `LLM_PROVIDER` | `anthropic` · `openai` · `aws` | défaut : `aws` |
| `AWS_ACCESS_KEY_ID` | Clé AWS Bedrock (si provider=aws) | non |
| `AWS_SECRET_ACCESS_KEY` | Secret AWS | non |
| `AWS_REGION` | Région AWS | défaut : `us-east-1` |
| `OPENAI_API_KEY` | Clé OpenAI (si provider=openai) | non |
| `SEARXNG_URL` | URL interne SearXNG | défaut : `http://searxng:8080` |

---

## Structure

```
argos/
├── argos/
│   ├── services/
│   │   ├── intent_discovery.py   # Décomposition intention → sources (AUTHORITY_REGISTRY)
│   │   ├── calibration_agent.py  # Entretien LLM de calibration (perso + projet)
│   │   ├── collector.py          # RSS · GitHub · ArXiv · Web
│   │   ├── classifier.py         # Classification LLM (importance · type · keywords)
│   │   ├── scorer.py             # Scoring fiabilité sans LLM
│   │   ├── digest_generator.py   # LLM → markdown + JSON structuré
│   │   ├── rag.py                # RAG hybride (LanceDB + fulltext)
│   │   ├── scheduler.py          # APScheduler + Celery
│   │   ├── web_browser.py        # Playwright stealth
│   │   └── llm_provider.py       # Abstraction OpenAI / Anthropic / Bedrock
│   ├── api/
│   │   ├── router.py             # API principale (items, briefing, projets, MCP)
│   │   ├── projects.py           # Espaces projet (création, membres, propositions)
│   │   └── workspaces.py         # Workspaces multi-tenant
│   └── server.py                 # FastAPI app + MCP JSON-RPC
├── frontend/src/
│   ├── pages/
│   │   ├── Briefing.tsx          # Briefing journalier (veille + apprentissage)
│   │   ├── ProjetDetail.tsx      # Espace projet (sujets, membres, sources, briefing)
│   │   ├── ProjetNouveau.tsx     # Création projet (CDC → entretien → sujets → sources)
│   │   ├── Veille.tsx            # Création de veille par intention
│   │   └── Library.tsx           # Bibliothèque (documents générés + RAG)
│   └── components/
│       ├── BriefingPanel.tsx     # Panel briefing partagé (perso + projet)
│       └── ui/ItemReaderModal.tsx # Reader document (LLM, fullscreen, Sauvegarder & indexer)
├── tests/                        # Suite de tests automatisés
└── docker-compose.yml
```

---

## Licence

MIT
