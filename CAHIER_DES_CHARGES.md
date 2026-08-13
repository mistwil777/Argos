# Cahier des Charges Fonctionnel — Argos

**Version :** 2.0  
**Date :** Août 2026  
**Statut :** Version de production

---

## 1. Philosophie et objectifs

### 1.1 Ce qu'est Argos

Argos est un système de veille et d'apprentissage personnalisé. Il collecte automatiquement des contenus depuis des sources hétérogènes, les filtre, les classe — et les sert à chaque utilisateur en fonction de ce qu'il sait déjà et de ce qui lui manque.

La distinction centrale : Argos ne sait pas seulement *quoi* collecter. Il sait *pour qui* et *pourquoi*. Le même article peut être de la veille pour un expert et de l'apprentissage fondamental pour un débutant sur le même sujet. Argos fait cette distinction automatiquement, pour chaque utilisateur, pour chaque sujet configuré.

Argos est **agnostique à tous les domaines**. Il ne contient aucune logique codée pour un secteur spécifique. Le profil de connaissance, les sources, la classification et le graphe de relations sont entièrement configurés par l'utilisateur.

### 1.2 Principes architecturaux non négociables

**Comprendre avant de collecter.** Avant toute collecte, Argos conduit un entretien structuré avec l'utilisateur pour cartographier ses lacunes et ses objectifs. Sans ce profil, le système est aveugle.

**Rien n'entre dans la base de connaissance automatiquement.** L'ingestion dans le RAG est un acte délibéré de l'utilisateur. Un classificateur LLM est précis à 85–90% — les 10–15% d'erreurs s'accumulent silencieusement dans une base automatique. Une base petite et propre, constituée de décisions humaines, vaut plus qu'une base large et bruitée.

**L'apprentissage est progressif.** Le contenu d'apprentissage est servi dans l'ordre du plan établi lors de l'entretien, au fur et à mesure de la collecte. L'utilisateur ne reçoit pas tout d'un coup — il progresse sans être submergé.

**La base de connaissance reste vivante.** Une comparaison hebdomadaire entre les nouvelles sources collectées et l'état du RAG+KG permet de mettre à jour les informations obsolètes sans intervention manuelle.

### 1.3 Utilisateurs cibles

- Consultants et experts métier (tout domaine)
- Équipes de veille technologique, réglementaire, concurrentielle
- Formateurs et responsables pédagogiques
- Équipes projet ayant besoin d'une mémoire de mission partagée
- Développeurs via intégration IDE (MCP)

---

## 2. Architecture système

### 2.1 Stack technique

**Backend :**
- Python 3.11+
- FastAPI (API REST + SSE pour le streaming)
- PostgreSQL 16 (source de vérité unique)
- LanceDB embarqué (vector store — hybrid search natif)
- SentenceTransformer (embeddings locaux — zéro coût, zéro latence réseau)
- Celery + Redis (tâches asynchrones — collecte, pipeline)
- SearXNG (moteur de recherche interne pour la découverte de sources)
- Playwright (rendu JavaScript pour les SPAs)
- Trafilatura (extraction sémantique de contenu web)
- Tesseract + poppler (OCR pour PDF et images)

**LLMs :**
- AWS Bedrock — Amazon Nova Pro (classification, digest, extraction KG, contenu tagging)
- Anthropic Claude Haiku (tâches rapides — tagging, vérification domaine)
- Interface commune : changement de modèle = variable d'environnement

**Frontend :**
- React 19 + TypeScript
- Vite 7
- TailwindCSS 3.4
- React Router 7
- TanStack React Query 5

**Déploiement :**
- Docker Compose (3 services : PostgreSQL, argos-server, SearXNG)
- CI GitHub Actions (pytest, 110 tests)

### 2.2 Architecture en couches

