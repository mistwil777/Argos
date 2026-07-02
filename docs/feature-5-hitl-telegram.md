# Feature 5 : HITL (Human-in-the-Loop) avec Telegram

## Vue d'ensemble

La Feature 5 implémente une boucle de feedback humain via **Telegram Bot** pour valider les décisions système automatiques.

### Composants

1. **TelegramBotService** : Service de notification et gestion callbacks
2. **8 MCP Tools HITL** : Outils pour déclencher notifications et consulter décisions  
3. **2 Workflows n8n** : Automatisation classification et génération de cours
4. **Boutons inline Telegram** : Approve/Reject/Review directement dans Telegram

---

## Configuration du Bot Telegram

### Étape 1 : Créer votre bot avec @BotFather

1. Ouvrez Telegram et cherchez **@BotFather**
2. Envoyez `/newbot`
3. Choisissez un nom : `Argos Bot`
4. Choisissez un username : `argos_bot`
5. **Copiez votre token** : `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### Étape 2 : Récupérer votre Chat ID

1. Envoyez un message à votre nouveau bot
2. Visitez : `https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates`
3. Trouvez `"chat":{"id":123456789}`
4. **Copiez votre chat_id** : `123456789`

### Étape 3 : Configurer les variables d'environnement

Créez `.env` (ou modifiez `.env.example`) :

```bash
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_CHAT_ID=123456789

# Optional: Public webhook URL (pour production)
# TELEGRAM_WEBHOOK_URL=https://your-domain.com/telegram/webhook
```

---

## Installation des dépendances

```bash
# Dans votre environnement virtuel
pip install python-telegram-bot==20.7
```

Ou avec `requirements.txt` (déjà mis à jour) :

```bash
pip install -r requirements.txt
```

---

## Utilisation

### 1. Démarrer le bot Telegram

**Option A : Via MCP tool (recommandé pour développement)**

```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.start_bot",
  "params": {},
  "id": 1
}'
```

**Option B : Automatique au démarrage du serveur** (TODO: à implémenter)

### 2. Tester les notifications

#### a) Notification après classification

```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.notify_classification",
  "params": {
    "item_id": 1,
    "topics": ["RAG", "LLM"],
    "importance": "high",
    "item_type": "tutorial"
  },
  "id": 2
}'
```

Vous recevrez dans Telegram :
```
✅ Classification Complétée

Item: Introduction au Model Context Protocol

Topics: RAG, LLM
Importance: HIGH
Type: tutorial

URL: https://example.com

Validez ou rejetez cette classification:
[✅ Approuver] [❌ Rejeter]
```

#### b) Notification de cours généré

```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.notify_course_generated",
  "params": {
    "course_id": 1,
    "qa_score": 8.5
  },
  "id": 3
}'
```

Vous recevrez :
```
📚 Nouveau Cours Généré

Titre: Introduction au Model Context Protocol

Sujet: MCP
Niveau: beginner
Durée estimée: 45 min

Qualité: QA Score: 8.5/10

Voulez-vous publier ce cours ?
[📖 Voir le cours]
[✅ Publier] [📝 Revoir] [🗑 Rejeter]
```

### 3. Commandes Telegram

Dans Telegram, envoyez :

- `/start` - Démarrer le bot et voir les commandes
- `/status` - Statut du système (items/cours en attente)
- `/help` - Aide et documentation

---

## Workflows n8n

### Workflow 1 : Auto-Classification HITL

**Fichier** : `workflows/n8n-hitl-auto-classification.json`

**Fonctionnement** :
1. **Cron** : Toutes les 30 minutes
2. **Récupère** : Items non classifiés
3. **Classifie** : Batch de 10 items avec LLM
4. **Notifie** : Envoie notification Telegram avec boutons
5. **Attend** : Validation humaine

**Import dans n8n** :
1. Interface n8n : `http://localhost:5678`
2. Menu → Import from File
3. Sélectionnez `n8n-hitl-auto-classification.json`
4. Activez le workflow

### Workflow 2 : Auto-Course Generation avec Review

**Fichier** : `workflows/n8n-hitl-auto-course-generation.json`

**Fonctionnement** :
1. **Cron** : Tous les lundis à 9h
2. **Récupère** : Topics avec ≥5 items classifiés
3. **Génère** : Cours sur topic aléatoire
4. **Évalue** : QA score automatique
5. **Notifie** : Telegram avec boutons review
6. **Auto-publish** : Si QA ≥ 8.5, publication automatique

**Import dans n8n** : Même procédure que Workflow 1

