#!/usr/bin/env python3
"""
Script to seed the database with test data for validation.
"""
import sys
import os
from datetime import datetime, timedelta
import random

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from argos.database import DatabaseManager
from argos.config import settings

def seed_items(db: DatabaseManager):
    """Seed test items."""
    print("📦 Seeding items...")
    
    items_data = [
        {
            "title": "GPT-4 Turbo with Vision: Multimodal AI",
            "content": "OpenAI has announced GPT-4 Turbo with Vision, a significant upgrade to their flagship model. This new version can process both text and images, enabling applications like visual question answering and image analysis. The model features a 128K context window and is more cost-effective than previous versions.",
            "summary": "OpenAI releases GPT-4 Turbo with enhanced vision capabilities, processing both text and images.",
            "url": "https://openai.com/blog/gpt-4-turbo-vision",
            "source_type": "rss",
            "source_url": "https://openai.com/blog/rss",
            "subject": "Large Language Models",
            "importance": "High",
            "classification_status": "classified",
            "published_at": datetime.now() - timedelta(days=2)
        },
        {
            "title": "Stable Diffusion XL 1.0: Next-Gen Image Generation",
            "content": "Stability AI has unveiled SDXL 1.0, representing a major leap in open-source image generation. The model demonstrates improved image quality, better composition understanding, and enhanced text rendering capabilities. It features a refined architecture and training methodology.",
            "summary": "Stability AI unveils SDXL 1.0 with improved image quality and composition understanding.",
            "url": "https://stability.ai/blog/sdxl-1-0",
            "source_type": "rss",
            "source_url": "https://stability.ai/rss",
            "subject": "Computer Vision",
            "importance": "High",
            "classification_status": "classified",
            "published_at": datetime.now() - timedelta(days=3)
        },
        {
            "title": "LangChain 0.1.0: Production-Ready LLM Framework",
            "content": "LangChain has reached its stable 1.0 release, marking a significant milestone for the popular LLM framework. This version includes improved APIs, better documentation, and production-ready features for building robust LLM applications. The update focuses on stability and developer experience.",
            "summary": "LangChain releases stable 1.0 version with improved APIs for building LLM applications.",
            "url": "https://blog.langchain.dev/langchain-v0-1-0",
            "source_type": "github",
            "source_url": "https://github.com/langchain-ai/langchain",
            "subject": "ML Frameworks",
            "importance": "Medium",
            "classification_status": "classified",
            "published_at": datetime.now() - timedelta(days=1)
        },
        {
            "title": "Mistral 7B: Efficient Open-Source LLM",
            "content": "Mistral AI has released Mistral 7B, a compact yet powerful open-source language model. Despite having only 7 billion parameters, it outperforms many larger models on various benchmarks. The model is available for download and can run on consumer hardware.",
            "summary": "Mistral AI releases compact 7B parameter model outperforming larger models.",
            "url": "https://mistral.ai/news/announcing-mistral-7b",
            "source_type": "rss",
            "source_url": "https://mistral.ai/rss",
            "subject": "Large Language Models",
            "importance": "High",
            "classification_status": "pending",
            "published_at": datetime.now() - timedelta(hours=12)
        },
        {
            "title": "AutoGPT: Autonomous AI Agents Framework",
            "content": "AutoGPT is a groundbreaking framework for building autonomous AI agents powered by GPT-4. It enables agents to break down tasks, create sub-tasks, and execute them independently. The project has gained significant traction in the AI community for its potential applications.",
            "summary": "New framework for building autonomous AI agents with GPT-4.",
            "url": "https://github.com/Significant-Gravitas/AutoGPT",
            "source_type": "github",
            "source_url": "https://github.com/Significant-Gravitas/AutoGPT",
            "subject": "AI Agents",
            "importance": "Medium",
            "classification_status": "pending",
            "published_at": datetime.now() - timedelta(hours=6)
        },
        {
            "title": "Vector Database Benchmarks 2024",
            "content": "A comprehensive analysis comparing the performance of leading vector databases including Pinecone, Weaviate, and Qdrant. The benchmarks cover query latency, throughput, memory usage, and scalability. Results show varying strengths depending on use case requirements.",
            "summary": "Comprehensive performance comparison of Pinecone, Weaviate, and Qdrant.",
            "url": "https://artificialcorner.com/vector-db-benchmarks",
            "source_type": "manual",
            "source_url": "https://artificialcorner.com",
            "subject": "Vector Databases",
            "importance": "Low",
            "classification_status": "pending",
            "published_at": datetime.now() - timedelta(hours=3)
        },
        {
            "title": "Reinforcement Learning from Human Feedback (RLHF) Tutorial",
            "content": "An in-depth tutorial explaining RLHF techniques used to align large language models with human preferences. The guide covers the three-step process: supervised fine-tuning, reward model training, and reinforcement learning optimization using PPO algorithm.",
            "summary": "Deep dive into RLHF techniques used to align language models.",
            "url": "https://huggingface.co/blog/rlhf",
            "source_type": "rss",
            "source_url": "https://huggingface.co/blog/rss",
            "subject": "Machine Learning",
            "importance": "Medium",
            "classification_status": "classified",
            "published_at": datetime.now() - timedelta(days=4)
        },
        {
            "title": "LlamaIndex: Data Framework for LLM Applications",
            "content": "LlamaIndex provides a comprehensive data framework for connecting custom data sources to large language models. It offers tools for data ingestion, indexing, and retrieval, making it easier to build context-aware LLM applications with private or specialized data.",
            "summary": "Framework for connecting custom data sources to large language models.",
            "url": "https://github.com/run-llama/llama_index",
            "source_type": "github",
            "source_url": "https://github.com/run-llama/llama_index",
            "subject": "ML Frameworks",
            "importance": "Medium",
            "classification_status": "pending",
            "published_at": datetime.now() - timedelta(hours=18)
        }
    ]
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for item in items_data:
                cur.execute("""
                    INSERT INTO items (
                        title, content, summary, url, source_type, source_url,
                        subject, importance, classification_status, published_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    item["title"], item["content"], item["summary"], item["url"], 
                    item["source_type"], item["source_url"],
                    item["subject"], item["importance"], 
                    item["classification_status"], item["published_at"]
                ))
        conn.commit()
    
    print(f"✅ Inserted {len(items_data)} items")


def seed_courses(db: DatabaseManager):
    """Seed test courses."""
    print("📚 Seeding courses...")
    
    # First, get some item IDs to link courses to
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, subject FROM items 
                WHERE classification_status = 'classified' 
                ORDER BY created_at DESC
                LIMIT 4
            """)
            items = cur.fetchall()
            item_map = {row[1]: row[0] for row in items}  # subject -> id mapping
    
    courses_data = [
        {
            "title": "Introduction to Large Language Models",
            "subject": "Large Language Models",
            "level": "beginner",
            "estimated_duration_minutes": 120,
            "status": "published",
            "qa_score": 0.92,
            "item_id": item_map.get("Large Language Models", items[0][0] if items else 1),
            "content": """# Introduction to Large Language Models

## Overview
Large Language Models (LLMs) are neural networks trained on massive text corpora to understand and generate human language.

## Key Concepts
- **Transformer Architecture**: Self-attention mechanisms
- **Pre-training**: Learning from billions of tokens
- **Fine-tuning**: Adapting to specific tasks

## Popular Models
1. GPT-4 (OpenAI)
2. Claude (Anthropic)
3. LLaMA (Meta)

## Applications
- Text generation
- Question answering
- Code completion
- Translation

## Best Practices
- Use appropriate prompt engineering
- Monitor token usage
- Implement safety guardrails""",
            "published_at": datetime.now() - timedelta(days=1)
        },
        {
            "title": "Computer Vision Fundamentals with Deep Learning",
            "subject": "Computer Vision",
            "level": "intermediate",
            "estimated_duration_minutes": 180,
            "status": "published",
            "qa_score": 0.88,
            "item_id": item_map.get("Computer Vision", items[1][0] if len(items) > 1 else items[0][0] if items else 1),
            "content": """# Computer Vision Fundamentals

## Introduction
Computer vision enables machines to interpret and understand visual information.

## Core Techniques
- **Convolutional Neural Networks (CNNs)**
- **Object Detection**: YOLO, R-CNN
- **Image Segmentation**: U-Net, Mask R-CNN
- **Diffusion Models**: Stable Diffusion, DALL-E

## Applications
- Image classification
- Object detection
- Facial recognition
- Medical imaging
- Autonomous vehicles

## Tools & Frameworks
- PyTorch Vision
- TensorFlow
- OpenCV
- Hugging Face Transformers""",
            "published_at": datetime.now() - timedelta(days=2)
        },
        {
            "title": "Building LLM Applications with LangChain",
            "subject": "ML Frameworks",
            "level": "intermediate",
            "estimated_duration_minutes": 90,
            "status": "draft",
            "qa_score": 0.85,
            "item_id": item_map.get("ML Frameworks", items[2][0] if len(items) > 2 else items[0][0] if items else 1),
            "content": """# Building LLM Applications with LangChain

## What is LangChain?
A framework for developing applications powered by language models.

## Core Components
1. **Models**: LLM and Chat Model interfaces
2. **Prompts**: Template management
3. **Chains**: Combining multiple components
4. **Agents**: Dynamic tool selection
5. **Memory**: Conversation history

## Example Use Cases
- Chatbots
- Document Q&A systems
- Code assistants
- Data analysis tools

## Getting Started
```python
from langchain import OpenAI, PromptTemplate
llm = OpenAI(temperature=0.9)
```""",
            "published_at": None
        },
        {
            "title": "Machine Learning Basics: From Theory to Practice",
            "subject": "Machine Learning",
            "level": "beginner",
            "estimated_duration_minutes": 150,
            "status": "published",
            "qa_score": 0.90,
            "item_id": item_map.get("Machine Learning", items[3][0] if len(items) > 3 else items[0][0] if items else 1),
            "content": """# Machine Learning Basics

## What is Machine Learning?
ML enables computers to learn from data without explicit programming.

## Types of Learning
1. **Supervised Learning**: Labeled data
2. **Unsupervised Learning**: Pattern discovery
3. **Reinforcement Learning**: Trial and error

## Common Algorithms
- Linear Regression
- Decision Trees
- Neural Networks
- k-Nearest Neighbors

## The ML Pipeline
1. Data collection
2. Data preprocessing
3. Model training
4. Evaluation
5. Deployment

## Tools
- scikit-learn
- TensorFlow
- PyTorch""",
            "published_at": datetime.now() - timedelta(days=3)
        }
    ]
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for course in courses_data:
                cur.execute("""
                    INSERT INTO courses (
                        title, subject, level, estimated_duration_minutes,
                        status, qa_score, content, published_at, item_id
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (
                    course["title"], course["subject"], course["level"],
                    course["estimated_duration_minutes"], course["status"],
                    course["qa_score"], course["content"], course["published_at"],
                    course["item_id"]
                ))
        conn.commit()
    
    print(f"✅ Inserted {len(courses_data)} courses")


def seed_decisions(db: DatabaseManager):
    """Seed test decisions for cost tracking."""
    print("💰 Seeding decisions (for cost tracking)...")
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # Get some classified items
            cur.execute("""
                SELECT id FROM items 
                WHERE classification_status = 'classified' 
                LIMIT 4
            """)
            item_ids = [row[0] for row in cur.fetchall()]
            
            if not item_ids:
                print("⚠️  No classified items to create decisions for")
                return
            
            decisions_data = [
                {
                    "item_id": item_ids[0],
                    "decision_type": "classification_override",
                    "decision": "modify",
                    "cost_usd": 0.0023,
                    "tokens_used": 850,
                    "decided_by": "gpt-4-turbo"
                },
                {
                    "item_id": item_ids[1],
                    "decision_type": "classification_override",
                    "decision": "approve",
                    "cost_usd": 0.0019,
                    "tokens_used": 720,
                    "decided_by": "gpt-4-turbo"
                },
                {
                    "item_id": item_ids[2] if len(item_ids) > 2 else item_ids[0],
                    "decision_type": "classification_override",
                    "decision": "approve",
                    "cost_usd": 0.0025,
                    "tokens_used": 920,
                    "decided_by": "gpt-4-turbo"
                },
                {
                    "item_id": item_ids[3] if len(item_ids) > 3 else item_ids[0],
                    "decision_type": "classification_override",
                    "decision": "modify",
                    "cost_usd": 0.0021,
                    "tokens_used": 780,
                    "decided_by": "gpt-4-turbo"
                }
            ]
            
            for decision in decisions_data:
                cur.execute("""
                    INSERT INTO decisions (
                        decision_type, item_id, decision, cost_usd,
                        tokens_used, decided_by, decided_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (
                    decision["decision_type"], decision["item_id"],
                    decision["decision"], decision["cost_usd"],
                    decision["tokens_used"], decision["decided_by"],
                    datetime.now() - timedelta(hours=random.randint(1, 48))
                ))
        conn.commit()
    
    print(f"✅ Inserted {len(decisions_data)} decisions")


def seed_rag_history(db: DatabaseManager):
    """Seed RAG query history."""
    print("🔍 Seeding RAG history...")
    
    rag_queries = [
        {
            "query": "Qu'est-ce que GPT-4 Turbo ?",
            "answer": "GPT-4 Turbo est la dernière version du modèle de langage d'OpenAI, offrant des capacités multimodales (texte et vision), une fenêtre de contexte étendue jusqu'à 128K tokens, et des performances améliorées. Il est optimisé pour être plus rapide et moins coûteux que GPT-4 standard.",
            "user_identifier": "test_user",
            "created_at": datetime.now() - timedelta(hours=5)
        },
        {
            "query": "Comment fonctionne le RLHF ?",
            "answer": "Le Reinforcement Learning from Human Feedback (RLHF) est une technique d'alignement des LLMs qui utilise les retours humains pour affiner le modèle. Le processus implique : 1) Pre-training du modèle, 2) Collection de comparaisons humaines, 3) Entraînement d'un reward model, 4) Optimisation avec PPO.",
            "user_identifier": "test_user",
            "created_at": datetime.now() - timedelta(hours=12)
        },
        {
            "query": "Quelle est la différence entre Stable Diffusion et DALL-E ?",
            "answer": "Stable Diffusion est un modèle open-source qui s'exécute localement, tandis que DALL-E (OpenAI) est propriétaire et accessible via API. Stable Diffusion offre plus de contrôle et de personnalisation, tandis que DALL-E excelle en qualité et cohérence pour des usages généraux.",
            "user_identifier": "test_user",
            "created_at": datetime.now() - timedelta(days=1)
        },
        {
            "query": "Quels sont les meilleurs frameworks pour build des apps LLM ?",
            "answer": "Les principaux frameworks incluent : LangChain (orchestration complète), LlamaIndex (RAG et indexation), Haystack (NLP pipelines), et Semantic Kernel (Microsoft). Le choix dépend de vos besoins : LangChain pour la flexibilité, LlamaIndex pour la recherche documentaire.",
            "user_identifier": "test_user",
            "created_at": datetime.now() - timedelta(hours=8)
        }
    ]
    
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for query in rag_queries:
                cur.execute("""
                    INSERT INTO rag_queries (query, answer, user_identifier, created_at)
                    VALUES (%s, %s, %s, %s)
                """, (query["query"], query["answer"], query["user_identifier"], query["created_at"]))
        conn.commit()
    
    print(f"✅ Inserted {len(rag_queries)} RAG queries")


def main():
    """Main seeding function."""
    print("\n🌱 Starting database seeding...\n")
    
    db = DatabaseManager(settings.database_url)
    
    try:
        # Check if data already exists
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM items")
                item_count = cur.fetchone()[0]
                
                if item_count > 0:
                    print(f"⚠️  Database already contains {item_count} items")
                    response = input("Do you want to add more test data? (y/N): ")
                    if response.lower() != 'y':
                        print("❌ Seeding cancelled")
                        return
        
        # Seed data
        seed_items(db)
        seed_courses(db)
        seed_decisions(db)
        seed_rag_history(db)
        
        print("\n✅ Database seeding completed successfully!\n")
        print("📊 Summary:")
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM items")
                print(f"   Items: {cur.fetchone()[0]}")
                cur.execute("SELECT COUNT(*) FROM courses")
                print(f"   Courses: {cur.fetchone()[0]}")
                cur.execute("SELECT COUNT(*) FROM decisions")
                print(f"   Decisions: {cur.fetchone()[0]}")
                cur.execute("SELECT COUNT(*) FROM rag_queries")
                print(f"   RAG queries: {cur.fetchone()[0]}")
        
        print("\n🎉 You can now test the application at http://localhost:3000\n")
        
    except Exception as e:
        print(f"\n❌ Error seeding database: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    main()
