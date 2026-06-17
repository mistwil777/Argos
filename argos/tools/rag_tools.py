"""
RAG Tools for MCP Server

Tools for asking questions and searching through indexed courses and items.
"""

import logging
from typing import Dict, Optional

from argos.config import settings
from argos.database import DatabaseManager
from argos.services.llm_provider import create_llm_provider
from argos.services.vector_store_singleton import get_vector_store
from argos.services.rag import RAGService

logger = logging.getLogger(__name__)


# ============================================
# Singletons
# ============================================

_db_manager: Optional[DatabaseManager] = None
_rag_service: Optional[RAGService] = None


def _get_db_manager() -> DatabaseManager:
    """Get or create DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings.database_url)
    return _db_manager


def _get_rag_service() -> RAGService:
    """Get or create RAGService singleton."""
    global _rag_service
    
    if _rag_service is None:
        db_manager = _get_db_manager()
        vector_store = get_vector_store()
        
        # Use AWS Nova Pro for RAG (cost-effective)
        llm_provider = create_llm_provider(
            provider_type="aws",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.amazon.nova-pro-v1:0"
        )
        
        _rag_service = RAGService(
            llm_provider=llm_provider,
            vector_store=vector_store,
            db_manager=db_manager,
            top_k=5,
            temperature=0.5,
            max_tokens=800
        )
        
        logger.info("RAG service initialized")
    
    return _rag_service


# ============================================
# Tool Functions
# ============================================

async def ask_question(
    query: str,
    filter_source_type: Optional[str] = None,
    user_identifier: str = "anonymous",
    use_hybrid_search: bool = True
) -> Dict:
    """
    Ask a question and get an AI-generated answer.
    
    Args:
        query: Question to ask
        filter_source_type: Optional filter by 'course' or 'item'
        user_identifier: User ID for logging
        use_hybrid_search: Use hybrid search (semantic+lexical, default: True)
    
    Returns:
        Dict with answer, sources, and metrics
    """
    if not query or not query.strip():
        return {
            "success": False,
            "error": "Query cannot be empty"
        }
    
    try:
        rag = _get_rag_service()
        result = await rag.ask(
            query=query,
            filter_source_type=filter_source_type,
            user_identifier=user_identifier,
            use_hybrid_search=use_hybrid_search
        )
        
        # Add success flag
        result["success"] = True
        return result
    
    except Exception as e:
        logger.error(f"Error in ask_question: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def search_content(
    query: str,
    limit: int = 10,
    filter_source_type: Optional[str] = None,
    use_hybrid_search: bool = True
) -> Dict:
    """
    Perform search without LLM generation.
    
    Args:
        query: Search query
        limit: Maximum results
        filter_source_type: Optional filter
        use_hybrid_search: Use hybrid search (semantic+lexical, default: True)
    
    Returns:
        Dict with results
    """
    if not query or not query.strip():
        return {
            "success": False,
            "error": "Query cannot be empty"
        }
    
    try:
        rag = _get_rag_service()
        results = await rag.search_only(
            query=query,
            limit=limit,
            filter_source_type=filter_source_type,
            use_hybrid_search=use_hybrid_search
        )
        
        return {
            "success": True,
            "query": query,
            "results": results,
            "count": len(results)
        }
    
    except Exception as e:
        logger.error(f"Error in search_content: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


def index_course(course_id: int) -> Dict:
    """
    Index a course for RAG.
    
    Args:
        course_id: Course ID
    
    Returns:
        Dict with indexing result
    """
    try:
        rag = _get_rag_service()
        result = rag.index_course(course_id)
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        logger.error(f"Error in index_course: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


def index_item(item_id: int) -> Dict:
    """
    Index an item for RAG.
    
    Args:
        item_id: Item ID
    
    Returns:
        Dict with indexing result
    """
    try:
        rag = _get_rag_service()
        result = rag.index_item(item_id)
        
        return {
            "success": True,
            **result
        }
    
    except Exception as e:
        logger.error(f"Error in index_item: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


def rebuild_index(include_items: bool = True) -> Dict:
    """
    Rebuild entire RAG index.
    
    Args:
        include_items: Whether to include items
    
    Returns:
        Dict with rebuild statistics
    """
    try:
        rag = _get_rag_service()
        stats = rag.rebuild_index(include_items=include_items)
        
        return {
            "success": True,
            **stats
        }
    
    except Exception as e:
        logger.error(f"Error in rebuild_index: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


def get_index_stats() -> Dict:
    """
    Get RAG index statistics.
    
    Returns:
        Dict with statistics
    """
    try:
        rag = _get_rag_service()
        stats = rag.get_index_stats()
        
        return {
            "success": True,
            **stats
        }
    
    except Exception as e:
        logger.error(f"Error in get_index_stats: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }
