# 🔄 Configuration n8n - AcademiaOps

## ✅ n8n est démarré !

**URL** : http://localhost:5678  
**Username** : admin  
**Password** : (voir `.env` → `N8N_PASSWORD`)

---

## 📋 Étapes de configuration

### 1️⃣ Première connexion

1. Ouvrez votre navigateur : **http://localhost:5678**
2. Connectez-vous avec les credentials du fichier `.env`
3. Vous arrivez sur le dashboard n8n

### 2️⃣ Configurer les Credentials Telegram

Avant d'importer les workflows, configurez les credentials Telegram :

1. **Menu** → **Credentials** → **+ New Credential**
2. Recherchez **"Telegram"**
3. Cliquez sur **"Telegram"** (API credentials)
4. Configurez :
   - **Name** : `AcademiaOps Telegram Bot`
   - **Access Token** : Copiez depuis `.env` → `TELEGRAM_BOT_TOKEN`
     ```
     8583347695:AAGX8-GGCN2-6PJY5pt4w2NwS2qJ4kTTd-o
     ```
5. Cliquez **"Save"**

> 💡 **Note** : Ces credentials seront utilisés par les deux workflows pour envoyer des notifications

### 3️⃣ Configurer le Chat ID Telegram

Pour les nœuds "Send Message" dans les workflows, vous aurez besoin de votre Chat ID :

**Votre Chat ID** : `2065690901` (depuis `.env`)

---

## 📥 Import des Workflows

### Workflow 1 : Auto-Classification avec HITL

1. **Menu** → **Workflows** → **Import from File**
2. Sélectionnez : `workflows/n8n-hitl-auto-classification.json`
3. Le workflow s'ouvre automatiquement

#### Configuration du workflow

Pour chaque nœud **"Send Telegram Message"** :

1. Cliquez sur le nœud
2. Dans **"Chat ID"**, entrez : `2065690901`
3. Dans **"Credentials"**, sélectionnez : `AcademiaOps Telegram Bot`
4. Cliquez **"Save"** (en haut à droite)

#### Activation

1. Cliquez sur le toggle **"Active"** en haut à droite
2. Le workflow s'exécutera automatiquement toutes les 30 minutes

---

### Workflow 2 : Auto-Génération de Cours

1. **Menu** → **Workflows** → **Import from File**
2. Sélectionnez : `workflows/n8n-hitl-auto-course-generation.json`
3. Le workflow s'ouvre automatiquement

#### Configuration du workflow

Même procédure que Workflow 1 :

1. Configurez tous les nœuds **"Send Telegram Message"**
2. Chat ID : `2065690901`
3. Credentials : `AcademiaOps Telegram Bot`
4. Cliquez **"Save"**

#### Activation

1. Toggle **"Active"** en haut à droite
2. Le workflow s'exécutera tous les lundis à 9h

---

## 🧪 Tests

### Test Manuel - Workflow 1 (Classification)

1. Ouvrez le workflow **"Auto Classification with HITL"**
2. Cliquez sur **"Execute Workflow"** (en bas à droite)
3. Vérifiez :
   - ✅ Les nœuds deviennent verts
   - ✅ Vous recevez une notification Telegram
   - ✅ Les items non classifiés sont traités

### Test Manuel - Workflow 2 (Génération)

1. Ouvrez le workflow **"Auto Course Generation"**
2. Cliquez sur **"Execute Workflow"**
3. Vérifiez :
   - ✅ Un cours est généré
   - ✅ Notification Telegram avec boutons de validation
   - ✅ Le cours apparaît dans la page "Courses" du frontend

---

## 📊 Monitoring

### Vérifier l'exécution des workflows

1. **Menu** → **Executions**
2. Vous voyez l'historique de toutes les exécutions
3. Cliquez sur une exécution pour voir les détails

### Vérifier les erreurs

Si un workflow échoue :

1. Ouvrez l'exécution en erreur
2. Les nœuds en rouge indiquent l'erreur
3. Cliquez sur le nœud pour voir les détails
4. Vérifiez les logs : `docker-compose logs n8n`

