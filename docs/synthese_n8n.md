# Synthèse n8n pour Architecte IA 🔄

**Temps de lecture** : 8 minutes  
**Objectif** : Comprendre ce qu'un architecte IA doit savoir sur n8n pour l'intégrer efficacement dans une stack IA

---

## 🎯 n8n en une phrase

**n8n est un orchestrateur de workflows visuels qui connecte des services entre eux (APIs, bases de données, outils) via des "nodes" configurables, permettant d'automatiser des processus sans (ou avec peu de) code.**

---

## 🧠 Concepts clés pour un architecte IA

### 1. Workflow = DAG (Directed Acyclic Graph)

Un workflow n8n est un **graphe orienté acyclique** :
- **Nodes** = étapes du processus (appels HTTP, requêtes DB, transformations)
- **Connections** = flux de données entre nodes
- **Triggers** = points d'entrée (cron, webhook, manuel)

**Analogie** : C'est comme un pipeline de data engineering, mais visuel et généraliste.

```
Trigger (Cron)
    ↓
HTTP Request (API)
    ↓
Function (Transform)
    ↓
PostgreSQL (Insert)
    ↓
IF (Condition)
   ↓ True      ↓ False
Telegram    Log & Stop
```

**Point critique pour architecte IA** : n8n est **excellent pour l'orchestration IO** (collecter, notifier, scheduler), mais **pas pour la logique métier complexe**. C'est pourquoi on l'utilise en tandem avec MCP Server (qui contient la vraie logique).

---

### 2. Nodes : Les briques de base

Il existe 3 types de nodes :

#### a) **Trigger Nodes** (déclencheurs)
| Node | Usage IA |
|------|---------|
| **Cron** | Lancer veille périodique (ex : tous les jours à 8h) |
| **Webhook** | Déclenché par API externe (ex : GitHub webhook sur nouveau commit) |
| **Manual** | Pour tests et debug |

#### b) **Regular Nodes** (traitement)
| Node | Usage IA |
|------|---------|
| **HTTP Request** | Appeler des APIs (OpenAI, MCP server, RSS feeds) |
| **PostgreSQL** | Lire/écrire en base (items, logs, stats) |
| **Function** | Transformer les données (JavaScript ou Python) |
| **IF** | Logique conditionnelle simple |
| **Switch** | Router selon plusieurs conditions |
| **Merge** | Combiner plusieurs flux de données |

#### c) **Output Nodes** (notifications, sortie)
| Node | Usage IA |
|------|---------|
| **Telegram** | Notifications push |
| **Email** | Alertes critiques |
| **Write Binary File** | Exporter des résultats |

**Point critique** : Pour appeler ton MCP server, tu utilises **HTTP Request node** avec un payload JSON-RPC 2.0.

---

### 3. Gestion des données entre nodes

Chaque node produit un **objet JSON** qui est passé au node suivant.

**Structure du JSON** :
```json
{
  "json": {
    "key": "value",
    "nested": {"data": 123}
  },
  "binary": {} // Pour fichiers
}
```

**Accès aux données dans n8n** :
- **Expression** : `{{$json.key}}` (accède à la clé "key" du JSON)
- **Boucle sur items** : Si un node retourne un array, n8n exécute les nodes suivants pour chaque élément

**Exemple** :
```javascript
// Node 1 (HTTP Request) retourne :
[
  {"id": 1, "title": "Article A"},
  {"id": 2, "title": "Article B"}
]

// Node 2 (Function) reçoit automatiquement chaque item :
// Pour le 1er passage : {"id": 1, "title": "Article A"}
// Pour le 2ème passage : {"id": 2, "title": "Article B"}
```

**Point critique pour architecte IA** : Comprendre ce mécanisme de **batch processing implicite** est essentiel. Si tu veux traiter 20 items en un seul appel (batching), tu dois le faire **dans le Function node avant** d'appeler ton MCP server.

---

### 4. Gestion d'erreurs

n8n offre 3 niveaux de gestion d'erreurs :

#### a) **Continue On Fail** (au niveau du node)
```
Si ce node échoue → ne pas arrêter le workflow, continuer avec les prochains nodes
```
Usage : Collecte de plusieurs sources (si une source est down, continuer avec les autres)

#### b) **Error Workflow** (au niveau du workflow)
```
Si n'importe quel node échoue → déclencher un workflow dédié (ex : alertes)
```
Usage : Monitoring centralisé des erreurs

#### c) **Try-Catch avec IF** (logique manuelle)
```
HTTP Request (Continue On Fail = true)
    ↓
IF ($json.error !== undefined)
    ↓ True: Log error
    ↓ False: Continue normal flow
```

**Point critique pour architecte IA** : Dans Argos, utilise **Continue On Fail** sur les collectes de sources (si Reddit est down, continuer avec HackerNews) et **Error Workflow** pour les appels critiques (MCP server).

---

### 5. Retry et Rate Limiting

**Retry automatique** :
```
HTTP Request Node > Settings > Retry On Fail
- Nombre de retries : 3
- Délai entre retries : 1000 ms (exponentiel)
```

**Rate Limiting (important pour APIs externes)** :
```
HTTP Request Node > Settings > Rate Limit
- Requests : 10
- Period : 1 minute
```

**Point critique** : Pour les LLM APIs (OpenAI, Anthropic), active **toujours** le retry avec backoff exponentiel.

---

## 🏗️ Patterns d'architecture pour systèmes IA

### Pattern 1 : Veille automatisée

```
Cron (8h quotidien)
    ↓
HTTP Request (RSS Feed 1)
    ↓
HTTP Request (RSS Feed 2)
    ↓
Merge (combiner les 2 sources)
    ↓
Function (déduplication par URL)
    ↓
PostgreSQL (insert items)
    ↓
HTTP Request (MCP server: batch_classify_items)
    ↓
Telegram (notification: "X nouveautés à valider")
```

**Durée d'exécution estimée** : 30 secondes pour 50 items

---

### Pattern 2 : Traitement asynchrone déclenché

```
Webhook (déclenché par Dashboard quand user valide item)
    ↓
HTTP Request (MCP server: generate_course)
    ↓
Wait (timeout: 120s, attendre réponse)
    ↓
IF (status === "success")
    ↓ True: Telegram "✅ Cours généré"
    ↓ False: Telegram "❌ Erreur"
```

**Important** : La génération de cours peut prendre 1-2 minutes. n8n doit **attendre la réponse** ou utiliser un système de polling.

---

### Pattern 3 : Monitoring et alertes

```
Cron (20h quotidien)
    ↓
HTTP Request (MCP server: get_stats)
    ↓
Function (formatter stats en message lisible)
    ↓
Telegram (rapport quotidien)
    ↓
IF (cost_usd > 15)
    ↓ True: Telegram "⚠️ Budget LLM > 15€"
```

---

## 🚨 Pièges à éviter pour architectes IA

### ❌ Piège 1 : Mettre trop de logique dans n8n

**Mauvais** :
```
Function Node (500 lignes de code Python)
- Appeler l'API OpenAI
- Parser la réponse
- Valider les données
- Insérer en DB
```

**Bon** :
```
Function Node (10 lignes)
- Formatter les données pour MCP
↓
HTTP Request (MCP server)
- Toute la logique métier est dans le serveur MCP
```

**Règle d'or** : Si un Function node dépasse 50 lignes, ça devrait être une fonction dans ton MCP server.

---

### ❌ Piège 2 : Oublier le batching

**Mauvais (20 appels LLM)** :
```
Pour chaque item dans [items]:
    HTTP Request (MCP server: classify_item)
```
Coût : 20 × 0.002$ = 0.04$

**Bon (1 appel LLM)** :
```
Function (grouper tous les items)
    ↓
HTTP Request (MCP server: batch_classify_items)
```
Coût : 1 × 0.005$ = 0.005$

**Économie : 8x**

---

### ❌ Piège 3 : Ne pas gérer les timeouts

Les LLM peuvent prendre du temps (génération de cours = 30-120s).

**Configurer les timeouts** :
```
HTTP Request Node > Settings
- Timeout : 120000 ms (2 minutes)
```

Si timeout dépassé → utiliser un système de callback ou polling.

---

## 🔧 Configuration n8n pour Argos

### Variables d'environnement essentielles

```yaml
# docker-compose.yml
n8n:
  environment:
    - N8N_BASIC_AUTH_ACTIVE=true           # Sécurité
    - N8N_BASIC_AUTH_USER=${N8N_USER}
    - N8N_BASIC_AUTH_PASSWORD=${N8N_PASSWORD}
    - DB_TYPE=postgresdb                   # Persister les workflows
    - DB_POSTGRESDB_HOST=postgres
    - WEBHOOK_URL=http://localhost:5678/   # Pour webhooks
    - EXECUTIONS_DATA_SAVE_ON_SUCCESS=all  # Garder historique
    - EXECUTIONS_DATA_MAX_AGE=168          # 7 jours
```

**Point critique** : Utilise PostgreSQL comme backend pour n8n (pas SQLite) pour avoir un historique fiable des exécutions.

---

## 📊 Monitoring des workflows

### Métriques à surveiller

| Métrique | Bon | Mauvais | Action |
|----------|-----|---------|--------|
| **Success rate** | > 95% | < 90% | Ajouter retry, améliorer gestion d'erreurs |
| **Durée d'exécution** | < 60s | > 120s | Optimiser les appels (caching, batching) |
| **Nombre d'exécutions/jour** | Prévu | 10x plus | Vérifier si boucle infinie |

**n8n offre un dashboard** : http://localhost:5678/workflows

---

## 🎓 Ce que tu DOIS retenir

### Pour être efficace dans Argos

1. **n8n = orchestrateur IO, pas cerveau** : La logique métier doit être dans ton MCP server
2. **Batching is king** : Toujours grouper les appels LLM pour économiser
3. **Gestion d'erreurs = critique** : Continue On Fail + Error Workflows
4. **Timeout = configuré** : Les LLM prennent du temps
5. **Persister les workflows** : Utilise PostgreSQL backend pour n8n

### Les 3 workflows critiques d'Argos

| Workflow | Trigger | Fréquence | Durée |
|----------|---------|-----------|-------|
| **Veille quotidienne** | Cron | 1x/jour (8h) | 30s |
| **Génération cours** | Webhook | On-demand | 60-120s |
| **Monitoring** | Cron | 1x/jour (20h) | 5s |

---

## 🔗 Ressources

- [Documentation officielle n8n](https://docs.n8n.io)
- [n8n Community workflows](https://n8n.io/workflows)
- [Notre dossier workflows](../n8n_workflows/) (à créer)

---

## ✅ Checklist avant de coder

Avant de créer tes workflows n8n, assure-toi de comprendre :

- [ ] Comment fonctionne le passage de données entre nodes (expression `{{$json.key}}`)
- [ ] La différence entre traiter les items un par un vs en batch
- [ ] Comment configurer Continue On Fail et Retry
- [ ] Pourquoi la logique métier doit être dans MCP server, pas dans n8n
- [ ] Comment appeler ton MCP server avec JSON-RPC 2.0

**Si ces 5 points sont clairs, tu es prêt à utiliser n8n efficacement ! 🚀**

---

[← Retour à l'index](README.md) | [Synthèse MCP →](synthese_mcp.md)
