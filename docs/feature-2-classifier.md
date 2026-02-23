# Feature 2 : Agent Classifier

## Vue d'ensemble

L'Agent Classifier est responsable de l'analyse et de la classification automatique des items de veille technologique. Il utilise GPT-3.5-turbo pour extraire des informations structurées et assigner des topics pertinents.

## Objectifs

1. **Classification automatique** : Analyser le contenu des items et extraire topics, importance, type
2. **Efficacité** : Traiter les items par batch pour optimiser les coûts LLM
3. **Robustesse** : Gérer les erreurs et les cas limites (contenu vide, API timeout, etc.)
4. **Traçabilité** : Logger toutes les décisions de classification dans la table `decisions`

## Architecture

### Composants

```
┌─────────────────────────────────────────────────┐
│           MCP Tool: classifier.classify         │
│  (Point d'entrée JSON-RPC)                      │
└─────────────────┬───────────────────────────────┘
                  │
                  v
┌─────────────────────────────────────────────────┐
│      ClassifierService (mcp_server/services/)   │
│  - classify_item(item_id)                       │
│  - classify_batch(item_ids[])                   │
│  - _call_llm(prompt)                            │
│  - _parse_response(response)                    │
└─────────────────┬───────────────────────────────┘
                  │
        ┌─────────┴─────────┐
        v                   v
┌───────────────┐   ┌──────────────────┐
│  OpenAI API   │   │  DatabaseManager │
│  (GPT-3.5)    │   │  (PostgreSQL)    │
└───────────────┘   └──────────────────┘
```

### Flux de données

1. **Requête MCP** : `{"method": "classifier.classify", "params": {"item_id": 123}}`
2. **Récupération** : Charger l'item depuis PostgreSQL (title, summary, url)
3. **Prompt LLM** : Construire un prompt structuré avec instructions
4. **Appel API** : Envoyer à OpenAI GPT-3.5-turbo
5. **Parsing** : Extraire le JSON de classification
6. **Validation** : Vérifier la cohérence des données
7. **Écriture** : Mettre à jour `items` et créer entrée dans `decisions`
8. **Réponse** : Retourner le résultat au client MCP

## Schéma de données

### Input (Item non classifié)

```python
{
    "id": 123,
    "title": "GPT-4 Turbo with Vision API",
    "summary": "OpenAI announces GPT-4 Turbo with vision capabilities...",
    "url": "https://openai.com/blog/...",
    "source": "OpenAI Blog",
    "created_at": "2024-12-01T10:00:00Z"
}
```

### Output (Classification LLM)

```json
{
    "topics": ["LLM", "Multimodal", "GPT-4"],
    "importance": "high",
    "item_type": "innovation",
    "reasoning": "Major capability upgrade for GPT-4, enabling image understanding alongside text. High impact for developers building multimodal applications."
}
```

### Database Update

```sql
-- Table items
UPDATE items 
SET 
    importance = 'high',
    item_type = 'innovation',
    classification_status = 'classified',
    updated_at = NOW()
WHERE id = 123;

-- Table decisions
INSERT INTO decisions (item_id, decision_type, decision_value, reasoning, model_used, tokens_used, cost_usd)
VALUES (123, 'classification', '{"topics":["LLM","Multimodal","GPT-4"],"importance":"high","item_type":"innovation"}', 'Major capability upgrade...', 'gpt-3.5-turbo', 450, 0.0007);
```

## Prompt Engineering

### Template de classification

