# Synthèse Agno + Skills pour Architecte IA 🤖

**Temps de lecture** : 12 minutes  
**Objectif** : Maîtriser l'architecture multi-agents avec Agno et la composition par Skills

---

## 🎯 Agno en une phrase

**Agno est un framework Python pour orchestrer des systèmes multi-agents où chaque agent est une entité spécialisée composée de Skills (capacités), capable d'utiliser des outils (LLM, DB, APIs) pour accomplir sa mission de manière autonome ou collaborative.**

---

## 🧠 Les 4 concepts fondamentaux

### 1. Agent = Acteur autonome avec un rôle

Un **Agent** est une entité qui :
- A un **nom** et un **rôle** clairement défini
- Possède des **skills** (capacités spécifiques)
- Utilise des **outils** (LLM, bases de données, APIs)
- Prend des **décisions** basées sur son contexte
- Peut **collaborer** avec d'autres agents

**Analogie** : Pense à une entreprise. Un agent = un employé avec une fiche de poste.

```
Agent "Classifier"
├─ Rôle : Classifier des articles techniques par sujet
├─ Skills :
│  ├─ extract_keywords
│  ├─ map_to_taxonomy
│  └─ assess_impact
└─ Outils : LLM (GPT-3.5), Taxonomie (config)
```

---

### 2. Skill = Capacité atomique

Un **Skill** est une compétence spécifique d'un agent :
- **Fonction Python** bien définie
- **Input** et **Output** typés
- **Réutilisable** par plusieurs agents
- **Testable** unitairement

**Analogie** : Un chef cuisinier (Agent) a des skills : "découper des légumes", "faire une sauce", "dresser une assiette".

```python
class ExtractKeywordsSkill(Skill):
    """Skill : Extraire les mots-clés techniques d'un texte"""
    
    async def execute(self, text: str) -> list[str]:
        # Appeler le LLM avec un prompt spécialisé
        response = await self.llm.chat([
            {"role": "system", "content": "Extrait 5 mots-clés techniques"},
            {"role": "user", "content": text}
        ])
        return self.parse_keywords(response.content)
```

**Point clé** : Un Skill est **mono-responsabilité**. Il fait UNE chose et la fait bien.

---

### 3. Team = Collaboration d'agents

Une **Team** orchestre plusieurs agents pour une tâche complexe :
- **Agent lead** : Coordonne les autres
- **Agents spécialisés** : Chacun fait sa partie
- **Workflow** : Séquence ou parallèle

**Analogie** : Une équipe de projet. Le Product Owner (lead) coordonne le dev, le designer et le QA.

```
Team "CourseGeneration"
├─ Agent Lead : "Pédago" (définit la structure)
├─ Agent Worker 1 : "CourseBuilder" (génère le contenu)
└─ Agent Worker 2 : "QA Reviewer" (valide la qualité)
```

**Workflow** :
```
Pédago définit structure (niveaux, chapitres)
    ↓
CourseBuilder génère contenu pour chaque niveau (parallèle)
    ↓
QA Reviewer vérifie cohérence et qualité
    ↓
Résultat final
```

---

### 4. LLM = Outil cognitif

Le **LLM** est l'outil principal des agents Agno :
- **Raisonnement** : Analyser, classifier, comparer
- **Génération** : Créer du contenu structuré
- **Extraction** : Parser des données non structurées

**Point crucial** : Le LLM n'est **pas l'agent**. L'agent **utilise** le LLM comme un outil.

```
Agent = Cerveau (stratégie, décisions)
LLM = Outil cognitif (traitement du langage)
Skills = Mains (exécution)
```

---

## 🏗️ Architecture d'un Agent Agno

### Anatomie complète

```python
from agno import Agent, Skill

class ClassifierAgent(Agent):
    """
    Agent spécialisé dans la classification de contenus techniques.
    
    Responsabilité : Analyser des articles/repos et les classifier par
    sujet, impact et pertinence.
    """
    
    def __init__(self, llm, taxonomy_config):
        super().__init__(
            name="Classifier",  # Nom unique
            role="Classifier des articles techniques",  # Description du rôle
            llm=llm,  # Client LLM (OpenAI, Anthropic, etc.)
            # Optionnel :
            instructions="Tu es un expert en veille technologique IA...",
            temperature=0.3,  # Peu créatif = cohérence
        )
        
        # État interne de l'agent
        self.taxonomy = taxonomy_config
        self.last_tokens_used = 0
        
        # Enregistrer les skills
        self.add_skill(ExtractKeywordsSkill(llm))
        self.add_skill(MapToTaxonomySkill(taxonomy_config))
        self.add_skill(AssessImpactSkill(llm))
    
    async def classify_batch(self, items: list[dict]) -> list[dict]:
        """
        Méthode publique de l'agent : classifier plusieurs items.
        
        Flow :
        1. Appeler skill "extract_keywords" sur chaque item
        2. Appeler skill "map_to_taxonomy" avec les keywords
        3. Appeler skill "assess_impact" pour chaque item
        4. Consolider les résultats
        """
        results = []
        
        for item in items:
            # Utiliser les skills
            keywords = await self.run_skill("extract_keywords", item["content"])
            subject = await self.run_skill("map_to_taxonomy", keywords)
            impact = await self.run_skill("assess_impact", item["content"])
            
            results.append({
                "id": item["id"],
                "subject": subject,
                "impact": impact,
                "keywords": keywords
            })
        
        return results
```

