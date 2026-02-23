# AcademiaOps 🎓🤖

**Plateforme intelligente de veille IA et génération de contenus pédagogiques**

> Automatisez votre veille technologique, laissez l'IA classifier les nouveautés, et générez des cours structurés pour apprendre efficacement.

---

## 📋 Vue d'ensemble

**AcademiaOps** est un système automatisé qui :

1. 🔍 **Surveille** automatiquement l'écosystème IA (RSS, APIs, GitHub, blogs)
2. 🧠 **Analyse et classifie** les nouveautés avec des agents IA (sujet, impact, pertinence)
3. ✅ **Vous assiste** dans la décision d'adoption (comparaison avec votre stack actuel)
4. 📚 **Génère automatiquement** des cours pédagogiques structurés par niveau (débutant/intermédiaire/avancé)
5. 💬 **Offre un chatbot RAG** pour interroger votre base de connaissances

**Le tout avec optimisation des coûts LLM et hébergement sur un simple VPS !**

---

## 🎯 Pourquoi ce projet ?

### Problèmes résolus

- **Surcharge informationnelle** : L'IA évolue trop vite (MCP, Agno, nouveaux frameworks chaque semaine...)
- **Bruit vs Signal** : 90% des annonces sont du "hype", 10% sont réellement utiles
- **Apprentissage fragmenté** : Tutoriels dispersés, qualité variable, pas de personnalisation
- **Pas de mémoire** : Vous oubliez ce que vous avez appris il y a 3 mois
- **Temps limité** : Impossible de tout suivre manuellement

### Objectifs

✅ Réduire le temps de veille de **10h/semaine à 1h/semaine**  
✅ Avoir des contenus pédagogiques **cohérents et adaptés à votre niveau**  
✅ Constituer votre **"second cerveau" technique** interrogeable  
✅ **Apprendre MCP, Agno et n8n** en construisant le système  

---

## 🏗️ Architecture

```
     INTERNET                n8n                MCP Server           Agents Agno
  (Sources veille)    (Orchestration)      (Tools exposés)      (Logique métier)
         │                    │                    │                    │
         ▼                    ▼                    ▼                    ▼
    ┌─────────┐         ┌──────────┐        ┌───────────┐       ┌─────────────┐
    │  RSS    │────────▶│ Workflow │───────▶│   Tools   │──────▶│ Classifier  │
    │  APIs   │         │  Cron    │        │    MCP    │       │ CourseGen   │
    │ GitHub  │         │ HTTP Req │        │ JSON-RPC  │       │ QA Review   │
    └─────────┘         └──────────┘        └───────────┘       └─────────────┘
                                                   │                    │
                                                   ▼                    ▼
                                            ┌──────────┐         ┌────────────┐
                                            │PostgreSQL│         │  LanceDB   │
                                            │(Metadata)│         │  (RAG)     │
                                            └──────────┘         └────────────┘
                                                   │                    │
                                                   └──────────┬─────────┘
                                                              ▼
                                                      ┌──────────────┐
                                                      │  Dashboard   │
                                                      │  (Next.js)   │
                                                      └──────────────┘
```

**Stack technique** :
- 🧠 **MCP** (Model Context Protocol) : Exposition de tools structurés pour les LLM
- 🤖 **Agno** : Orchestration multi-agents (Classifier, Pédago, CourseBuilder, QA Reviewer)
- 🔄 **n8n** : Automatisation des workflows (collecte, notifications, monitoring)
- 🗄️ **PostgreSQL** : Stockage des métadonnées (items, cours, décisions)
- 🔍 **LanceDB** : Base vectorielle pour le RAG (recherche sémantique)
- 🎨 **Next.js 14** : Dashboard web (validation, consultation, chatbot)
- 🐳 **Docker Compose** : Orchestration de tous les services

---

## 📚 Documentation

Le projet est **abondamment documenté** (c'est aussi un projet pédagogique !) :

| Document | Description |
|----------|-------------|
| [📘 Cahier des charges fonctionnel](docs/cahier_des_charges_fonctionnel.md) | Objectifs métier, cas d'usage, fonctionnalités du MVP |
| [📗 Cahier des charges technique](docs/cahier_des_charges_technique.md) | Choix technologiques, architecture, modèle de données, déploiement |
| [📙 Architecture du projet](docs/architecture.md) | Arborescence complète avec explications pédagogiques par dossier/fichier |
| [📕 Guide MCP](docs/mcp_guide.md) | Guide pédagogique sur le Model Context Protocol *(à venir)* |
| [📔 Guide Agno](docs/agno_guide.md) | Guide pédagogique sur le framework multi-agents Agno *(à venir)* |
| [📓 Guide n8n](docs/n8n_guide.md) | Guide pédagogique sur n8n (workflows, bonnes pratiques) *(à venir)* |

---

## 🚀 Quick Start

### Prérequis

- **Docker** et **Docker Compose** installés
- **8 Go de RAM** minimum (ou VPS équivalent)
- **Clés API** : Anthropic (Claude) et/ou OpenAI/GlobalGPT
- **Compte Telegram** (pour les notifications, optionnel)

### Installation

```bash
# 1. Cloner le projet
git clone https://github.com/<your-username>/academiaops.git
cd academiaops

# 2. Configurer les variables d'environnement
cp .env.example .env
nano .env  # Remplir les secrets (API keys, passwords)

# 3. Lancer tous les services
docker-compose up -d

# 4. Vérifier que tout fonctionne
docker-compose ps
curl http://localhost:8000/health  # MCP Server
curl http://localhost:5678         # n8n
curl http://localhost:3000         # Dashboard (si hébergé localement)

# 5. Initialiser la base de données (automatique au premier lancement)
# Les tables, indexes et données de seed sont créés automatiquement

# 6. Importer les workflows n8n
# - Ouvrir http://localhost:5678
# - Login avec N8N_USER / N8N_PASSWORD (définis dans .env)
# - Importer les fichiers JSON depuis /n8n_workflows/
```

### Premier test

```bash
# Tester le serveur MCP avec un appel simple
curl -X POST http://localhost:8000/mcp/v1/tools/execute \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": "test_1",
    "method": "tools/execute",
    "params": {
      "tool": "get_pending_items",
      "input": {"limit": 10}
    }
  }'
```

---

## 🎓 Guides pédagogiques

Ce projet est conçu pour **apprendre en faisant**. Chaque composant est largement commenté et expliqué.

### Apprendre MCP (Model Context Protocol)

**Qu'est-ce que MCP ?**  
MCP est un protocole standardisé (JSON-RPC 2.0) qui permet aux LLM d'interagir avec des outils externes de manière structurée. C'est comme un "menu de restaurant" : au lieu que le LLM invente des appels de fonction, il choisit parmi des "tools" bien définis.

**Dans AcademiaOps** :
- [server.py](mcp_server/server.py) : Point d'entrée MCP (FastAPI + JSON-RPC)
- [tools/](mcp_server/tools/) : Tous les tools exposés (`batch_classify_items`, `generate_course`, etc.)
- Chaque tool a un schéma d'input/output (Pydantic) et une description claire

**Ressources** :
- [Documentation officielle MCP](https://modelcontextprotocol.io)
- [Guide MCP du projet](docs/mcp_guide.md) *(à créer ensemble)*

---

### Apprendre Agno (Multi-agents)

**Qu'est-ce qu'Agno ?**  
Agno est un framework pour orchestrer des agents IA spécialisés. Chaque agent a un rôle, des skills (capacités), et peut collaborer avec d'autres agents en "team".

**Dans AcademiaOps** :
- [agents/classifier.py](mcp_server/agents/classifier.py) : Agent qui classifie les items de veille
- [agents/course_builder.py](mcp_server/agents/course_builder.py) : Agent qui génère les contenus pédagogiques
- [agents/qa_reviewer.py](mcp_server/agents/qa_reviewer.py) : Agent qui vérifie la qualité des cours générés

**Pattern utilisé** :
```python
Agent → Skills → LLM → Output structuré → Validation
```

**Ressources** :
- [Documentation officielle Agno](https://agno.dev)
- [Guide Agno du projet](docs/agno_guide.md) *(à créer ensemble)*

---

### Apprendre n8n (Automatisation)

**Qu'est-ce que n8n ?**  
n8n est une plateforme no-code/low-code pour créer des workflows automatisés (comme Zapier, mais self-hosted et open-source).

**Dans AcademiaOps** :
- [n8n_workflows/01_veille_quotidienne.json](n8n_workflows/01_veille_quotidienne.json) : Collecte automatique RSS/APIs
- Workflow : Cron → HTTP Request → Dedupe → PostgreSQL → MCP Tool → Notification

**Pourquoi n8n ?**  
Interface visuelle, facilite le debugging, connecteurs natifs (RSS, HTTP, PostgreSQL, Telegram), gestion d'erreurs intégrée.

**Ressources** :
- [Documentation officielle n8n](https://docs.n8n.io)
- [Guide n8n du projet](docs/n8n_guide.md) *(à créer ensemble)*

---

## 🧪 Roadmap d'implémentation

Le projet est conçu pour être implémenté **progressivement**, étape par étape :

### ✅ Phase 1 : Fondations (Semaine 1-2) ✅ COMPLETE
- Serveur MCP minimal fonctionnel
- Base PostgreSQL initialisée
- n8n installé et accessible
- **Objectif** : Hello World MCP qui répond
- **Status**: ✅ Completed Feb 20, 2026

### ✅ Phase 2 : Veille et classification (Semaine 3-4) ✅ COMPLETE
- Workflow n8n de collecte RSS (prêt à implémenter)
- Agent Classifier opérationnel ✅
- Tool MCP `classifier.classify_batch` ✅
- Multi-provider LLM (AWS Bedrock Nova Pro) ✅
- Cost tracking complet ✅
- **Objectif** : 100 items réels classifiés automatiquement
- **Status**: ✅ Completed Feb 23, 2026 - 5 items classifiés ($0.003)

### ⏳ Phase 3 : Génération de cours (Semaine 5-6) - EN COURS
- Agents CourseGenerator, QA Reviewer
- Tool MCP `course.generate`
- Indexation vectorielle (LanceDB)
- **Objectif** : 1 cours complet (3 niveaux) généré
- **Status**: 🔄 Next feature - Starting soon

### ⬜ Phase 4 : Dashboard (Semaine 7-8)
- Interface Next.js déployée
- Page de validation des items
- Page de consultation des cours
- Chatbot RAG basique
- **Objectif** : Dashboard fonctionnel et responsive

### ⬜ Phase 5 : Optimisations (Semaine 9-10)
- Batching des appels LLM ✅ (déjà implémenté)
- Caching des embeddings
- Monitoring et alertes
- **Objectif** : Coûts LLM < 5€/mois

**Statut actuel** : 🟢 Phase 1 & 2 complètes ✅ | Phase 3 prête à démarrer 🚀  
**Documentation**: Feature 2 documentée dans [`docs/feature-2-classifier-COMPLETE.md`](docs/feature-2-classifier-COMPLETE.md)  
**Roadmap détaillée**: Voir [`docs/ROADMAP.md`](docs/ROADMAP.md)

---

## 💰 Optimisation des coûts

Le projet est conçu pour fonctionner avec un **budget LLM minimal** (< 20€/mois) :

| Optimisation | Description | Gain estimé |
|--------------|-------------|-------------|
| **Batching** | Classifier 20 items en 1 appel vs 20 appels | 8x |
| **Caching** | Cache les embeddings déjà calculés | 3x |
| **Choix du modèle** | GPT-3.5 pour classification, Claude 4.5 pour cours | 5x |
| **TTL data** | Purge automatique des anciennes données | ∞ |

**Estimation mensuelle (MVP)** :
- Classification : 20 items/jour × 30 jours = ~0.15€
- Génération cours : 3 cours/semaine × 4 = ~1.80€
- RAG : 50 requêtes/semaine × 4 = ~0.20€
- **Total ≈ 2.5€/mois** (large marge)

---

## 🗂️ Structure du projet

```
academiaops/
├── docs/                      # 📚 Documentation complète
├── database/                  # 🗄️ Scripts SQL (init, migrations, seeds)
├── mcp_server/                # 🧠 Serveur MCP + Agents Agno
│   ├── tools/                 # 🔧 Tools MCP exposés
│   ├── agents/                # 🤖 Agents Agno (Classifier, CourseBuilder, etc.)
│   ├── database/              # 💾 Accès DB (PostgreSQL, LanceDB)
│   └── utils/                 # 🛠️ Helpers (embeddings, chunking, LLM clients)
├── n8n_workflows/             # 🔄 Workflows n8n (JSON exportés)
├── dashboard/                 # 🎨 Frontend Next.js
├── scripts/                   # 🔨 Scripts utilitaires (deploy, backup, etc.)
└── docker-compose.yml         # 🐳 Orchestration de tous les services
```

**Voir [docs/architecture.md](docs/architecture.md) pour le détail complet de chaque dossier.**

---

## 🤝 Contribution

Ce projet est principalement un **projet personnel pédagogique**, mais les contributions sont bienvenues !

**Comment contribuer** :
1. Fork le projet
2. Crée une branche (`git checkout -b feature/amazing-feature`)
3. Commit tes changements (`git commit -m 'Add amazing feature'`)
4. Push vers la branche (`git push origin feature/amazing-feature`)
5. Ouvre une Pull Request

**Règles** :
- Code commenté (en français pour ce projet)
- Tests pour les fonctionnalités critiques
- Documentation à jour

---

## 📜 Licence

[MIT License](LICENSE)

Vous êtes libre d'utiliser, modifier et distribuer ce projet.

---

## 🙏 Remerciements

- **Anthropic** pour Claude et le protocole MCP
- **Agno** pour le framework multi-agents
- **n8n** pour la plateforme d'automatisation open-source
- **LanceDB** pour la base vectorielle légère et performante
- La communauté IA pour tous les tutoriels et retours d'expérience

---

## 📞 Contact & Support

- **Créateur** : [Votre nom]
- **Email** : [Votre email]
- **Issues** : [GitHub Issues](https://github.com/<your-username>/academiaops/issues)

**Besoin d'aide ?**  
Consultez d'abord la [documentation complète](docs/) avant d'ouvrir une issue.

---

## 🔮 Roadmap future (post-MVP)

- ❌ Multilingue (EN, ES, etc.)
- ❌ Multi-utilisateurs (collaboration)
- ❌ Export NotebookLM (flashcards, scripts vidéo)
- ❌ Gamification (progression, badges)
- ❌ API publique documentée
- ❌ Mobile (React Native ou PWA)
- ❌ Intelligence sur les sources (détection de qualité, biais)

---

<div align="center">

**Construisons ensemble votre second cerveau technique ! 🧠✨**

[📘 Voir la doc complète](docs/) | [🚀 Commencer l'implémentation](docs/architecture.md#5-ordre-dimplémentation-recommandé) | [💬 Poser une question](https://github.com/<your-username>/academiaops/issues)

</div>
