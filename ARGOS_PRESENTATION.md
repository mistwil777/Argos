# Argos — Système de veille technologique intelligente
### Document de présentation architecturale
*Wilfried Leroulier — Ingénieur IA, Capgemini — Août 2026*

---

## 1. Vision et positionnement

Argos est un système de veille technologique conçu pour les professionnels de l'IA qui ont besoin de **rester à jour sur un domaine qui évolue chaque semaine**. Ce n'est pas un agrégateur de flux RSS amélioré. C'est un pipeline complet qui va de la collecte brute jusqu'à la constitution d'une base de connaissance personnelle interrogeable en langage naturel.

Le problème qu'il résout est précis : un ingénieur IA passe aujourd'hui entre 1h et 3h par semaine à trier manuellement des sources hétérogènes (arXiv, GitHub, blogs techniques, documentation officielle) pour en extraire ce qui est réellement nouveau et pertinent. Argos automatise cette chaîne tout en laissant à l'humain le contrôle sur ce qui entre dans sa base de connaissance.

---

## 2. Ce qui différencie Argos

### 2.1 Architecture HITL assumée

La plupart des systèmes RAG ingèrent tout automatiquement. Argos ne le fait pas. L'ingestion dans le RAG est un acte délibéré du consultant. Cette décision architecturale n'est pas une limitation — c'est un choix de qualité.

Pourquoi : un RAG dont la base est polluée par des contenus redondants, obsolètes ou peu fiables génère des réponses dégradées. Les systèmes qui ingèrent tout automatiquement finissent par produire des synthèses qui moyennent le bruit avec le signal. Argos garantit que ce qui entre dans le RAG a été validé par un humain.

### 2.2 Détection de diff sur les pages surveillées

Surveiller une documentation officielle comme celle d'Anthropic, LangChain ou AWS n'a de valeur que si l'on détecte ce qui a *changé*. Argos implémente une logique de diff textuel : la première visite stocke le contenu complet, les visites suivantes calculent uniquement les lignes ajoutées. L'item créé ne contient que la nouveauté, pas le contenu déjà connu.

Cette approche est différente d'un simple "est-ce que la page a changé ?" — elle *isole* la nouveauté.

### 2.3 Pipeline de fiabilité avant insertion

Chaque item passe par un scorer de fiabilité avant d'entrer en base. Ce scorer opère sur deux niveaux : le domaine (liste de 40+ domaines officiels reconnus — anthropic.com, arxiv.org, huggingface.co, pytorch.org, etc.) et le contenu (densité de signaux commerciaux, longueur minimale, seuil de stars GitHub). Un item qui ne passe pas le filtre n'est jamais inséré, sans bloquer le pipeline.

### 2.4 Knowledge Graph couplé au RAG

La plupart des systèmes RAG traitent les documents comme des vecteurs isolés. Argos extrait en parallèle des entités et des relations (via LLM) pour construire un graphe de connaissance. Quand un consultant interroge Argos, la réponse est enrichie par le contexte relationnel du graphe : "LangGraph est lié à LangChain, qui est intégré par Mistral dans tel contexte."

### 2.5 Rendu JS-first avec Playwright

La majorité de la documentation technique moderne est générée côté client (React, Vue, Next.js). Un scraper classique récupère une page vide. Argos détecte automatiquement les "shells JavaScript" (< 200 caractères de contenu extrait) et bascule sur un navigateur headless Chromium pour rendre la page avant extraction.

---

## 3. Architecture technique détaillée

### 3.1 Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                        Sources                               │
│  RSS feeds  │  Sites web  │  GitHub API  │  ArXiv Atom      │
└──────┬──────┴──────┬──────┴──────┬───────┴──────┬───────────┘
       │             │             │              │
       └─────────────┴─────────────┴──────────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Collector Service  │
                    │  + Playwright       │
                    │  + Trafilatura      │
                    │  + Diff engine      │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │ Reliability Scorer  │  ← filtre avant INSERT
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │    PostgreSQL       │
                    │    items (pending)  │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Classifier LLM     │  ← AWS Bedrock Nova Pro
                    │  topics, importance │
                    │  type, résumé FR    │
                    └─────────┬──────────┘
                              │
                    ┌─────────▼──────────┐
                    │  Interface HITL     │  ← décision humaine
                    │  Sauvegarder        │
                    │  Intégrer au RAG    │
                    │  Ignorer            │
                    └──────┬──────┬───────┘
                           │      │
            ┌──────────────▼┐    ┌▼──────────────────┐
            │   LanceDB      │    │  Knowledge Graph   │
            │   (vectors)    │    │  (PostgreSQL)      │
            │   SentenceTrans│    │  kg_nodes/kg_edges │
            └──────────────┬┘    └┬──────────────────┘
                           │      │
                    ┌──────▼──────▼──────┐
                    │    RAG + KG Query   │  ← hybrid search
                    │    Réponse en FR    │
                    └────────────────────┘
