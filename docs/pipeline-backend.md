# Pipeline Backend — Architecture & Étapes de traitement

> Document de référence technique — mis à jour le 9 mars 2026  
> Décrit le flux complet depuis la collecte d'une source jusqu'à la réponse RAG.

---

## Vue d'ensemble

```
Sources externes
      │
      ▼
[1] Collecte (CollectorService)
      │  items bruts (titre, url, summary, hash)
      ▼
[2] Stockage PostgreSQL (table `items`, statut = pending)
      │
      ▼
[3] Classification LLM (ClassifierService)
      │  topics, importance, item_type, summary_fr
      ▼
[4] Stockage PostgreSQL (statut = classified)
      │
      ├──────────────────────────────────────────┐
      ▼                                          ▼
[5] Génération de documents              [6] Indexation vectorielle
    (auto_course_generator)                  (VectorStoreService / LanceDB)
      │                                          │
      ▼                                          ▼
    table `courses`                    [7] RAG (RAGService)
    (draft → review → published)            réponse enrichie avec sources
```

---

## Étape 1 — Collecte (`CollectorService`)

**Fichier :** `mcp_server/services/collector.py`  
**Déclenché par :**
- API REST `POST /api/v1/sources` → background task `_auto_collect_and_classify`
- Appel manuel `POST /api/v1/sources/{id}/collect`
- Automatisation n8n (workflows planifiés)

### Ce que fait le service

Le `CollectorService` lit la configuration des sources depuis `config/veille_sources.yaml` et supporte trois types de sources :

| Type | Méthode | Entrée configurée |
|------|---------|-------------------|
| `rss` | `fetch_rss_feed()` via `feedparser` | URL du flux RSS |
| `website` | `fetch_website_page()` via `requests` + BeautifulSoup | URL de la page |
| `github` | `fetch_github_repos()` via GitHub API | URL du dépôt |

### Déduplication

Chaque item est haché via SHA-256 sur `title + source_url`. La méthode `insert_items()` effectue un `INSERT ... ON CONFLICT DO NOTHING` — les doublons sont silencieusement ignorés et comptabilisés dans les stats.

### Sortie

Chaque item inséré dans la table `items` avec :
- `title`, `summary`, `url`, `source_url`, `source_type`
- `workspace_id` (hérité de la source)
- `classification_status = 'pending'`
- `created_at = NOW()`

---

## Étape 2 — Stockage PostgreSQL

**Table principale : `items`**

```sql
id                  SERIAL PRIMARY KEY
title               TEXT NOT NULL
summary             TEXT
url                 TEXT UNIQUE  -- déduplication URL
source_url          TEXT         -- URL de la source parente
source_type         VARCHAR(20)  -- rss | website | github
workspace_id        INTEGER      -- espace de travail
classification_status VARCHAR(20) DEFAULT 'pending'  -- pending | classified | error
importance          VARCHAR(20)  -- critical | high | medium | low
item_type           VARCHAR(20)  -- innovation | tutorial | research | news | opinion
topics              TEXT[]       -- tableau de topics
subject             TEXT         -- sujet résumé
summary_fr          TEXT         -- résumé en français (post-classification)
confidence_score    FLOAT
created_at          TIMESTAMPTZ DEFAULT NOW()
```

---

## Étape 3 — Classification LLM (`ClassifierService`)

**Fichier :** `mcp_server/services/classifier.py`  
**Déclenché par :**
- Background task automatique après collecte (`_auto_collect_and_classify`)
- API `POST /api/v1/items/{id}/classify` (classification unitaire)
- API `POST /api/v1/items/batch/classify` (classification par lot)
- Cockpit UI : bouton "Classifier maintenant" (ItemInspector) ou "Classifier" (FluxMode batch)

### Paramètres LLM

| Paramètre | Valeur |
|-----------|--------|
| `temperature` | 0.3 (déterministe) |
| `max_tokens` | 800 |
| Modèle configuré via `.env` | ex. `aws.nova-pro-v1` ou `gpt-3.5-turbo` |

### Prompt

Le template `CLASSIFICATION_PROMPT_TEMPLATE` injecte :
- `title`, `summary`, `source`, `url` de l'item

Le LLM retourne un JSON strict avec :