---

## MCP Tools HITL

### 8 nouveaux outils disponibles

| Tool | Description |
|------|-------------|
| `hitl.notify_new_item` | Notifier nouvel item collecté |
| `hitl.notify_classification` | Notifier classification complétée + boutons validation |
| `hitl.notify_course_generated` | Notifier cours généré + boutons review |
| `hitl.notify_rag_query` | Notifier requête RAG pour feedback |
| `hitl.get_pending_decisions` | Liste des items/cours en attente de décision |
| `hitl.get_decisions_history` | Historique des décisions humaines |
| `hitl.start_bot` | Démarrer le bot Telegram (mode polling) |
| `hitl.stop_bot` | Arrêter le bot Telegram |

### Exemples d'utilisation

**Get pending decisions** :
```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.get_pending_decisions",
  "params": {},
  "id": 4
}'
```

Réponse :
```json
{
  "jsonrpc": "2.0",
  "result": {
    "success": true,
    "pending_items": [
      {"id": 12, "title": "New AI Agent Framework", "topics": ["Agents", "LLM"], "importance": "high"}
    ],
    "pending_items_count": 1,
    "pending_courses": [
      {"id": 6, "title": "RAG with LanceDB", "status": "draft", "qa_score": 8.2}
    ],
    "pending_courses_count": 1
  },
  "id": 4
}
```

**Get decisions history** :
```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.get_decisions_history",
  "params": {"limit": 10},
  "id": 5
}'
```

---

## Architecture des Callbacks

### Callback Data Format

Les boutons Telegram envoient des callbacks au format :

```
approve_class_{item_id}     → Approuver classification item
reject_class_{item_id}      → Rejeter classification item
publish_course_{course_id}  → Publier cours
review_course_{course_id}   → Marquer cours pour révision
reject_course_{course_id}   → Rejeter cours
view_course_{course_id}     → Voir aperçu cours
rag_good_{query_hash}       → Feedback positif RAG
rag_bad_{query_hash}        → Feedback négatif RAG
```

### Flow de décision

```
1. Système (LLM) génère contenu
2. TelegramBot envoie notification avec boutons
3. Admin clique sur un bouton
4. Callback handler traite l'action
5. Base de données mise à jour (table `decisions`)
6. Telegram affiche confirmation
```

### Table `decisions` (déjà créée)

```sql
CREATE TABLE decisions (
    id SERIAL PRIMARY KEY,
    item_id INTEGER REFERENCES items(id),
    course_id INTEGER REFERENCES courses(id),
    decision_type VARCHAR(50) NOT NULL,  -- 'item_validation', 'course_generation', 'course_qa'
    decision VARCHAR(50) NOT NULL,        -- 'approved', 'rejected', 'published'
    decided_by VARCHAR(255),              -- 'telegram_admin', 'auto', 'webhook'
    decided_at TIMESTAMP DEFAULT NOW(),
    metadata JSONB
);
```

---

## Mode Polling vs Webhook

### Mode Polling (développement)

- ✅ Simple à configurer
- ✅ Fonctionne en local sans domaine public
- ❌ Moins performant (requêtes régulières)
- 🎯 **Utilisé actuellement**

**Activation** :
```python
await telegram_bot.start_polling()
```

### Mode Webhook (production)

- ✅ Plus performant (push notifications)
- ✅ Scalable
- ❌ Nécessite domaine public + HTTPS
- ⏳ **À implémenter plus tard**

**Configuration future** :
```bash
TELEGRAM_WEBHOOK_URL=https://your-domain.com/telegram/webhook
```

---

## Testing

### Test manuel du bot

1. **Démarrer le bot** :
```bash
curl -X POST http://localhost:8000/rpc -d '{"jsonrpc":"2.0","method":"hitl.start_bot","params":{},"id":1}'
```

2. **Dans Telegram, envoyez** :
```
/start
/status
```

3. **Déclencher une notification** :
```bash
# Classifier un item puis notifier
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "classifier.classify",
  "params": {"item_id": 1},
  "id": 2
}'

# Envoyer notification
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.notify_classification",
  "params": {
    "item_id": 1,
    "topics": ["MCP", "AI"],
    "importance": "high",
    "item_type": "tutorial"
  },
  "id": 3
}'
```

4. **Cliquez sur les boutons dans Telegram**

5. **Vérifier la décision en base** :
```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.get_decisions_history",
  "params": {"limit": 5},
  "id": 4
}'
```

### Test automatique via n8n

