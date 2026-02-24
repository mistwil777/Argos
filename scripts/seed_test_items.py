#!/usr/bin/env python3
"""
Seed Test Items from Sources

Creates test items from configured sources to demonstrate the workflow.
"""

import sys
import os
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from mcp_server.database import DatabaseManager
from mcp_server.config import settings

# Test items based on real sources
TEST_ITEMS = [
    {
        "title": "Model Context Protocol (MCP): Empowering AI Apps With External Tools",
        "summary": "Anthropic introduces the Model Context Protocol (MCP), an innovative open-source standard that enables seamless integration between AI applications and external data sources. MCP provides a universal interface for connecting language models with various tools, databases, and APIs, dramatically simplifying the development of AI-powered applications. The protocol includes server-side tool definitions, client-side integrations, and support for multiple transport mechanisms.",
        "url": "https://github.com/modelcontextprotocol/servers",
        "source_type": "github",
        "source_url": "https://github.com/modelcontextprotocol",
        "published_at": datetime.now()
    },
    {
        "title": "LangChain Expression Language (LCEL): Building Production RAG Pipelines",
        "summary": "Deep dive into LangChain's Expression Language (LCEL), a declarative way to compose chains for production-ready RAG applications. LCEL provides streaming support, async operations, parallel execution, and built-in observability. Learn how to build complex retrieval pipelines with retry logic, fallbacks, and dynamic routing based on query complexity.",
        "url": "https://blog.langchain.dev/lcel-production-patterns/",
        "source_type": "rss",
        "source_url": "https://blog.langchain.dev/rss/",
        "published_at": datetime.now()
    },
    {
        "title": "LlamaIndex: Advanced Query Engines and Retrievers",
        "summary": "Comprehensive guide to LlamaIndex's query engines and custom retrievers. Covers hybrid search combining semantic similarity with keyword matching, recursive retrieval for multi-hop reasoning, and auto-merging retrievers that dynamically adjust chunk sizes. Includes practical examples of building production RAG systems with sub-question decomposition.",
        "url": "https://www.llamaindex.ai/blog/advanced-retrieval-patterns",
        "source_type": "rss",
        "source_url": "https://www.llamaindex.ai/blog/rss.xml",
        "published_at": datetime.now()
    },
    {
        "title": "ChromaDB 0.5.0: Distributed Vector Search at Scale",
        "summary": "ChromaDB releases version 0.5.0 with distributed architecture support, enabling horizontal scaling for billion-scale vector collections. New features include native HNSW indexing, improved query performance (3x faster), and production-ready clustering. Includes examples of deploying distributed ChromaDB on Kubernetes with automatic sharding.",
        "url": "https://github.com/chroma-core/chroma/releases/tag/0.5.0",
        "source_type": "github",
        "source_url": "https://github.com/chroma-core/chroma",
        "published_at": datetime.now()
    },
    {
        "title": "n8n Workflow Automation: Building AI-Powered Data Pipelines",
        "summary": "Tutorial on building automated data collection and processing pipelines with n8n. Covers RSS feed monitoring, GitHub API integration, webhook triggers, and LLM processing nodes. Includes a complete example of an AI-powered tech watch system that collects articles, classifies them with GPT-4, and stores results in PostgreSQL.",
        "url": "https://blog.n8n.io/ai-automation-workflows/",
        "source_type": "rss",
        "source_url": "https://blog.n8n.io/rss/",
        "published_at": datetime.now()
    },
    {
        "title": "GPT-4 Turbo: Function Calling and JSON Mode Improvements",
        "summary": "OpenAI announces major improvements to GPT-4 Turbo's function calling capabilities. The new model provides deterministic JSON output via JSON mode, parallel function execution, and improved function selection accuracy (95%+ vs 88% previously). Detailed comparison of cost savings (60% cheaper) and latency improvements (40% faster) compared to GPT-4.",
        "url": "https://platform.openai.com/docs/guides/function-calling",
        "source_type": "manual",
        "source_url": "https://platform.openai.com/docs/api-reference",
        "published_at": datetime.now()
    },
    {
        "title": "Claude 3.5 Sonnet: Extended Context and Tool Use",
        "summary": "Anthropic releases Claude 3.5 Sonnet with 200K context window and enhanced tool use capabilities. The model excels at multi-step reasoning, maintaining context across long conversations, and reliably calling external APIs. Benchmarks show 92% accuracy on complex agentic tasks, outperforming GPT-4 Turbo. Includes pricing details ($3/MTok input, $15/MTok output).",
        "url": "https://docs.anthropic.com/claude/reference/getting-started",
        "source_type": "manual",
        "source_url": "https://docs.anthropic.com/claude/reference",
        "published_at": datetime.now()
    },
    {
        "title": "Semantic Kernel: Microsoft's Library for AI Orchestration",
        "summary": "In-depth exploration of Microsoft's Semantic Kernel, an SDK for integrating LLMs into applications with enterprise-grade features. Supports memory management, planning/reasoning chains, and native plugin architecture. Comparison with LangChain and LlamaIndex, highlighting Semantic Kernel's strengths in .NET/C# ecosystems and Azure integration.",
        "url": "https://github.com/microsoft/semantic-kernel",
        "source_type": "github",
        "source_url": "https://github.com/microsoft/semantic-kernel",
        "published_at": datetime.now()
    }
]


def seed_items():
    """Seed test items from sources."""
    print("🌱 Seeding test items from configured sources...\n")
    
    db = DatabaseManager(settings.database_url)
    
    try:
        inserted = 0
        skipped = 0
        
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                for item in TEST_ITEMS:
                    # Check if item already exists
                    cur.execute("SELECT id FROM items WHERE url = %s", (item["url"],))
                    existing = cur.fetchone()
                    
                    if existing:
                        print(f"⏭️  Skipped: {item['title'][:60]}... (already exists)")
                        skipped += 1
                        continue
                    
                    # Insert new item
                    cur.execute("""
                        INSERT INTO items (
                            title, summary, content, url, source_type, source_url,
                            classification_status, published_at, created_at
                        ) VALUES (%s, %s, %s, %s, %s, %s, 'pending', %s, CURRENT_TIMESTAMP)
                        RETURNING id
                    """, (
                        item["title"],
                        item["summary"],
                        item["summary"],  # Use summary as content for now
                        item["url"],
                        item["source_type"],
                        item["source_url"],
                        item["published_at"]
                    ))
                    
                    item_id = cur.fetchone()[0]
                    print(f"✅ Inserted: {item['title'][:60]}... (ID: {item_id})")
                    inserted += 1
                
                conn.commit()
        
        print(f"\n{'='*60}")
        print(f"✅ Seeding complete!")
        print(f"   Inserted: {inserted}")
        print(f"   Skipped:  {skipped}")
        print(f"   Total:    {inserted + skipped}")
        print(f"{'='*60}\n")
        
        if inserted > 0:
            print("📝 Next steps:")
            print("1. Visit http://localhost:3000/items")
            print("2. Click 'Classifier' on pending items")
            print("3. Wait for AI classification (~5-10 seconds)")
            print("4. Click 'Générer le cours' on classified items")
            print("5. Check generated courses in /courses\n")
    
    except Exception as e:
        print(f"\n❌ Error seeding items: {e}")
        raise
    finally:
        if 'conn' in locals():
            conn.close()


if __name__ == "__main__":
    seed_items()