```json
{
  "topics": ["LLM", "RAG", "Agents"],
  "importance": "high",
  "item_type": "innovation",
  "reasoning": "Explication courte justifiant la classification.",
  "summary_fr": "Résumé en français de l'item (2-3 phrases)."
}
```

### Mise à jour en base

```sql
UPDATE items SET
  classification_status = 'classified',
  topics       = ARRAY['LLM', 'RAG'],
  importance   = 'high',
  item_type    = 'innovation',
  summary_fr   = '...',
  subject      = '<premier topic>'
WHERE id = ?
```

Un enregistrement est automatiquement créé dans `llm_decisions` (coût, tokens, latence, modèle utilisé).

---

## Étape 4 — Génération de documents (`auto_course_generator`)

**Fichier :** `mcp_server/tools/auto_course_generator.py`  
**Endpoint :** `POST /api/v1/courses/generate`  
**Déclenché par :**
- Cockpit UI : sélection de 1 à N types dans l'ItemInspector → génération séquentielle
- Workflow n8n automatisé

### Types de documents supportés

| `content_type` | Label | Volume cible |
|----------------|-------|-------------|
| `course` | Cours pédagogique | 5000+ mots |
| `guide` | Guide pratique | 2000-3000 mots |
| `article` | Article de veille | 1500-2000 mots |
| `fiche` | Fiche de synthèse | 800-1200 mots |
| `cas_pratique` | Cas pratique | 3000+ mots |

Chaque type dispose d'un `system_prompt` et d'un `prefix` dédiés dans `CONTENT_TYPE_CONFIG`.  
Quand plusieurs types sont sélectionnés dans le cockpit, les générations sont **séquentielles** (l'une après l'autre) pour préserver les quotas LLM.

### Flux interne de génération

```
generate_course_from_item(item_id, content_type, duration_minutes)
  │
  ├─ 1. Fetch item depuis PostgreSQL
  │
  ├─ 2. RAG enrichissement (optionnel)
  │      VectorStoreService.search() — récupère les K chunks les plus proches
  │      du titre + summary de l'item pour enrichir le prompt
  │
  ├─ 3. Construction du prompt
  │      FRENCH_COURSE_PROMPT + system_prompt du type + contexte RAG
  │
  ├─ 4. Appel LLM (aws.nova-pro ou openai)
  │      temperature=0.7, max_tokens=4000
  │
  ├─ 5. Parsing réponse JSON
  │      { title, content (markdown), learning_objectives, ... }
  │
  ├─ 6. Insertion dans `courses`
  │      status='draft', source_item_id=item_id, content_type=content_type
  │
  ├─ 7. Génération PDF asynchrone (pdf_generator en background)
  │
  └─ 8. Indexation vectorielle du contenu généré
         VectorStoreService.add_course() → LanceDB
```

### Table `courses`

```sql
id              SERIAL PRIMARY KEY
title           TEXT
content         TEXT        -- contenu Markdown
content_type    VARCHAR(20) -- course | guide | article | fiche | cas_pratique
status          VARCHAR(20) DEFAULT 'draft'  -- draft | review | published | archived
source_item_id  INTEGER     -- item d'origine
workspace_id    INTEGER
qa_score        FLOAT       -- score qualité 0-10 (post-évaluation QA)
tokens_used     INTEGER
cost_usd        FLOAT
created_at      TIMESTAMPTZ
```

---

## Étape 5 — Indexation vectorielle (`VectorStoreService`)

**Fichier :** `mcp_server/services/vector_store.py`  
**Base vectorielle :** LanceDB (`./data/lancedb`)  
**Table LanceDB :** `academiaops_embeddings`

### Providers d'embeddings

| Provider | Modèle | Dimension |
|----------|--------|-----------|
| AWS Bedrock (défaut) | Amazon Titan Embeddings V2 | 1024 |
| SentenceTransformer (fallback) | `all-MiniLM-L6-v2` | 384 |

Le provider actif est configuré via `embedding_provider` dans `.env`.

### Quand l'indexation se déclenche

1. **Après génération** : le contenu du `course` est découpé en chunks et indexé automatiquement
2. **Post-classification** : le `summary_fr` de l'item peut être indexé
3. **Import manuel** via script `scripts/import_sources.py`

