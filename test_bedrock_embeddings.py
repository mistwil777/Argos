"""
Quick test to verify Bedrock Embeddings provider.
Run this with: python -m test_bedrock_embeddings
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mcp_server.config import settings
from mcp_server.services.bedrock_embeddings import BedrockEmbeddingsProvider

def test_bedrock_embeddings():
    """Test Bedrock Embeddings provider initialization and basic encoding."""
    
    print("🧪 Testing Bedrock Embeddings Provider...")
    print(f"   Provider configured: {settings.embedding_provider}")
    print(f"   AWS Region: {settings.aws_region}")
    print(f"   Dimensions: {settings.bedrock_embedding_dimensions}")
    
    if settings.embedding_provider != "bedrock":
        print("⚠️  WARNING: EMBEDDING_PROVIDER is not set to 'bedrock' in .env")
        print("   Set EMBEDDING_PROVIDER=bedrock to use Amazon Titan Embeddings")
        return False
    
    if not settings.aws_access_key_id or not settings.aws_secret_access_key:
        print("❌ ERROR: AWS credentials not configured!")
        print("   Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in .env")
        return False
    
    try:
        # Initialize provider
        print("\n1️⃣ Initializing BedrockEmbeddingsProvider...")
        provider = BedrockEmbeddingsProvider(
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            region=settings.aws_region,
            dimensions=settings.bedrock_embedding_dimensions,
            normalize=settings.bedrock_embedding_normalize
        )
        print(f"   ✅ Provider initialized! Dimension: {provider.get_sentence_embedding_dimension()}")
        
        # Test single embedding
        print("\n2️⃣ Testing single text embedding...")
        test_text = "Machine learning is a subset of artificial intelligence."
        embedding = provider.encode(test_text)
        print(f"   ✅ Generated embedding: shape={embedding.shape}, dtype={embedding.dtype}")
        print(f"   Sample values: {embedding[0][:5]}")
        
        # Test batch embedding
        print("\n3️⃣ Testing batch text embedding...")
        test_texts = [
            "Deep learning uses neural networks.",
            "Natural language processing analyzes text.",
            "Computer vision processes images."
        ]
        embeddings = provider.encode(test_texts, show_progress_bar=True)
        print(f"   ✅ Generated {len(embeddings)} embeddings: shape={embeddings.shape}")
        
        print("\n✅ All tests passed! Bedrock Embeddings is ready to use.")
        return True
        
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = test_bedrock_embeddings()
    sys.exit(0 if success else 1)