```
┌─────────────────────────────────────────────────────────┐
│                  Frontend (React/Vite)                  │
│   Veille · Briefing · Librairie · Réglages · Assistant  │
├─────────────────────────────────────────────────────────┤
│                  API REST (FastAPI)                      │
│   + Serveur MCP (Model Context Protocol)                │
├──────────────┬──────────────────────────────────────────┤
│   Services   │  CalibrationAgent · CollectorService     │
│   Métier     │  ReliabilityScorer · ClassifierService   │
│              │  ContentTagger · DigestService           │
│              │  RAGService · KGService                  │
├──────────────┼──────────────┬───────────────────────────┤
│  PostgreSQL  │   LanceDB    │  SentenceTransformer      │
│  (données    │  (vecteurs   │  (embeddings locaux)      │
│  relationnelles) hybrid)   │                           │
└──────────────┴──────────────┴───────────────────────────┘
```

---

## 3. Fonctionnalités

### 3.1 Entretien de calibration (CalibrationAgent)

**Rôle :** Cartographier les connaissances de l'utilisateur avant toute collecte.

**Déroulé :**
1. L'utilisateur crée un sujet de veille (ex : "MLOps", "Droit européen du numérique")
2. L'agent IA conduit un entretien conversationnel — questions ouvertes par sous-thème, approfondissement des réponses, évaluation du niveau réel démontré
3. L'entretien produit un **bilan de connaissance** : maîtrisé / lacunaire / inconnu, par sous-thème
4. Sur la base du bilan, l'agent génère un **plan d'apprentissage chronologique** : les sujets dans l'ordre logique de progression, avec les prérequis identifiés
5. Le bilan et le plan sont stockés dans `knowledge_profile` (sujet) — ils servent de référence pour tout le pipeline aval
6. Le bilan peut être mis à jour quand les besoins évoluent (l'agent détecte l'existence d'un profil et propose mise à jour vs recréation)

**Durée :** 15–20 minutes par sujet, une seule fois.

**Tables DB :** `sujets.knowledge_profile` (jsonb : `bilan_md`, `learning_plan_md`, `learning_context`)

### 3.2 Découverte et gestion des sources

**Découverte automatique :** SearXNG interroge le web pour identifier les sources pertinentes selon le profil du sujet (mots-clés, domaine, niveau). Les résultats sont présentés à l'utilisateur pour validation.

**Types de sources supportés :**
- Flux RSS/Atom
- Sites web (avec détection de diff et rendu JS via Playwright)
- Dépôts GitHub (releases, README)
- Bases documentaires publiques
- Documents internes (PDF, images via OCR)
- Webhooks / APIs tierces

**Logique de diff (sources web) :** chaque page est hachée (SHA-256). À chaque collecte, si le hash a changé, seules les lignes ajoutées sont extraites (`difflib.unified_diff`) et transformées en item titré `[MàJ]`. L'utilisateur ne voit que la nouveauté, pas le contenu déjà connu.

**Tables DB :** `sources (id, name, source_type, url, config, sujet_id, last_collected_at, is_active)`

### 3.3 Pipeline de collecte et de traitement

Le pipeline est exécuté en tâche asynchrone (Celery). Chaque étape est indépendante — un échec ne bloque pas les étapes suivantes.

```
Collecte
  ↓
Déduplication (URL exacte + similarité trigram PostgreSQL, seuil 0.6)
  ↓
Reliability Scoring (filtre avant INSERT)
  ↓
INSERT en base (statut : pending)
  ↓
Classification LLM (topics, importance, type, résumé français)
  ↓
Content Tagging (veille / apprentissage / mixed — selon profil)
  ↓
Verify Domains (vérification LLM des domaines unknown, mise en cache)
```

#### Reliability Scoring

Score calculé avant tout INSERT. Approche agnostique — aucune liste de domaines codée en dur.

| Règle | Résultat |
|-------|----------|
| Token du domaine présent dans le titre de l'article | `official` — 1.0 |
| TLD institutionnel (`.gov`, `.gouv.fr`, `.edu`, `.ac.uk`) | `official` — 1.0 |
| Sous-domaine `docs.*` | `official` — 0.95 |
| Domaine inconnu (ni rejeté ni confirmé) | `unknown` — 0.4 |
| Extensions commerciales, patterns "affiliate"/"sponsored"/"coupon" | `rejected` — 0.0 |

Signaux contenus : longueur minimale 200 mots, densité commerciale > 4% → rejet, signaux forts ("request a demo", "free trial") → rejet immédiat.

Les domaines `unknown` sont soumis à une vérification LLM différée, mise en cache dans `domain_reputation` — un domaine n'est vérifié qu'une seule fois.

#### Classification LLM

Appel AWS Bedrock (Nova Pro, température 0.5). Retourne un JSON structuré :

| Champ | Valeurs |
|-------|---------|
| `topics` | 1–5 strings (technologies, concepts, acteurs mentionnés) |
| `importance` | `critical` · `high` · `medium` · `low` |
| `item_type` | `tool` · `tutorial` · `research` · `news` · `discussion` · `other` |
| `summary_fr` | Résumé 2–3 phrases en français (même si source anglaise) |

Chaque appel LLM est tracé dans `llm_usage` : modèle, tokens input/output, coût USD, operation_type.

#### Content Tagging

Haiku lit `cleaned_content` + `knowledge_profile` du sujet (`bilan_md` + `learning_plan_md`) et retourne :

| Champ | Valeurs |
|-------|---------|
| `category` | `veille` · `apprentissage` · `mixed` |
| `veille_passages` | Extraits relevant de la veille |
| `apprentissage_passages` | Extraits relevant de l'apprentissage |

Stocké dans `items.content_tags` (jsonb). C'est ce champ qui détermine dans quel onglet du Briefing l'item apparaît.

**Tables DB :** `items (id, title, summary, url, cleaned_content, source_type, sujet_id, classification_status, importance, item_type, keywords, content_tags, content_tagged_at, reliability_score, reliability_tier, reliability_reason, domain_reputation_id, metadata, published_at, created_at)`

### 3.4 Briefing journalier

Vue principale de l'application. Synthèse quotidienne des éléments nouveaux depuis la dernière collecte.

**Onglet Veille :**
- Résumé 3 lignes LLM des items veille du jour
- Liste des items `veille` et `mixed` par ordre d'importance
- Signal faible (items de faible importance mais potentiellement intéressants)

**Onglet Apprentissage :**
- Section "Pour commencer" — items prioritaires selon le plan d'apprentissage
- Liste des items `apprentissage` et `mixed` dans l'ordre chronologique du plan
- Logique de temporalité : les items sont servis progressivement selon la séquence du plan, pas tous d'un coup

**Actions sur chaque item :**
- **Intégrer au RAG** → déclenche digest LLM + indexation vectorielle + extraction KG
- **Sauvegarder en bibliothèque** → archive l'item sans l'indexer dans le RAG
- **Ignorer** → l'item disparaît du feed, statut `ignored`

**Fonctionnalités complémentaires :**
- Traduction à la volée : si une langue cible est configurée dans les préférences utilisateur, le contenu est traduit automatiquement à l'ouverture. Bandeau "Traduit en X" affiché.
- Lecture plein écran sur les modals

### 3.5 Base de connaissance — RAG + Knowledge Graph

#### Ce qui est indexé : le digest, pas le contenu brut

Quand l'utilisateur choisit "Intégrer au RAG", un digest structuré est généré par LLM (résumé dense de l'article, sans redondances ni bruit HTML). C'est ce digest qui est encodé et indexé — les vecteurs sont plus précis, les résultats de recherche plus pertinents.