### Structure d'un vecteur

```python
{
  "id": "course_42_chunk_3",
  "vector": [...],   # 1024 floats
  "text": "...",     # chunk de texte (~500 tokens)
  "source_type": "course",
  "course_id": 42,
  "title": "Introduction au RAG",
  "metadata": { ... }
}
```

---

## Étape 6 — Recherche RAG (`RAGService`)

**Fichier :** `mcp_server/services/rag.py`  
**Endpoint :** `POST /api/v1/rag/ask`  
**Interface :** cockpit, onglet "Chat RAG" (`AssistantMode.tsx`)

### Recherche hybride

Quand `use_hybrid_search=True` (défaut) :
1. **Recherche vectorielle** — cosine similarity sur les embeddings (top_k=5)
2. **Recherche full-text** — FTS LanceDB sur le texte des chunks

Les deux résultats sont fusionnés, dédupliqués par `course_id` et re-classés.

### Flux `ask()`

```
ask(query, use_hybrid_search=True)
  │
  ├─ 1. Embed la query (même provider que l'indexation)
  │
  ├─ 2. VectorStore.hybrid_search() ou vector_search()
  │      → liste de chunks avec score de distance
  │
  ├─ 3. Construction du prompt RAG
  │      RAG_USER_PROMPT_TEMPLATE + sources formatées + question
  │
  ├─ 4. Appel LLM (temperature=0.5, max_tokens=800)
  │
  ├─ 5. Parsing réponse
  │      { answer: "...", sources: [{course_id, title, chunk_text, _distance}] }
  │
  └─ 6. Sauvegarde historique dans `rag_history`
         { query, answer, sources_json, user_identifier, created_at }
```

### Affichage dans le cockpit

Les sources retournées dans la réponse sont affichées comme des boutons cliquables.  
Cliquer sur une source navigue directement vers le document en mode **Contenus** avec l'inspecteur ouvert.

---

## Évaluation qualité QA (`score_course_quality`)

**Déclenché optionnellement** après génération.

Le `QA_SCORING_PROMPT` envoie le contenu du cours au LLM (temperature=0.1) pour obtenir un score de 0 à 10 avec :
- Issues identifiées
- Points forts
- Recommandations d'amélioration

Le score est stocké dans `courses.qa_score`. Baseline attendue pour du contenu LLM bien structuré : **8.0 – 9.0**.

---

## Providers LLM (`LLMProvider`)

**Fichier :** `mcp_server/services/llm_provider.py`

| Provider | Modèles configurés | Usage principal |
|----------|--------------------|----------------|
| `aws` (Bedrock) | `us.amazon.nova-pro-v1:0` | Génération de contenu, classification |
| `openai` | `gpt-3.5-turbo`, `gpt-4` | Classification (fallback) |
| `anthropic` | Claude 3 | Optionnel |

La factory `create_llm_provider(provider_type, ...)` est appelée à la demande dans les endpoints (pas d'instance globale) pour permettre la rotation de modèles selon la tâche.

---

## Variables d'environnement clés

| Variable | Usage |
|----------|-------|
| `LLM_PROVIDER` | `aws` \| `openai` \| `anthropic` |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | Accès Bedrock |
| `AWS_REGION` | ex. `us-east-1` |
| `AWS_BEDROCK_MODEL` | ex. `us.amazon.nova-pro-v1:0` |
| `EMBEDDING_PROVIDER` | `bedrock` \| `sentence-transformers` |
| `DATABASE_URL` | URL PostgreSQL |
| `LANCEDB_PATH` | Chemin vers `./data/lancedb` |
| `TELEGRAM_BOT_TOKEN` | HITL via Telegram |

---

## Récapitulatif des tables PostgreSQL

| Table | Rôle |
|-------|------|
| `items` | Items collectés (bruts → classifiés) |
| `sources` | Configuration des sources de veille |
| `courses` | Documents générés (tous types) |
| `rag_history` | Historique des questions/réponses RAG |
| `llm_decisions` | Traçabilité coût/tokens par appel LLM |
| `workspaces` | Espaces de travail |
| `workspace_permissions` | Membres et droits par workspace |
| `topics` | Topics de classification (référentiel) |
