#!/bin/bash
# Test RAG API endpoints

echo "==================================="
echo "🧪 Testing RAG API with Bedrock Embeddings"
echo "==================================="

# Test 1: Health check
echo ""
echo "1️⃣ Backend health check..."
curl -s http://localhost:8000/health | head -2 || echo "❌ Backend not responding"

# Test 2: RAG ask endpoint
echo ""
echo ""
echo "2️⃣ Testing RAG /ask endpoint..."
echo "Question: Qu'est-ce que le machine learning?"
curl -X POST http://localhost:8000/api/v1/rag/ask \
  -H "Content-Type: application/json" \
  -d '{"query": "Qu'\''est-ce que le machine learning?", "use_hybrid_search": true}' \
  -w "\nHTTP Status: %{http_code}\n" \
  2>&1

echo ""
echo ""
echo "3️⃣ Checking RAG history..."
curl -s http://localhost:8000/api/v1/rag/history?limit=5 \
  | python3 -c "import sys, json; data = json.load(sys.stdin); print(f'Historique: {len(data)} entrées'); [print(f' - {item[\"query\"][:50]}...') for item in data[:3]]" \
  || echo "❌ Cannot fetch history"

echo ""
echo "==================================="
echo "✅ Test complete"
echo "==================================="