#### Recherche hybride (LanceDB)

- **Sémantique** (cosine similarity sur embeddings SentenceTransformer) — reformulations, synonymes, questions en langage naturel
- **Lexicale BM25** — noms de modèles, versions, acronymes techniques exacts

Les deux scores sont fusionnés (Reciprocal Rank Fusion).

#### Knowledge Graph (PostgreSQL)

À chaque ingestion, le LLM extrait :
- **Entités** (max 8) : types `org | person | product | concept | technology`
- **Relations** (max 6) : verbes courts en français ("publie", "intègre", "acquiert", "remplace")

Upsert dans PostgreSQL : si une entité existe déjà, son poids est incrémenté de 0.1. Le graphe se densifie avec l'usage — les entités les plus citées deviennent les plus "lourdes".

Lors d'une requête, les entités correspondant à des mots de la question (≥ 4 chars) sont récupérées avec leurs relations et injectées dans le prompt de génération, en complément des sources vectorielles.

#### Mise à jour hebdomadaire

Une fois par semaine, Argos compare le contenu de la base vectorielle et du KG avec les nouvelles sources collectées. Les informations obsolètes (nouvelle version d'un outil, article contredisant une affirmation précédente, documentation mise à jour) sont identifiées et mises à jour.

**Tables DB :**
```
kg_nodes (id, label, entity_type, description, weight, sujet_id)
kg_edges (id, source_id, target_id, relation, weight, item_id, created_at)
```

**LanceDB :** table `rag_chunks` — `item_id`, `chunk_text`, `chunk_index`, `embedding` (384D SentenceTransformer), `metadata`

### 3.6 Assistant RAG+KG

Interface de questions-réponses en langage naturel sur la base de connaissance.

**Flux de traitement :**
1. Question de l'utilisateur
2. Embedding de la question (SentenceTransformer)
3. Recherche hybride LanceDB (top 8 chunks)
4. Récupération des entités et relations KG correspondant aux mots de la question
5. Prompt final : sources vectorielles + contexte graphe + question
6. Génération LLM en français avec citations `(→ Source N)`
7. Score de confiance : `1 − avg(distance vectorielle) / 2`
8. Affichage réponse + sources cliquables

**Endpoints :** `POST /api/v1/rag/ask`, `GET /api/v1/rag/history`, `DELETE /api/v1/rag/history`

### 3.7 Librairie

Archive de tous les contenus sauvegardés ou intégrés au RAG.

**Onglets :**
- **Bruts** — items collectés non encore traités
- **RAG** — items intégrés dans la base vectorielle (badge distinctif)
- **Documents** — documents générés ou importés
- **KG** — visualisation du graphe de connaissance

**Filtres :** sujet, importance, type, statut RAG, date

### 3.8 Serveur MCP (Model Context Protocol)

Argos expose un serveur MCP accessible à `http://argos-server:8000/mcp` via Streamable HTTP. N'importe quel IDE ou assistant IA compatible peut se connecter.

**Outils exposés :**

| Outil | Description |
|-------|-------------|
| `search_veille` | Recherche hybride dans la base RAG. Paramètres : query, sujet_id, limit |
| `get_briefing` | Briefing du jour par sujet — éléments nouveaux depuis la dernière collecte |
| `get_item` | Détail complet d'un item (digest, topics, importance, source, date) |
| `list_recent` | Derniers items fiables par sujet. Filtre sur importance |
| `argos_ask` | Interroge directement le moteur RAG+KG. Réponse en français + sources |
| `web.browse` | Scrape une URL (avec Playwright si nécessaire) et génère un digest |
| `web.watch` | Enregistre une URL pour surveillance périodique |

**Cas d'usage :** VS Code / Cursor (l'assistant IDE interroge Argos pour répondre sur des sujets métier), Claude Desktop, ChatGPT, pipelines n8n.

