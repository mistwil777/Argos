# Guide de Lecture des Synthèses 📖

**Objectif** : Structurer ton apprentissage de la stack AcademiaOps avant d'implémenter

---

## 🎯 Vue d'ensemble

Tu as devant toi **3 synthèses techniques** (30 minutes de lecture totale) qui couvrent les technologies au cœur du projet :

| Synthèse | Temps | Concept clé | Pourquoi c'est critique |
|----------|-------|-------------|-------------------------|
| [**n8n**](synthese_n8n.md) | 8 min | Orchestration workflow | Tu dois comprendre ce que n8n fait et **ce qu'il ne doit pas faire** (pas de logique métier dedans) |
| [**MCP**](synthese_mcp.md) | 10 min | Protocole standardisé | C'est l'interface entre tes agents et le monde extérieur (DB, APIs, fichiers) |
| [**Agno + Skills**](synthese_agno.md) | 12 min | Multi-agents | C'est le cerveau du système : comment structurer tes agents, skills, et teams |

**Total : 30 minutes de lecture concentrée.**

---

## 📋 Plan de lecture recommandé

### Option 1 : Lecture séquentielle (débutant)

**Pour qui** : Tu découvres n8n, MCP ou Agno

**Ordre de lecture** :

1. **[n8n](synthese_n8n.md)** (8 min)
   - Commence par ici : c'est le plus simple
   - Concepts : workflows, nodes, triggers
   - **Focus** : Section "Ce que n8n NE doit PAS faire" → essentiel pour éviter les erreurs d'architecture

2. **[MCP](synthese_mcp.md)** (10 min)
   - Après n8n, tu comprendras mieux comment MCP s'insère entre n8n et les agents
   - Concepts : JSON-RPC 2.0, Tools/Resources/Prompts
   - **Focus** : Section "Les 5 outils critiques pour AcademiaOps" → tu verras les tools qu'on va créer

3. **[Agno + Skills](synthese_agno.md)** (12 min)
   - Termine par Agno : c'est le plus complexe
   - Concepts : Agent, Skill, Team, collaboration
   - **Focus** : Section "Les 6 Agents d'AcademiaOps" → tu verras exactement ce qu'on va coder

**Pause recommandée** : 5 minutes entre chaque synthèse pour laisser décanter.

---

### Option 2 : Lecture par préoccupation (intermédiaire)

**Pour qui** : Tu as déjà des notions de ces technos, tu veux cibler tes lacunes

**Parcours modulaire** :

