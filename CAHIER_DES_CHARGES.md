# Cahier des Charges Fonctionnel - Argos

**Version:** 1.0  
**Date:** 27 février 2026  
**Statut:** Version de production

---

## 1. Présentation du Projet

### 1.1 Contexte

Argos (anciennement Argos) est une plateforme intelligente de gestion de la veille technologique et de génération automatisée de contenus pédagogiques. Le système utilise l'intelligence artificielle pour automatiser la collecte, l'analyse, la classification et la transformation de contenus techniques en documents structurés.

### 1.2 Objectifs Principaux

- **Automatiser la veille technologique** : Collecter automatiquement les contenus via RSS, APIs, GitHub, etc.
- **Classifier intelligemment** : Évaluer la pertinence et l'importance des contenus avec des LLMs
- **Générer des contenus structurés** : Transformer automatiquement les items en cours, synthèses, guides, etc.
- **Système RAG avancé** : Permettre l'interrogation contextuelle des contenus avec recherche hybride
- **Multi-domaines** : Organiser la veille par espaces de travail thématiques
- **Human-in-the-Loop (HITL)** : Validation et contrôle qualité humain sur les décisions IA

### 1.3 Utilisateurs Cibles

- Formateurs et enseignants
- Équipes de veille technologique
- Responsables de la documentation technique
- Équipes juridiques (veille réglementaire)
- Consultants et experts métier

---

## 2. Architecture Système

### 2.1 Stack Technique

**Backend:**
- Python 3.11+
- FastAPI (API REST)
- PostgreSQL 16 (base de données relationnelle)
- LanceDB (base vectorielle)
- AWS Bedrock (Titan Embeddings V2, Nova Pro)
- Docker & Docker Compose

**Frontend:**
- React 19.2
- TypeScript
- Vite 7.3
- TailwindCSS 3.4
- React Router 7.13
- TanStack React Query 5.90
- Recharts (visualisations)

**Intégrations:**
- N8N (automatisations workflows)
- Amazon Bedrock (LLMs & Embeddings)
- GitHub API
- RSS Feeds

### 2.2 Architecture en Couches

```
┌─────────────────────────────────────────────┐
│           Frontend (React/Vite)             │
├─────────────────────────────────────────────┤
│         API REST (FastAPI)                  │
├─────────────────────────────────────────────┤
│    Services Métier (Business Logic)        │
├──────────────┬──────────────┬───────────────┤
│  PostgreSQL  │   LanceDB    │  AWS Bedrock  │
└──────────────┴──────────────┴───────────────┘
```

---

## 3. Fonctionnalités Détaillées

### 3.1 Gestion des Espaces de Travail

**Description:** Organisation multi-domaines de la veille par espaces thématiques.

**Fonctionnalités:**
- Création d'espaces personnalisables (nom, description, domaine, icône, couleur)
- Génération automatique de slug URL-friendly
- Statistiques en temps réel par espace (sources, items, documents)
- Permissions par espace (lecture/écriture/suppression/génération)
- Désactivation soft-delete des espaces

**Cas d'usage:**
- Veille juridique (suivi réglementaire)
- Veille IA & Tech (innovations technologiques)
- Veille concurrentielle
- Veille sectorielle (santé, finance, etc.)

**Endpoints API:**
- `GET /api/v1/workspaces` - Liste des espaces
- `POST /api/v1/workspaces` - Création
- `GET /api/v1/workspaces/{id}` - Détails
- `PATCH /api/v1/workspaces/{id}` - Modification
- `DELETE /api/v1/workspaces/{id}` - Suppression
- `GET /api/v1/workspaces/{id}/templates` - Templates disponibles

**Tables DB:**
```sql
workspaces (id, name, slug, domain, icon, color, is_active)
workspace_permissions (user_identifier, workspace_id, role, permissions)
```

---

### 3.2 Gestion des Sources

**Description:** Configuration des sources de collecte automatique.

**Fonctionnalités:**
- Ajout de flux RSS/Atom
- Intégration GitHub (repos, releases)
- Scraping web configurable
- Planification de collecte (cron)
- Gestion des erreurs de collecte
- Association aux espaces de travail

**Types de sources supportés:**
- RSS/Atom feeds
- GitHub repositories
- APIs externes
- Webhooks N8N

**Endpoints API:**
- `GET /api/v1/sources` - Liste des sources
- `POST /api/v1/sources` - Ajout source
- `PUT /api/v1/sources/{id}` - Modification
- `DELETE /api/v1/sources/{id}` - Suppression
- `POST /api/v1/sources/{id}/collect` - Collecte manuelle

**Tables DB:**
```sql
sources (
  id, name, source_type, url, config,
  last_collected_at, collection_interval,
  is_active, workspace_id
)
```

---

### 3.3 Gestion des Items

**Description:** Contenus collectés en attente de classification.

**Fonctionnalités:**
- Liste paginée et filtrable des items
- Classification automatique par LLM (AWS Nova Pro)
- Classification par batch (traitement en masse)
- Extraction automatique des métadonnées:
  - Sujet principal
  - Niveau d'importance (High/Medium/Low)
  - Type de contenu (Tutorial, News, Research, etc.)
  - Topics/tags
- Prévisualisation du contenu
- Suppression d'items non pertinents
- Statistiques de classification

**Statuts possibles:**
- `pending` : En attente de classification
- `classified` : Classifié et prêt pour génération
- `rejected` : Rejeté (non pertinent)

**Endpoints API:**
- `GET /api/v1/items` - Liste avec pagination/filtres
- `GET /api/v1/items/{id}` - Détails
- `POST /api/v1/items/{id}/classify` - Classification individuelle
- `POST /api/v1/items/batch/classify` - Classification en masse
- `DELETE /api/v1/items/{id}` - Suppression

**Tables DB:**
```sql
items (
  id, title, summary, url, content,
  source_type, source_url, source_id,
  classification_status, subject, importance,
  item_type, topics, metadata,
  workspace_id, published_at, created_at
)
```

**Algorithme de classification:**
```python
1. Récupération du contenu de l'item
2. Prompt structuré envoyé à AWS Nova Pro:
   - Analyse du sujet principal
   - Évaluation de l'importance
   - Identification du type
   - Extraction des topics
3. Validation du JSON retourné
4. Sauvegarde des métadonnées
5. Mise à jour du statut → 'classified'
```

---

### 3.4 Bibliothèque de Contenus (Courses)

**Description:** Documents générés automatiquement à partir des items classifiés.

**Fonctionnalités:**
- Génération automatique multi-templates:
  - Cours complets (durée configurable: 60-360 min)
  - Revues techniques
  - Synthèses exécutives
  - Guides pratiques
  - Analyses comparatives
  - Checklists méthodologiques
- Prévisualisation du contenu Markdown
- Gestion des statuts (draft/review/published/archived)
- Scoring de qualité automatique
- Régénération de contenus
- Publication et archivage
- Export des contenus

**Statuts possibles:**
- `draft` : Brouillon en cours
- `review` : En révision HITL
- `published` : Publié
- `archived` : Archivé

**Templates de contenu:**
```yaml
1. Cours Complet (course):
   - Introduction
   - Objectifs pédagogiques
   - Sections thématiques
   - Exercices pratiques
   - Évaluation
   - Ressources complémentaires

2. Revue Technique (technical_review):
   - Résumé exécutif
   - Analyse approfondie
   - Points clés
   - Recommandations

3. Synthèse (synthesis):
   - Contexte
   - Points principaux
   - Implications
   - Actions suggérées

4. Guide Pratique (practical_guide):
   - Prérequis
   - Étapes détaillées
   - Bonnes pratiques
   - Pièges à éviter

5. Analyse Comparative (comparison):
   - Technologies/solutions comparées
   - Critères d'évaluation
   - Tableau comparatif
   - Recommandations

6. Checklist (checklist):
   - Éléments à vérifier
   - Critères de validation
   - Actions correctives
```

