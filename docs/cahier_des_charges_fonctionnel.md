# Cahier des Charges Fonctionnel - AcademiaOps
## Plateforme de Veille IA et Génération de Contenus Pédagogiques

**Version** : 1.0 MVP  
**Date** : 20 février 2026  
**Projet** : AcademiaOps

---

## 📋 Table des matières

1. [Présentation du projet](#1-présentation-du-projet)
2. [Contexte et enjeux](#2-contexte-et-enjeux)
3. [Objectifs](#3-objectifs)
4. [Périmètre du MVP](#4-périmètre-du-mvp)
5. [Acteurs et rôles](#5-acteurs-et-rôles)
6. [Cas d'usage détaillés](#6-cas-dusage-détaillés)
7. [Fonctionnalités du MVP](#7-fonctionnalités-du-mvp)
8. [Exigences non fonctionnelles](#8-exigences-non-fonctionnelles)
9. [Glossaire](#9-glossaire)

---

## 1. Présentation du projet

### 1.1 Vision du projet

AcademiaOps est une plateforme intelligente et automatisée qui permet de :
- **Surveiller en continu** l'écosystème des technologies d'IA (nouveaux frameworks, protocoles, outils)
- **Analyser et classifier** automatiquement ces innovations
- **Assister la décision** humaine pour l'adoption de nouvelles technologies
- **Générer automatiquement** des contenus pédagogiques structurés et adaptés par niveau
- **Créer une base de connaissances** interrogeable pour un apprentissage continu

**L'idée centrale** : Au lieu de passer des heures à surveiller manuellement Reddit, GitHub, HackerNews, les blogs techniques, puis à apprendre chaque nouvelle technologie en naviguant entre 50 tutoriels incohérents, la plateforme automatise la veille ET la création de contenus pédagogiques de qualité, personnalisés selon mon niveau et mes besoins.

### 1.2 Problèmes résolus

**Problème 1 - Surcharge informationnelle** : L'écosystème IA évolue trop vite. Difficile de tout suivre sans y passer 10h/semaine.

**Problème 2 - Bruit vs Signal** : Beaucoup de "hype" mais peu de technologies réellement utiles pour mon contexte.

**Problème 3 - Apprentissage fragmenté** : Les ressources d'apprentissage sont dispersées (docs officielles, tutoriels YouTube, articles de blog) avec des niveaux de qualité variables.

**Problème 4 - Pas de personnalisation** : Les tutoriels génériques ne répondent pas à mes questions spécifiques : "Comment cette techno s'intègre-t-elle dans MON stack actuel ?"

**Problème 5 - Pas de mémoire** : J'oublie ce que j'ai appris sur une techno il y a 3 mois. Pas de base de connaissances centralisée.

---

## 2. Contexte et enjeux

### 2.1 Profil utilisateur

- **Rôle** : Architecte IA / automatisation, développeur full-stack
- **Niveau technique** : Avancé en IA (RAG, LangGraph, SMA), intermédiaire en DevOps
- **Contraintes** : 
  - Temps limité pour la veille
  - Budget limité (optimisation des coûts LLM)
  - Infrastructure limitée (VPS 2 vCPU, 8 Go RAM)
- **Besoins d'apprentissage** : 
  - Découvrir MCP en profondeur
  - Apprendre Agno (multi-agents)
  - Maîtriser n8n pour l'automatisation

### 2.2 Enjeux stratégiques

**Enjeu 1 - Efficacité** : Réduire le temps de veille de 10h/semaine à 1h/semaine (consultation des recommandations).

**Enjeu 2 - Qualité** : Avoir des contenus pédagogiques structurés, cohérents, adaptés à mon niveau.

**Enjeu 3 - ROI** : Investir dans les bonnes technologies au bon moment (ni trop tôt = instable, ni trop tard = obsolète).

**Enjeu 4 - Capitalisation** : Constituer une base de connaissances personnelle interrogeable (mon "second cerveau" technique).

**Enjeu 5 - Pédagogique** : En construisant cette plateforme, apprendre concrètement MCP, Agno et n8n.

---

## 3. Objectifs

### 3.1 Objectifs métier

1. **Automatiser 90% de la veille** : Surveiller automatiquement 20+ sources (RSS, GitHub, APIs)
2. **Classifier intelligemment** : Identifier automatiquement le sujet, le niveau d'importance, la pertinence pour mon stack
3. **Optimiser ma décision** : Recevoir un résumé + comparaison en 2 minutes, décider en 30 secondes (oui/non/plus tard)
4. **Générer des cours de qualité** : Pour chaque technologie validée, créer automatiquement des supports pédagogiques par niveau (débutant/intermédiaire/avancé)
5. **Interroger ma base** : Pouvoir poser des questions type "Comment MCP se compare à LangGraph ?" et avoir une réponse contextualisée basée sur mes cours et ma veille

### 3.2 Objectifs pédagogiques

1. **Comprendre MCP en profondeur** : Architecture, protocole JSON-RPC, conception de tools, bonnes pratiques
2. **Maîtriser Agno** : Agents, skills, workflows, teams, orchestration déterministe
3. **Apprendre n8n** : Workflows robustes, gestion d'erreurs, retry, intégrations
4. **Comprendre l'architecture globale** : Vision système de bout en bout

### 3.3 Objectifs techniques

1. **Optimiser les coûts** : Limiter à 20€/mois de coûts LLM via batching, caching, choix du modèle
2. **Tenir dans les ressources** : VPS 2 vCPU / 8 Go RAM doit suffire pour le MVP
3. **Scalabilité future** : Architecture permettant d'ajouter des sources, des agents, des formats de sortie
4. **Maintenabilité** : Code commenté, documenté, testable

---

## 4. Périmètre du MVP

### 4.1 Ce qui est DANS le MVP

✅ **Veille automatisée** : 
- 5 sources minimum (ex : HackerNews API, r/MachineLearning RSS, GitHub trending AI, Anthropic blog, n8n blog)
- Collecte 1x par jour
- Déduplication basique (URL)

✅ **Classification automatique** : 
- Sujet (MCP, RAG, Agents, n8n, LangChain, etc.)
- Impact (High/Medium/Low)
- Pertinence pour mon stack (0-10)
- Résumé en français (150 mots max)

✅ **Comparaison contextuelle** : 
- Comparer la nouvelle techno avec celles que j'utilise déjà
- Identifier forces/faiblesses/cas d'usage différenciants

✅ **Validation humaine** : 
- Dashboard web listant les items en attente
- Pour chaque item : lire le résumé, décider (Oui/Non/Plus tard)

✅ **Génération de cours** : 
- Pour chaque item validé "Oui", générer un cours structuré en 3 niveaux
- Format : Markdown avec sections prédéfinies (Définition, Concepts clés, Exemples, TP, Quizz)

✅ **Stockage et indexation** : 
- PostgreSQL pour métadonnées + historique des décisions
- LanceDB pour recherche sémantique (RAG)

✅ **Consultation** : 
- Interface web pour lire les cours générés
- Recherche par sujet, niveau, date
- Chatbot simple (RAG basique)

✅ **Monitoring minimal** : 
- Nombre d'items traités
- Coût LLM estimé
- Statut des workflows

### 4.2 Ce qui est HORS du MVP (pour V2+)

❌ **Pas d'intelligence sur les sources** : Pas d'analyse de qualité des sources (ça viendra après)  
❌ **Pas de multilingue** : Français uniquement pour le MVP  
❌ **Pas de collaboration** : Un seul utilisateur (moi)  
❌ **Pas d'export NotebookLM** : Flashcards, scripts vidéo, etc. = V2  
❌ **Pas de gamification** : Pas de système de progression, badges, etc.  
❌ **Pas d'API publique** : L'API MCP est privée, pas de documentation externe  
❌ **Pas de mobile** : Web responsive seulement  

---

## 5. Acteurs et rôles

### 5.1 Acteurs humains

| Acteur | Rôle | Responsabilités |
|--------|------|----------------|
| **Curateur (moi)** | Utilisateur principal | - Décide quelles technologies entrent dans le système<br>- Consulte les cours générés<br>- Interroge le chatbot<br>- Surveille les coûts |
| **Administrateur système** | Ops | - Déploie sur le VPS<br>- Surveille les ressources<br>- Gère les backups |

### 5.2 Acteurs systèmes

| Acteur | Nature | Rôle |
|--------|--------|------|
| **n8n Workflow Scheduler** | Orchestrateur | Déclenche les collectes de veille à intervalles réguliers |
| **MCP Server "AcademiaOps"** | Service backend | Expose les tools pour la classification, génération, recherche |
| **Agno Agents Team** | Intelligence | Exécute les tâches de classification, comparaison, génération de cours |
| **PostgreSQL** | Persistence | Stocke les métadonnées, décisions, historique |
| **LanceDB** | Recherche vectorielle | Permet le RAG sur veille + cours |
| **Dashboard Web** | Interface | Permet la validation humaine et la consultation |

---

## 6. Cas d'usage détaillés

### 6.1 CU01 - Collecte automatique d'une nouveauté

**Acteur principal** : n8n Workflow Scheduler  
**Déclencheur** : Cron job (tous les jours à 8h)  
**Préconditions** : Sources de veille configurées  

**Scénario nominal** :
1. n8n déclenche le workflow "Collecte Veille"
2. Pour chaque source configurée :
   - Récupère les nouveaux items (RSS ou API)
   - Filtre les items déjà connus (déduplication par URL)
3. Enregistre les nouveaux items en base avec statut = "pending_classification"
4. Appelle le tool MCP `batch_classify_items(items[])`
5. Le serveur MCP orchestre l'agent Classifier (Agno)
6. L'agent analyse chaque item et retourne : sujet, impact, pertinence, résumé
7. MCP met à jour les items en base avec statut = "pending_validation"
8. n8n envoie une notification (Telegram/Email) : "X nouveautés à valider"

**Variantes** :
- **V1** : Si source inaccessible → log erreur, continue avec autres sources
- **V2** : Si classification échoue pour un item → statut = "classification_failed", retry plus tard

**Post-conditions** : Nouveaux items classifiés et en attente de validation humaine


### 6.2 CU02 - Validation humaine d'une nouveauté

**Acteur principal** : Curateur  
**Déclencheur** : Notification reçue  
**Préconditions** : Au moins 1 item avec statut "pending_validation"

**Scénario nominal** :
1. Le curateur ouvre le dashboard web
2. Voit la liste des items en attente (triés par pertinence décroissante)
3. Pour chaque item :
   - Lit le titre, source, date, sujet
   - Clique pour voir le résumé + comparaison avec le stack actuel
4. Décide : 
   - **"Oui, apprendre"** → Déclenche CU03 (génération de cours)
   - **"Non, pas intéressant"** → Item archivé avec raison
   - **"Plus tard"** → Item mis en attente (snooze 30 jours)
5. La décision est enregistrée en base avec timestamp

**Variantes** :
- **V1** : Le curateur peut demander une "comparaison approfondie" → appel MCP tool `compare_with_stack(item_id)` → génère un rapport détaillé
- **V2** : Le curateur peut ajouter des notes personnelles sur un item

**Post-conditions** : Item avec décision enregistrée


### 6.3 CU03 - Génération automatique de cours

**Acteur principal** : Agno Agent "CourseBuilder"  
**Déclencheur** : Validation "Oui" par le curateur  
**Préconditions** : Item validé avec sujet identifié

**Scénario nominal** :
1. Le dashboard appelle le tool MCP `generate_course(item_id, levels=["beginner", "intermediate", "advanced"])`
2. MCP orchestre l'agent "Pédago" :
   - Analyse le sujet
   - Définit les objectifs pédagogiques par niveau
   - Identifie les prérequis
   - Décompose en chapitres
3. MCP orchestre l'agent "CourseBuilder" :
   - Pour chaque niveau :
     - Génère l'introduction
     - Génère les définitions et concepts clés
     - Génère les analogies
     - Génère les exemples concrets
     - Génère un mini-TP
     - Génère un quizz (5 questions)
4. MCP orchestre l'agent "QA Reviewer" :
   - Vérifie la cohérence entre les 3 niveaux
   - Détecte les hallucinations potentielles
   - Signale les redondances
5. MCP chunke les contenus et les indexe dans LanceDB
6. MCP enregistre les cours en base (PostgreSQL) avec version, date, métadonnées
7. Le curateur reçoit une notification : "Cours généré pour {sujet}"

**Variantes** :
- **V1** : Si génération échoue (timeout, erreur LLM) → retry 1x, puis alerte administrateur
- **V2** : Le curateur peut demander une "régénération partielle" (ex : refaire le TP seulement)

**Post-conditions** : 3 cours (beginner/intermediate/advanced) disponibles et indexés


### 6.4 CU04 - Consultation d'un cours

**Acteur principal** : Curateur  
**Déclencheur** : Besoin d'apprendre ou de réviser un sujet  
**Préconditions** : Au moins 1 cours généré

**Scénario nominal** :
1. Le curateur ouvre le dashboard web
2. Navigue dans l'onglet "Mes Cours"
3. Filtre par sujet et/ou niveau (ex : "MCP" + "Intermediate")
4. Clique sur un cours
5. Lit le contenu (format Markdown rendu)
6. Peut marquer le cours comme "lu" ou "en cours"
7. Peut ajouter des notes personnelles

**Variantes** :
- **V1** : Le curateur peut exporter le cours en PDF (via tool côté serveur)
- **V2** : Le curateur peut tester ses connaissances avec le quizz intégré

**Post-conditions** : Progression enregistrée


### 6.5 CU05 - Recherche sémantique (RAG)

**Acteur principal** : Curateur  
**Déclencheur** : Question précise sur un sujet  
**Préconditions** : Base LanceDB indexée avec au moins quelques documents

**Scénario nominal** :
1. Le curateur ouvre le chatbot (dans le dashboard ou interface dédiée)
2. Pose une question en français : "Comment MCP se compare à LangGraph pour orchestrer des agents ?"
3. Le frontend appelle le tool MCP `search_knowledge_base(query, context="comparison")`
4. MCP :
   - Génère l'embedding de la question
   - Recherche les top 5 chunks pertinents dans LanceDB (veille + cours)
   - Passe la question + les chunks à un agent "RAG Responder"
5. L'agent génère une réponse contextualisée avec sources citées
6. Le chatbot affiche la réponse + liens vers les cours sources

**Variantes** :
- **V1** : Si aucun résultat pertinent → "Je n'ai pas assez d'information sur ce sujet dans ma base"
- **V2** : Le curateur peut demander des précisions (conversation multi-tours)

**Post-conditions** : Question répondue avec sources


### 6.6 CU06 - Consultation des statistiques

**Acteur principal** : Curateur / Administrateur  
**Déclencheur** : Monitoring régulier  
**Préconditions** : -

**Scénario nominal** :
1. Ouvre le dashboard web, onglet "Stats"
2. Voit :
   - Nombre d'items collectés (total, cette semaine, ce mois)
   - Nombre d'items classifiés / en attente / archivés
   - Nombre de cours générés par sujet
   - Coût LLM estimé (ce mois, historique)
   - Utilisation des ressources VPS (RAM, CPU, disk)
3. Peut exporter les stats en CSV

**Post-conditions** : Visibilité sur l'activité


---

## 7. Fonctionnalités du MVP

### 7.1 Module Veille

| ID | Fonctionnalité | Priorité | Détails |
|----|---------------|----------|---------|
| F01 | Configuration des sources | Must Have | Interface pour ajouter/modifier/supprimer des sources (RSS, API, GitHub) |
| F02 | Collecte automatique | Must Have | Workflow n8n avec cron job |
| F03 | Déduplication | Must Have | Par URL (hash) |
| F04 | Classification automatique | Must Have | Sujet, impact, pertinence, résumé |
| F05 | Comparaison avec stack | Should Have | Comparaison contextualisée avec mes technos actuelles |
| F06 | Notification | Must Have | Telegram ou Email avec résumé quotidien |

### 7.2 Module Validation

| ID | Fonctionnalité | Priorité | Détails |
|----|---------------|----------|---------|
| F07 | Liste des items en attente | Must Have | Dashboard web avec tri, filtres |
| F08 | Détail d'un item | Must Have | Résumé, source, date, comparaison |
| F09 | Décision (Oui/Non/Plus tard) | Must Have | Boutons d'action |
| F10 | Ajout de notes | Nice to Have | Champ texte libre |
| F11 | Historique des décisions | Should Have | Voir mes anciennes décisions |

### 7.3 Module Génération de Cours

| ID | Fonctionnalité | Priorité | Détails |
|----|---------------|----------|---------|
| F12 | Génération multi-niveaux | Must Have | Beginner / Intermediate / Advanced |
| F13 | Structure de cours | Must Have | Sections : Intro, Concepts, Exemples, TP, Quizz |
| F14 | QA automatique | Should Have | Agent vérifie cohérence, hallucinations |
| F15 | Versioning des cours | Nice to Have | Possibilité de régénérer une version améliorée |
| F16 | Indexation vectorielle | Must Have | Chunking + stockage LanceDB |

### 7.4 Module Consultation

| ID | Fonctionnalité | Priorité | Détails |
|----|---------------|----------|---------|
| F17 | Navigation par sujet | Must Have | Liste des sujets avec compteur de cours |
| F18 | Navigation par niveau | Must Have | Filtrer par beginner/intermediate/advanced |
| F19 | Lecture de cours | Must Have | Markdown rendu, syntaxe highlighting |
| F20 | Recherche full-text | Should Have | Barre de recherche simple (titre, mots-clés) |
| F21 | Chatbot RAG | Must Have | Interface de question-réponse |
| F22 | Marquer comme lu | Nice to Have | Tracking de progression |

### 7.5 Module Monitoring

| ID | Fonctionnalité | Priorité | Détails |
|----|---------------|----------|---------|
| F23 | Stats de veille | Must Have | Nombre d'items collectés, classifiés, etc. |
| F24 | Stats de cours | Must Have | Nombre de cours par sujet, niveau |
| F25 | Coûts LLM | Must Have | Estimation basée sur les tokens consommés |
| F26 | Ressources VPS | Should Have | Monitoring RAM, CPU, disk |
| F27 | Logs d'erreurs | Should Have | Centralisation des erreurs (n8n, Agno, MCP) |

---

## 8. Exigences non fonctionnelles

### 8.1 Performance

- **Collecte** : Traiter 100 items en moins de 5 minutes
- **Classification** : Classifier 20 items en batch en moins de 30 secondes
- **Génération de cours** : Générer 3 niveaux en moins de 2 minutes
- **Recherche RAG** : Répondre en moins de 5 secondes

### 8.2 Disponibilité

- **Cible MVP** : 95% uptime (acceptable pour usage personnel)
- **Tolérance** : Maintenance programmée 1x par semaine (dimanche matin)

### 8.3 Coûts

- **Budget LLM** : 20€/mois maximum
- **Stratégies** :
  - Utiliser GlobalGPT ou modèle économique par défaut
  - Réserver Claude 4.5 aux tâches critiques (génération de cours)
  - Batching des appels (classifier 20 items en 1 appel vs 20 appels)
  - Caching des résultats (pas de régénération inutile)

### 8.4 Ressources

- **VPS** : 2 vCPU, 8 Go RAM
- **Contraintes** :
  - n8n + MCP + Agno + PostgreSQL + LanceDB doivent cohabiter
  - Limiter l'usage mémoire de LanceDB (purge des anciens vecteurs)
  - Limiter les logs (rotation)

### 8.5 Sécurité

- **Authentification** : Basique pour le MVP (login/password sur dashboard)
- **API** : Pas d'exposition publique (localhost ou VPN)
- **Secrets** : Variables d'environnement (docker-compose.yml avec .env)

### 8.6 Maintenabilité

- **Code** : Commenté en français, style guide Python (Black, Flake8)
- **Documentation** : README par dossier, diagrammes d'architecture
- **Tests** : Tests unitaires sur les agents critiques (Classifier, CourseBuilder)
- **Logs** : Structurés (JSON), niveaux (INFO, WARNING, ERROR)

### 8.7 Évolutivité

- **Architecture modulaire** : Chaque agent Agno = module indépendant
- **Ajout de sources** : Configuration déclarative (YAML ou JSON)
- **Ajout de formats de sortie** : Plugin system pour export (PDF, SCORM, etc.)
- **Multi-utilisateurs** : Schéma DB prévu pour multi-tenant (V2)

---

## 9. Glossaire

| Terme | Définition |
|-------|-----------|
| **MCP** | Model Context Protocol. Protocole standardisé (JSON-RPC 2.0) pour permettre aux LLM d'interagir avec des outils externes de manière structurée. |
| **Agno** | Framework multi-agents pour orchestrer des workflows IA complexes avec des agents spécialisés. |
| **n8n** | Plateforme d'automatisation no-code/low-code permettant de créer des workflows avec triggers, nodes, conditions. |
| **RAG** | Retrieval-Augmented Generation. Technique consistant à enrichir le contexte d'un LLM avec des documents pertinents récupérés dans une base vectorielle. |
| **LanceDB** | Base de données vectorielle pour stocker et rechercher des embeddings (recherche sémantique). |
| **Tool (MCP)** | Fonction exposée par un serveur MCP, appelable par un client MCP (ex : un LLM ou un workflow). |
| **Agent (Agno)** | Entité autonome avec un rôle spécifique, capable d'utiliser des outils et de prendre des décisions. |
| **Skill (Agno)** | Capacité spécifique d'un agent (ex : "classifier un texte", "générer un résumé"). |
| **Workflow (n8n)** | Ensemble de nodes connectés qui automatisent un processus (ex : collecte RSS → classification → notification). |
| **Batching** | Technique consistant à regrouper plusieurs requêtes LLM en une seule pour réduire les coûts et la latence. |
| **Chunking** | Découpage d'un document en morceaux (chunks) pour l'indexation vectorielle. |
| **Embedding** | Représentation vectorielle (numérique) d'un texte, utilisée pour la recherche sémantique. |
| **MVP** | Minimum Viable Product. Version minimale fonctionnelle du produit. |

---

## 📝 Notes finales

Ce cahier des charges fonctionnel pose les bases métier du projet AcademiaOps. Il doit être validé avant de passer au cahier des charges technique.

**Points d'attention** :
- Le MVP est volontairement limité (1 utilisateur, français seulement) pour garantir une mise en production rapide
- L'accent est mis sur la qualité des contenus générés et l'optimisation des coûts
- L'architecture doit permettre l'extension future (multi-utilisateurs, multilingue, API publique)

**Prochaine étape** : Rédaction du cahier des charges technique (choix technologiques, architecture, modèle de données).
