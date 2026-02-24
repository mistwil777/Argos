"""
High-Quality Course Generator from Single Item

Generates comprehensive pedagogical courses in French from classified items.
Uses the Computer Vision course as quality template.
"""
import logging
from typing import Dict, Any, Optional

from mcp_server.config import settings
from mcp_server.database import DatabaseManager
from mcp_server.services.llm_provider import create_llm_provider

logger = logging.getLogger(__name__)

# Comprehensive French course generation prompt
FRENCH_COURSE_PROMPT = """Tu es un expert pédagogique spécialisé en IA et technologies émergentes.

OBJECTIF : Créer un cours complet, pédagogique et professionnel en français sur le sujet mentionné, avec le même niveau de qualité que le cours "Vision par Ordinateur : Fondamentaux".

INFORMATIONS SOURCE :
Titre : {title}
URL : {url}
Description : {description}
Sujet : {subject}
Importance : {importance}

STRUCTURE EXACTE REQUISE (5000+ mots) :

# 🎨 [Titre accrocheur avec emoji pertinent]

## 📋 Table des Matières
[Liste numérotée de 8-10 sections principales]

## 🌟 Introduction

Rédiger une introduction captivante avec :
- Une définition claire et accessible du sujet
- Une analogie concrète du quotidien
- Le contexte et l'importance du sujet dans l'IA moderne

### 🎯 Objectifs d'apprentissage
À la fin de ce cours, vous serez capable de :
1. [Objectif mesurable et concret]
2. [Objectif mesurable et concret]
3. [Objectif mesurable et concret]
4. [Objectif mesurable et concret]

### 📊 Prérequis
- [Prérequis 1 avec niveau requis]
- [Prérequis 2 avec niveau requis]
- [Prérequis 3 avec niveau requis]

## 🧠 Concepts Fondamentaux

[3-5 sous-sections détaillées sur les concepts clés]

### 1. [Nom du Premier Concept]

💡 **Définition** : [Explication claire et précise en 2-3 phrases]

**Analogie** : [Comparaison du quotidien qui rend le concept accessible]

**Exemple concret en Python** :
```python
# [Commentaire expliquant le contexte]
[Code Python pertinent et commenté (10-15 lignes)]
```

💡 **Importance** : 
- [Raison 1 pourquoi c'est crucial]
- [Raison 2 avec exemple concret]
- [Raison 3 avec application pratique]

[Répéter pour 3-5 concepts fondamentaux]

## 🏗️ Architectures et Approches Techniques

[Présenter 3-4 architectures ou approches majeures du domaine]

### [Nom de l'Architecture 1]

- **Description** : [Fonctionnement détaillé]
- **Caractéristiques clés** : [3-4 points]
- **Innovations** : [Ce qui la rend unique]
- **Cas d'usage** : [Où elle excelle]

[Répéter pour 3-4 architectures]

## 🎨 Techniques Avancées

[Présenter 3-4 techniques avancées du domaine]

## 🔬 Applications Pratiques

Présenter **5 applications concrètes** dans différents domaines :

### 1. [Domaine d'application 1]
- **Application** : [Description]
- **Exemple réel** : [Entreprise ou projet]
- **Impact** : [Résultats mesurables]

[Répéter pour 4 autres domaines]

## 🛠️ Outils et Frameworks

Présenter les outils essentiels :

### [Outil/Framework 1]

**Description** : [Ce que c'est]

**Installation** :
```bash
pip install [package]
```

**Exemple d'utilisation** :
```python
[Code Python commenté (15-20 lignes)]
```

[Répéter pour 2-3 outils majeurs]

## 📝 Exercices Pratiques

### Niveau Débutant : [Titre]
**Objectif** : [Compétence à développer]
**Énoncé** : [Description détaillée]
**Résultat attendu** : [Métriques de succès]

### Niveau Intermédiaire : [Titre]
[Même structure, exercice plus complexe]

### Niveau Avancé : [Titre]
[Exercice challengeant]

## 🎓 Résumé et Points Clés

**Concepts essentiels à retenir** :
- 📌 [Point clé 1]
- 📌 [Point clé 2]
- 📌 [Point clé 3]
- 📌 [Point clé 4]
- 📌 [Point clé 5]

## 🎯 Quiz Final

**Question 1** : [Question conceptuelle]
**Réponse** : [Réponse détaillée avec explication]

**Question 2** : [Question technique]
**Réponse** : [Réponse détaillée]

**Question 3** : [Question d'application]
**Réponse** : [Réponse détaillée]

## 📚 Ressources Complémentaires

**Livres recommandés** :
- [Titre] - [Auteur] : [Pourquoi le lire]

**Cours en ligne** :
- [Nom du cours] : [Description]

**Papers de référence** :
- [Titre] ([Année]) : [Contribution]

**Datasets** :
- [Nom] : [Description]

---

**⏱️ Durée estimée** : {duration_minutes} minutes

**🎉 Félicitations ! Vous avez terminé ce cours !**

CONTRAINTES CRITIQUES :
- **Longueur** : MINIMUM 5000 mots
- **Langue** : UNIQUEMENT français
- **Ton** : Pédagogique mais rigoureux
- **Code** : Python avec commentaires français
- **Progression** : Du simple au complexe
- **Exemples** : Concrets et actuels
- **Analogies** : Créatives et pertinentes

Génère maintenant le cours complet."""