**Endpoints API:**
- `GET /api/v1/courses` - Liste avec filtres
- `GET /api/v1/courses/{id}` - Détails
- `GET /api/v1/courses/{id}/content` - Contenu complet
- `POST /api/v1/courses/generate` - Génération
- `POST /api/v1/courses/{id}/regenerate` - Régénération
- `POST /api/v1/courses/{id}/publish` - Publication
- `PATCH /api/v1/courses/{id}/status` - Changement statut

**Tables DB:**
```sql
courses (
  id, title, description, topic, level,
  status, duration, content, item_id,
  qa_score, qa_issues, metadata,
  workspace_id, created_at, updated_at
)
```

---

### 3.5 Assistant RAG (Retrieval-Augmented Generation)

**Description:** Système de questions-réponses intelligent sur la base de connaissances.

**Fonctionnalités:**
- **Recherche hybride:**
  - Recherche vectorielle (Titan Embeddings V2 - 1024D)
  - Recherche texte plein (Tantivy)
  - Fusion des scores (Reciprocal Rank Fusion)
- Génération de réponses contextuelles (AWS Nova Pro)
- Citations des sources avec liens cliquables
- Historique des conversations
- Score de confiance des réponses
- Nettoyage de l'historique
- Support Markdown dans les réponses

**Architecture RAG:**
```
Question utilisateur
    ↓
[Embedding Titan V2]
    ↓
[Recherche Hybride]
    ├─→ LanceDB (vecteurs)
    └─→ Tantivy (full-text)
    ↓
[Fusion RRF]
    ↓
[Top-K Sources]
    ↓
[Prompt + Contexte] → AWS Nova Pro
    ↓
Réponse + Citations
```

**Paramètres configurables:**
- Nombre de sources à récupérer (top_k: 5-20)
- Mode de recherche (vectorielle, textuelle, hybride)
- Température de génération
- Tokens max de réponse

**Endpoints API:**
- `POST /api/v1/rag/ask` - Poser une question
- `GET /api/v1/rag/history` - Historique
- `DELETE /api/v1/rag/history` - Nettoyer historique

**Tables DB:**
```sql
rag_queries (
  id, query, answer, sources,
  confidence_score, search_mode,
  workspace_id, created_at
)

rag_vector_store (
  id, course_id, chunk_text, chunk_index,
  embedding, metadata
)
```

**Vecteurs:**
- Dimensions: 1024 (Titan V2)
- Normalisation: activée
- Stockage: LanceDB
- Index: IVF-PQ pour performance

---

### 3.6 Human-in-the-Loop (HITL)

**Description:** Système de validation et contrôle qualité humain.

**Fonctionnalités:**
- File d'attente de décisions à prendre
- Types de décisions:
  - Validation de classification d'items
  - Approbation de cours générés
  - Révision de réponses RAG
  - Résolution de conflits
- Metadata enrichie par l'humain
- Traçabilité complète (qui, quand, pourquoi)
- Statistiques de décisions
- Notifications temps réel

**Workflow HITL:**
```
1. IA génère un contenu/classification
2. Score de confiance calculé
3. Si score < seuil → file HITL
4. Humain valide/rejette/corrige
5. Feedback enregistré
6. Amélioration continue du système
```

**Endpoints API:**
- `GET /api/v1/hitl/decisions` - File d'attente
- `POST /api/v1/hitl/decisions/{id}/approve` - Approuver
- `POST /api/v1/hitl/decisions/{id}/reject` - Rejeter
- `PATCH /api/v1/hitl/decisions/{id}` - Modifier

**Tables DB:**
```sql
hitl_decisions (
  id, item_id, course_id, decision_type,
  ai_suggestion, confidence_score,
  decision, decided_by, rationale,
  metadata, created_at, decided_at
)
```

---

### 3.7 Analytics & Reporting

**Description:** Tableaux de bord et métriques système.

**Fonctionnalités:**
- **Statistiques globales:**
  - Items collectés/classifiés/en attente
  - Cours générés/publiés/en révision
  - Coûts IA cumulés et mensuels
  
- **Timeline d'activité:**
  - Évolution sur 7/30/90 jours
  - Items collectés par jour
  - Cours générés par jour
  