### 3.9 Authentification et espaces

**Authentification JWT :**
- Inscription email + mot de passe (hashage bcrypt)
- Token JWT stocké côté client, vérifié à chaque requête
- `PrivateRoute` React intercepte les navigations non authentifiées
- Préférences utilisateur dans `users.preferences` (jsonb) : langue cible, paramètres d'affichage

**Modèle d'espaces :**

Trois niveaux d'utilisation :

1. **Personnel** — un consultant, sa propre base RAG, ses sujets privés
2. **Partagé** — plusieurs membres sur un espace commun, veille mutualisée, RAG partagé
3. **Projet** — espace isolé pour une mission client : RAG, KG, droits dédiés. Livrable transmissible en fin de mission.

**Rôles par espace :**

| Rôle | Lire | Écrire | Intégrer RAG | Supprimer | Inviter |
|------|------|--------|--------------|-----------|---------|
| Propriétaire | ✓ | ✓ | ✓ | ✓ | ✓ |
| Éditeur | ✓ | ✓ | ✓ | ✗ | ✗ |
| Lecteur | ✓ | ✗ | ✗ | ✗ | ✗ |

Toutes les requêtes SQL filtrent systématiquement par `sujet_id` ou `workspace_id` — isolation des données garantie côté serveur.

---

## 4. Modèle de données