```python
CLASSIFICATION_PROMPT = """
Analyze the following tech watch item and classify it.

**Item:**
- Title: {title}
- Summary: {summary}
- Source: {source}
- URL: {url}

**Your task:**
Extract structured information in JSON format with these fields:

1. **topics** (array of 1-5 strings): Main technical topics/technologies mentioned.
   Examples: ["LLM", "RAG", "Embeddings", "Agents", "FineTuning", "Multimodal"]

2. **importance** (enum): Strategic importance for staying up-to-date.
   - "critical": Revolutionary impact, paradigm shift
   - "high": Major advancement, significant implications
   - "medium": Incremental improvement, useful to know
   - "low": Minor update or niche topic

3. **item_type** (enum): Nature of the content.
   - "innovation": New technology, breakthrough, major release
   - "tutorial": How-to guide, implementation example
   - "research": Academic paper, research findings
   - "news": Industry announcement, company news
   - "opinion": Analysis, commentary, best practices

4. **reasoning** (string): Brief explanation (1-2 sentences) justifying your classification.

**Output format (JSON only, no markdown):**
{
    "topics": ["topic1", "topic2"],
    "importance": "high",
    "item_type": "innovation",
    "reasoning": "Your explanation here."
}
"""
```

## Implémentation

### 1. DatabaseManager (`mcp_server/database.py`)

```python
class DatabaseManager:
    def __init__(self, database_url: str):
        self.database_url = database_url
    
    def get_unclassified_items(self, limit: int = 10) -> List[Dict]:
        """Fetch items where classification_status = 'pending'"""
        pass
    
    def get_item_by_id(self, item_id: int) -> Optional[Dict]:
        """Fetch single item for classification"""
        pass
    
    def update_classification(self, item_id: int, classification: Dict) -> bool:
        """Update item with classification results"""
        pass
    
    def log_decision(self, item_id: int, decision_data: Dict) -> int:
        """Insert classification decision with cost tracking"""
        pass
    
    def get_or_create_topic(self, topic_name: str) -> int:
        """Get existing topic or create new one"""
        pass
    
    def link_item_to_topics(self, item_id: int, topic_ids: List[int]):
        """Create many-to-many relationships in items_topics"""
        pass
```

### 2. ClassifierService (`mcp_server/services/classifier.py`)

```python
class ClassifierService:
    def __init__(self, openai_api_key: str, db_manager: DatabaseManager):
        self.client = OpenAI(api_key=openai_api_key)
        self.db = db_manager
        self.model = "gpt-3.5-turbo"
    
    async def classify_item(self, item_id: int) -> Dict:
        """Classify a single item"""
        # 1. Fetch item from DB
        item = self.db.get_item_by_id(item_id)
        if not item:
            raise ValueError(f"Item {item_id} not found")
        
        # 2. Build prompt
        prompt = self._build_prompt(item)
        
        # 3. Call LLM
        response = await self._call_llm(prompt)
        
        # 4. Parse & validate
        classification = self._parse_response(response)
        
        # 5. Update database
        self._save_classification(item_id, classification, response)
        
        return classification
    
    async def classify_batch(self, item_ids: List[int]) -> List[Dict]:
        """Classify multiple items (with rate limiting)"""
        results = []
        for item_id in item_ids:
            try:
                result = await self.classify_item(item_id)
                results.append({"item_id": item_id, "status": "success", "data": result})
            except Exception as e:
                results.append({"item_id": item_id, "status": "error", "error": str(e)})
        return results
    
    def _build_prompt(self, item: Dict) -> str:
        """Construct classification prompt"""
        pass
    
    async def _call_llm(self, prompt: str) -> Dict:
        """Call OpenAI API with error handling"""
        pass
    
    def _parse_response(self, response: Dict) -> Dict:
        """Extract and validate JSON from LLM response"""
        pass
    
    def _save_classification(self, item_id: int, classification: Dict, llm_response: Dict):
        """Persist classification to database"""
        pass
```

### 3. MCP Tool (`mcp_server/tools/classifier.py`)

```python
from mcp_server.services.classifier import ClassifierService

async def classify_item(item_id: int) -> Dict:
    """
    Classify a tech watch item using LLM.
    
    Args:
        item_id: ID of the item to classify
    
    Returns:
        {
            "item_id": 123,
            "topics": ["LLM", "GPT-4"],
            "importance": "high",
            "item_type": "innovation",
            "reasoning": "...",
            "tokens_used": 450,
            "cost_usd": 0.0007
        }
    """
    service = ClassifierService(...)
    return await service.classify_item(item_id)

async def classify_batch(limit: int = 10) -> Dict:
    """
    Classify multiple unclassified items.
    
    Args:
        limit: Maximum number of items to process
    
    Returns:
        {
            "processed": 10,
            "successful": 9,
            "failed": 1,
            "results": [...]
        }
    """
    pass
```