```

### 3.2 Stack technique

| Couche | Technologie | Justification du choix |
|---|---|---|
| Backend | FastAPI (Python 3.11) | Performance async, validation Pydantic, documentation OpenAPI auto |
| Base de données principale | PostgreSQL 16 | ACID, support tableau natif pour keywords, JSON natif (content_json), similarité trigram intégrée |
| Vector store | LanceDB | Embarqué (pas de service externe), hybrid search (sémantique + lexical) natif, format Lance columnar performant |
| LLM provider | AWS Bedrock (Amazon Nova Pro) | Pas de dépendance OpenAI, contrôle du coût, modèle configurable sans recompiler |
| Embeddings | SentenceTransformer (HuggingFace) | Modèle local, pas d'appel API pour l'indexation, coût zéro à l'usage |
| Rendu JS | Playwright (Chromium headless) | Standard industriel, support des SPAs modernes, géré comme fallback automatique |
| Extraction texte | Trafilatura + HTMLParser custom | Trafilatura = extraction sémantique (retire nav, footer, pubs), fallback sur parser custom |
| OCR | Tesseract + poppler | Documents PDF et images, en français + anglais |
| Frontend | React + TypeScript + Vite | HMR, typage fort, standard de l'écosystème |
| Conteneurisation | Docker Compose | Isolement services, reproductibilité, déploiement one-command |

### 3.3 Le pipeline en détail

#### Étape 1 — Collecte

Le `CollectorService` dispatche selon le type de source :

**RSS** : `feedparser` parse le flux Atom/RSS. Si le contenu de l'item RSS est trop court (pas de fulltext dans le flux), `trafilatura` est appelé sur l'URL de l'article — limité à 10 appels par session pour éviter les surcharges. Déduplication par URL exacte puis par similarité trigram PostgreSQL (seuil 0.6) pour éviter les doublons de reformulation.

**Website (single page)** : requête HTTP + parsing HTML custom. Si le contenu extrait est inférieur à 200 caractères → détection de "JS shell" → basculement automatique sur Playwright. Playwright ouvre une page Chromium en mode headless, attend `domcontentloaded` (timeout 45s), extrait le HTML rendu et les liens internes. Toutes les opérations Playwright étant synchrones, elles s'exécutent dans `asyncio.to_thread()` pour ne pas bloquer la boucle événementielle FastAPI.

**Website (crawl)** : même logique, étendue à un spider récursif jusqu'à 100 pages du même domaine. Filtrage par `netloc` (et non par préfixe d'URL) pour ne pas suivre les liens externes. Sur chaque page : calcul SHA-256 du contenu, comparaison avec le hash stocké dans `documents`, génération du diff si différence → item `[MàJ]` avec uniquement les lignes ajoutées.

**GitHub** : appel à l'API de recherche GitHub. Filtre : ≥ 100 étoiles. Champs extraits : nom, description, stars, langage, date de création.

**ArXiv** : flux Atom officiel. Champs : titre, abstract, 3 premiers auteurs.

#### Étape 2 — Reliability Scoring

Avant tout `INSERT`, chaque item passe par le `ReliabilityScorer`. Le scoring se fait en deux passes :

*Niveau domaine* : le domaine est classé en 4 tiers (official → 1.0, recognized → 0.75, unknown → 0.4, rejected → 0.0). La liste `official` inclut les sources de référence du domaine IA : anthropic.com, openai.com, arxiv.org, huggingface.co, pytorch.org, github.com, etc.

*Niveau contenu* : longueur minimale (200 mots, sauf changelogs), détection de signaux commerciaux forts ("request a demo", "enterprise pricing" → rejet immédiat), densité commerciale > 4% → rejet, bonus pour auteur identifié (+0.05), date présente (+0.05), contenu long (+0.05 à partir de 500 mots, +0.05 à partir de 1500 mots).

Un item rejeté est logué mais jamais inséré. Un item qui passe est enrichi de ses métadonnées de fiabilité (`reliability_score`, `reliability_tier`, `reliability_reason`) stockées dans `items`.

#### Étape 3 — Classification LLM

Le `ClassifierService` interroge AWS Bedrock (modèle `us.amazon.nova-pro-v1:0`, température 0.5, top_p 0.5) avec un prompt structuré qui demande un JSON contenant :
- `topics` (1-5 strings) : technologies mentionnées
- `importance` : `critical | high | medium | low`
- `item_type` : `tool | tutorial | research | news | discussion | other`
- `reasoning` : justification courte
- `summary_fr` : résumé en français (2-3 phrases)

La réponse remplace le résumé brut par le résumé en français. Les topics sont stockés dans le champ `keywords TEXT[]` de PostgreSQL. Les coûts sont tracés dans `llm_usage` (tokens input/output, coût USD, modèle, operation_type).

Un échec de classification ne perd jamais l'item : il reste en statut `pending` et reste visible dans l'interface.

#### Étape 4 — Décision HITL

L'item classifié apparaît dans l'interface avec trois actions :

- **Sauvegarder en bibliothèque** : `user_action = 'saved'`. L'item est archivé dans la bibliothèque personnelle du consultant, accessible en lecture mais pas dans le RAG.
- **Intégrer au RAG** : déclenche la chaîne digest → indexation → KG. Voir étape 5.
- **Ignorer** : `user_action = 'ignored'`. L'item disparaît du feed.

#### Étape 5 — Ingestion RAG + Knowledge Graph (sur action humaine)

*Digest LLM* : génération d'un résumé structuré enrichi (`digest_markdown`) à partir du contenu de l'item. Ce digest est la source indexée dans le RAG (pas le contenu brut), ce qui améliore la qualité des embeddings.

*Relevance scoring* : score de pertinence calculé avant indexation (combinaison domain_score + densité de contenu).

*Indexation LanceDB* : le `digest_markdown` est encodé par SentenceTransformer (modèle HuggingFace local) et stocké dans LanceDB. LanceDB supporte nativement le hybrid search (sémantique + BM25 lexical).

*Knowledge Graph* : extraction LLM des entités (max 8, types : org, person, product, concept, technology) et des relations (max 6, en français). Upsert dans `kg_nodes` et `kg_edges` : si une entité existe déjà (comparaison insensible à la casse), son poids (`weight`) est incrémenté de 0.1 à chaque nouvelle occurrence. Le graphe se densifie avec le temps sans duplication.

#### Étape 6 — Interrogation RAG enrichie KG

Une requête de l'utilisateur déclenche :
1. Recherche hybrid dans LanceDB (top_k=8)
2. Enrichissement contextuel depuis `kg_nodes` : les entités dont le label correspond à un mot de la query (≥ 4 chars) sont récupérées avec leurs relations
3. Construction du prompt final : sources vectorielles + contexte graphe + question
4. Génération LLM (température 0.75, max_tokens 2500) en français avec citations `(→ Source N)`
5. Calcul du score de confiance : `1 - avg(distance LanceDB) / 2`
6. Logging dans `rag_queries`

---

## 4. Schéma de base de données

```
workspaces ──┐
             ├── sujets ──┐
             │            └── sources (url, type, content_hash, monitor_enabled)
             │            └── items (url, title, summary, importance, item_type,
             │                      keywords[], classification_status,
             │                      digest_markdown, rag_indexed,
             │                      reliability_score, user_action)
             │            └── documents (title, content_markdown, content_json)
             │
             └── rag_queries (query, answer, sources JSONB, confidence_score)

