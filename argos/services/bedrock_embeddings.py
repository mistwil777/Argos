"""
Amazon Bedrock Embeddings Provider

Uses Amazon Titan Text Embeddings V2 for generating vector embeddings.
Replaces HuggingFace SentenceTransformer to avoid CDN network issues.
"""

import logging
import json
from typing import List, Optional

import numpy as np

logger = logging.getLogger(__name__)


class BedrockEmbeddingsProvider:
    """
    Amazon Bedrock Titan Embeddings V2 provider.
    
    Model: amazon.titan-embed-text-v2:0
    Supports: 256, 512, or 1024 dimensions
    Pricing: ~$0.0001 per 1K tokens (input)
    """
    
    def __init__(
        self,
        aws_access_key_id: str,
        aws_secret_access_key: str,
        region: str = "us-west-2",
        dimensions: int = 1024,
        normalize: bool = True,
        model_id: str = "amazon.titan-embed-text-v2:0"
    ):
        """
        Initialize Bedrock Embeddings provider.
        
        Args:
            aws_access_key_id: AWS access key
            aws_secret_access_key: AWS secret key
            region: AWS region (default: us-west-2)
            dimensions: Embedding dimensions (256, 512, or 1024)
            normalize: Whether to normalize embeddings
            model_id: Bedrock model ID
        """
        import boto3
        
        if dimensions not in [256, 512, 1024]:
            raise ValueError("Dimensions must be 256, 512, or 1024 for Titan Embeddings V2")
        
        self.dimensions = dimensions
        self.normalize = normalize
        self.model_id = model_id
        self.region = region
        
        # Initialize Bedrock Runtime client
        self.client = boto3.client(
            service_name="bedrock-runtime",
            region_name=region,
            aws_access_key_id=aws_access_key_id,
            aws_secret_access_key=aws_secret_access_key
        )
        
        logger.info(
            f"BedrockEmbeddingsProvider initialized: {model_id} "
            f"({dimensions}D, normalize={normalize}, region={region})"
        )
    
    def get_sentence_embedding_dimension(self) -> int:
        """
        Get embedding dimension (compatible with SentenceTransformer API).
        
        Returns:
            Embedding dimension (256, 512, or 1024)
        """
        return self.dimensions
    
    def encode(
        self,
        texts: str | List[str],
        convert_to_numpy: bool = True,
        show_progress_bar: bool = False,
        batch_size: int = 32
    ) -> np.ndarray:
        """
        Generate embeddings for text(s) (compatible with SentenceTransformer API).
        
        Args:
            texts: Single text string or list of texts
            convert_to_numpy: Return as numpy array (always True)
            show_progress_bar: Show progress bar (not supported)
            batch_size: Batch size for processing
        
        Returns:
            Numpy array of embeddings:
            - For single text: 1D array of shape (dimensions,)
            - For multiple texts: 2D array of shape (N, dimensions)
        """
        # Handle single text - return 1D array
        if isinstance(texts, str):
            embedding = self._embed_single(texts)
            return np.array(embedding)  # Returns 1D array (1024,)
        
        # Handle multiple texts - return 2D array
        embeddings = []
        total = len(texts)
        
        if show_progress_bar and total > 1:
            logger.info(f"Generating embeddings for {total} texts...")
        
        for i in range(0, total, batch_size):
            batch = texts[i:i + batch_size]
            
            for text in batch:
                embedding = self._embed_single(text)
                embeddings.append(embedding)
            
            if show_progress_bar and total > 1:
                progress = min(i + batch_size, total)
                logger.info(f"Progress: {progress}/{total} embeddings generated")
        
        return np.array(embeddings)
    
    def _embed_single(self, text: str) -> List[float]:
        """
        Generate embedding for a single text using Bedrock API.
        
        Args:
            text: Text to embed
        
        Returns:
            List of floats (embedding vector)
        """
        # Create request payload
        request_body = {
            "inputText": text,
            "dimensions": self.dimensions,
            "normalize": self.normalize
        }
        
        try:
            # Call Bedrock API
            response = self.client.invoke_model(
                modelId=self.model_id,
                body=json.dumps(request_body)
            )
            
            # Parse response
            response_body = json.loads(response['body'].read())
            
            embedding = response_body.get("embedding", [])
            input_token_count = response_body.get("inputTextTokenCount", 0)
            
            logger.debug(
                f"Generated embedding: {len(embedding)}D, {input_token_count} tokens"
            )
            
            return embedding
            
        except Exception as e:
            logger.error(f"Failed to generate embedding: {e}")
            # Return zero vector as fallback
            return [0.0] * self.dimensions
    
    def embed_text(self, text: str) -> np.ndarray:
        """
        Generate embedding for a single text (VectorStore API).
        
        Args:
            text: Text to embed
        
        Returns:
            Numpy array of embedding
        """
        embedding = self._embed_single(text)
        return np.array(embedding)
    
    def embed_texts(self, texts: List[str]) -> np.ndarray:
        """
        Generate embeddings for multiple texts (VectorStore API).
        
        Args:
            texts: List of texts to embed
        
        Returns:
            Numpy array of embeddings (N x dimensions)
        """
        return self.encode(texts, show_progress_bar=True)