1. Importer les 2 workflows dans n8n
2. Activer le workflow "Auto-Classification"
3. Attendre 30 minutes (ou déclencher manuellement)
4. Vérifier les notifications Telegram

---

## Intégration avec les Features existantes

### Feature 2 : Classifier → HITL

Après classification, notifier automatiquement :

```python
# Dans classifier service (à ajouter)
result = await classify_item(item_id)

# Send Telegram notification
if telegram_bot:
    await telegram_bot.notify_classification_complete(
        item_id=result['item_id'],
        topics=result['topics'],
        importance=result['importance'],
        item_type=result['item_type']
    )
```

### Feature 3 : Course Generator → HITL

Après génération de cours, notifier :

```python
# Dans course generator service (à ajouter)
course = await generate_course(topic, level)
qa_result = await score_course_quality(course['id'])

# Send Telegram notification
if telegram_bot:
    await telegram_bot.notify_course_generated(
        course_id=course['id'],
        qa_score=qa_result['qa_score']
    )
```

### Feature 4 : RAG → HITL (optionnel)

Envoyer feedback sur réponses RAG :

```python
# Dans RAG service (optionnel, pour monitoring)
result = await rag.ask(query)

# Notify for quality check (sample 10% of queries)
if random.random() < 0.1 and telegram_bot:
    await telegram_bot.notify_rag_query(
        query=query,
        answer=result['answer'],
        confidence=result['confidence'],
        sources_count=len(result['sources'])
    )
```

---

## Sécurité

### Authentification

- **Chat ID whitelist** : Seul `TELEGRAM_ADMIN_CHAT_ID` reçoit les notifications
- **Token secret** : `TELEGRAM_BOT_TOKEN` doit rester confidentiel
- **Callbacks verification** : Telegram signe tous les callbacks

### Bonnes pratiques

1. ⚠️ **Ne jamais commit** le `.env` avec vos tokens
2. 🔐 **Utilisez des variables d'environnement** en production
3. 🛡️ **Limitez les permissions** du bot (pas besoin de lire tous les messages)
4. 📝 **Loggez toutes les décisions** dans la table `decisions`

---

## Troubleshooting

### Le bot ne démarre pas

- ✅ Vérifiez que `TELEGRAM_BOT_TOKEN` est défini
- ✅ Vérifiez que `TELEGRAM_ADMIN_CHAT_ID` est défini
- ✅ Token valide ? Testez : `https://api.telegram.org/bot<TOKEN>/getMe`

### Pas de notification reçue

- ✅ Bot démarré ? Vérifiez avec `/status`
- ✅ Chat ID correct ? Envoyez un message au bot et récupérez votre chat ID
- ✅ Vérifiez les logs du serveur MCP

### Callbacks ne fonctionnent pas

- ✅ Bot en mode polling activé ?
- ✅ Vérifiez les logs pour voir les callbacks reçus
- ✅ Base de données accessible ?

---

## Métriques et Monitoring

### Décisions enregistrées

```sql
-- Statistiques des décisions
SELECT 
    decision_type,
    decision,
    COUNT(*) as count
FROM decisions
GROUP BY decision_type, decision
ORDER BY count DESC;
```

### Temps de réponse humain

```sql
-- Temps moyen entre notification et décision
SELECT 
    decision_type,
    AVG(EXTRACT(EPOCH FROM (decided_at - created_at))) / 60 as avg_minutes
FROM decisions d
LEFT JOIN items i ON d.item_id = i.id
GROUP BY decision_type;
```

---

## Prochaines améliorations (Feature 5.5)

1. **Multi-users** : Support de plusieurs admins
2. **Rôles** : Reviewer vs Publisher
3. **Webhooks mode** : Passer en mode webhook pour production
4. **Analytics dashboard** : Visualisation des décisions dans n8n
5. **Slack integration** : Alternative à Telegram

---

## Résumé des fichiers créés

```
mcp_server/
├── config.py                          (modifié - ajout config Telegram)
├── services/
│   └── telegram_bot.py                (NOUVEAU - 700+ lignes)
├── tools/
│   └── hitl_tools.py                  (NOUVEAU - 350+ lignes)
└── server.py                          (modifié - 8 nouveaux tools)

workflows/
├── n8n-hitl-auto-classification.json  (NOUVEAU - workflow n8n)
└── n8n-hitl-auto-course-generation.json (NOUVEAU - workflow n8n)

requirements.txt                       (modifié - ajout python-telegram-bot)
```

**Total : 30 outils MCP actifs (22 base + 8 HITL)** ✅