#### Si tu veux comprendre **l'architecture globale** :
1. Lis les sections "en une phrase" de chaque synthèse (3 min total)
2. Puis lis la section 8.2 (Agents et orchestration) du [Cahier des Charges Technique](cahier_des_charges_technique.md#82-agents-et-orchestration)

#### Si tu veux comprendre **comment les agents collaborent** :
1. [Agno - Les 6 Agents d'AcademiaOps](synthese_agno.md#-les-6-agents-dacademiaops)
2. [Agno - Collaboration entre agents (Teams)](synthese_agno.md#-collaboration-entre-agents-teams)
3. [MCP - Pattern 2 : Agent avec état](synthese_mcp.md#pattern-2--agent-avec-état-conversationnel)

#### Si tu veux comprendre **les workflows d'automatisation** :
1. [n8n - Les 3 workflows AcademiaOps](synthese_n8n.md#-les-3-workflows-dacademiaops)
2. [Cahier des Charges Technique - Section 5 (Workflows n8n)](cahier_des_charges_technique.md#5-workflows-n8n)

#### Si tu veux comprendre **comment exposer des fonctionnalités au LLM** :
1. [MCP - Les 3 primitives](synthese_mcp.md#-les-3-primitives-mcp)
2. [MCP - Design de Tools](synthese_mcp.md#-design-de-tools-bonnes-pratiques)
3. [Architecture - mcp_server/tools/](architecture.md#mcp_servertools)

---

### Option 3 : Lecture inversée (expert)

**Pour qui** : Tu veux partir du concret (le code à écrire) vers l'abstrait (les concepts)

**Ordre inversé** :

1. **[Agno + Skills](synthese_agno.md)** d'abord → Tu vois les 6 agents à créer
2. **[MCP](synthese_mcp.md)** ensuite → Tu comprends comment ces agents utilisent des tools
3. **[n8n](synthese_n8n.md)** enfin → Tu vois comment orchestrer les appels

---

## 🧪 Exercices pratiques après lecture

### Après n8n

**Exercice 1 : Dessine un workflow papier**

Prends une feuille et dessine le workflow "Collecte RSS" :
- Nodes (rectangles)
- Flèches de connexion
- Données transmises entre nodes

**Critère de réussite** : Tu dois avoir 4-6 nodes et pouvoir expliquer ce que chaque node fait.

**Exercice 2 : Spot les erreurs**

Voici un workflow n8n mal conçu. Trouve les 3 erreurs :

```
[1. RSS Trigger]
    ↓
[2. Function Node : Appeler GPT-3.5 pour classifier l'article]
    ↓
[3. If Node : Si sujet = MCP, continuer]
    ↓
[4. HTTP Request : POST /items]
```

<details>
<summary>Voir les erreurs</summary>

1. **Erreur 1** : Logique de classification dans n8n (node 2) → Devrait appeler un endpoint MCP qui utilise l'agent Classifier
2. **Erreur 2** : Pas de gestion d'erreur sur le HTTP Request (node 4) → Devrait avoir "Continue On Fail" activé
3. **Erreur 3** : Pas de batching → Si 100 items RSS, ça fait 100 appels isolés. Devrait batché (ex : 10 items par appel)

</details>

---

### Après MCP

**Exercice 3 : Écrire un contrat de tool**

Écris le contrat (schema Pydantic) pour un tool `search_courses` qui :
- Prend en input : `query` (str), `level` (enum: beginner, intermediate, advanced), `limit` (int, optionnel, défaut=5)
- Retourne : liste de dict avec `id`, `title`, `excerpt`, `relevance_score`

<details>
<summary>Voir une solution</summary>

```python
from pydantic import BaseModel, Field
from enum import Enum

class CourseLevel(str, Enum):
    BEGINNER = "beginner"
    INTERMEDIATE = "intermediate"
    ADVANCED = "advanced"

class SearchCoursesInput(BaseModel):
    query: str = Field(..., description="Requête de recherche en langage naturel")
    level: CourseLevel | None = Field(None, description="Filtrer par niveau de cours")
    limit: int = Field(5, ge=1, le=20, description="Nombre maximum de résultats")

class CourseSearchResult(BaseModel):
    id: int
    title: str
    excerpt: str = Field(..., max_length=200)
    relevance_score: float = Field(..., ge=0.0, le=1.0)

class SearchCoursesOutput(BaseModel):
    results: list[CourseSearchResult]
    total_count: int
```

</details>

**Exercice 4 : Diagnostiquer une erreur MCP**

Un agent a reçu cette réponse d'erreur :

```json
{
  "jsonrpc": "2.0",
  "id": "abc123",
  "error": {
    "code": -32602,
    "message": "Invalid params",
    "data": {
      "validation_errors": [
        {"field": "level", "error": "value is not a valid enumeration member"}
      ]
    }
  }
}
```

Que s'est-il passé ? Comment le corriger ?

<details>
<summary>Voir la réponse</summary>

**Diagnostic** : L'agent a envoyé une valeur invalide pour le champ `level`. Probablement `"avancé"` ou `"Beginner"` (mauvaise casse) au lieu de `"beginner"`, `"intermediate"`, `"advanced"`.

**Correction** :
1. Dans le prompt de l'agent, spécifier les valeurs exactes acceptées : "beginner", "intermediate", "advanced"
2. Ajouter une validation côté agent avant d'appeler le tool :
   ```python
   if level not in ["beginner", "intermediate", "advanced"]:
       raise ValueError(f"Invalid level: {level}")
   ```

</details>

---

### Après Agno

**Exercice 5 : Décomposer un agent en skills**

L'agent `CourseBuilder` doit générer un cours complet. Décompose-le en 3-5 skills atomiques.

<details>
<summary>Voir une décomposition</summary>

1. `GenerateIntroductionSkill` : Créer l'introduction du cours (contexte, objectifs)
2. `ExplainConceptsSkill` : Expliquer les concepts principaux avec analogies
3. `CreateExamplesSkill` : Générer des exemples de code concrets
4. `DesignMiniTPSkill` : Créer un mini TP (énoncé + solution)
5. `GenerateQuizSkill` : Créer un quizz de validation (5-10 questions)

**Principe appliqué** : Chaque skill fait UNE chose et retourne un type clair (str markdown, list[dict], etc.)

</details>

**Exercice 6 : Orchestrer une Team**

Tu veux générer un cours ET une comparaison avec le stack de l'utilisateur.

Agents disponibles :
- `PedagoAgent`
- `CourseBuilderAgent`
- `ComparerAgent`

Quelle Team créer ? Séquentiel ou parallèle ? Dessine le workflow.

<details>
<summary>Voir une solution</summary>

**Solution : Team parallèle (fan-out)**

```
Pédago (définit structure)
    ↓
┌──────────────────────┬────────────────────┐
│ CourseBuilderAgent   │ ComparerAgent      │
│ (génère cours)       │ (compare tech)     │
└──────────────────────┴────────────────────┘
    ↓
Résultats consolidés
```

**Justification** : Les 2 agents (CourseBuilder et Comparer) sont indépendants → parallèle = 2x plus rapide.

**Code** :
```python
async def generate_course_and_comparison(topic: str, user_stack: list[str]):
    structure = await pedago.design_structure(topic)
    
    # Exécution parallèle
    course_task = course_builder.generate(structure)
    comparison_task = comparer.compare_with_stack(topic, user_stack)
    
    course, comparison = await asyncio.gather(course_task, comparison_task)
    
    return {"course": course, "comparison": comparison}
```

</details>

---

## 🚦 Critères de validation (avant de coder)

### Tu es prêt à coder si :

#### n8n
- [ ] Tu sais ce qu'est un Trigger, un Node, et un Output Node
- [ ] Tu comprends le principe "Continue On Fail" pour gérer les erreurs
- [ ] Tu sais que n8n est pour l'IO, PAS pour la logique métier

#### MCP
- [ ] Tu sais expliquer la différence entre Tool, Resource, et Prompt
- [ ] Tu comprends le flow JSON-RPC 2.0 (request → response ou error)
- [ ] Tu sais écrire un schema Pydantic pour un tool input/output

#### Agno + Skills
- [ ] Tu sais expliquer la hiérarchie : Team → Agent → Skill → LLM/Tool
- [ ] Tu comprends la composition (skills atomiques réutilisables)
- [ ] Tu sais orchestrer des agents en séquentiel ET en parallèle

### Tu as besoin d'approfondir si :

- ❌ Tu confonds "Agent" et "LLM"
- ❌ Tu penses que n8n doit contenir la logique de classification
- ❌ Tu ne vois pas l'intérêt de décomposer un agent en plusieurs skills
- ❌ Tu ne comprends pas pourquoi MCP utilise JSON-RPC au lieu d'un simple POST REST

**Action** : Relis la synthèse concernée, section par section, en prenant des notes.

---

## 📚 Ressources complémentaires

### Documentation officielle

- [n8n Documentation](https://docs.n8n.io)
- [MCP Protocol Spec](https://modelcontextprotocol.io)
- [Agno Documentation](https://agno.dev)

### Nos documents de conception

- [Cahier des Charges Fonctionnel](cahier_des_charges_fonctionnel.md) : Les features à implémenter
- [Cahier des Charges Technique](cahier_des_charges_technique.md) : L'architecture détaillée
- [Architecture du projet](architecture.md) : La structure du code (80+ fichiers)

### Après avoir lu les synthèses

Une fois que tu as validé les critères ci-dessus, lis :

1. **[Architecture - Section 3.1 : Le serveur MCP](architecture.md#31-le-serveur-mcp)** (10 min)
   - Comprendre comment le serveur MCP est structuré
   
2. **[Cahier des Charges Technique - Section 7 : Base de données](cahier_des_charges_technique.md#7-base-de-données)** (5 min)
   - Comprendre le schéma PostgreSQL et LanceDB

**Ensuite, tu seras 100% prêt pour la Phase 1 d'implémentation !**

---

## 🗺️ Roadmap d'apprentissage (après les synthèses)

### Phase 1 : Fondations (2-3 jours)
- [ ] Lire les 3 synthèses (30 min)
- [ ] Faire les 6 exercices pratiques (1h)
- [ ] Explorer l'architecture du projet (architecture.md) (30 min)
- [ ] Lire le schéma de base de données (cahier_des_charges_technique.md, section 7) (15 min)

### Phase 2 : Implémentation Docker + MCP (3-4 jours)
- [ ] Créer docker-compose.yml (PostgreSQL, n8n)
- [ ] Créer database/init.sql (schéma complet)
- [ ] Créer mcp_server/server.py (FastAPI + JSON-RPC)
- [ ] Créer le premier tool : `hello_world` (test de bout en bout)

### Phase 3 : Agents (5-7 jours)
- [ ] Créer ClassifierAgent + 3 skills
- [ ] Créer CourseBuilderAgent + 5 skills
- [ ] Créer PedagoAgent + 3 skills
- [ ] Créer QAReviewerAgent + 4 skills
- [ ] Créer RAGResponderAgent + 4 skills
- [ ] Créer ComparerAgent + 3 skills

### Phase 4 : Workflows n8n (2-3 jours)
- [ ] Workflow "Collecte RSS"
- [ ] Workflow "Classification automatique"
- [ ] Workflow "Génération de cours"

### Phase 5 : Dashboard Next.js (3-4 jours)
- [ ] CRUD Items
- [ ] Validation humaine
- [ ] Visualisation des cours

**Total estimé : 15-21 jours (3-4 semaines)**

---

## 💡 Conseils pratiques

### Pendant la lecture

1. **Prends des notes manuscrites** : Dessine les schémas, note les concepts clés
2. **Fais les exercices** : Ne les saute pas, ils valident ta compréhension
3. **Pose-toi des questions** : "Comment je ferais ça dans AcademiaOps ?"

### Après la lecture

1. **Explique à voix haute** : Essaie d'expliquer les concepts comme si tu formais quelqu'un
2. **Dessine l'architecture globale** : Un gros schéma qui relie n8n, MCP, Agno, PostgreSQL, LanceDB
3. **Identifie tes zones floues** : Note ce qui n'est pas 100% clair et relis ces sections

### Avant de coder

1. **Relis la roadmap** : Comprends dans quel ordre on va construire (Phase 1 → 5)
2. **Prépare ton environnement** : Docker Desktop installé, Python 3.11+, Node.js 18+
3. **Clone le repo** : Même si vide pour l'instant, structure tes dossiers

---

## 🎯 Prochaine étape

**Une fois que tu as lu les 3 synthèses et fait les exercices** :

1. Fais-moi signe 👋 : "J'ai terminé les synthèses, je suis prêt pour la Phase 1"
2. On créera ensemble le premier commit : docker-compose.yml + database/init.sql + mcp_server/server.py
3. Tu verras ton premier agent Agno communiquer via MCP avec n8n !

**Bon apprentissage ! 🚀**

---

[← Synthèse Agno](synthese_agno.md) | [Retour à l'index](README.md) | [Voir la Roadmap →](cahier_des_charges_technique.md#9-roadmap)