### 4.1 Tables principales

```sql
-- Utilisateurs
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    display_name VARCHAR(255),
    preferences JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Sujets de veille/apprentissage
CREATE TABLE sujets (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    keywords TEXT[],
    knowledge_profile JSONB,  -- bilan_md, learning_plan_md, learning_context
    owner_id INTEGER REFERENCES users(id),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Sources de collecte
CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL,  -- rss, website, github, pdf, webhook
    url TEXT NOT NULL,
    config JSONB,
    sujet_id INTEGER REFERENCES sujets(id),
    last_collected_at TIMESTAMP,
    last_error TEXT,
    collection_interval INTEGER DEFAULT 3600,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Items collectés
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    cleaned_content TEXT,
    url TEXT,
    source_type VARCHAR(50),
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    sujet_id INTEGER REFERENCES sujets(id),
    classification_status VARCHAR(20) DEFAULT 'pending',
    importance VARCHAR(20),
    item_type VARCHAR(50),
    keywords TEXT[],
    content_tags JSONB,           -- {category, veille_passages, apprentissage_passages}
    content_tagged_at TIMESTAMP,
    reliability_score FLOAT,
    reliability_tier VARCHAR(20),
    reliability_reason TEXT,
    metadata JSONB,
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Cache réputation des domaines
CREATE TABLE domain_reputation (
    id SERIAL PRIMARY KEY,
    domain VARCHAR(255) UNIQUE NOT NULL,
    tier VARCHAR(20) NOT NULL,
    score FLOAT NOT NULL,
    verified_by VARCHAR(20) DEFAULT 'heuristic',  -- heuristic, llm
    verified_at TIMESTAMP DEFAULT NOW()
);

-- Traçabilité des appels LLM
CREATE TABLE llm_usage (
    id SERIAL PRIMARY KEY,
    model VARCHAR(100) NOT NULL,
    operation_type VARCHAR(100),
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost_usd FLOAT,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    sujet_id INTEGER REFERENCES sujets(id),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge Graph — nœuds
CREATE TABLE kg_nodes (
    id SERIAL PRIMARY KEY,
    label VARCHAR(255) NOT NULL,
    entity_type VARCHAR(50),  -- org, person, product, concept, technology
    description TEXT,
    weight FLOAT DEFAULT 1.0,
    sujet_id INTEGER REFERENCES sujets(id),
    created_at TIMESTAMP DEFAULT NOW()
);

-- Knowledge Graph — arêtes
CREATE TABLE kg_edges (
    id SERIAL PRIMARY KEY,
    source_id INTEGER REFERENCES kg_nodes(id) ON DELETE CASCADE,
    target_id INTEGER REFERENCES kg_nodes(id) ON DELETE CASCADE,
    relation VARCHAR(100),
    weight FLOAT DEFAULT 1.0,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

-- Requêtes RAG (historique)
CREATE TABLE rag_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    answer TEXT,
    sources JSONB,
    confidence_score FLOAT,
    sujet_id INTEGER REFERENCES sujets(id),
    user_id INTEGER REFERENCES users(id),
    created_at TIMESTAMP DEFAULT NOW()
);
```