- **Statistiques par topics:**
  - Distribution des sujets
  - Top 10 topics
  - Graphiques en barres
  
- **Coûts détaillés:**
  - Breakdown par service (classification, génération, RAG)
  - Évolution temporelle
  - Projections budgétaires

**Visualisations:**
- Graphiques en lignes (timeline)
- Barres (distribution topics)
- Cartes métriques
- Tableaux de données

**Endpoints API:**
- `GET /api/v1/stats/global` - Stats générales
- `GET /api/v1/stats/timeline?days=7` - Timeline
- `GET /api/v1/stats/topics?limit=10` - Distribution topics
- `GET /api/v1/stats/costs?period=month` - Coûts

---

### 3.8 Administration

**Description:** Configuration système et monitoring.

**Fonctionnalités:**
- Configuration base de données
- État des connexions (PostgreSQL, LanceDB, Bedrock)
- Gestion des API keys
- Logs système
- Configuration des LLMs
- Gestion des utilisateurs
- Backup et restauration

**Endpoints API:**
- `GET /api/v1/admin/health` - Santé système
- `GET /api/v1/admin/config` - Configuration
- `POST /api/v1/admin/backup` - Lancer backup
- `GET /api/v1/admin/logs` - Logs

---

## 4. Modèle de Données Complet

### 4.1 Schéma Relationnel (PostgreSQL)

```sql
-- Espaces de travail
CREATE TABLE workspaces (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    domain VARCHAR(100),
    icon VARCHAR(50) DEFAULT 'folder',
    color VARCHAR(7) DEFAULT '#3B82F6',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions workspace
CREATE TABLE workspace_permissions (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    user_identifier VARCHAR(255),
    role VARCHAR(50) DEFAULT 'viewer',
    can_read BOOLEAN DEFAULT true,
    can_write BOOLEAN DEFAULT false,
    can_delete BOOLEAN DEFAULT false,
    can_generate BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Templates de contenu
CREATE TABLE content_templates (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) UNIQUE NOT NULL,
    display_name VARCHAR(255) NOT NULL,
    description TEXT,
    template_type VARCHAR(50),
    structure JSONB,
    default_duration INTEGER,
    prompt_template TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Sources de collecte
CREATE TABLE sources (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    source_type VARCHAR(50) NOT NULL,
    url TEXT NOT NULL,
    config JSONB,
    last_collected_at TIMESTAMP,
    last_error TEXT,
    collection_interval INTEGER DEFAULT 3600,
    is_active BOOLEAN DEFAULT true,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Items collectés
CREATE TABLE items (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    url TEXT,
    source_type VARCHAR(50),
    source_url TEXT,
    source_id INTEGER REFERENCES sources(id) ON DELETE SET NULL,
    classification_status VARCHAR(20) DEFAULT 'pending',
    subject TEXT,
    importance VARCHAR(20),
    item_type VARCHAR(50),
    topics TEXT[],
    metadata JSONB,
    workspace_id INTEGER REFERENCES workspaces(id),
    published_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cours générés
CREATE TABLE courses (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    topic VARCHAR(255),
    level VARCHAR(20) DEFAULT 'intermediate',
    status VARCHAR(20) DEFAULT 'draft',
    duration INTEGER,
    content TEXT,
    item_id INTEGER REFERENCES items(id) ON DELETE SET NULL,
    qa_score FLOAT,
    qa_issues JSONB,
    metadata JSONB,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    published_at TIMESTAMP
);

-- Requêtes RAG
CREATE TABLE rag_queries (
    id SERIAL PRIMARY KEY,
    query TEXT NOT NULL,
    answer TEXT,
    sources JSONB,
    confidence_score FLOAT,
    search_mode VARCHAR(20) DEFAULT 'hybrid',
    tokens_used INTEGER,
    cost FLOAT,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Décisions HITL
CREATE TABLE hitl_decisions (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id) ON DELETE CASCADE,
    course_id INTEGER REFERENCES courses(id) ON DELETE CASCADE,
    decision_type VARCHAR(50) NOT NULL,
    ai_suggestion JSONB,
    confidence_score FLOAT,
    decision VARCHAR(20),
    decided_by VARCHAR(255),
    rationale TEXT,
    metadata JSONB,
    workspace_id INTEGER REFERENCES workspaces(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    decided_at TIMESTAMP
);

-- API Keys externes
CREATE TABLE api_keys (
    id SERIAL PRIMARY KEY,
    workspace_id INTEGER REFERENCES workspaces(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    key_hash VARCHAR(255) NOT NULL,
    permissions JSONB,
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tracking des coûts
CREATE TABLE cost_tracking (
    id SERIAL PRIMARY KEY,
    service VARCHAR(50) NOT NULL,
    operation VARCHAR(100),
    tokens_input INTEGER,
    tokens_output INTEGER,
    cost FLOAT,
    workspace_id INTEGER REFERENCES workspaces(id),
    metadata JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 4.2 Index de Performance

```sql
-- Index pour requêtes fréquentes
CREATE INDEX idx_items_classification_status ON items(classification_status);
CREATE INDEX idx_items_workspace_id ON items(workspace_id);
CREATE INDEX idx_items_created_at ON items(created_at DESC);
CREATE INDEX idx_courses_status ON courses(status);
CREATE INDEX idx_courses_workspace_id ON courses(workspace_id);
CREATE INDEX idx_rag_queries_workspace_id ON rag_queries(workspace_id);
CREATE INDEX idx_rag_queries_created_at ON rag_queries(created_at DESC);
CREATE INDEX idx_sources_is_active ON sources(is_active) WHERE is_active = true;

