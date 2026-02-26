"""
Classifier MCP Tools

Exposes classification functionality via Model Context Protocol (JSON-RPC).
"""

import logging
from typing import Dict, Optional, List

from mcp_server.config import settings
from mcp_server.database import DatabaseManager
from mcp_server.services.classifier import ClassifierService
from mcp_server.services.llm_provider import create_llm_provider

logger = logging.getLogger(__name__)

# ============================================
# Singleton Instances
# ============================================

_db_manager = None
_classifier_service = None


def _get_db_manager() -> DatabaseManager:
    """Get or create DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings.database_url)
    return _db_manager


def _get_classifier_service() -> ClassifierService:
    """Get or create ClassifierService singleton."""
    global _classifier_service
    if _classifier_service is None:
        db = _get_db_manager()
        
        # Create LLM provider based on configuration
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        
        _classifier_service = ClassifierService(
            llm_provider=llm_provider,
            db_manager=db,
            temperature=0.5,  # Balanced temperature for better classification
            max_tokens=800
        )
    return _classifier_service


# ============================================
# MCP Tool: classifier.classify
# ============================================

async def classify_item(item_id: int) -> Dict:
    """
    Classify a single tech watch item using LLM.
    
    This tool analyzes the item's title, summary, and source to extract:
    - Topics: Main technical subjects (e.g., "LLM", "RAG", "Embeddings")
    - Importance: Strategic value (critical/high/medium/low)
    - Item Type: Content nature (innovation/tutorial/research/news/opinion)
    - Reasoning: Explanation for the classification
    
    Args:
        item_id: ID of the item to classify
    
    Returns:
        {
            "item_id": 123,
            "topics": ["LLM", "GPT-4"],
            "importance": "high",
            "item_type": "innovation",
            "reasoning": "Major capability upgrade for GPT-4...",
            "model": "gpt-3.5-turbo",
            "tokens_used": 450,
            "cost_usd": 0.0007,
            "latency_ms": 1200
        }
    
    Raises:
        ValueError: If item not found or has no content
        Exception: If classification fails
    
    Example:
        >>> await classify_item(item_id=1)
        {'item_id': 1, 'topics': ['LLM', 'GPT-4'], 'importance': 'high', ...}
    """
    logger.info(f"MCP Tool called: classifier.classify for item {item_id}")
    
    try:
        service = _get_classifier_service()
        result = await service.classify_item(item_id)
        
        logger.info(
            f"Classification successful via MCP tool",
            extra={
                "item_id": item_id,
                "topics": result["topics"],
                "cost_usd": result["cost_usd"]
            }
        )
        
        return result
        
    except ValueError as e:
        logger.error(f"Validation error in classifier.classify: {e}")
        raise
    except Exception as e:
        logger.error(f"Unexpected error in classifier.classify: {e}", exc_info=True)
        raise Exception(f"Classification failed: {str(e)}")


# ============================================
# MCP Tool: classifier.classify_batch
# ============================================

async def classify_batch(
    item_ids: Optional[List[int]] = None,
    limit: int = 10
) -> Dict:
    """
    Classify multiple unclassified items in batch.
    
    This tool processes multiple items sequentially (to avoid rate limits).
    If item_ids are not provided, it fetches the oldest unclassified items.
    
    Args:
        item_ids: Specific item IDs to classify (optional)
        limit: If item_ids not provided, process up to this many items (default: 10)
    
    Returns:
        {
            "processed": 10,
            "successful": 9,
            "failed": 1,
            "total_cost_usd": 0.0063,
            "total_tokens": 4230,
            "results": [
                {
                    "item_id": 1,
                    "status": "success",
                    "data": {...}
                },
                {
                    "item_id": 2,
                    "status": "error",
                    "error": "Item not found"
                }
            ]
        }
    
    Example:
        >>> await classify_batch(limit=5)
        {'processed': 5, 'successful': 5, 'failed': 0, ...}
        
        >>> await classify_batch(item_ids=[1, 2, 3])
        {'processed': 3, 'successful': 3, 'failed': 0, ...}
    """
    logger.info(
        f"MCP Tool called: classifier.classify_batch",
        extra={"item_ids": item_ids, "limit": limit}
    )
    
    try:
        service = _get_classifier_service()
        result = await service.classify_batch(item_ids=item_ids, limit=limit)
        
        logger.info(
            f"Batch classification complete via MCP tool",
            extra={
                "processed": result["processed"],
                "successful": result["successful"],
                "failed": result["failed"],
                "total_cost_usd": result["total_cost_usd"]
            }
        )
        
        return result
        
    except Exception as e:
        logger.error(f"Unexpected error in classifier.classify_batch: {e}", exc_info=True)
        raise Exception(f"Batch classification failed: {str(e)}")


# ============================================
# MCP Tool: classifier.stats
# ============================================

async def get_classification_stats() -> Dict:
    """
    Get classification statistics and progress.
    
    Returns summary of items by classification status and total costs.
    
    Returns:
        {
            "items_by_status": {
                "pending": 15,
                "classified": 85,
                "rejected": 2
            },
            "total_cost_usd": 0.125,
            "total_tokens": 185000,
            "top_topics": [
                {"name": "LLM", "item_count": 25},
                {"name": "RAG", "item_count": 18},
                {"name": "Embeddings", "item_count": 15}
            ]
        }
    
    Example:
        >>> await get_classification_stats()
        {'items_by_status': {'pending': 15, 'classified': 85}, ...}
    """
    logger.info("MCP Tool called: classifier.stats")
    
    try:
        db = _get_db_manager()
        
        # Get classification status breakdown
        items_by_status = db.get_classification_stats()
        
        # Get cost and token usage
        total_cost, total_tokens = db.get_total_cost()
        
        # Get top topics
        top_topics = db.get_topics_by_popularity(limit=10)
        
        result = {
            "items_by_status": items_by_status,
            "total_cost_usd": round(total_cost, 4),
            "total_tokens": total_tokens,
            "top_topics": [
                {"name": topic["name"], "item_count": topic["item_count"]}
                for topic in top_topics
            ]
        }
        
        logger.info(f"Classification stats retrieved via MCP tool", extra=result)
        return result
        
    except Exception as e:
        logger.error(f"Error in classifier.stats: {e}", exc_info=True)
        raise Exception(f"Failed to get classification stats: {str(e)}")


# ============================================
# MCP Tool: classifier.get_unclassified
# ============================================

async def get_unclassified_items(limit: int = 20) -> Dict:
    """
    Get list of items pending classification.
    
    Args:
        limit: Maximum number of items to return (default: 20)
    
    Returns:
        {
            "count": 15,
            "items": [
                {
                    "id": 1,
                    "title": "GPT-4 Turbo Released",
                    "summary": "OpenAI announces...",
                    "url": "https://...",
                    "source": "OpenAI Blog",
                    "published_at": "2024-12-01T10:00:00Z",
                    "created_at": "2024-12-01T11:00:00Z"
                }
            ]
        }
    
    Example:
        >>> await get_unclassified_items(limit=5)
        {'count': 5, 'items': [...]}
    """
    logger.info(f"MCP Tool called: classifier.get_unclassified (limit={limit})")
    
    try:
        db = _get_db_manager()
        items = db.get_unclassified_items(limit=limit)
        
        result = {
            "count": len(items),
            "items": items
        }
        
        logger.info(f"Retrieved {len(items)} unclassified items via MCP tool")
        return result
        
    except Exception as e:
        logger.error(f"Error in classifier.get_unclassified: {e}", exc_info=True)
        raise Exception(f"Failed to get unclassified items: {str(e)}")