kg_nodes (label, type, confidence_score, source_count, hitl_validated)
kg_edges (source_node_id, target_node_id, relation_type, weight)
kg_node_sources (node_id, item_id, url, confidence)

llm_usage (operation_type, model, tokens_used, cost_usd, input_data, output_data)
```

---

## 5. Ce qu'Argos peut apporter chez Capgemini

### 5.1 Veille individuelle du consultant

Un consultant IA passe aujourd'hui entre 1h et 3h par semaine à trier manuellement ses sources. Argos réduit ce temps à 15-20 minutes : le tri brut est automatisé, le consultant ne voit que ce qui a changé, classifié, résumé en français, avec les items les moins pertinents déjà filtrés.

### 5.2 Base de connaissance d'équipe projet

Argos est construit pour le travail multi-espaces. Chaque espace de travail (workspace) peut isoler sa base de connaissance. Dans le contexte d'un projet client, l'équipe constitue progressivement une base RAG partagée : contrats, spécifications techniques, veille réglementaire, documentation client. Le RAG est interrogeable par toute l'équipe. Le Knowledge Graph permet de visualiser les entités clés du projet et leurs relations.

### 5.3 Centre de compétences IA

À l'échelle d'une practice IA, Argos peut centraliser la veille sur les LLMs, les frameworks d'agents (LangGraph, AutoGen, CrewAI), les annonces de modèles (Anthropic, Mistral, Gemini). La base RAG constitue un actif de connaissance durable, interrogeable pour préparer des propositions commerciales, des audits techniques ou des formations internes.

### 5.4 Ingestion documentaire

Argos peut ingérer des documents PDF et images via OCR (Tesseract + poppler déjà en production). Un contrat client en PDF, une note d'architecture interne, un rapport de mission — tout peut entrer dans la base de connaissance et être interrogeable en langage naturel.

---

## 6. Décisions architecturales clés et leurs justifications

### Pourquoi PostgreSQL et non uniquement une base vectorielle ?

Les bases vectorielles pures (Pinecone, Weaviate) ne supportent pas les requêtes relationnelles complexes. Argos a besoin de jointures (items → sujets → workspaces), de contraintes d'intégrité, de déduplication par trigram, de stockage de métadonnées structurées. PostgreSQL joue le rôle de source de vérité. LanceDB est un index de recherche, pas une base de données.

### Pourquoi LanceDB et non pgvector ?

pgvector ne supporte pas le hybrid search natif (sémantique + lexical combinés). LanceDB est conçu pour ça. De plus, LanceDB s'exécute en mode embarqué (pas de service séparé), ce qui simplifie le déploiement et élimine un point de défaillance.

### Pourquoi AWS Bedrock et non l'API OpenAI directement ?

Chez Capgemini, les contrats cloud et la gouvernance des données passent souvent par AWS. Bedrock permet d'utiliser des modèles de pointe (Amazon Nova, Claude via Bedrock) sans sortir de l'infrastructure AWS du client. Le provider est abstrait derrière une interface commune — passer d'Amazon Nova Pro à Claude 3.5 Sonnet ne nécessite qu'un changement de variable d'environnement, sans modifier le code.

### Pourquoi le digest et non le contenu brut dans le RAG ?

Un article brut de 3000 mots contient beaucoup de redondance, de formulations parasites, de structure HTML résiduelle. Encoder un contenu mal structuré produit des embeddings bruités. Le digest LLM est une synthèse dense : les embeddings sont plus précis, la recherche hybride retourne des résultats plus pertinents.

### Pourquoi un Knowledge Graph en plus du RAG vectoriel ?

Le RAG vectoriel répond à "quels documents parlent de ce sujet ?". Le Knowledge Graph répond à "quelles entités sont liées, comment, avec quelle fréquence ?". Les deux sont complémentaires : le graphe enrichit le contexte injecté dans le prompt de génération finale, ce qui produit des réponses plus précises sur les relations entre technologies (ex: "LangGraph est maintenu par LangChain, qui a été intégré dans ce framework de Microsoft").

### Pourquoi HITL explicite pour l'ingestion RAG ?

Un RAG dont la qualité dépend des décisions automatiques d'un classificateur LLM finit par dériver. Le classificateur a une précision de ~85-90% sur les cas standard — mais les 10-15% d'erreurs s'accumulent silencieusement dans la base. En forçant un acte humain pour l'ingestion, Argos garantit que la base vectorielle ne contient que du contenu validé. La qualité des réponses RAG dépend directement de la qualité de la base : mieux vaut une base petite et propre qu'une base large et bruitée.

---

## 7. État du projet et roadmap

**En production aujourd'hui :**
- Pipeline collect → reliability filter → insert → classify (AWS Bedrock)
- Détection de diff sur pages surveillées (hash SHA-256 + difflib)
- Playwright pour les sites JS-rendered
- RAG hybride LanceDB + SentenceTransformer
- Knowledge Graph avec extraction LLM
- Interface HITL : Sauvegarder / Intégrer au RAG / Ignorer
- OCR documents (Tesseract + poppler)
- Multi-espaces et multi-sujets
- Traçabilité complète des coûts LLM

**Prochaines étapes :**
- Clustering des items (HDBSCAN) pour émergence automatique de thèmes
- Alertes push sur les items `critical`
- Export de briefings hebdomadaires automatiques
- Support multi-utilisateurs avec rôles (lecteur / contributeur / admin espace)

---

*Argos est développé en autonomie complète dans le cadre d'une alternance M2 IA à Capgemini, en parallèle des missions client. Toute la stack est open-source à l'exception des APIs LLM.*
