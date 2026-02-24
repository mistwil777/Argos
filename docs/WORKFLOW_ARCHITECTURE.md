# 🔄 Architecture et Workflow AcademiaOps

## 📊 Flux de données actuel

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUX ACTUEL (Manuel)                         │
└─────────────────────────────────────────────────────────────────┘

1. 📥 Collecte MANUELLE
   └─> Script Python (seed_test_items.py)
       └─> Insertion items dans PostgreSQL
           └─> Status: "pending"

2. 🧠 Classification IA
   └─> Click "Classifier" dans UI
       └─> API POST /items/{id}/classify
           └─> LLM (GPT-4/Claude) analyse le contenu
               ├─> Extrait: topics, importance, item_type
               ├─> Coût: ~$0.001 par item
               └─> Update: subject, importance, status="classified"

3. 📚 Génération de cours
   └─> Click "Générer le cours" dans UI
       └─> API POST /courses/generate
           └─> LLM génère cours complet (5000+ mots)
               ├─> Structure pédagogique
               ├─> Exemples de code
               ├─> Exercices pratiques
               ├─> Coût: ~$0.05-0.15 par cours
               └─> Sauvegarde: status="draft"

4. 📖 Publication
   └─> Click "Publier" dans UI
       └─> API POST /courses/{id}/publish
           └─> Status: "published"
               └─> Auto-indexation RAG
                   ├─> Découpage en chunks (500 tokens)
                   ├─> Embeddings (sentence-transformers)
                   └─> Stockage LanceDB

5. 💬 Q/A RAG
   └─> Question dans UI /rag
       └─> API POST /rag/ask
           ├─> Embedding de la question
           ├─> Recherche vectorielle (top_k=5)
           ├─> LLM génère réponse avec contexte
           └─> Retourne: answer + sources + confidence


┌─────────────────────────────────────────────────────────────────┐
│              FLUX CIBLE (Automatisé avec n8n)                   │
└─────────────────────────────────────────────────────────────────┘

1. 📡 Collecte AUTOMATIQUE (n8n)
   ├─> RSS Feeds (toutes les heures)
   │   ├─> blog.langchain.dev/rss
   │   ├─> llamaindex.ai/blog/rss.xml
   │   ├─> blog.n8n.io/rss
   │   └─> 6 autres sources
   │
   ├─> GitHub API (toutes les 6h)
   │   ├─> modelcontextprotocol repos
   │   ├─> langchain-ai/langchain releases
   │   ├─> chroma-core/chroma releases
   │   └─> 8 autres repos
   │
   └─> Webhook POST /n8n/webhook/items
       └─> Parse + Déduplication
           └─> INSERT items (status="pending")

2. 🧠 Classification AUTOMATIQUE (n8n)
   └─> Trigger: Nouveaux items pending
       └─> Batch classification (5-10 items)
           └─> API POST /items/batch/classify
               └─> Classification parallèle
                   └─> Résultats stockés

3. ✅ Validation HITL (Telegram Bot)
   ├─> Bot détecte: items classified (importance=high/critical)
   │   └─> Envoie notification Telegram
   │       ├─> Titre + Summary
   │       ├─> Topics extraits
   │       ├─> Importance suggérée
   │       └─> Boutons:
   │           ├─> ✅ Approuver → génère cours
   │           ├─> ✏️ Modifier → edit topics/importance
   │           └─> ❌ Rejeter → mark as rejected
   │
   └─> Telegram Webhook → API POST /hitl/telegram
       └─> Update item validation_status
           └─> Si approved: trigger génération cours

4. 📚 Génération AUTOMATIQUE (n8n)
   └─> Trigger: Items approved (validation_status="approved")
       └─> API POST /courses/generate
           └─> Cours générés en background
               └─> Status="draft"

5. 📖 Publication + RAG (Semi-auto)
   └─> Review humain sur cours draft
       └─> Click "Publier"
           └─> Auto-indexation RAG


┌─────────────────────────────────────────────────────────────────┐
│                    INTÉGRATION TELEGRAM                         │
└─────────────────────────────────────────────────────────────────┘

Fonctionnalités du Bot:

1. 📬 Notifications Push
   └─> Items à fort impact détectés
       └─> Message formaté avec:
           ├─> 📋 Titre
           ├─> 📝 Résumé (150 chars)
           ├─> 🏷️ Topics: [LLM, RAG, MCP]
           ├─> ⚠️ Importance: High
           └─> 🔗 Lien source

2. 🎮 Actions Inline
   └─> Boutons interactifs:
       ├─> ✅ Approuver et générer cours
       ├─> 📝 Modifier classification
       ├─> 🗑️ Rejeter (non pertinent)
       └─> 📊 Voir statistiques

3. 💬 Commandes Chat
   ├─> /stats → Statistiques globales
   ├─> /pending → Items en attente (count)
   ├─> /courses → Derniers cours générés
   ├─> /ask <question> → Q/A RAG direct
   └─> /classify <item_id> → Force classification

4. 🔔 Alertes
   ├─> Nouveau MCP repository détecté
   ├─> Paper de recherche majeur (arXiv)
   ├─> Breaking change dans LangChain/LlamaIndex
   └─> Coût LLM dépassant seuil ($10/jour)


┌─────────────────────────────────────────────────────────────────┐
│                   WORKFLOWS N8N À CRÉER                         │
└─────────────────────────────────────────────────────────────────┘

