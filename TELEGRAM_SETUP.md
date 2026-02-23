# Guide rapide : Configuration et test du Bot Telegram

## 🚀 Installation rapide (5 minutes)

### Étape 1 : Créez votre bot Telegram

1. Ouvrez Telegram
2. Cherchez **@BotFather**
3. Envoyez `/newbot`
4. Nom : `AcademiaOps Bot` (ou autre)
5. Username : `academiaops_bot` (ou autre, doit finir par `_bot`)
6. **Copiez le token** : `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`

### Étape 2 : Récupérez votre Chat ID

1. Envoyez un message à votre bot (ex: "Hello")
2. Visitez (remplacez `<YOUR_TOKEN>`) :
   ```
   https://api.telegram.org/bot<YOUR_TOKEN>/getUpdates
   ```
3. Trouvez `"chat":{"id":123456789}`
4. **Copiez votre chat_id** : `123456789`

### Étape 3 : Configurez l'environnement

Créez ou modifiez `.env` :

```bash
# Telegram Bot
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_ADMIN_CHAT_ID=123456789
```

### Étape 4 : Redémarrez le serveur MCP

```bash
docker-compose restart mcp-server
```

---

## 🧪 Test rapide

### Option A : Via MCP tool (CLI)

```bash
# Démarrer le bot
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.start_bot",
  "params": {},
  "id": 1
}'

# Envoyer une notification de test
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.notify_classification",
  "params": {
    "item_id": 1,
    "topics": ["MCP", "AI"],
    "importance": "high",
    "item_type": "tutorial"
  },
  "id": 2
}'
```

### Option B : Dans Telegram

Envoyez ces commandes à votre bot :

- `/start` - Démarrer le bot
- `/status` - Voir le statut du système
- `/help` - Aide

---

## 📱 Test des notifications

### 1. Notification de classification

Après avoir classifié un item :

```json
{
  "jsonrpc": "2.0",
  "method": "hitl.notify_classification",
  "params": {
    "item_id": 42,
    "topics": ["RAG", "Vector DB"],
    "importance": "high",
    "item_type": "tutorial"
  },
  "id": 3
}
```

**Résultat dans Telegram** :
```
✅ Classification Complétée

Item: Introduction au RAG avec LanceDB

Topics: RAG, Vector DB
Importance: HIGH
Type: tutorial

URL: https://example.com/rag-tutorial

Validez ou rejetez cette classification:
[✅ Approuver] [❌ Rejeter]
```

### 2. Notification de cours généré

Après génération d'un cours :

```json
{
  "jsonrpc": "2.0",
  "method": "hitl.notify_course_generated",
  "params": {
    "course_id": 12,
    "qa_score": 8.7
  },
  "id": 4
}
```

**Résultat dans Telegram** :
```
📚 Nouveau Cours Généré

Titre: Introduction au Model Context Protocol

Sujet: MCP
Niveau: beginner
Durée estimée: 45 min

Qualité: QA Score: 8.7/10

Voulez-vous publier ce cours ?
[📖 Voir le cours]
[✅ Publier] [📝 Revoir] [🗑 Rejeter]
```

---

## ⚙️ Configuration n8n

### Import des workflows

1. Ouvrez n8n : `http://localhost:5678`
2. Menu → Import from File
3. Importez `workflows/n8n-hitl-auto-classification.json`
4. Importez `workflows/n8n-hitl-auto-course-generation.json`
5. Activez les 2 workflows

### Test manuel des workflows

**Workflow 1 : Classification automatique**
- Déclenchez : Cliquez sur "Execute Workflow"
- Résultat : Items non classifiés sont classifiés et vous recevez des notifications Telegram

**Workflow 2 : Génération de cours**
- Déclenchez : Cliquez sur "Execute Workflow" 
- Résultat : Un cours est généré sur un topic aléatoire et vous recevez une notification

---

## 🐛 Troubleshooting

### Bot ne démarre pas

```bash
# Vérifier les logs
docker logs -f academiaops-mcp-server

# Vérifier que le token est défini
docker exec academiaops-mcp-server env | grep TELEGRAM
```

Si pas de variable, vérifiez le `.env` et redémarrez :

```bash
docker-compose down
docker-compose up -d
```

### Notifications ne sont pas reçues

1. **Vérifiez le bot est démarré** :
   ```bash
   curl -X POST http://localhost:8000/rpc -d '{
     "jsonrpc": "2.0",
     "method": "hitl.start_bot",
     "params": {},
     "id":1
   }'
   ```

2. **Vérifiez votre chat_id** :
   - Envoyez un message au bot
   - Vérifiez avec `/getUpdates` (URLci-dessus)
   - Mettez à jour `TELEGRAM_ADMIN_CHAT_ID`

3. **Vérifiez les logs** :
   ```bash
   docker logs -f academiaops-mcp-server | grep -i telegram
   ```

### Callbacks ne fonctionnent pas

1. **Vérifiez le bot est en mode polling** :
   - Les callbacks nécessitent le mode polling actif
   - Relancez `hitl.start_bot` si le bot s'est arrêté

2. **Vérifiez la base de données** :
   ```bash
   docker exec -it academiaops-postgres psql -U academiaops_user -d academiaops -c "SELECT COUNT(*) FROM decisions;"
   ```

---

## 📊 Vérifier les décisions

### Via MCP tool

```bash
curl -X POST http://localhost:8000/rpc -d '{
  "jsonrpc": "2.0",
  "method": "hitl.get_decisions_history",
  "params": {"limit": 10},
  "id": 5
}'
```

### Via SQL

```bash
docker exec -it academiaops-postgres psql -U academiaops_user -d academiaops

SELECT 
  decision_type,
  decision,
  COUNT(*) as count,
  MAX(decided_at) as last_decision
FROM decisions
GROUP BY decision_type, decision
ORDER BY last_decision DESC;
```

---

## 🔐 Sécurité

### Production

Pour la production, utilisez le mode **webhook** :

1. Configurez un domaine public avec HTTPS
2. Ajoutez `TELEGRAM_WEBHOOK_URL` dans `.env` :
   ```
   TELEGRAM_WEBHOOK_URL=https://your-domain.com/telegram/webhook
   ```
3. Redémarrez le serveur MCP

### Secrets

⚠️ **IMPORTANT** :
- Ne commitez jamais votre `.env` avec les tokens
- Utilisez des variables d'environnement en production
- Limitez `TELEGRAM_ADMIN_CHAT_ID` à votre chat uniquement

---

## 📚 Ressources

- [Documentation complète](./docs/feature-5-hitl-telegram.md)
- [Telegram Bot API](https://core.telegram.org/bots/api)
- [python-telegram-bot Docs](https://docs.python-telegram-bot.org/)

---

## ✅ Checklist de test complet

- [ ] Bot créé via @BotFather
- [ ] Token et Chat ID configurés dans `.env`
- [ ] Serveur MCP redémarré
- [ ] Bot démarré (`hitl.start_bot`)
- [ ] Commande `/start` fonctionne
- [ ] Commande `/status` affiche des stats
- [ ] Notification de classification reçue
- [ ] Boutons "Approuver/Rejeter" fonctionnent
- [ ] Notification de cours reçue
- [ ] Boutons "Publier/Revoir/Rejeter" fonctionnent
- [ ] Workflows n8n importés et activés
- [ ] Décisions enregistrées en base (`decisions` table)

---

🎉 **Vous êtes prêt !** Votre système HITL avec Telegram est opérationnel.