---

## 🔧 Architecture des Workflows

### Workflow 1 : Auto-Classification HITL

```
┌─────────────────┐
│ Cron (30 min)   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────┐
│ Get Unclassified Items  │  → API MCP: classifier.get_unclassified
└─────────┬───────────────┘
          │
          ▼
    ┌──────────┐
    │ Has Items?│
    └─────┬────┘
          │ YES
          ▼
┌─────────────────────┐
│ Classify Batch      │  → API MCP: classifier.classify_batch
└──────────┬──────────┘
           │
           ▼
┌──────────────────────┐
│ Send Telegram        │  → Notification avec résultats
└──────────────────────┘
```

### Workflow 2 : Auto-Course Generation

```
┌──────────────────┐
│ Cron (Lundi 9h)  │
└────────┬─────────┘
         │
         ▼
┌─────────────────────────┐
│ Get Topics Ready        │  → API MCP: topics.get_ready
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ Select Random Topic     │
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ Generate Course         │  → API MCP: course.generate
└─────────┬───────────────┘
          │
          ▼
┌─────────────────────────┐
│ Evaluate Quality (QA)   │  → Scoring automatique
└─────────┬───────────────┘
          │
          ▼
    ┌───────────┐
    │ QA ≥ 8.5? │
    └─────┬─────┘
          │
    ┌─────┴──────┐
    │            │
   YES          NO
    │            │
    ▼            ▼
┌─────────┐  ┌────────────┐
│Auto-Pub │  │Send Review │  → Notification Telegram
└─────────┘  └────────────┘
```

---

## 🚀 Prochaines étapes

### Workflows additionnels possibles :

1. **RSS Collection Workflow** (automatiser la collecte)
   - Cron : Toutes les heures
   - Récupère les nouveaux items des sources RSS
   - Insère dans la base de données

2. **GitHub Monitoring Workflow**
   - Cron : Quotidien
   - Check les repos GitHub pour nouveaux releases
   - Notifie les changements importants

3. **Weekly Report Workflow**
   - Cron : Tous les dimanches
   - Génère un rapport hebdomadaire
   - Envoie par email/Telegram

4. **RAG Indexing Workflow**
   - Trigger : Nouveau cours créé
   - Index automatiquement dans LanceDB
   - Met à jour les embeddings

---

## 🐛 Troubleshooting

### n8n ne démarre pas

```bash
docker-compose logs n8n
docker-compose restart n8n
```

### Erreur de connexion PostgreSQL

```bash
# Vérifier que PostgreSQL tourne
docker-compose ps postgres

# Vérifier les credentials dans .env
cat .env | grep POSTGRES
```

### Workflow ne reçoit pas de données

1. Vérifier que le MCP Server tourne : `http://localhost:8000/docs`
2. Tester l'API manuellement : 
   ```bash
   curl -X POST http://localhost:8000/rpc \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"classifier.get_unclassified","params":{"limit":5},"id":1}'
   ```

### Notifications Telegram ne marchent pas

1. Vérifier les credentials : Menu → Credentials → AcademiaOps Telegram Bot
2. Tester le bot manuellement :
   ```bash
   curl "https://api.telegram.org/bot8583347695:AAGX8-GGCN2-6PJY5pt4w2NwS2qJ4kTTd-o/sendMessage?chat_id=2065690901&text=Test"
   ```

---

## 📚 Documentation

- **n8n Documentation** : https://docs.n8n.io/
- **Telegram Bot API** : https://core.telegram.org/bots/api
- **MCP Server API** : http://localhost:8000/docs

---

## ✅ Checklist

- [ ] n8n accessible sur http://localhost:5678
- [ ] Credentials Telegram configurées
- [ ] Workflow 1 importé et activé
- [ ] Workflow 2 importé et activé
- [ ] Test manuel Workflow 1 réussi
- [ ] Test manuel Workflow 2 réussi
- [ ] Notification Telegram reçue
- [ ] Vérification page "Executions" dans n8n

---

**🎉 Félicitations ! Votre système d'orchestration n8n est opérationnel.**