## Tests

### Unit Tests (`tests/test_classifier.py`)

```python
def test_build_prompt():
    """Test prompt construction with item data"""
    pass

def test_parse_valid_response():
    """Test parsing of correct LLM JSON response"""
    pass

def test_parse_invalid_response():
    """Test handling of malformed JSON"""
    pass

def test_importance_validation():
    """Test validation of importance enum values"""
    pass

@pytest.mark.asyncio
async def test_classify_item_success():
    """Test successful item classification with mocked LLM"""
    pass

@pytest.mark.asyncio
async def test_classify_item_not_found():
    """Test classification of non-existent item"""
    pass
```

### Integration Tests

```python
@pytest.mark.integration
async def test_classify_real_item():
    """Test classification with real database and LLM API"""
    # Insert test item
    # Call classifier
    # Verify database updates
    # Check decision log
    pass
```

## Métriques & Monitoring

### KPIs

- **Précision** : Cohérence des classifications (audit manuel sur sample)
- **Coût** : USD dépensés par item classifié
- **Latence** : Temps moyen de classification
- **Taux d'erreur** : % d'appels LLM échoués

### Logs

```python
logger.info(f"Classifying item {item_id}", extra={
    "item_id": item_id,
    "model": "gpt-3.5-turbo",
    "tokens_prompt": 300,
})

logger.info(f"Classification successful", extra={
    "item_id": item_id,
    "topics": ["LLM", "GPT-4"],
    "importance": "high",
    "tokens_total": 450,
    "cost_usd": 0.0007,
    "latency_ms": 1200
})
```

## Migration depuis agno (TODO)

Initialement prévu avec le framework `agno`, nous implémentons manuellement :

1. **Agent simple** : Service Python classique (pas besoin de framework complexe pour 1 task)
2. **État** : Géré par PostgreSQL (pas de mémoire agent)
3. **Orchestration** : n8n appelera l'outil MCP, pas besoin de multi-agents pour l'instant

**Évolution future** : Si nous avons besoin de multi-agents coordonnés (ex: Classifier + Summarizer + CourseGenerator travaillant ensemble), nous pourrions intégrer LangGraph ou Crew AI.

## Déploiement

### Variables d'environnement

```bash
# Dans .env (déjà configuré)
OPENAI_API_KEY=sk-proj-...
DEFAULT_CLASSIFICATION_MODEL=gpt-3.5-turbo
MAX_ITEMS_PER_BATCH=20
MAX_TOKENS_PER_REQUEST=4000
```

### Commandes

```bash
# Rebuild container avec nouveau code
docker-compose build mcp-server

# Restart service
docker-compose up mcp-server -d

# Test classification via API
curl -X POST http://localhost:8000/rpc \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "classifier.classify",
    "params": {"item_id": 1},
    "id": 1
  }'
```

## Checklist d'implémentation

- [ ] Créer `mcp_server/database.py` avec DatabaseManager
- [ ] Créer `mcp_server/services/classifier.py` avec ClassifierService
- [ ] Créer `mcp_server/tools/classifier.py` avec outils MCP
- [ ] Enregistrer les outils dans `server.py`
- [ ] Écrire tests unitaires
- [ ] Tester avec items de seed data
- [ ] Documenter l'API dans README
- [ ] Commit + Push

## Prochaines étapes (Feature 3)

Après la classification, nous pourrons implémenter :
- **Feature 3** : Générateur de cours (utilise les items classifiés)
- **Feature 4** : Système RAG pour Q&A
- **Feature 5** : Dashboard Next.js

