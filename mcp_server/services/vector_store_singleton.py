"""
Singleton for VectorStoreService to avoid reloading the embedding model.
"""

import logging
from typing import Optional
from mcp_server.services.vector_store import VectorStoreService
from mcp_server.config import settings

logger = logging.getLogger(__name__)

# Global singleton instance
_vector_store_instance: Optional[VectorStoreService] = None


def get_vector_store(
    db_path: str = None,
    model_name: str = None,
    table_name: str = "academiaops_embeddings"
) -> VectorStoreService:
    """
    Get or create VectorStoreService singleton.
    
    On first call, loads the embedding model (slow).
    Subsequent calls return the cached instance (fast).
    
    Args:
        db_path: LanceDB path (defaults to settings.lancedb_path)
        model_name: Embedding model (defaults to settings.embedding_model)
        table_name: LanceDB table name
    
    Returns:
        VectorStoreService singleton instance
    """
    global _vector_store_instance
    
    if _vector_store_instance is None:
        # Use defaults from settings if not provided
        db_path = db_path or str(settings.lancedb_path)
        model_name = model_name or settings.embedding_model
        
        logger.info("Initializing VectorStoreService singleton (first load may take 30-60s)...")
        _vector_store_instance = VectorStoreService(
            db_path=db_path,
            model_name=model_name,
            table_name=table_name
        )
        logger.info("✅ VectorStoreService singleton ready!")
    
    return _vector_store_instance


async def warmup_vector_store():
    """
    Pre-load the VectorStoreService at server startup.
    
    This avoids the first user waiting minutes for the model to load.
    Call this in FastAPI's @app.on_event("startup").
    """
    import asyncio
    logger.info("🔥 Warming up VectorStoreService (loading embedding model)...")
    
    try:
        # Run synchronous init in thread to avoid blocking startup
        await asyncio.to_thread(get_vector_store)
        logger.info("✅ VectorStoreService warmed up and ready!")
    except Exception as e:
        logger.error(f"❌ Failed to warm up VectorStoreService: {e}", exc_info=True)
        logger.warning("RAG features will be slow on first use due to model loading")


def reset_vector_store():
    """Reset singleton (useful for testing or hot reload)."""
    global _vector_store_instance
    _vector_store_instance = None
    logger.info("VectorStoreService singleton reset")
