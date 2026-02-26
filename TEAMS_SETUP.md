# 🚀 Configuration Microsoft Teams pour AcademiaOps

Ce guide explique comment configurer les notifications Microsoft Teams pour AcademiaOps, alternative professionnelle à Telegram compatible avec les environnements d'entreprise (Capgemini, Zscaler, etc.).

## 📋 Table des matières

1. [Pourquoi Teams au lieu de Telegram ?](#pourquoi-teams)
2. [Créer un Incoming Webhook Teams](#créer-webhook)
3. [Configuration de l'environnement](#configuration-env)
4. [Test des notifications Teams](#test-notifications)
5. [Configuration des workflows n8n](#workflows-n8n)
6. [Dépannage](#dépannage)

---

## 🤔 Pourquoi Teams au lieu de Telegram ? {#pourquoi-teams}

### Problèmes avec Telegram en entreprise

- ❌ **Zscaler bloque Telegram** : Les proxys d'entreprise (Zscaler, Forcepoint, etc.) bloquent l'API Telegram
- ❌ **Non approuvé** : Telegram n'est pas dans les outils approuvés par les DSI
- ❌ **Compliance** : Risques de non-conformité RGPD dans certains secteurs

### Avantages de Teams

- ✅ **Approuvé** : Microsoft Teams est l'outil de collaboration standard chez Capgemini et la plupart des entreprises
- ✅ **Compatible proxy** : Fonctionne derrière Zscaler et autres proxys d'entreprise
- ✅ **Intégration native** : Déjà utilisé quotidiennement par les équipes
- ✅ **Adaptive Cards** : Messages riches avec boutons d'action interactifs
- ✅ **Aucune installation requise** : Utilise des webhooks (API REST simple)

---

## 🔗 Créer un Incoming Webhook Teams {#créer-webhook}

### Étape 1 : Choisir un canal Teams

1. Ouvrez **Microsoft Teams** (desktop ou web)
2. Naviguez vers l'équipe et le canal où vous voulez recevoir les notifications
   - Exemple : `Équipe Data Science` → `Canal: AcademiaOps Notifications`
3. Si nécessaire, créez un nouveau canal :
   - Clic droit sur l'équipe → `Ajouter un canal`
   - Nom : `AcademiaOps Notifications`
   - Confidentialité : Standard ou Privé selon vos besoins

### Étape 2 : Configurer le connecteur Incoming Webhook

1. **Ouvrir les connecteurs** :
   - Cliquez sur les `...` à côté du nom du canal
   - Sélectionnez `Connecteurs` (ou `Connectors` en anglais)

2. **Ajouter le connecteur** :
   - Recherchez `Incoming Webhook` dans la barre de recherche
   - Cliquez sur `Configurer` (ou `Configure`)

3. **Configurer le webhook** :
   - **Nom** : `AcademiaOps Bot` (ou nom de votre choix)
   - **Image** (optionnel) : Uploadez un logo/icône
   - Cliquez sur `Créer`

4. **Copier l'URL du webhook** :
   - Une fois créé, une URL sera affichée :
     ```
     https://capgemini.webhook.office.com/webhookb2/xxxx-xxxx-xxxx/IncomingWebhook/yyyy-yyyy-yyyy
     ```
   - ⚠️ **IMPORTANT** : Copiez cette URL immédiatement (vous ne pourrez plus la voir après)
   - Cliquez sur `Terminé`

### Étape 3 : Sécuriser l'URL du webhook

⚠️ **Sécurité** : Cette URL permet d'envoyer des messages à votre canal Teams. Traitez-la comme un mot de passe :

- ❌ Ne la commitez **jamais** dans Git
- ✅ Stockez-la uniquement dans le fichier `.env` (qui est dans `.gitignore`)
- ✅ Utilisez un gestionnaire de secrets en production (Azure Key Vault, AWS Secrets Manager, etc.)

---

## ⚙️ Configuration de l'environnement {#configuration-env}

### 1. Ajouter l'URL du webhook dans `.env`

Ouvrez le fichier `.env` à la racine du projet et ajoutez :

```bash
# ============================================
# Microsoft Teams (Notifications)
# ============================================
TEAMS_WEBHOOK_URL=https://capgemini.webhook.office.com/webhookb2/votre-webhook-id
TEAMS_ENABLED=true

# ============================================
# Telegram (Désactivé - Bloqué par Zscaler)
# ============================================
TELEGRAM_ENABLED=false
# TELEGRAM_BOT_TOKEN=...  # Commenté car non utilisé
# TELEGRAM_CHAT_ID=...
```

### 2. Redémarrer les services Docker

```bash
# Arrêter et redémarrer les containers pour charger la nouvelle config
docker-compose restart mcp-server

# Vérifier que le serveur démarre correctement
docker-compose logs -f mcp-server
```

---

## 🧪 Test des notifications Teams {#test-notifications}

### Test rapide avec curl

Testez votre webhook directement avec curl :

```bash
curl -X POST "VOTRE_WEBHOOK_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "message",
    "attachments": [{
      "contentType": "application/vnd.microsoft.card.adaptive",
      "content": {
        "type": "AdaptiveCard",
        "version": "1.2",
        "body": [{
          "type": "TextBlock",
          "text": "🧪 Test AcademiaOps",
          "size": "Large",
          "weight": "Bolder"
        }, {
          "type": "TextBlock",
          "text": "Si vous voyez ce message, votre intégration Teams fonctionne !",
          "wrap": true
        }]
      }
    }]
  }'
```

✅ **Résultat attendu** : Vous devriez recevoir un message dans votre canal Teams.

### Test depuis Python (backend)

Créez un script de test `test_teams.py` :

```python
import asyncio
import os
from dotenv import load_dotenv
from mcp_server.services.teams_bot import TeamsBot

load_dotenv()

async def test_teams_notification():
    """Test de notification Teams."""
    webhook_url = os.getenv("TEAMS_WEBHOOK_URL")
    
    if not webhook_url:
        print("❌ TEAMS_WEBHOOK_URL not configured in .env")
        return
    
    bot = TeamsBot(webhook_url)
    
    # Test 1: Notification simple
    print("📤 Envoi d'une notification simple...")
    success = await bot.send_notification(
        title="🧪 Test AcademiaOps",
        message="Votre intégration Teams fonctionne correctement !",
        color="28A745"  # Green
    )
    print(f"✅ Succès : {success}")
    
    # Test 2: Notification avec facts et actions
    print("\n📤 Envoi d'une notification avec détails...")
    success = await bot.send_notification(
        title="📊 Rapport de Classification",
        message="5 items ont été classifiés automatiquement",
        color="0078D4",  # Blue
        facts=[
            {"title": "Total", "value": "5"},
            {"title": "Réussis", "value": "5"},
            {"title": "Coût", "value": "$0.003"}
        ],
        actions=[
            {"title": "📋 Voir les items", "url": "http://localhost:3000/items"}
        ]
    )
    print(f"✅ Succès : {success}")
    
    # Test 3: Notification de cours généré
    print("\n📤 Envoi d'une notification de cours...")
    success = await bot.send_course_generated(
        course_title="Introduction to Machine Learning",
        course_id=123,
        topic="AI/ML",
        duration=180
    )
    print(f"✅ Succès : {success}")
    
    await bot.close()
    print("\n✅ Tous les tests terminés !")

if __name__ == "__main__":
    asyncio.run(test_teams_notification())
```

Exécutez le test :

```bash
python test_teams.py
```

---

## 🔄 Configuration des workflows n8n {#workflows-n8n}

### 1. Accéder à n8n

Ouvrez votre instance n8n : **http://localhost:5678**

### 2. Importer les workflows Teams

Les workflows modifiés pour Teams sont dans `workflows/` :

- `n8n-hitl-auto-classification-teams.json` - Classification automatique (toutes les 30 min)
- `n8n-hitl-auto-course-generation-teams.json` - Génération de cours (lundi 9h)

**Import** :
1. Cliquez sur le menu hamburger (☰) en haut à gauche
2. Sélectionnez `Import from File`
3. Choisissez le fichier JSON
4. Cliquez sur `Import`

### 3. Configurer les credentials Teams dans n8n

#### Option A : Variable d'environnement (recommandé)

Le webhook URL est déjà configuré via `TEAMS_WEBHOOK_URL` dans `.env` et passé à n8n via `docker-compose.yml`.

Les workflows utilisent `{{ $env.TEAMS_WEBHOOK_URL }}` automatiquement.

#### Option B : Credential Teams dans n8n

Si vous préférez gérer les credentials directement dans n8n :

1. Allez dans **Settings** → **Credentials**
2. Cliquez sur **Add Credential**
3. Cherchez `Microsoft Teams`
4. Sélectionnez **Webhook URL** comme méthode d'authentification
5. Collez votre webhook URL
6. Nommez : `AcademiaOps Teams Webhook`
7. Sauvegardez

### 4. Adapter les workflows (si nécessaire)

Ouvrez chaque workflow et vérifiez :

#### Node "Microsoft Teams"

```json
{
  "parameters": {
    "authentication": "webhook",
    "webhookUrl": "={{ $env.TEAMS_WEBHOOK_URL }}",
    "messageType": "adaptiveCard",
    "adaptiveCard": { ... }
  },
  "type": "n8n-nodes-base.microsoftTeams",
  "typeVersion": 1
}
```

#### Remplacer les URLs dans les actions

Les boutons pointent vers le frontend. Adaptez si nécessaire :

```json
"actions": [
  {
    "type": "Action.OpenUrl",
    "title": "📋 Voir les items",
    "url": "http://localhost:3000/items"
  }
]
```

### 5. Activer les workflows

1. Ouvrez chaque workflow
2. Cliquez sur le toggle `Inactive` en haut à droite → passe à `Active`
3. Vérifiez que l'icône devient verte ✅

### 6. Tester manuellement

Avant d'attendre le CRON, testez manuellement :

1. Ouvrez le workflow `Classification HITL (Teams)`
2. Cliquez sur `Execute Workflow` (bouton play en bas à droite)
3. Vérifiez les résultats dans le panneau de droite
4. Allez dans Teams → Vérifiez que le message est arrivé

---

## 🔧 Dépannage {#dépannage}

### Problème : "Webhook URL not configured"

**Cause** : La variable `TEAMS_WEBHOOK_URL` n'est pas définie.

**Solution** :
```bash
# Vérifiez que .env contient :
grep TEAMS_WEBHOOK_URL .env

# Si absent, ajoutez-le :
echo 'TEAMS_WEBHOOK_URL=https://votre-webhook-url' >> .env

# Redémarrez les containers :
docker-compose restart mcp-server n8n
```

### Problème : Messages n'arrivent pas dans Teams

**Diagnostic** :

1. **Test du webhook directement** :
   ```bash
   curl -X POST "VOTRE_WEBHOOK_URL" \
     -H "Content-Type: application/json" \
     -d '{"text": "Test"}'
   ```
   - ✅ Si ça marche : Le problème vient du code Python ou n8n
   - ❌ Si ça ne marche pas : Le webhook est invalide ou révoqué

2. **Vérifier les logs du backend** :
   ```bash
   docker-compose logs mcp-server | grep -i teams
   ```
   
3. **Vérifier le webhook** :
   - Retournez dans Teams → Canal → Connecteurs
   - Vérifiez que le webhook `AcademiaOps Bot` existe toujours
   - Si supprimé : Recréez-le et mettez à jour `.env`

### Problème : "400 Bad Request" de Teams

**Cause** : Structure JSON Adaptive Card invalide.

**Solution** :
- Validez votre Adaptive Card sur : https://adaptivecards.io/designer/
- Vérifiez la version : `"version": "1.2"` (supportée par Teams)
- Consultez les logs pour voir le JSON envoyé

### Problème : Zscaler bloque toujours les webhooks

**Cause rare** : Certaines configurations Zscaler très strictes bloquent tous les webhooks.

**Solution** :

1. **Vérifiez les logs Zscaler** :
   - Consultez les logs de votre proxy d'entreprise
   - Cherchez les requêtes vers `*.webhook.office.com`

2. **Demandez une exemption** :
   - Contactez votre équipe IT/Sécurité
   - Demandez d'ajouter `*.webhook.office.com` à la whitelist
   - Argument : "Intégration Microsoft Teams officielle"

3. **Alternative** : Azure Function comme proxy
   - Déployez une Azure Function qui relaie les messages
   - La fonction tourne sur Azure (pas bloqué par Zscaler)
   - Votre backend appelle la fonction, qui appelle Teams

### Problème : "Too many requests" (429)

**Cause** : Limite de débit Teams dépassée (environ 4 messages/seconde).

**Solution** :
```python
# Ajoutez un rate limiter dans teams_bot.py
import asyncio
from datetime import datetime, timedelta

class TeamsBot:
    def __init__(self, webhook_url: str):
        self.webhook_url = webhook_url
        self.last_sent = datetime.now()
        self.min_interval = timedelta(seconds=0.3)  # 3 messages/sec max
    
    async def send_notification(self, ...):
        # Rate limiting
        elapsed = datetime.now() - self.last_sent
        if elapsed < self.min_interval:
            await asyncio.sleep((self.min_interval - elapsed).total_seconds())
        
        # ... send message ...
        
        self.last_sent = datetime.now()
```

---

## 📚 Ressources supplémentaires

- **Adaptive Cards Designer** : https://adaptivecards.io/designer/
  - Testez vos cartes interactivement avant de les coder
  
- **Teams Webhooks Doc** : https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook
  - Documentation officielle Microsoft

- **Adaptive Card Schema** : https://adaptivecards.io/explorer/
  - Référence complète des éléments disponibles

- **n8n Teams Node** : https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.microsoftteams/
  - Documentation du node Microsoft Teams dans n8n

---

## ✅ Checklist de déploiement en production

Avant de déployer AcademiaOps chez Capgemini ou en entreprise :

- [ ] Webhook Teams créé dans le canal officiel
- [ ] URL du webhook stockée dans Azure Key Vault (pas en .env hardcodé)
- [ ] Variable d'environnement `TEAMS_WEBHOOK_URL` configurée
- [ ] Service `teams_bot.py` testé avec script de test
- [ ] Workflows n8n importés et activés
- [ ] Test manuel de chaque workflow (Execute Workflow)
- [ ] Notifications arrivent dans le bon canal Teams
- [ ] Boutons d'action fonctionnent (redirections frontend)
- [ ] Logs backend ne contiennent pas d'erreurs Teams
- [ ] Rate limiting configuré (si gros volume)
- [ ] Monitoring configuré (alertes si webhooks échouent)
- [ ] Documentation partagée avec l'équipe Data Science

---

**Besoin d'aide ?** Consultez les logs :
```bash
docker-compose logs -f mcp-server | grep -i teams
```

**Questions ?** Ouvrez une issue sur le repo AcademiaOps ! 🚀
