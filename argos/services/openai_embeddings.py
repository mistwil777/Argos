"""
OpenAI Embeddings Provider for Argos
Utilise text-embedding-3-small (1536 dimensions, meilleure qualité sémantique que MiniLM).
"""

import logging
from typing import List
import numpy as np

logger = logging.getLogger(__name__)


class OpenAIEmbeddingsProvider:
    """Provider d'embeddings via l'API OpenAI (text-embedding-3-small)."""

    MODEL = "text-embedding-3-small"
    DIMENSIONS = 1536

    def __init__(self, api_key: str):
        from openai import OpenAI
        self.client = OpenAI(api_key=api_key)
        logger.info(f"OpenAIEmbeddingsProvider initialisé ({self.MODEL}, {self.DIMENSIONS}D)")

    def encode(self, texts: List[str] | str, **kwargs) -> np.ndarray:
        if isinstance(texts, str):
            texts = [texts]
        response = self.client.embeddings.create(model=self.MODEL, input=texts)
        vectors = [np.array(item.embedding, dtype=np.float32) for item in response.data]
        return np.array(vectors) if len(vectors) > 1 else vectors[0]

    def get_sentence_embedding_dimension(self) -> int:
        return self.DIMENSIONS