**Points clés de l'architecture** :

1. **Héritage de `Agent`** : Donne accès aux méthodes Agno (run_skill, chat, etc.)
2. **État interne** : L'agent peut mémoriser des infos (tokens, coûts, contexte)
3. **Composition par Skills** : L'agent ajoute des skills spécialisés
4. **Méthodes publiques** : Interface claire pour interagir avec l'agent

---

## 🎨 Design de Skills (bonnes pratiques)

### Principe 1 : Un Skill = Une transformation

❌ **Mauvais** (skill fourre-tout) :
```python
class ProcessItemSkill(Skill):
    async def execute(self, item):
        keywords = self.extract_keywords(item)
        subject = self.classify(keywords)
        summary = self.summarize(item)
        return {"keywords": keywords, "subject": subject, "summary": summary}
```

✅ **Bon** (skills atomiques) :
```python
class ExtractKeywordsSkill(Skill):
    async def execute(self, text: str) -> list[str]:
        # Une seule responsabilité
        pass

class ClassifyByKeywordsSkill(Skill):
    async def execute(self, keywords: list[str]) -> str:
        pass

class SummarizeSkill(Skill):
    async def execute(self, text: str, max_words: int = 150) -> str:
        pass
```

**Bénéfices** :
- Réutilisable (plusieurs agents peuvent utiliser `ExtractKeywordsSkill`)
- Testable (tester chaque skill indépendamment)
- Debuggable (logs clairs par skill)

---

### Principe 2 : Skills avec état vs sans état

**Skill sans état** (stateless) :
```python
class ExtractKeywordsSkill(Skill):
    """Skill pur : même input → même output"""
    
    async def execute(self, text: str) -> list[str]:
        # Pas d'état interne, réutilisable partout
        response = await self.llm.chat(...)
        return self.parse(response)
```

**Skill avec état** (stateful) :
```python
class IncrementalSummarySkill(Skill):
    """Skill avec mémoire : garde le contexte entre appels"""
    
    def __init__(self, llm):
        super().__init__(llm)
        self.context = []  # État interne
    
    async def execute(self, new_text: str) -> str:
        self.context.append(new_text)
        # Résumer en tenant compte du contexte accumulé
        full_text = "\n\n".join(self.context)
        return await self.summarize(full_text)
```

**Quand utiliser quel type** :
- **Stateless** : Par défaut (plus simple, réutilisable)
- **Stateful** : Quand le skill doit mémoriser (ex : conversation multi-tours, accumulation de contexte)

---

### Principe 3 : Composition de Skills

Un skill peut **utiliser d'autres skills** :

```python
class AnalyzeArticleSkill(Skill):
    """Skill composite : utilise plusieurs sous-skills"""
    
    def __init__(self, llm, taxonomy):
        super().__init__(llm)
        self.extract_keywords = ExtractKeywordsSkill(llm)
        self.map_taxonomy = MapToTaxonomySkill(taxonomy)
        self.assess_impact = AssessImpactSkill(llm)
    
    async def execute(self, article: str) -> dict:
        # Orchestrer les sous-skills
        keywords = await self.extract_keywords.execute(article)
        subject = await self.map_taxonomy.execute(keywords)
        impact = await self.assess_impact.execute(article)
        
        return {
            "subject": subject,
            "impact": impact,
            "keywords": keywords
        }
```

**Quand composer** : Quand un workflow de skills est réutilisé souvent → créer un skill composite.

---

## 🚀 Les 6 Agents d'Argos

### 1. Agent Classifier

**Rôle** : Classifier des items de veille par sujet, impact, pertinence

**Skills** :
- `extract_keywords(text)` → list[str]
- `map_to_taxonomy(keywords)` → str (sujet)
- `assess_impact(text)` → str (High/Medium/Low)
- `calculate_relevance(text, user_stack)` → int (0-10)

**Outil principal** : GPT-3.5-turbo (économique pour classification)

**Prompt système** :
```
Tu es un expert en veille technologique IA.
Ton rôle : classifier des articles par sujet, impact et pertinence.
Taxonomie : MCP, RAG, Multi-agents, n8n, Embeddings, Fine-tuning, Autre
Impact : High (révolutionnaire), Medium (intéressant), Low (marginal)
```