-- Index pour recherche full-text
CREATE INDEX idx_items_content_fts ON items USING GIN(to_tsvector('french', content));
CREATE INDEX idx_courses_content_fts ON courses USING GIN(to_tsvector('french', content));
```

### 4.3 Schéma Vectoriel (LanceDB)

```python
# Table des embeddings
courses_vectors = {
    "id": int,
    "course_id": int,
    "chunk_text": str,
    "chunk_index": int,
    "embedding": np.array(shape=(1024,), dtype=float32),
    "metadata": {
        "title": str,
        "topic": str,
        "workspace_id": int,
        "created_at": str
    }
}
```

---

## 5. Flux de Travail Utilisateur

### 5.1 Workflow de Veille Standard

```
1. Configuration initiale
   └─→ Créer un espace de travail (ex: "Veille IA")
   └─→ Ajouter des sources RSS/GitHub
   └─→ Configurer la collecte automatique

2. Collecte automatique (N8N + Cron)
   └─→ N8N déclenche la collecte toutes les X heures
   └─→ Items stockés avec statut 'pending'
   └─→ Notification nouveaux items

3. Classification
   └─→ Utilisateur ouvre page "Items"
   └─→ Clique "Classifier en masse"
   └─→ IA analyse tous les items pending
   └─→ Métadonnées extraites automatiquement
   └─→ Statut → 'classified'

4. Génération de contenu
   └─→ Utilisateur sélectionne un item classifié
   └─→ Clique "Générer un cours"
   └─→ Choisit le template (cours/guide/synthèse)
   └─→ Configure la durée
   └─→ IA génère le contenu structuré
   └─→ Le document apparaît dans "Bibliothèque"

5. Révision HITL (optionnelle)
   └─→ Si score QA < 80% → file HITL
   └─→ Humain révise le contenu
   └─→ Approuve/Rejette/Corrige
   └─→ Feedback enregistré

6. Publication
   └─→ Utilisateur publie le document
   └─→ Indexation automatique dans RAG
   └─→ Document interrogeable via l'Assistant

7. Utilisation RAG
   └─→ Utilisateur pose une question
   └─→ Recherche hybride dans tous les documents
   └─→ Réponse générée avec citations
   └─→ Liens cliquables vers sources
```

### 5.2 Workflow de Questions RAG

```
1. Utilisateur ouvre "Assistant"
2. Active/désactive recherche hybride
3. Pose une question en langage naturel
4. Système:
   ├─→ Embedding de la question (Titan V2)
   ├─→ Recherche vectorielle (LanceDB)
   ├─→ Recherche full-text (Tantivy)
   └─→ Fusion des résultats (RRF)
