# Argos - Plan de Développement

**Last Updated**: February 23, 2026  
**Current Status**: Feature 3 Complete ✅ 

---

## 🎯 Vision du Projet

**Argos** est un système complet de veille technologique IA + génération de contenu pédagogique automatisé.

**Objectif final**: Automatiser la découverte, classification, transformation en contenus éducatifs et diffusion d'informations sur l'IA.

---

## ✅ Features Complétées

### Feature 1: Infrastructure Docker ✅
**Status**: Complete  
**Date**: February 20, 2026  
**Branch**: `feature/docker-database-setup`

- Docker Compose avec 3 services (PostgreSQL, n8n, MCP Server)
- Database schema complet (8 tables)
- Health checks et networking
- Seed data pour tests

### Feature 2: Classifier Agent ✅
**Status**: Complete  
**Date**: February 23, 2026  
**Branch**: `feature/classifier-agent`  
**Commit**: `95f0bc6`

- Multi-provider LLM architecture (OpenAI, AWS Bedrock)
- Classification automatique (topics, importance, type)
- 4 MCP tools exposés
- Cost tracking complet
- Production-ready avec AWS Nova Pro

**Résultats**: 55 items classifiés pour $0.0386 (~$0.0007/item)

### Feature 2.5: Data Collection ✅
**Status**: Complete  
**Date**: February 23, 2026  
**Branch**: `feature/classifier-agent`
Article:
Title: {title}
Summary: {summary}
Topics: {topics}
URL: {url}

Requirements:
1. Target audience: {level} (beginner/intermediate/advanced)
2. Length: 800-1200 words
3. Structure: Introduction → Key Concepts → Practical Examples → Exercises → Conclusion
4. Language: French (for Capgemini audience)
5. Include: Learning objectives, prerequisites, estimated duration