**Méthode publique** :
```python
async def classify_batch(items: list[dict], context: str) -> list[dict]
```

---

### 2. Agent Comparer

**Rôle** : Comparer une nouvelle techno avec le stack actuel de l'utilisateur

**Skills** :
- `identify_alternatives(new_tech, user_stack)` → list[str]
- `compare_features(tech1, tech2)` → dict (tableau comparatif)
- `highlight_differentiators(comparison)` → str (analyse)

**Outil principal** : Claude Sonnet (meilleur pour comparaisons nuancées)

**Prompt système** :
```
Tu es un architecte solutions IA.
Ton rôle : comparer une nouvelle technologie avec les alternatives existantes.
Format : tableau comparatif + recommandations situées.
```

**Méthode publique** :
```python
async def compare_with_stack(item_id: int, user_stack: list[str]) -> dict
```

---

### 3. Agent Pédago

**Rôle** : Analyser un sujet et définir une progression pédagogique

**Skills** :
- `define_learning_objectives(topic, level)` → list[str]
- `identify_prerequisites(topic, level)` → list[str]
- `design_curriculum(topic)` → dict (chapitres, durée)

**Outil principal** : Claude Sonnet (conception pédagogique requiert nuance)

**Prompt système** :
```
Tu es un expert en ingénierie pédagogique pour contenus techniques.
Ton rôle : structurer un parcours d'apprentissage progressif (débutant → avancé).
Principes : progression logique, exemples concrets, pratique immédiate.
```

**Méthode publique** :
```python
async def design_course_structure(topic: str) -> dict
# Retourne : {
#   "beginner": {"objectives": [...], "chapters": [...], "duration_hours": 2},
#   "intermediate": {...},
#   "advanced": {...}
# }
```

---

### 4. Agent CourseBuilder

**Rôle** : Générer le contenu concret d'un cours (texte, exemples, TP, quizz)

**Skills** :
- `generate_introduction(topic, level)` → str (markdown)
- `explain_concepts(concepts, level)` → str (markdown)
- `create_examples(concept, level)` → list[dict] (code + explication)
- `design_mini_tp(topic, level)` → dict (énoncé + solution)
- `generate_quiz(topic, level)` → list[dict] (questions + réponses)

**Outil principal** : Claude Sonnet (qualité max pour génération)

**Prompt système** :
```
Tu es un formateur technique expert.
Ton rôle : créer des contenus pédagogiques clairs, engageants, avec exemples concrets.
Style : tutoriel progressif, analogies, code commenté, format Markdown.
```

**Méthode publique** :
```python
async def generate_course_content(structure: dict, level: str) -> str
# Retourne : Markdown complet du cours
```

---

### 5. Agent QA Reviewer

**Rôle** : Vérifier la qualité d'un cours généré (cohérence, hallucinations)

**Skills** :
- `check_coherence(course_beginner, course_intermediate, course_advanced)` → list[dict] (issues)
- `detect_hallucinations(course, facts_db)` → list[dict] (infos douteuses)
- `verify_code_syntax(code_snippets)` → list[dict] (erreurs)
- `check_progression(courses)` → float (score 0-10)