5. Top-5 chunks récupérés
6. Prompt construit avec contexte
7. AWS Nova Pro génère la réponse
8. Affichage réponse + sources cliquables
9. Historique sauvegardé
```

---

## 6. Exigences Non-Fonctionnelles

### 6.1 Performance

| Métrique | Cible | Critique |
|----------|-------|----------|
| Temps de réponse API | < 500ms (p95) | < 2s |
| Génération de cours | < 60s | < 120s |
| Requête RAG | < 3s | < 10s |
| Classification batch (100 items) | < 5min | < 15min |
| Charge page frontend | < 1s | < 3s |

### 6.2 Scalabilité

- Support de 1000+ items simultanés
- 100+ requêtes RAG/jour
- 50+ utilisateurs concurrents
- 10+ espaces de travail actifs
- Base vectorielle extensible (millions de vecteurs)

### 6.3 Disponibilité

- Uptime cible: 99.5%
- Backup automatique quotidien
- Redémarrage automatique des services
- Monitoring temps réel (healthchecks)

### 6.4 Sécurité

- **Authentification:** API keys avec hashing
- **Autorisation:** Permissions par workspace
- **Chiffrement:** HTTPS obligatoire
- **Validation:** Sanitization des entrées utilisateur
- **Rate limiting:** Protection anti-abus
- **Logs:** Traçabilité complète des actions

### 6.5 Coûts

**Estimation mensuelle (usage moyen):**
- Classification: 100 items/jour × $0.0001 = $0.30/mois
- Génération cours: 20 cours/jour × $0.002 = $1.20/mois
- RAG queries: 200 requêtes/jour × $0.0005 = $3.00/mois
- Embeddings: 10,000 chunks × $0.00001 = $0.10/mois
- **Total estimé:** ~$5-10/mois (hors infrastructure)

---

## 7. Intégrations Externes

### 7.1 Amazon Bedrock

**Utilisation:**
- **Titan Text Embeddings V2:** Vectorisation (1024D)
- **Amazon Nova Pro:** Génération et classification

**Configuration:**
```python
BEDROCK_REGION = "us-east-1"
EMBEDDING_MODEL = "amazon.titan-embed-text-v2:0"
GENERATION_MODEL = "amazon.nova-pro-v1:0"
```

### 7.2 N8N

**Workflows automatisés:**
- Collecte RSS programmée
- Webhooks de notification
- Intégration Slack/Email
- Déclenchement génération batch

**Endpoints:**
```
POST {N8N_URL}/webhook/collect-rss
POST {N8N_URL}/webhook/notify-new-items
POST {N8N_URL}/webhook/trigger-generation
```

### 7.3 GitHub API

**Intégration:**
- Suivi des releases de repos
- Collecte de README/documentation
- Tracking d'issues/PRs

### 7.4 APIs tierces

**Possibles extensions:**
- Notion (export documentation)
- Confluence (intégration wiki)
- Slack (notifications)
- Discord (bot assistant)

---

## 8. Interface Utilisateur

### 8.1 Navigation Principale

**Sidebar:**
```
🏠 Dashboard
📁 Espaces [NOUVEAU]
📄 Items
📚 Bibliothèque
🤖 Assistant
❓ Guide
🔗 Sources
👥 HITL
📊 Analytics
⚙️ Admin
```

### 8.2 Pages Principales

#### Dashboard
- Cartes métriques (items, cours, coûts)
- Guide de démarrage rapide
- Timeline d'activité (graphique)
- Distribution des topics (barres)

#### Espaces
- Grille de cartes colorées
- Stats en temps réel par espace
- Modal création/édition
- Choix icône (7 options) et couleur (8 palettes)

#### Items
- Tableau paginé avec filtres
- Actions: Classifier, Régénérer, Supprimer
- Modal de prévisualisation
- Classification batch

#### Bibliothèque
- Liste de documents générés
- Filtres: statut, topic, date
- Prévisualisation Markdown
- Actions: Publier, Régénérer, Archiver

#### Assistant
- Interface chat
- Toggle recherche hybride
- Affichage sources avec liens
- Historique avec delete

#### Analytics
- Graphiques Recharts
- Filtres temporels
- Export CSV/JSON
- Breakdown coûts

---

## 9. Tests et Qualité

### 9.1 Tests Unitaires

**Backend:**
```bash
pytest mcp_server/tests/
```

**Couverture:**
- Services: 80%+
- API endpoints: 90%+
- Modèles: 95%+

### 9.2 Tests d'Intégration

- Test complet workflow de classification
- Test génération + indexation RAG
- Test recherche hybride
- Test workflows N8N

### 9.3 Tests E2E

- Parcours utilisateur complet
- Test UI avec Playwright
- Test performance API (locust)

---

## 10. Déploiement

### 10.1 Architecture de Déploiement

**Docker Compose (développement):**
```yaml
services:
  - postgres (PostgreSQL 16)
  - backend (FastAPI)
  - frontend (Vite dev server)