Format: Markdown with clear headings (##, ###)
```

#### Tests
- Générer 1 cours niveau beginner (item_id: 1 - MCP)
- Générer 1 cours niveau intermediate (item_id: 2 - LangChain)
- Vérifier QA score > 7.0
- Vérifier presence sections obligatoires

#### Success Metrics
- [x] 2 cours générés et sauvegardés en BD
- [x] QA scoring fonctionnel
- [x] Markdown valide (pas de syntax errors)
- [x] Learning objectives et prerequisites remplis
- [x] Cost tracking (Claude Sonnet ~$0.01/cours estimé)

---

### Feature 4: RAG System 🔍

**Branche**: `feature/rag-system`  
**Priorité**: MEDIUM  
**Estimation**: 6-8 heures  
**Stack**: LanceDB + sentence-transformers + AWS Nova Pro

#### Objectif
Permettre aux utilisateurs de poser des questions et obtenir des réponses basées sur les cours générés + items de veille.

#### Fonctionnalités

1. **Vector Store** (`mcp_server/services/vector_store.py`)
   - Embeddings: `sentence-transformers/all-MiniLM-L6-v2` (384 dimensions)
   - Storage: LanceDB (déjà configuré dans docker volumes)
   - Index: Tous les cours + items classifiés
   - Chunks: Split par section (markdown headers ##)
   - Metadata: course_id, item_id, section_title, chunk_index

2. **RAG Service** (`mcp_server/services/rag.py`)
   - Query: Question utilisateur
   - Retrieval: Top 5 chunks similaires (cosine similarity)
   - Augmentation: Prompt avec context
   - Generation: Réponse + sources avec LLM
   - Logging: Table `rag_queries` (query, answer, sources, confidence_score)

3. **MCP Tools**
   - `rag.ask` - Pose une question
   - `rag.index_course` - Indexe un cours généré
   - `rag.index_item` - Indexe un item de veille
   - `rag.rebuild_index` - Rebuild complet de l'index
   - `rag.search` - Recherche sémantique pure (sans génération)

4. **Prompt Template**
```
Context: Based on the following educational content, answer the user's question.

Sources:
{source_1}
{source_2}
{source_3}

User Question: {query}

Instructions:
- Answer in French
- Be concise but complete (200-300 words)
- Cite sources using [Source 1], [Source 2]
- If unsure, say so explicitly
- Focus on practical, actionable information

Answer:
```

#### Pipeline
```
User Query
   ↓
Embed query (sentence-transformers)
   ↓
Vector search LanceDB (top 5 chunks)
   ↓
Build prompt with context
   ↓
LLM generation (Nova Pro)
   ↓
Response + metadata (sources, confidence)
   ↓
Log to rag_queries table
```

#### Tests
- Indexer 2 cours générés
- Question: "Qu'est-ce que le Model Context Protocol?"
- Vérifier: Réponse pertinente + sources citées
- Vérifier: Confidence score > 0.7
- Cost: ~$0.0008/query

#### Success Metrics
- [x] Index LanceDB créé avec cours + items
- [x] Recherche sémantique fonctionnelle (top-5 accuracy)
- [x] Génération de réponse avec sources
- [x] Logging complet des queries
- [x] Cost tracking

---

### Feature 5: n8n Workflows 🔄

**Branche**: `feature/n8n-workflows`  
**Priorité**: MEDIUM  
**Estimation**: 4-5 heures  
**Stack**: n8n + MCP Server + Telegram

#### Objectif
Automatiser les tâches répétitives : scraping RSS, classification quotidienne, génération de cours, notifications.

#### Workflows

**1. RSS Scraper (quotidien)**
- Trigger: Cron (tous les jours à 8h00)
- Nodes:
  1. RSS Feed Reader (sources: OpenAI blog, Anthropic blog, HuggingFace, etc.)
  2. Deduplicate (check if URL exists in DB)
  3. HTTP Request → MCP Server (insert item)
  4. Telegram notification: "X nouveaux items ajoutés"

**2. Auto-Classifier (quotidien)**
- Trigger: Cron (tous les jours à 9h00)
- Nodes:
  1. HTTP Request → `classifier.get_unclassified` (limit: 10)
  2. Loop over items
  3. HTTP Request → `classifier.classify` (par item)
  4. Aggregate results
  5. Telegram notification: "X items classifiés - Coût: $Y"

**3. Weekly Course Generation (hebdomadaire)**
- Trigger: Cron (tous les lundis à 10h00)
- Nodes:
  1. PostgreSQL → Get high-importance items from last 7 days
  2. Filter: items without associated course
  3. Loop over items (max 3)
  4. HTTP Request → `course.generate`
  5. Telegram notification: "X nouveaux cours disponibles"

**4. Quality Check (hebdomadaire)**
- Trigger: Cron (tous les vendredis à 16h00)
- Nodes:
  1. PostgreSQL → Get courses with status='draft'
  2. Loop over courses
  3. HTTP Request → `course.quality_check`
  4. Update course status to 'review' if qa_score > 7
  5. Telegram notification: "X cours prêts pour review"

**5. Budget Monitor (mensuel)**
- Trigger: Cron (1er du mois à 9h00)
- Nodes:
  1. PostgreSQL → SUM(cost_usd) FROM decisions WHERE decision_type='classification' AND created_at > NOW() - INTERVAL '30 days'
  2. PostgreSQL → SUM(cost_usd) FROM courses WHERE created_at > NOW() - INTERVAL '30 days'
  3. PostgreSQL → SUM(cost_usd) FROM rag_queries WHERE created_at > NOW() - INTERVAL '30 days'
  4. Aggregate total
  5. Telegram notification: "Coût mensuel: $X / $20 budget (Y%)"

#### Configuration
- Credentials: PostgreSQL, MCP Server (http://mcp-server:8000), Telegram Bot
- Error handling: Retry 3x avec backoff exponentiel
- Logging: Workflow execution logs dans n8n

#### Tests
- Activer workflow RSS (test avec 1 feed)
- Activer auto-classifier (avec 2 items)
- Vérifier notifications Telegram
- Monitoring dashboard n8n

#### Success Metrics
- [x] 5 workflows créés et activés
- [x] RSS scraping quotidien fonctionnel
- [x] Auto-classification quotidienne
- [x] Notifications Telegram
- [x] Budget monitoring

---

### Feature 6: Dashboard Next.js 🖥️

**Branche**: `feature/dashboard`  
**Priorité**: LOW  
**Estimation**: 8-10 heures  
**Stack**: Next.js 14 + TailwindCSS + PostgreSQL REST API

#### Objectif
Interface web pour visualiser, gérer et interagir avec le contenu (items, cours, RAG).

#### Pages

**1. Dashboard (`/`)**
- Statistiques globales:
  * Items classifiés (chart par importance/type)
  * Cours générés (chart par level/subject)
  * Coûts LLM (monthly trend)
  * Topics populaires (word cloud)
- Actions rapides: "Classifier items", "Générer cours", "Ask RAG"

**2. Items Library (`/items`)**
- DataTable avec filtres:
  * Source type, importance, item_type, classification_status, topics
- Colonnes: ID, Title, Importance, Type, Topics (badges), Created At, Actions
- Actions: View details, Reclassify, Generate course, Delete
- Pagination: 20 items/page

**3. Courses Library (`/courses`)**
- Card grid avec filtres:
  * Level, subject, status, QA score
- Cards: Title, Level, Subject, QA Score, Status, Actions
- Actions: View course, Edit, Publish, Archive
- Markdown renderer pour affichage cours

**4. RAG Interface (`/rag`)**
- Chat-like UI:
  * Input: Question textuelle
  * Output: Réponse + sources (liens vers cours/items)
- Historique des queries (sidebar)
- Feedback: "Was helpful?" (thumbs up/down)

**5. Analytics (`/analytics`)**
- Charts:
  * Classification costs over time (line chart)
  * Course generation costs over time (line chart)
  * RAG query costs over time (line chart)
  * Total monthly spend (bar chart)
- Tables:
  * Top expensive operations
  * Most queried topics (RAG)
  * Most generated course subjects

**6. Settings (`/settings`)**
- LLM Provider configuration (select: AWS / OpenAI / Anthropic)
- Model selection per feature (classification, course, RAG)
- Budget alerts (set monthly limit)
- Telegram notifications toggle
- API keys management (masked display)

#### API Routes (`/api`)
- `/api/items` - GET (list), POST (create)
- `/api/items/[id]` - GET (details), PUT (update), DELETE
- `/api/courses` - GET (list), POST (generate)
- `/api/courses/[id]` - GET, PUT, DELETE
- `/api/rag` - POST (ask question)
- `/api/stats` - GET (dashboard stats)
- `/api/costs` - GET (cost analytics)

#### Tech Stack
- Framework: Next.js 14 (App Router)
- UI: TailwindCSS + shadcn/ui components
- Charts: Recharts
- Markdown: react-markdown
- API: Direct PostgreSQL queries (pg lib)
- Auth: NextAuth (optional, pour MVP juste basic auth)

#### Tests
- Page items affiche les 5 items classifiés
- Page courses (vide pour l'instant, après Feature 3)
- RAG interface (après Feature 4)
- Analytics charts avec données réelles

#### Success Metrics
- [x] 6 pages fonctionnelles
- [x] DataTables avec filtres
- [x] Markdown rendering
- [x] RAG chat interface
- [x] Analytics charts
- [x] Responsive design (mobile-friendly)

---

## 📊 Budget Prévisionnel

### Coûts de développement (tests inclus)

| Feature | Est. Tests | Est. Cost |
|---------|-----------|-----------|
| F1: Infrastructure | N/A | $0 |
| F2: Classifier | 5 items | $0.003 ✅ |
| F3: Course Generator | 3 cours | $0.03 |
| F4: RAG System | 30 queries | $0.025 |
| F5: n8n Workflows | 10 runs | $0.01 |
| F6: Dashboard | N/A | $0 |
| **TOTAL DEV** | | **$0.068** (~7¢) |

### Coûts de production (mensuel, estimé)

| Operation | Volume | Cost/unit | Monthly Cost |
|-----------|--------|-----------|--------------|
| RSS items classifiés | 300 | $0.0006 | $0.18 |
| Cours générés | 12 | $0.01 | $0.12 |
| RAG queries | 500 | $0.0008 | $0.40 |
| **TOTAL PROD** | | | **$0.70/mois** |

**Budget mensuel fixé**: $20/mois  
**Marge confortable**: 96.5% 🎉

---

## 🗓️ Timeline Estimée

```
✅ Feature 1: Infrastructure       [DONE] - Feb 20
✅ Feature 2: Classifier           [DONE] - Feb 23
⏳ Feature 3: Course Generator     [TODO] - 1 jour
⏳ Feature 4: RAG System            [TODO] - 1.5 jours
⏳ Feature 5: n8n Workflows         [TODO] - 1 jour
⏳ Feature 6: Dashboard             [TODO] - 2 jours

TOTAL: ~2 semaines de dev
```

---

## 🎯 Prochaine Action Immédiate

### Démarrer Feature 3: Course Generator

**Étapes**:

1. **Créer branche**
   ```bash
   git checkout -b feature/course-generator
   ```

2. **Créer service**
   - `mcp_server/services/course_generator.py`
   - Prompt engineering pour Claude Sonnet
   - Quality scoring logic

3. **Créer tools**
   - `mcp_server/tools/course.py`
   - 4 tools: generate, list, get, quality_check

4. **Tests**
   - Générer cours beginner sur item 1 (MCP)
   - Générer cours intermediate sur item 2 (LangChain)
   - Vérifier QA score
   - Vérifier sauvegarde en BD

5. **Documentation**
   - `docs/feature-3-course-generator.md`

**Estimation**: 4-6 heures de développement

---

## 🏆 Success Criteria - MVP Final

Un MVP complet d'Argos sera considéré prêt quand:

- [x] Feature 1: Infrastructure opérationnelle ✅
- [x] Feature 2: Classification automatique ✅
- [ ] Feature 3: Génération de cours automatique
- [ ] Feature 4: RAG pour Q&A sur contenu
- [ ] Feature 5: 3 workflows n8n actifs (RSS, classifier, course gen)
- [ ] Feature 6: Dashboard web fonctionnel

**Timeline MVP**: ~2 semaines  
**Budget MVP**: <$1 (tests + 1er mois prod)

---

## 📚 Documentation

### Existante
- `docs/architecture.md` - Architecture globale
- `docs/feature-1-infrastructure.md` - Setup Docker
- `docs/feature-2-classifier-COMPLETE.md` - Classifier agent ✅

### À créer
- `docs/feature-3-course-generator.md`
- `docs/feature-4-rag-system.md`
- `docs/feature-5-n8n-workflows.md`
- `docs/feature-6-dashboard.md`
- `docs/deployment-production.md`
- `docs/api-reference.md`
- `README.md` final (user-facing)

---

## 🔮 Futures Évolutions (Post-MVP)

### V2 Features (optionnel)

1. **Multi-user support**
   - Authentication (NextAuth)
   - User roles (admin, editor, viewer)
   - Permissions sur items/cours

2. **Advanced Analytics**
   - A/B testing de prompts
   - Model performance comparison
   - User engagement metrics (RAG, courses)

3. **Content Publishing**
   - Export cours en PDF
   - Publishing sur Confluence/Notion
   - Newsletter automatique

4. **Enhanced RAG**
   - Multi-modal (images, diagrams)
   - Conversational (chat history)
   - Fine-tuning embeddings

5. **Integration Slack**
   - Notifications Slack
   - Slash commands (/classify, /ask)

---

## 🛠️ Outils de Développement

### Requis
- Docker Desktop
- Python 3.11+ venv
- Node.js 18+ (pour dashboard)
- PostgreSQL client (psql)
- Git

### Recommandé
- VS Code avec extensions:
  * Python
  * Docker
  * PostgreSQL
  * Markdown Preview
- Postman (tests MCP API)
- DBeaver (visualisation BD)

---

**Next Step**: Start Feature 3 - Course Generator 🎓
