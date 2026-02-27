"""
Quick test pour vérifier que l'API RAG fonctionne avec Bedrock Embeddings
"""
import requests
import json
import sys

BASE_URL = "http://localhost:8000/api/v1"

def test_rag_api():
    """Test l'endpoint RAG /ask"""
    print("=================================")
    print("🧪 Test API RAG avec Bedrock Embeddings")
    print("=================================\n")
    
    # Test 1: Health check
    print("1️⃣ Vérification du backend...")
    try:
        response = requests.get("http://localhost:8000/health", timeout=5)
        if response.status_code == 200:
            print("✅ Backend opérationnel\n")
        else:
            print(f"⚠️  Backend répond avec code {response.status_code}\n")
    except Exception as e:
        print(f"❌ Backend non accessible: {e}\n")
        return False
    
    # Test 2: RAG ask
    print("2️⃣ Test de l'assistant RAG...")
    print("Question: 'Qu'est-ce que le machine learning?'\n")
    
    try:
        response = requests.post(
            f"{BASE_URL}/rag/ask",
            json={"query": "Qu'est-ce que le machine learning?", "use_hybrid_search": True},
            timeout=30
        )
        
        if response.status_code == 200:
            data = response.json()
            print("✅ RAG a répondu avec succès!")
            print(f"\n📝 Réponse (premiers 300 caractères):")
            print("-" * 60)
            answer = data.get('answer', 'N/A')
            print(answer[:300] + "..." if len(answer) > 300 else answer)
            print("-" * 60)
            print(f"\n📊 Statistiques:")
            print(f"  - Tokens utilisés: {data.get('tokens_used', 0)}")
            print(f"  - Confiance: {data.get('confidence', 0):.2%}")
            print(f"  - Sources: {len(data.get('sources', []))}")
            print("\n✅ Test réussi! Le RAG fonctionne avec Bedrock Embeddings.")
            return True
        else:
            print(f"❌ Erreur {response.status_code}: {response.text}")
            return False
            
    except requests.exceptions.Timeout:
        print("❌ Timeout - le backend met trop de temps à répondre")
        print("   Cela peut indiquer que le modèle d'embedding se charge...")
        return False
    except Exception as e:
        print(f"❌ Erreur lors du test: {e}")
        return False
    
    # Test 3: History
    print("\n3️⃣ Vérification de l'historique...")
    try:
        response = requests.get(f"{BASE_URL}/rag/history?limit=5", timeout=5)
        if response.status_code == 200:
            history = response.json()
            print(f"✅ Historique récupéré: {len(history)} entrée(s)")
            return True
    except Exception as e:
        print(f"⚠️  Impossible de récupérer l'historique: {e}")
    
    return True

if __name__ == "__main__":
    success = test_rag_api()
    print("\n=================================")
    sys.exit(0 if success else 1)