```

**Production (recommandé):**
```
- Frontend: Vercel/Netlify
- Backend: AWS ECS/Fargate
- Base de données: AWS RDS PostgreSQL
- Vecteurs: LanceDB Cloud ou self-hosted
```

### 10.2 Variables d'Environnement

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:5432/argos

# AWS Bedrock
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
AWS_REGION=us-east-1

# LanceDB
LANCEDB_PATH=./data/lancedb

# N8N
N8N_WEBHOOK_URL=http://n8n:5678/webhook/...

# Frontend
VITE_API_URL=http://localhost:8000
```

---

## 11. Roadmap Fonctionnelle

### 11.1 Version 1.0 (Actuelle)
✅ Espaces de travail multi-domaines  
✅ Classification automatique items  
✅ Génération multi-templates  
✅ RAG avec recherche hybride  
✅ HITL basique  
✅ Analytics de base  

### 11.2 Version 1.5 (Q2 2026)
- 🔄 Authentification multi-utilisateurs
- 🔄 Permissions granulaires
- 🔄 Export PDF/Word des contenus
- 🔄 Templates personnalisables
- 🔄 Intégration Slack/Discord
- 🔄 API publique documentée (OpenAPI)

### 11.3 Version 2.0 (Q3 2026)
- 📋 Workflows personnalisables (no-code)
- 📋 Fine-tuning des modèles IA
- 📋 Recherche sémantique avancée
- 📋 Versioning des contenus
- 📋 Collaboration temps réel
- 📋 Mobile app (React Native)

---

## 12. Glossaire

**Item:** Contenu collecté depuis une source externe, en attente de classification.

**Cours/Document:** Contenu structuré généré automatiquement à partir d'un item classifié.

**Workspace:** Espace de travail thématique pour organiser les items et contenus.

**RAG:** Retrieval-Augmented Generation - Technique combinant recherche et génération IA.

**HITL:** Human-in-the-Loop - Validation humaine des décisions IA.

**Embedding:** Représentation vectorielle d'un texte (1024 dimensions avec Titan V2).

**Chunk:** Fragment de texte indexé pour la recherche vectorielle.

**RRF:** Reciprocal Rank Fusion - Algorithme de fusion de résultats de recherche.

**LLM:** Large Language Model - Modèle de langage (ex: AWS Nova Pro).

---

## 13. Support et Maintenance

### 13.1 Documentation

- README.md principal
- SOLUTIONS.md (troubleshooting)
- Guide utilisateur intégré (/guide)
- API documentation (Swagger)

### 13.2 Monitoring

- Logs structurés (JSON)
- Healthchecks endpoints
- Métriques Prometheus (future)
- Alertes Sentry (future)

### 13.3 Backup

- PostgreSQL: backup quotidien
- LanceDB: snapshot hebdomadaire
- Configuration: versioning Git

---

**Fin du Cahier des Charges Fonctionnel**

*Document vivant - mis à jour régulièrement en fonction de l'évolution du produit.*
