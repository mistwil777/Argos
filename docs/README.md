# 📚 Documentation AcademiaOps

Bienvenue dans la documentation complète du projet AcademiaOps !

---

## 📖 Index des documents

### 🎯 Documentation de référence

| Document | Description | Pour qui ? |
|----------|-------------|-----------|
| [📘 Cahier des charges fonctionnel](cahier_des_charges_fonctionnel.md) | Objectifs métier, cas d'usage, fonctionnalités du MVP | Product Owner, Utilisateurs |
| [📗 Cahier des charges technique](cahier_des_charges_technique.md) | Choix technologiques, architecture système, modèle de données | Développeurs, Architectes |
| [📙 Architecture du projet](architecture.md) | Arborescence complète avec explications pédagogiques | Développeurs, Contributeurs |

### 🎓 Synthèses pour architectes IA

| Synthèse | Temps | Description |
|----------|-------|-------------|
| [📕 Synthèse MCP](synthese_mcp.md) | 10 min | Le protocole MCP, JSON-RPC 2.0, design de Tools |
| [📔 Synthèse Agno + Skills](synthese_agno.md) | 12 min | Multi-agents, composition par Skills, les 6 agents d'AcademiaOps |
| [📓 Synthèse n8n](synthese_n8n.md) | 8 min | Workflows, nodes, patterns pour systèmes IA |
| [📖 Guide de lecture](guide_lecture_syntheses.md) | - | Comment lire les synthèses + exercices pratiques |

**Total : 30 minutes de lecture** avant de coder la Phase 1.

### 📐 Diagrammes d'architecture (à créer)

| Diagramme | Format | Description |
|-----------|--------|-------------|
| Architecture globale | Mermaid | Vue d'ensemble du système |
| Flux de veille | Mermaid | De la collecte à la classification |
| Flux de génération de cours | Mermaid | De la validation à la publication |
| Modèle de données | Mermaid/ERD | Schéma PostgreSQL complet |

---

## 🗺️ Comment naviguer dans la documentation

### Je veux comprendre le QUOI (objectifs métier)
👉 Commencez par le [Cahier des charges fonctionnel](cahier_des_charges_fonctionnel.md)

### Je veux comprendre le COMMENT (architecture technique)
👉 Lisez le [Cahier des charges technique](cahier_des_charges_technique.md)

### Je veux implémenter le projet
👉 Suivez l'[Architecture du projet](architecture.md) avec l'ordre d'implémentation recommandé

### Je veux apprendre MCP, Agno ou n8n
👉 Lisez les [synthèses pour architectes IA](#-synthèses-pour-architectes-ia) et suivez le [guide de lecture](guide_lecture_syntheses.md)

---

## 📝 Structure de chaque document

Tous les documents respectent cette structure pour faciliter la navigation :

1. **Table des matières** : Liens directs vers les sections
2. **Vue d'ensemble** : Résumé en quelques phrases
3. **Contenu détaillé** : Explications, exemples, code commenté
4. **Références** : Liens vers ressources externes
5. **Prochaines étapes** : Où aller ensuite

---

## 🎯 Philosophie de documentation

Ce projet adopte une approche **pédagogique** :

### ✅ Ce qu'on fait
- ✅ **Expliquer le POURQUOI** avant le comment (design decisions)
- ✅ **Fournir des analogies** pour les concepts complexes
- ✅ **Montrer des exemples concrets** tirés du projet
- ✅ **Commenter abondamment** le code
- ✅ **Créer des guides progressifs** (débutant → avancé)

### ❌ Ce qu'on évite
- ❌ Documentation minimaliste type "RTFM"
- ❌ Jargon sans explication
- ❌ Code sans contexte
- ❌ Supposer des connaissances préalables

**Principe directeur** : Quelqu'un qui découvre MCP, Agno ou n8n doit pouvoir comprendre en lisant notre documentation.

---

## 🔄 Processus de mise à jour

La documentation évolue avec le projet :

1. **Avant l'implémentation** : Mettre à jour les specs (cahiers des charges)
2. **Pendant l'implémentation** : Documenter les choix techniques (commentaires inline, README par dossier)
3. **Après l'implémentation** : Créer les guides pédagogiques (retours d'expérience)

**Règle d'or** : Le code et la doc doivent toujours être synchronisés.

---

## 🤝 Contribution à la documentation

Vous voulez améliorer la documentation ? Super ! Voici comment :

### Typos et corrections mineures
1. Fork le projet
2. Corrigez directement dans `/docs`
3. Pull Request avec description claire

### Ajout de contenu
1. Discutez d'abord via une Issue (pour valider la pertinence)
2. Respectez le style et la structure existante
3. Ajoutez des exemples concrets
4. Pull Request avec review

### Création de guides pédagogiques
Contactez le mainteneur pour coordonner (éviter les doublons).

---

## 📚 Ressources externes

### MCP (Model Context Protocol)
- [Documentation officielle](https://modelcontextprotocol.io)
- [Spécification JSON-RPC 2.0](https://www.jsonrpc.org/specification)
- [Exemples MCP Python](https://github.com/anthropics/mcp-python)

### Agno (Multi-agents)
- [Documentation officielle](https://agno.dev)
- [Exemples d'agents](https://github.com/agno/examples)

### n8n (Automatisation)
- [Documentation officielle](https://docs.n8n.io)
- [Exemples de workflows](https://n8n.io/workflows)
- [Forum communautaire](https://community.n8n.io)

### LanceDB (Base vectorielle)
- [Documentation officielle](https://lancedb.com/docs)
- [Python SDK](https://lancedb.github.io/lancedb/)

### RAG & Embeddings
- [Sentence Transformers](https://www.sbert.net)
- [Guide RAG (Anthropic)](https://www.anthropic.com/index/retrieval-augmented-generation)

---

## ❓ FAQ Documentation

### Q : Pourquoi la doc est-elle en français ?
**R** : C'est un choix assumé pour ce projet personnel/pédagogique. Le français facilite l'apprentissage des concepts complexes. Le code reste en anglais (noms de variables, fonctions) selon les conventions internationales.

### Q : La documentation est-elle complète ?
**R** : Les cahiers des charges et l'architecture sont complets. Les guides pédagogiques seront créés au fur et à mesure de l'implémentation (learning by doing).

### Q : Puis-je traduire la documentation en anglais ?
**R** : Oui, avec plaisir ! Créez une issue pour coordonner et éviter les doublons.

### Q : Comment générer les diagrammes ?
**R** : Les diagrammes sont en Mermaid (format texte). Ils sont rendus automatiquement sur GitHub. Pour un rendu local, utilisez [Mermaid Live Editor](https://mermaid.live) ou l'extension VS Code.

---

## 📞 Besoin d'aide ?

- **Problème technique** : [Ouvrir une Issue GitHub](https://github.com/<your-username>/academiaops/issues)
- **Question sur la doc** : Même processus
- **Suggestion d'amélioration** : Pull Request ou Issue avec le tag `documentation`

---

<div align="center">

**Bonne lecture et bon apprentissage ! 🎓✨**

[← Retour au README principal](../README.md)

</div>
