"""
Test script for RAG system

Tests:
1. Index existing courses
2. Ask questions
3. Semantic search
"""

import asyncio
import logging
from argos.tools.rag_tools import (
    _get_rag_service,
    rebuild_index,
    ask_question,
    search_content,
    get_index_stats
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


async def test_rag_system():
    """Test RAG system end-to-end."""
    
    print("=" * 70)
    print("RAG System Test")
    print("=" * 70)
    
    # Step 1: Rebuild index
    print("\n[1/4] Rebuilding index...")
    stats = rebuild_index(include_items=True)
    
    if stats["success"]:
        print(f"✅ Index rebuilt:")
        print(f"   - Total chunks: {stats['total_chunks']}")
        print(f"   - Courses: {stats['courses_indexed']} ({stats['course_chunks']} chunks)")
        print(f"   - Items: {stats['items_indexed']} ({stats['item_chunks']} chunks)")
    else:
        print(f"❌ Rebuild failed: {stats.get('error')}")
        return
    
    # Step 2: Get stats
    print("\n[2/4] Getting index stats...")
    stats = get_index_stats()
    
    if stats["success"]:
        print(f"✅ Index statistics:")
        print(f"   - Total chunks: {stats['total_chunks']}")
        print(f"   - Course chunks: {stats['course_chunks']}")
        print(f"   - Item chunks: {stats['item_chunks']}")
    else:
        print(f"❌ Stats failed: {stats.get('error')}")
    
    # Step 3: Compare vector vs hybrid search
    print("\n[3/5] Testing vector search...")
    search_query = "Qu'est-ce qu'un agent IA ?"
    vector_results = await search_content(
        query=search_query,
        limit=3,
        use_hybrid_search=False  # Pure vector search
    )
    
    if vector_results["success"]:
        print(f"✅ Vector search results for: '{search_query}'")
        print(f"   Found {vector_results['count']} results:")
        for result in vector_results["results"][:3]:
            print(f"   [{result['rank']}] {result['title'][:60]}...")
            print(f"       Similarity: {result['similarity_score']:.4f}")
    else:
        print(f"❌ Vector search failed: {vector_results.get('error')}")
    
    # Step 4: Hybrid search
    print("\n[4/5] Testing hybrid search (semantic + lexical)...")
    hybrid_results = await search_content(
        query=search_query,
        limit=3,
        use_hybrid_search=True  # Hybrid search with FTS
    )
    
    if hybrid_results["success"]:
        print(f"✅ Hybrid search results for: '{search_query}'")
        print(f"   Found {hybrid_results['count']} results:")
        for result in hybrid_results["results"][:3]:
            print(f"   [{result['rank']}] {result['title'][:60]}...")
            print(f"       Similarity: {result['similarity_score']:.4f}")
    else:
        print(f"❌ Hybrid search failed: {hybrid_results.get('error')}")
    
    # Step 5: Ask question with hybrid search
    print("\n[5/5] Testing RAG question answering (hybrid search)...")
    question = "C'est quoi un agent IA et comment ça fonctionne ?"
    answer_result = await ask_question(
        query=question,
        user_identifier="test_user",
        use_hybrid_search=True  # Use hybrid search for better relevance
    )
    
    if answer_result["success"]:
        print(f"✅ RAG Answer:")
        print(f"   Question: {answer_result['query']}")
        print(f"   \nAnswer:\n   {answer_result['answer'][:500]}...")
        print(f"   \nMetrics:")
        print(f"   - Confidence: {answer_result['confidence_score']}/1.0")
        print(f"   - Sources: {len(answer_result['sources'])} chunks")
        print(f"   - Model: {answer_result['model']}")
        print(f"   - Tokens: {answer_result['tokens_used']}")
        print(f"   - Cost: ${answer_result['cost_usd']:.6f}")
        print(f"   - Latency: {answer_result['latency_ms']}ms")
        
        print(f"   \nSources:")
        for source in answer_result['sources']:
            print(f"   [{source['source_number']}] {source['title']} - {source['section']}")
    else:
        print(f"❌ Ask failed: {answer_result.get('error')}")
    
    print("\n" + "=" * 70)
    print("Test completed!")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(test_rag_system())