Workflow 1: RSS Collection (Priorité 1)
├─> Schedule Trigger (every 1 hour)
├─> HTTP Request (fetch RSS feeds)
├─> RSS Parse Node
├─> Deduplication (check URL in DB)
├─> PostgreSQL Insert (items table)
└─> Webhook (notify Telegram si high importance)

Workflow 2: GitHub Monitoring (Priorité 1)
├─> Schedule Trigger (every 6 hours)
├─> GitHub API (list releases)
├─> Filter (major versions only)
├─> Deduplication
├─> PostgreSQL Insert
└─> Telegram Notification (nouveaux releases)

Workflow 3: Auto Classification (Priorité 2)
├─> Database Trigger (new pending items)
├─> Batch (group by 10)
├─> API POST /items/batch/classify
├─> Wait for completion
└─> Telegram Notification (high importance items)

Workflow 4: Telegram HITL (Priorité 2)
├─> Telegram Trigger (inline button clicks)
├─> Switch (action type)
│   ├─> approve → POST /hitl/decide
│   ├─> reject → POST /hitl/decide
│   └─> modify → Show edit form
└─> Telegram Reply (confirmation)

Workflow 5: Course Generation Queue (Priorité 3)
├─> Database Trigger (approved items)
├─> Queue Manager (rate limiting)
├─> API POST /courses/generate
├─> Wait for completion (60s timeout)
└─> Telegram Notification (course ready)

Workflow 6: Daily Reports (Priorité 3)
├─> Schedule Trigger (every day 9am)
├─> API GET /stats/global
├─> Format Report
│   ├─> Items collected: X
│   ├─> Items classified: Y
│   ├─> Courses generated: Z
│   ├─> Cost yesterday: $XX
│   └─> Top topics: LLM (12), RAG (8)
└─> Telegram Send Message


┌─────────────────────────────────────────────────────────────────┐
│                    PROCHAINE ÉTAPES                             │
└─────────────────────────────────────────────────────────────────┘

Phase 1: Test du système actuel (MAINTENANT)
✅ Items ajoutés (16 total: 8 existants + 8 nouveaux)
→ Tester classification avec bouton UI
→ Tester génération de cours
→ Vérifier coûts et temps d'exécution

Phase 2: Création Telegram Bot (2-3h)
1. Create bot avec @BotFather
2. Implémenter /start, /stats, /pending
3. Ajouter boutons inline pour HITL
4. Webhook /api/v1/hitl/telegram
5. Test notifications push

Phase 3: Workflows n8n RSS (2h)
1. Configurer connexion PostgreSQL
2. Créer workflow RSS collection
3. Test avec 2-3 sources
4. Déduplication par URL
5. Integration Telegram notifications

Phase 4: Workflows n8n GitHub (1-2h)
1. GitHub Personal Access Token
2. Workflow releases monitoring
3. Filter important updates
4. Telegram notifications

Phase 5: Auto-classification (1h)
1. Database trigger sur items pending
2. Batch processing (10 items)
3. Rate limiting (éviter dépassement API)
4. Error handling et retry

Phase 6: Monitoring et Amélioration (ongoing)
- Dashboard Grafana/Metabase
- Cost tracking par source
- Quality metrics (user feedback)
- A/B testing prompts classification


┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECTURE TECHNIQUE                       │
└─────────────────────────────────────────────────────────────────┘

Stack actuel:
├─> Frontend: React + TypeScript + Vite
├─> Backend: FastAPI + Python 3.11
├─> Database: PostgreSQL 16
├─> Vector DB: LanceDB (embeddings)
├─> LLM: Claude 3.5 Sonnet / GPT-4 Turbo
├─> Embeddings: sentence-transformers/all-MiniLM-L6-v2
└─> Containers: Docker Compose

Stack à ajouter:
├─> n8n (workflow automation)
│   ├─> Port: 5678
│   ├─> Auth: Basic (admin/password)
│   └─> DB: PostgreSQL (shared)
│
└─> Telegram Bot
    ├─> python-telegram-bot library
    ├─> Webhook mode (pas polling)
    ├─> Inline keyboards pour HITL
    └─> Rate limiting: 30 msg/sec

Endpoints API à ajouter:
├─> POST /api/v1/n8n/webhook/items (receive RSS/GitHub)
├─> POST /api/v1/items/batch/classify (bulk classification)
├─> POST /api/v1/hitl/telegram (webhook Telegram)
├─> GET /api/v1/hitl/pending (items await validation)
└─> POST /api/v1/courses/batch/generate (bulk generation)
```

## 🎯 Commandes pour tester maintenant

```bash
# 1. Vérifier les items dans la DB
docker exec academiaops-postgres psql -U academiaops -d academiaops -c \
  "SELECT id, title, classification_status FROM items ORDER BY id DESC LIMIT 10;"

# 2. Tester classification d'un item pending
curl -X POST http://localhost:8000/api/v1/items/27/classify

# 3. Voir le résultat
curl http://localhost:8000/api/v1/items/27

# 4. Générer un cours à partir d'un item classifié
curl -X POST http://localhost:8000/api/v1/courses/generate \
  -H "Content-Type: application/json" \
  -d '{"item_id": 27}'
```

Voulez-vous que je commence par créer le bot Telegram ou les workflows n8n en premier ?