async def generate_course_from_item(
    item_id: int,
    duration_minutes: int = 180,
    language: str = "fr"
) -> Dict[str, Any]:
    """
    Generate a high-quality pedagogical course from a classified item.
    
    Args:
        item_id: ID of the classified item
        duration_minutes: Target duration (default: 180 minutes)
        language: Course language (default: "fr" for French)
    
    Returns:
        Dict with course_id, tokens_used, cost, and other metadata
    """
    logger.info(f"Generating course from item {item_id} in language '{language}'")
    
    try:
        db = DatabaseManager(settings.database_url)
        
        # 1. Fetch item details
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, title, url, description, source,
                        classification_status, subject, importance,
                        reasoning, content
                    FROM items
                    WHERE id = %s
                """, (item_id,))
                
                row = cur.fetchone()
                if not row:
                    return {"error": f"Item {item_id} not found"}
                
                item = {
                    "id": row[0],
                    "title": row[1],
                    "url": row[2],
                    "description": row[3],
                    "source": row[4],
                    "classification_status": row[5],
                    "subject": row[6],
                    "importance": row[7],
                    "reasoning": row[8],
                    "content": row[9]
                }
        
        if item["classification_status"] != "classified":
            return {"error": f"Item {item_id} is not classified yet (status: {item['classification_status']})"}
        
        # 2. Build comprehensive French prompt
        prompt = FRENCH_COURSE_PROMPT.format(
            title=item["title"],
            url=item.get("url", "N/A"),
            description=item.get("description", ""),
            subject=item.get("subject", "Unknown"),
            importance=item.get("importance", "Medium"),
            duration_minutes=duration_minutes
        )
        
        # 3. Generate content using LLM provider
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id if settings.llm_provider == "aws" else None,
            aws_secret_access_key=settings.aws_secret_access_key if settings.llm_provider == "aws" else None,
            aws_region=settings.aws_region if settings.llm_provider == "aws" else None,
            anthropic_api_key=settings.anthropic_api_key if settings.llm_provider == "anthropic" else None,
            openai_api_key=settings.openai_api_key if settings.llm_provider == "openai" else None,
            model=settings.claude_model if settings.llm_provider == "anthropic" else settings.openai_model
        )
        
        logger.info(f"Generating course content using {settings.llm_provider} provider")
        
        # Generate with high token limit for comprehensive content
        response = await llm_provider.generate(
            prompt=prompt,
            max_tokens=16000,  # Long course content
            temperature=0.7    # Creative but focused
        )
        
        course_content = response["content"]
        tokens_used = response.get("tokens_used", 0)
        cost = response.get("cost", 0.0)
        
        logger.info(f"Generated {len(course_content)} characters, {tokens_used} tokens, ${cost:.4f}")
        
        # 4. Save course to database
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Insert course
                cur.execute("""
                    INSERT INTO courses 
                    (item_id, title, subject, content, duration, status, qa_score)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    item_id,
                    f"{item['subject']}: Fondamentaux et Applications",
                    item['subject'],
                    course_content,
                    duration_minutes,
                    "draft",  # Start as draft for review
                    0.0  # QA score calculated later
                ))
                
                course_id = cur.fetchone()[0]
                
                # Record decision for cost tracking
                cur.execute("""
                    INSERT INTO decisions 
                    (item_id, decision_type, tokens_used, cost, model_used)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    item_id,
                    "course_generation",
                    tokens_used,
                    cost,
                    f"{settings.llm_provider}:{settings.claude_model if settings.llm_provider == 'anthropic' else settings.openai_model}"
                ))
                
                conn.commit()
        
        logger.info(f"✅ Course {course_id} generated successfully from item {item_id}")
        
        return {
            "course_id": course_id,
            "item_id": item_id,
            "title": f"{item['subject']}: Fondamentaux et Applications",
            "subject": item['subject'],
            "duration_minutes": duration_minutes,
            "content_length": len(course_content),
            "tokens_used": tokens_used,
            "cost": cost,
            "status": "draft"
        }
        
    except Exception as e:
        logger.error(f"❌ Error generating course from item {item_id}: {e}", exc_info=True)
        return {"error": str(e)}