**Outil principal** : Claude Sonnet (détection d'hallucinations = raisonnement complexe)

**Prompt système** :
```
Tu es un QA technique spécialisé en contenu pédagogique.
Ton rôle : détecter les incohérences, hallucinations, erreurs de code.
Sois critique mais constructif.
```

**Méthode publique** :
```python
async def review_course(courses: dict[str, str]) -> dict
# Retourne : {
#   "overall_quality": 8.5,
#   "issues": [...],
#   "recommendation": "Approved with minor revisions"
# }
```

---

### 6. Agent RAG Responder

**Rôle** : Répondre aux questions en s'appuyant sur la base de connaissances

**Skills** :
- `search_relevant_chunks(query, lancedb)` → list[dict] (chunks + scores)
- `rerank_results(chunks, query)` → list[dict] (chunks triés)
- `synthesize_answer(query, chunks)` → str (réponse)
- `cite_sources(answer, chunks)` → str (réponse + sources)

**Outil principal** : GPT-3.5-turbo (RAG simple) ou Claude si complexe

**Prompt système** :
```
Tu es un assistant pédagogique spécialisé en IA.
Ton rôle : répondre aux questions en t'appuyant UNIQUEMENT sur les chunks fournis.
Règles : citer les sources, avouer si pas d'info, être concis (300 mots max).
```

**Méthode publique** :
```python
async def answer_question(query: str, top_k: int = 5) -> dict
# Retourne : {
#   "answer": "...",
#   "sources": [{"course_id": 1, "chapter": "..."}, ...],
#   "confidence": 0.87
# }
```

---

## 🎭 Collaboration entre agents (Teams)

### Pattern 1 : Séquentiel (Pipeline)

```python
class CourseGenerationTeam:
    """Team séquentielle pour générer un cours complet"""
    
    def __init__(self):
        self.pedago = PedagoAgent(llm_claude)
        self.builder = CourseBuilderAgent(llm_claude)
        self.qa = QAReviewerAgent(llm_claude)
    
    async def generate_course(self, topic: str) -> dict:
        # Étape 1 : Définir la structure
        structure = await self.pedago.design_course_structure(topic)
        
        # Étape 2 : Générer le contenu pour chaque niveau
        courses = {}
        for level in ["beginner", "intermediate", "advanced"]:
            courses[level] = await self.builder.generate_course_content(
                structure[level], 
                level
            )
        
        # Étape 3 : QA Review
        qa_result = await self.qa.review_course(courses)
        
        return {
            "courses": courses,
            "qa": qa_result
        }
```

**Workflow** :
```
Pédago → CourseBuilder (beginner) → CourseBuilder (intermediate) → 
CourseBuilder (advanced) → QA Reviewer → Résultat
```

---

### Pattern 2 : Parallèle (Fan-out / Fan-in)

```python
import asyncio

class ParallelCourseGenerationTeam:
    """Team parallèle pour générer les 3 niveaux en même temps"""
    
    async def generate_course(self, topic: str) -> dict:
        # Étape 1 : Structure (séquentiel)
        structure = await self.pedago.design_course_structure(topic)
        
        # Étape 2 : Génération parallèle des 3 niveaux
        tasks = [
            self.builder.generate_course_content(structure["beginner"], "beginner"),
            self.builder.generate_course_content(structure["intermediate"], "intermediate"),
            self.builder.generate_course_content(structure["advanced"], "advanced"),
        ]
        courses_list = await asyncio.gather(*tasks)
        
        courses = {
            "beginner": courses_list[0],
            "intermediate": courses_list[1],
            "advanced": courses_list[2]
        }
        
        # Étape 3 : QA (séquentiel)
        qa_result = await self.qa.review_course(courses)
        
        return {"courses": courses, "qa": qa_result}
```

**Workflow** :
```
Pédago
    ↓
┌───────────┬──────────────┬────────────┐
│ Builder   │ Builder      │ Builder    │
│ (beginner)│ (intermediate)│ (advanced) │
└───────────┴──────────────┴────────────┘
    ↓
QA Reviewer → Résultat
```

**Gain de temps** : ~3x plus rapide (si les 3 appels prennent 30s chacun, total = 30s au lieu de 90s)

---

## 🎓 Ce que tu DOIS retenir

### Hiérarchie conceptuelle

```
Team (Orchestration)
    ↓
Agent (Rôle + Stratégie)
    ↓
Skill (Capacité atomique)
    ↓
LLM / DB / API (Outils)
```

### Principes de design

1. **Un Agent = Un rôle clair** : Pas d'agents fourre-tout
2. **Un Skill = Une transformation** : Input → Output, mono-responsabilité
3. **Skills réutilisables** : Plusieurs agents peuvent partager des skills
4. **Teams pour workflows complexes** : Séquentiel ou parallèle selon le besoin
5. **LLM = Outil, pas agent** : L'agent décide, le LLM exécute

### Les 6 agents d'Argos

| Agent | Rôle | Skills clés | LLM |
|-------|------|-------------|-----|
| **Classifier** | Classifier items | extract_keywords, map_to_taxonomy | GPT-3.5 |
| **Comparer** | Comparer technos | identify_alternatives, compare_features | Claude |
| **Pédago** | Structurer cours | define_objectives, design_curriculum | Claude |
| **CourseBuilder** | Générer contenu | generate_introduction, create_examples | Claude |
| **QA Reviewer** | Vérifier qualité | check_coherence, detect_hallucinations | Claude |
| **RAG Responder** | Répondre questions | search_chunks, synthesize_answer | GPT-3.5 |

---

## 🔗 Ressources

- [Documentation officielle Agno](https://agno.dev)
- [Exemples d'agents](https://github.com/agno/examples)
- [Notre dossier agents](../mcp_server/agents/) (à créer)

---

## ✅ Checklist avant de coder

- [ ] Je comprends la différence entre Agent, Skill, et Tool
- [ ] Je sais quand créer un nouveau Skill vs réutiliser un existant
- [ ] Je comprends les benefits de la composition (skills atomiques)
- [ ] Je sais orchestrer des agents en séquentiel et en parallèle
- [ ] Je comprends que le LLM est un outil, pas l'intelligence de l'agent

**Si ces 5 points sont clairs, tu es prêt à construire tes agents Agno ! 🤖**

---

[← Synthèse MCP](synthese_mcp.md) | [Retour à l'index](README.md) | [Guide de lecture →](guide_lecture_syntheses.md)
