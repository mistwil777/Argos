"""
High-Quality Course Generator from Single Item

Generates comprehensive pedagogical courses in French from classified items.
Uses RAG (Retrieval Augmented Generation) for enriched content.
"""
import logging
import asyncio
from typing import Dict, Any, Optional

from mcp_server.config import settings
from mcp_server.database import DatabaseManager
from mcp_server.services.llm_provider import create_llm_provider
from mcp_server.services.vector_store_singleton import get_vector_store
from mcp_server.services.pdf_generator import generate_pdf_background

logger = logging.getLogger(__name__)

# Comprehensive French course generation prompt
FRENCH_COURSE_PROMPT = """OBJECTIF : Créer un cours complet, pédagogique et professionnel en français sur le sujet mentionné, avec le même niveau de qualité que le cours "Vision par Ordinateur : Fondamentaux".

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
                        id, title, url, summary, source_type,
                        classification_status, subject, importance,
                        content, item_type
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
                    "description": row[3],  # summary mapped to description
                    "source": row[4],  # source_type
                    "classification_status": row[5],
                    "subject": row[6],
                    "importance": row[7],
                    "content": row[8],
                    "item_type": row[9],
                    "reasoning": ""  # No reasoning column in DB
                }
        
        if item["classification_status"] != "classified":
            return {"error": f"Item {item_id} is not classified yet (status: {item['classification_status']})"}
        
        # Use item_type or extract from title if subject is empty
        if not item.get("subject"):
            item["subject"] = item.get("item_type", "AI/Tech")
        
        logger.info(f"📚 Step 1/4: Indexing item content into RAG...")
        
        # 2. Index the item content into RAG for retrieval (now using Bedrock embeddings!)
        vector_store = None
        try:
            # Use singleton to avoid reloading embedding model
            vector_store = get_vector_store()
            
            # Index the item (combines title + summary + content)
            # Wrap synchronous call in thread to avoid blocking event loop
            await asyncio.to_thread(
                vector_store.index_item,
                {
                    "id": item_id,
                    "title": item["title"],
                    "summary": f"{item.get('description', '')}\n\n{item.get('content', '')[:2000]}"  # First 2000 chars of content
                }
            )
            
            logger.info(f"✅ Item {item_id} indexed into RAG")
        except Exception as e:
            logger.warning(f"⚠️ RAG indexing failed (continuing without RAG): {e}")
        
        logger.info(f"🔍 Step 2/4: Retrieving relevant context from RAG...")
        
        # 3. Retrieve relevant context using RAG (powered by Bedrock Titan Embeddings!)
        rag_context = ""
        search_results = []
        try:
            if vector_store is not None:
                # Search for related content
                search_query = f"Informations détaillées sur {item['title']} - {item.get('subject', '')} - concepts, architectures, applications pratiques"
                # Wrap synchronous call in thread to avoid blocking event loop
                search_results = await asyncio.to_thread(
                    vector_store.search,
                    query=search_query,
                    limit=5
                )
            
            if search_results:
                rag_context = "\n\n---\n\n".join([
                    f"**Source {i+1}** (score: {result.get('_distance', 0):.3f}):\n{result.get('chunk_text', '')[:500]}..."
                    for i, result in enumerate(search_results)
                ])
                logger.info(f"✅ Retrieved {len(search_results)} relevant documents from RAG")
            else:
                logger.info("⚠️ No relevant documents found in RAG (this is normal if it's the first item)")
        except Exception as e:
            logger.warning(f"⚠️ RAG retrieval failed (continuing without context): {e}")
        
        logger.info(f"📝 Step 3/4: Generating course content with LLM...")
        
        # 4. Build comprehensive French prompt with RAG context
        prompt = FRENCH_COURSE_PROMPT.format(
            title=item["title"],
            url=item.get("url", "N/A"),
            description=item.get("description", ""),
            subject=item.get("subject", "Unknown"),
            importance=item.get("importance", "Medium"),
            duration_minutes=duration_minutes
        )
        
        # Add RAG context if available
        if rag_context:
            prompt += f"\n\n**CONTEXTE ADDITIONNEL DEPUIS LA BASE DE CONNAISSANCES**:\n\n{rag_context}\n\nUtilise ces informations pour enrichir le cours avec des détails techniques précis."
        
        # 5. Generate content using LLM provider
        # Determine model based on provider
        if settings.llm_provider == "aws":
            model = settings.aws_bedrock_model
        elif settings.llm_provider == "anthropic":
            model = settings.default_classification_model  # Fallback to default
        else:  # openai
            model = settings.default_classification_model
        
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id if settings.llm_provider == "aws" else None,
            aws_secret_access_key=settings.aws_secret_access_key if settings.llm_provider == "aws" else None,
            aws_region=settings.aws_region if settings.llm_provider == "aws" else None,
            openai_api_key=settings.openai_api_key if settings.llm_provider == "openai" else None,
            model=model
        )
        
        logger.info(f"🤖 Generating course using {settings.llm_provider} provider with model {model}")
        
        # Split prompt into system and user parts
        system_prompt = "Tu es un expert pédagogique spécialisé en IA et technologies émergentes. Tu crées des cours complets, pédagogiques et professionnels en français avec le même niveau de qualité que le cours 'Vision par Ordinateur : Fondamentaux'. Tu utilises le contexte fourni pour enrichir le cours avec des informations techniques précises."
        
        # Generate with high token limit for comprehensive content
        content, usage = await llm_provider.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=10000,  # Max for AWS Bedrock Nova
            temperature=0.7    # Creative but focused
        )
        
        course_content = content
        tokens_used = usage.get("total_tokens", 0)
        prompt_tokens = usage.get("prompt_tokens", 0)
        completion_tokens = usage.get("completion_tokens", 0)
        cost = llm_provider.calculate_cost(prompt_tokens, completion_tokens)
        
        logger.info(f"✅ Generated {len(course_content)} characters, {tokens_used} tokens, ${cost:.4f}")
        logger.info(f"💾 Step 4/4: Saving course to database...")
        
        # 6. Save course to database
        course_updated = False
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Check if a course already exists for this item and level
                cur.execute("""
                    SELECT id FROM courses 
                    WHERE item_id = %s AND level = %s
                """, (item_id, "intermediate"))
                existing_course = cur.fetchone()
                
                # Generate course title from item title (remove generic template)
                course_title = item["title"]
                
                if existing_course:
                    # Update existing course
                    course_updated = True
                    logger.info(f"🔄 Updating existing course ID {existing_course[0]} for item {item_id}")
                    cur.execute("""
                        UPDATE courses 
                        SET title = %s,
                            subject = %s,
                            content = %s,
                            estimated_duration_minutes = %s,
                            updated_at = NOW(),
                            status = %s,
                            qa_score = %s
                        WHERE id = %s
                        RETURNING id
                    """, (
                        course_title,
                        item['subject'],
                        course_content,
                        duration_minutes,
                        "draft",  # Reset to draft for review
                        5.0,  # Reset QA score
                        existing_course[0]
                    ))
                    course_id = existing_course[0]
                else:
                    # Insert new course
                    logger.info(f"📝 Creating new course for item {item_id}")
                    cur.execute("""
                        INSERT INTO courses 
                        (item_id, title, subject, level, content, estimated_duration_minutes, status, qa_score)
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                        RETURNING id
                    """, (
                        item_id,
                        course_title,
                        item['subject'],
                        "intermediate",  # Default level
                        course_content,
                        duration_minutes,
                        "draft",  # Start as draft for review
                        5.0  # Initial QA score (0-10 scale)
                        ))
                    course_id = cur.fetchone()[0]
                
                # Record decision for cost tracking
                # Note: Skipping decision logging - decision_type constraint doesn't allow "course_generation"
                # TODO: Add course_generation to decision_type CHECK constraint in DB migration
                # cur.execute("""
                #     INSERT INTO decisions 
                #     (item_id, decision_type, decision, tokens_used, cost_usd, decided_by)
                #     VALUES (%s, %s, %s, %s, %s, %s)
                # """, (
                #     item_id,
                #     "item_validation",  # Using existing type as workaround
                #     "approve",  # Required field
                #     tokens_used,
                #     cost,
                #     "system"  # decided_by is required
                # ))
                
                conn.commit()
        
        logger.info(f"🎉 Course {course_id} generated successfully from item {item_id} with RAG enrichment")
        
        # Generate PDF in background (non-blocking)
        asyncio.create_task(
            _generate_pdf_for_course(course_id, course_title, course_content)
        )
        
        return {
            "course_id": course_id,
            "item_id": item_id,
            "title": course_title,
            "subject": item['subject'],
            "duration_minutes": duration_minutes,
            "content_length": len(course_content),
            "tokens_used": tokens_used,
            "cost": cost,
            "rag_enabled": bool(rag_context),
            "rag_sources_count": len(search_results) if search_results else 0,
            "updated": course_updated,
            "status": "draft"
        }
        
    except Exception as e:
        logger.error(f"❌ Error generating course from item {item_id}: {e}", exc_info=True)
        return {"error": str(e)}


async def _generate_pdf_for_course(course_id: int, title: str, content: str):
    """Helper to generate PDF in background after course creation."""
    try:
        pdf_path = await generate_pdf_background(course_id, title, content)
        if pdf_path:
            logger.info(f"✅ PDF generated for course {course_id}: {pdf_path}")
        else:
            logger.warning(f"⚠️ PDF generation skipped/failed for course {course_id}")
    except Exception as e:
        logger.error(f"❌ Background PDF generation failed for course {course_id}: {e}")
