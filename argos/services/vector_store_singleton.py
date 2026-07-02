"""
Singleton for VectorStoreService to avoid reloading the embedding model.
"""

import logging
from typing import Optional
from argos.services.vector_store import VectorStoreService
from argos.config import settings

logger = logging.getLogger(__name__)

# Global singleton instance
_vector_store_instance: Optional[VectorStoreService] = None


def get_vector_store(
    db_path: str = None,
    model_name: str = None,
    table_name: str = "argos_embeddings"
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
        
        # Create embedding provider based on settings
        embedding_provider = None
        
        if settings.embedding_provider == "bedrock":
            logger.info("Initializing Amazon Bedrock Titan Embeddings V2...")
            
            # Import BedrockEmbeddingsProvider
            from argos.services.bedrock_embeddings import BedrockEmbeddingsProvider
            
            # Validate AWS credentials
            if not settings.aws_access_key_id or not settings.aws_secret_access_key:
                logger.error("AWS credentials not configured! Cannot use Bedrock embeddings.")
                raise ValueError(
                    "AWS credentials required for Bedrock embeddings. "
                    "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env"
                )
            
            # Create Bedrock provider
            embedding_provider = BedrockEmbeddingsProvider(
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                region=settings.aws_region,
                dimensions=settings.bedrock_embedding_dimensions,
                normalize=settings.bedrock_embedding_normalize
            )
            logger.info(f"✅ Bedrock Embeddings provider ready ({settings.bedrock_embedding_dimensions}D)")
        
        else:
            logger.info("Using SentenceTransformer for embeddings (may fail if HuggingFace CDN is blocked)")
        
        logger.info("Initializing VectorStoreService singleton...")
        _vector_store_instance = VectorStoreService(
            db_path=db_path,
            model_name=model_name,
            table_name=table_name,
            embedding_provider=embedding_provider
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
