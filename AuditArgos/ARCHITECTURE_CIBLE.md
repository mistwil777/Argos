# Architecture cible — Argos MVP

## Vision

L'utilisateur exprime une intention en langage naturel.  
Le système découvre les sources, collecte, filtre, classe, indexe et répond — sans intervention manuelle.  
L'interface principale est conversationnelle (texte + vocal).

---

## Vue d'ensemble des couches

```
┌─────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                      │
│  Dashboard │ Feed │ Assistant (vocal) │ Briefing │ ...   │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP / WebSocket
┌────────────────────────▼────────────────────────────────┐
│                  API FASTAPI (/api/v1)                   │
│         Routes existantes + nouvelles routes             │
└──┬──────────────┬──────────────┬───────────────┬────────┘
   │              │              │               │
┌──▼───┐    ┌────▼────┐   ┌─────▼─────┐   ┌────▼──────┐
│SCHED │    │PIPELINE │   │  RAG +    │   │  VOCAL    │
│ULER  │    │CONTINU  │   │ ASSISTANT │   │  (Web     │
│(APS) │    │         │   │  Claude   │   │  Speech)  │
└──┬───┘    └────┬────┘   └─────┬─────┘   └────┬──────┘
   │              │              │               │
┌──▼──────────────▼──────────────▼───────────────▼──────┐
│              SERVICES (existants + nouveaux)            │
│  collector │ classifier │ digest │ rag │ scorer │ ...   │
└──────────────────────────┬─────────────────────────────┘
                           │
┌──────────────────────────▼─────────────────────────────┐
│              PostgreSQL + LanceDB                        │
└─────────────────────────────────────────────────────────┘
```

---

## Couche 1 — Scheduler (remplace les boucles ad-hoc)

**Technologie** : APScheduler v3 + SQLAlchemyJobStore (PostgreSQL existant)

**Jobs planifiés** :

| Job | Fréquence | Description |
|---|---|---|
| `collect_all_sources` | Configurable par source (défaut 1h) | Collecte toutes les sources actives |
| `classify_pending` | Toutes les 15 min | Classifie les items `pending` en batch (max 20) |
| `ingest_high_priority` | Toutes les 30 min | Digest + RAG index automatique des items `high`/`critical` |
| `daily_briefing` | Quotidien 7h00 | Génère le briefing (remplace la boucle `while True`) |
| `score_sources` | Quotidien minuit | Recalcule les scores de pertinence de chaque source |
| `decay_sources` | Hebdomadaire | Baisse la priorité des sources peu performantes |

**Ce qui change** : `server.py` instancie un `AsyncIOScheduler` au lifespan, plus de `asyncio.ensure_future` ni de boucles `while True`.

---

## Couche 2 — Intent → Discovery (nouveau)

**Déclencheur** : l'utilisateur crée une veille en langage naturel depuis le frontend.

**Flux** :
```
User : "Je veux suivre les nouveautés Claude et Mistral"
           │
           ▼
  IntentService.decompose(text)          ← 1 appel Claude
           │
           ▼ retourne :
  {
    entities: ["Anthropic", "Claude", "Mistral AI", "Mixtral"],
    themes: ["LLM API", "function calling", "nouveaux modèles", "benchmarks"],
    source_types: ["changelog", "blog", "github", "arxiv", "rss"],
    keywords: ["claude 3", "mistral", "API", "system prompt", "tool use"]
  }
           │
           ▼
  DiscoveryService.find_sources(intent)  ← SearXNG (déjà là)
           │  - recherche par entité + type de source
           │  - trafilatura.feeds.find_feed_urls() sur les domaines trouvés
           │  - score domaine via Tranco (fiabilité)
           ▼
  [liste de sources candidates avec score]
           │
           ▼
  DiscoveryService.validate_sources()   ← heuristiques, pas de LLM
           │  - densité informationnelle (textstat)
           │  - score domaine Tranco
           │  - dédup si source déjà en base
           ▼
  Sources créées automatiquement en DB
  → premier collect déclenché immédiatement
```

**Nouveau service** : `argos/services/intent_discovery.py`  
**Nouvelle route** : `POST /veille/create` — body : `{"description": "texte libre", "workspace_id": int}`

---

## Couche 3 — Pipeline continu (automatise l'existant)

**Principe** : les services existent déjà, on les chaîne. Zéro intervention manuelle.

```
[Scheduler] collect_all_sources
        │
        ▼
CollectorService.fetch_from_db_sources()
        │  items insérés avec status="pending"
        ▼
[Scheduler] classify_pending (15 min plus tard au pire)
        │
        ▼
ClassifierService.classify_batch()
        │  items → status="classified" + importance + keywords
        ▼
[Scheduler] ingest_high_priority (30 min plus tard au pire)
        │  filtre : importance IN ('high', 'critical') AND digest IS NULL
        ▼
DigestGenerator.generate_digest()       ← contenu brut → digest LLM
        │
        ▼
RAGService.index_item()                 ← digest → LanceDB
        │
        ▼
Item prêt pour l'Assistant et le Briefing
```

**Délai end-to-end** : source publie un article → disponible dans le RAG en < 2h (pire cas). < 30 min si les schedulers tournent à plein régime.

**Suppression de l'étape preview/confirm** pour les items collectés automatiquement. Elle reste uniquement pour les uploads manuels (PDF, documents).

---

## Couche 4 — Scoring de pertinence (nouveau, sans LLM)

**Nouveau service** : `argos/services/scorer.py`

```python
# Score composite par item (0.0 → 1.0)
item_score = (
    domain_score(url)           * 0.25  # Tranco rank
  + density_score(content)      * 0.25  # textstat + structure HTML
  + semantic_novelty(embedding) * 0.30  # cosine vs base existante (sklearn)
  + cross_source_score(item)    * 0.20  # combien de sources couvrent ce sujet
)

# Score source (mis à jour par le job quotidien)
source_score = (
    ratio_high_critical         * 0.50  # signal utile / total collecté
  + avg_item_score              * 0.30  # qualité moyenne des items
  + recency                     * 0.20  # activité récente
)
```

**Table PostgreSQL** : `source_scores(source_id, score, computed_at, ratio_high, avg_density)`  
**Decay** : si `source_score < 0.2` depuis 14 jours → source passée en `priority="low"`, collecte réduite à 1x/jour.

---

## Couche 5 — Assistant conversationnel + Vocal (scénario B)

**Existant** : page `Assistant.tsx` + `POST /rag/ask` — déjà fonctionnel en texte.

**Ajouts pour le scénario B** :

### Vocal (Web Speech API — natif navigateur, zéro coût)

```
Microphone
    │
    ▼
SpeechRecognition (navigateur)     ← STT natif Chrome/Edge, français
    │  transcription en temps réel
    ▼
Assistant.tsx envoie POST /rag/ask
    │
    ▼
Claude génère la réponse
    │
    ▼
SpeechSynthesis (navigateur)       ← TTS natif macOS, voix "Thomas" FR
    │
    ▼
Audio joué dans le navigateur
```

**Upgrade futur** (après whitelist HF) : remplacer SpeechRecognition par faster-whisper et SpeechSynthesis par Kokoro — sans toucher au reste de l'architecture.

### Nouvelles fonctionnalités assistant

- **Mémoire de session** : contexte des 5 dernières questions conservé pour des échanges cohérents
- **Commandes vocales** : "génère un document sur X", "quoi de neuf sur Y cette semaine", "résume le briefing d'aujourd'hui" → détectées par Claude, déclenchent les routes existantes
- **Streaming** : `POST /rag/ask/stream` (SSE) pour afficher la réponse au fil de la génération

---

## Nouvelles pages frontend

| Page | Route | Description |
|---|---|---|
| **Veille** | `/veille` | Créer une veille par intention (remplace Sources pour les utilisateurs) |
| *(upgrade Sources)* | `/sources` | Sources reste pour les power users qui veulent ajouter manuellement |

**Page Veille** :
- Champ texte : "Décrivez votre besoin de veille"
- Bouton → appelle `POST /veille/create`
- Affiche les sources découvertes avec leur score avant confirmation
- L'utilisateur valide ou ajuste, les sources sont créées

---

## Nouveaux fichiers à créer

```
argos/
├── services/
│   ├── intent_discovery.py     # IntentService + DiscoveryService
│   ├── scorer.py               # item_score + source_score + decay
│   └── scheduler.py            # APScheduler init + tous les jobs
├── api/
│   └── veille.py               # POST /veille/create
frontend/src/
└── pages/
    └── Veille.tsx              # Page création de veille par intention
```

**Fichiers modifiés** :
- `argos/server.py` — remplacer les boucles asyncio par APScheduler
- `argos/api/router.py` — ajouter `POST /rag/ask/stream`
- `frontend/src/pages/Assistant.tsx` — ajouter STT/TTS Web Speech API
- `frontend/src/App.tsx` — ajouter route `/veille`
- `database/init.sql` — ajouter table `source_scores`, `interactions`

---

## Ce qu'on ne fait PAS dans le MVP

- Graph de connaissances — architecture DB compatible, implémentation après MVP
- Alertes temps réel (WebSocket push) — après MVP
- faster-whisper / Kokoro — après whitelist HuggingFace
- Multi-utilisateurs / workspaces avancés — après MVP
- Celery — upgrade possible plus tard sans tout casser

---

## Ordre d'implémentation

1. `scheduler.py` — APScheduler remplace les boucles ad-hoc (fondation)
2. `scorer.py` — scoring sans LLM (bloque le decay et la qualité)
3. `intent_discovery.py` + `POST /veille/create` + `Veille.tsx`
4. Pipeline continu (chaîner les services existants dans les jobs scheduler)
5. Vocal Web Speech API dans `Assistant.tsx` + streaming SSE