### 4.2 Index de performance

```sql
CREATE INDEX idx_items_sujet_id ON items(sujet_id);
CREATE INDEX idx_items_classification_status ON items(classification_status);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_items_content_tags ON items USING GIN(content_tags);
CREATE INDEX idx_items_keywords ON items USING GIN(keywords);
CREATE INDEX idx_kg_nodes_label ON kg_nodes(lower(label));
CREATE INDEX idx_kg_nodes_sujet ON kg_nodes(sujet_id);
CREATE INDEX idx_sources_active ON sources(is_active) WHERE is_active = true;

-- Déduplication trigram
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX idx_items_title_trgm ON items USING GIN(title gin_trgm_ops);
```

### 4.3 Stockage vectoriel (LanceDB)

```python
# Table rag_chunks
{
    "id": str,                        # uuid
    "item_id": int,
    "chunk_text": str,
    "chunk_index": int,
    "embedding": np.array(384,),      # SentenceTransformer all-MiniLM-L6-v2
    "metadata": {
        "title": str,
        "sujet_id": int,
        "importance": str,
        "category": str,              # veille | apprentissage | mixed
        "created_at": str
    }
}
```

---

## 5. Flux utilisateur

### 5.1 Mise en route — premier sujet

```
1. Inscription / connexion
2. Créer un sujet (nom, description, mots-clés initiaux)
3. Entretien de calibration (CalibrationAgent — 15-20 min)
   → Bilan de connaissance généré
   → Plan d'apprentissage généré
4. Découverte automatique de sources (SearXNG)
   → Validation et ajustement par l'utilisateur
5. Première collecte
   → Pipeline : reliability → classify → tag_content
6. Briefing disponible — onglets Veille et Apprentissage
```

### 5.2 Usage quotidien

```
1. Ouvrir le Briefing
2. Parcourir les items Veille (signal fort du jour)
   → Intégrer / Sauvegarder / Ignorer
3. Parcourir les items Apprentissage (séquence du plan)
   → Intégrer ceux qui correspondent à la progression actuelle
4. Interroger l'Assistant si besoin (question en langage naturel)
```

### 5.3 Requête RAG

```
1. Utilisateur pose une question dans l'Assistant
2. Embedding de la question
3. Recherche hybride LanceDB (top 8 chunks)
4. Enrichissement KG (entités et relations liées à la question)
5. Génération LLM — réponse française + citations
6. Affichage score de confiance + sources cliquables
```

---

## 6. Tests et qualité

### 6.1 Couverture actuelle

110 tests automatisés répartis en 5 suites :

| Suite | Périmètre |
|-------|-----------|
| `test_reliability_scorer` | Heuristique agnostique, cache domain_reputation, vérification LLM |
| `test_content_tagger` | Classification veille/apprentissage, bilan vide, batch |
| `test_pipeline_steps` | Étapes classify, tag_content, verify_domains |
| `test_auth` | JWT, hashage passwords, merge préférences |
| `test_api_routes` | Traduction, admin token 403, briefing today |

### 6.2 CI GitHub Actions

```yaml
- checkout
- python 3.11
- pip install -r requirements.txt
- PYTHONPATH=. pytest tests/ -v
```

Les tests sont unitaires — aucune dépendance à Redis, Celery ou LanceDB en CI. Les services externes sont mockés.

### 6.3 Conventions

- Tout nouveau service ou endpoint doit avoir son test avant merge
- Un test sans `assert` n'est pas un test
- TDD : test en premier, code minimal pour le faire passer, refactor si nécessaire

---

## 7. Déploiement

### 7.1 Docker Compose (développement et production)

```yaml
services:
  postgres:
    image: postgres:16
    volumes: [postgres_data:/var/lib/postgresql/data]

  argos-server:
    build: .
    depends_on: [postgres]
    ports: ["8000:8000"]
    environment:
      - DATABASE_URL
      - AWS_ACCESS_KEY_ID
      - AWS_SECRET_ACCESS_KEY
      - AWS_REGION
      - ANTHROPIC_API_KEY
      - LANCEDB_PATH
      - REDIS_URL
      - ADMIN_TOKEN

  searxng:
    image: searxng/searxng
    ports: ["8080:8080"]
```

### 7.2 Variables d'environnement

```bash
DATABASE_URL=postgresql://user:pass@postgres:5432/argos
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1
ANTHROPIC_API_KEY=...
LANCEDB_PATH=./data/lancedb
REDIS_URL=redis://redis:6379/0
ADMIN_TOKEN=...
VITE_API_URL=http://localhost:8000
```

### 7.3 Navigation frontend

```
/veille          → Briefing journalier (Veille + Apprentissage)
/bibliotheque    → Librairie (Bruts / RAG / Documents / KG)
/assistant       → Interface RAG+KG
/reglages        → Profil · Connexions · Espaces · Préférences
```

---

## 8. Roadmap

### 8.1 Livré (août 2026)

- Entretien de calibration — bilan, plan d'apprentissage, whitelist sources
- Pipeline complet : collect → reliability → classify → tag_content → verify_domains
- Reliability scorer agnostique (heuristique sémantique + cache + LLM)
- Briefing journalier avec onglets Veille / Apprentissage
- Apprentissage progressif chronologique
- Traduction à la volée
- RAG hybride (LanceDB + SentenceTransformer)
- Knowledge Graph (extraction LLM + enrichissement requêtes)
- Mise à jour hebdomadaire RAG+KG
- Authentification JWT + rôles par espace
- Ingestion PDF/images (OCR Tesseract)
- Serveur MCP — 7 outils
- 110 tests automatisés, CI GitHub Actions

### 8.2 Prochaines étapes

| Fonctionnalité | Objectif |
|----------------|----------|
| Librairie — onglets Veille / Apprentissage | Navigation structurée dans les contenus archivés |
| Moteur de progression — plan vs état KG | Ajuster le rythme selon l'avancement réel |
| Mise à jour du bilan — détection profil existant | Maintenir la pertinence du profil dans le temps |
| Rétention RAG — temporelle (veille) et par progression (apprentissage) | Base propre sans intervention manuelle |
| Espaces projets isolés — RAG/KG/droits par mission | Isolation complète pour missions client |

---

## 9. Glossaire

**Sujet :** unité de configuration d'Argos — regroupe sources, profil de connaissance, items, base RAG et KG d'un domaine de veille.

**Bilan de connaissance :** cartographie des lacunes d'un utilisateur par sous-thème, produit par l'entretien de calibration.

**Plan d'apprentissage :** séquence chronologique de sujets à acquérir, établie à partir du bilan, servant de fil conducteur pour le contenu d'apprentissage.

**Content tagging :** classification sémantique de chaque item en `veille`, `apprentissage` ou `mixed` selon le profil de l'utilisateur.

**RAG (Retrieval-Augmented Generation) :** technique combinant recherche dans une base vectorielle et génération LLM pour produire des réponses ancrées sur des faits réels.

**Knowledge Graph :** base de faits structurés sous forme d'entités et de relations, enrichissant les réponses RAG avec des liens que les vecteurs ne capturent pas.

**Digest :** résumé dense d'un article, généré par LLM, encodé et indexé dans LanceDB à la place du contenu brut.

**HITL (Human-in-the-Loop) :** architecture où un humain valide explicitement avant qu'une action critique soit exécutée — ici, l'ingestion dans le RAG.

**MCP (Model Context Protocol) :** protocole open-source (Anthropic) permettant à des IDE et assistants IA de se connecter à des systèmes externes pour récupérer des données en temps réel.

**SentenceTransformer :** modèle d'embeddings exécuté localement (all-MiniLM-L6-v2, 384 dimensions). Zéro coût, zéro dépendance réseau.

---

*Document vivant — mis à jour à chaque évolution significative du produit.*
