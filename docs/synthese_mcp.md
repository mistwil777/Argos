# Synthèse MCP (Model Context Protocol) pour Architecte IA 🔧

**Temps de lecture** : 10 minutes  
**Objectif** : Comprendre MCP comme standard d'interopérabilité pour systèmes IA

---

## 🎯 MCP en une phrase

**MCP est un protocole standardisé (JSON-RPC 2.0) qui permet aux LLM et aux applications d'interagir avec des outils externes (APIs, bases de données, services) de manière structurée, prédictible et documentée.**

---

## 🤔 Pourquoi MCP existe

### Le problème avant MCP

Avant MCP, chaque système IA inventait son propre format pour exposer des fonctions :

```python
# Format LangChain
tools = [
    Tool(name="search", func=search_function, description="...")
]

# Format OpenAI Function Calling
functions = [
    {"name": "search", "parameters": {"type": "object", ...}}
]

# Format custom
api.register_tool("search", search_function)
```

**3 problèmes majeurs** :
1. **Pas de standard** : Chaque framework a sa propre façon de faire
2. **Pas d'introspection** : Difficile de découvrir quels tools sont disponibles
3. **Pas de typage** : Les erreurs sont détectées à l'exécution

### La solution MCP

MCP standardise **3 concepts fondamentaux** :

| Concept | Description | Analogie |
|---------|-------------|----------|
| **Tools** | Fonctions appelables par l'IA | API REST endpoints |
| **Resources** | Données exposées en lecture | Fichiers statiques |
| **Prompts** | Templates de prompts paramétrables | Fonctions avec args |

**Architecture** :
```
┌─────────────┐         JSON-RPC 2.0        ┌──────────────┐
│   Client    │◄────────────────────────────│  MCP Server  │
│ (LLM, App)  │                             │  (Backend)   │
│             │──────────────────────────────►│             │
│  Discovery  │    tools/list, tools/execute │  Tools impl  │
└─────────────┘                             └──────────────┘
```

**Avantage architectural** : Le client **découvre dynamiquement** les tools disponibles (introspection).

---

## 🧠 Les 3 primitives MCP

### 1. Tools (Fonctions)

Un **tool** est une fonction que le client peut appeler.

**Structure d'un tool** :
```json
{
  "name": "batch_classify_items",
  "description": "Classifie plusieurs items de veille en un seul appel",
  "inputSchema": {
    "type": "object",
    "properties": {
      "items": {
        "type": "array",
        "items": {"type": "object"},
        "description": "Liste des items à classifier"
      }
    },
    "required": ["items"]
  }
}
```

**Point critique pour architecte IA** : Le schéma d'input est **auto-documenté**. Un client intelligent (y compris un LLM) peut comprendre comment utiliser le tool sans doc externe.

---

### 2. Resources (Données)

Un **resource** expose des données en lecture seule (comme une API GET).

**Exemple** :
```json
{
  "uri": "argos://courses/list",
  "name": "Liste des cours disponibles",
  "mimeType": "application/json"
}
```

**Usage** : Un LLM peut demander les resources disponibles, puis les lire pour enrichir son contexte.

**Dans Argos** :
- `argos://items/pending` : Liste des items en attente de validation
- `argos://courses/topics` : Liste des sujets de cours
- `argos://stats/monthly` : Stats du mois

---

### 3. Prompts (Templates)

Un **prompt** est un template paramétrable.

**Exemple** :
```json
{
  "name": "compare_tech",
  "description": "Compare deux technologies",
  "arguments": [
    {"name": "tech1", "description": "Première techno", "required": true},
    {"name": "tech2", "description": "Deuxième techno", "required": true}
  ]
}
```

**Usage** : Le client appelle `prompts/get` avec `{"tech1": "MCP", "tech2": "LangGraph"}` et reçoit un prompt complet.

**Point critique** : Dans Argos, on utilise principalement les **Tools**, mais les Prompts sont utiles pour des patterns de questions récurrentes.

---

## 🔌 JSON-RPC 2.0 : Le protocole sous-jacent

MCP utilise **JSON-RPC 2.0** comme transport.

### Anatomie d'une requête

```json
{
  "jsonrpc": "2.0",
  "id": "req_123",
  "method": "tools/execute",
  "params": {
    "tool": "batch_classify_items",
    "input": {
      "items": [...]
    }
  }
}
```

| Champ | Description |
|-------|-------------|
| `jsonrpc` | Version du protocole (toujours "2.0") |
| `id` | Identifiant unique de la requête (pour matcher la réponse) |
| `method` | Méthode appelée (ex : `tools/list`, `tools/execute`) |
| `params` | Paramètres (spécifiques à la méthode) |

### Anatomie d'une réponse (succès)

```json
{
  "jsonrpc": "2.0",
  "id": "req_123",
  "result": {
    "results": [...],
    "tokens_used": 450,
    "cost_usd": 0.0023
  }
}
```

### Anatomie d'une réponse (erreur)

```json
{
  "jsonrpc": "2.0",
  "id": "req_123",
  "error": {
    "code": -32603,
    "message": "Internal error: Database connection failed"
  }
}
```

**Codes d'erreur standards** :
- `-32700` : Parse error (JSON invalide)
- `-32600` : Invalid request
- `-32601` : Method not found
- `-32602` : Invalid params
- `-32603` : Internal error

**Point critique** : Respecter ces codes facilite le debugging et l'interopérabilité.

---

## 🏗️ Architecture MCP d'Argos

### La stack complète

```
┌─────────────────────────────────────────────────────┐
│                   Clients MCP                       │
├─────────────────────────────────────────────────────┤
│  n8n           Dashboard        CLI (tests)         │
│  (HTTP)        (HTTP)           (HTTP)              │
└────────┬───────────────┬────────────────┬───────────┘
         │               │                │
         ▼               ▼                ▼
    ┌─────────────────────────────────────────────┐
    │      MCP Server (FastAPI + JSON-RPC)        │
    │                                              │
    │  HTTP POST /mcp/v1/tools/execute            │
    │                                              │
    │  ┌──────────────────────────────────────┐  │
    │  │          Tools Registry              │  │
    │  │  - batch_classify_items              │  │
    │  │  - generate_course                   │  │
    │  │  - search_knowledge_base             │  │
    │  │  - get_pending_items                 │  │
    │  │  - validate_item                     │  │
    │  └──────────────┬───────────────────────┘  │
    │                 │                           │
    │                 ▼                           │
    │  ┌──────────────────────────────────────┐  │
    │  │       Agents Agno (logique)          │  │
    │  │  - Classifier                        │  │
    │  │  - CourseBuilder                     │  │
    │  │  - RAG Responder                     │  │
    │  └──────────────────────────────────────┘  │
    └─────────────────────────────────────────────┘
```

**Flux de données** :
1. Client (n8n) envoie requête JSON-RPC
2. MCP Server parse la requête
3. MCP Server route vers le tool approprié
4. Tool appelle l'agent Agno correspondant
5. Agent exécute la logique métier
6. Résultat remonté au client

---

## 🎨 Design d'un Tool MCP (bonnes pratiques)

### Principe 1 : Un tool = Une responsabilité

❌ **Mauvais** (tool fourre-tout) :
```python
@Tool(name="manage_items")
async def manage_items(action: str, data: dict):
    if action == "classify":
        # ...
    elif action == "validate":
        # ...
    elif action == "delete":
        # ...
```

✅ **Bon** (tools spécialisés) :
```python
@Tool(name="classify_items")
async def classify_items(items: list[dict]):
    # ...

@Tool(name="validate_item")
async def validate_item(item_id: int, decision: str):
    # ...
```

**Bénéfice** : Introspection claire, documentation auto-générée, testabilité.

---

### Principe 2 : Schémas Pydantic pour validation

```python
from pydantic import BaseModel, Field

class ClassifyInput(BaseModel):
    items: list[dict] = Field(description="Items à classifier")
    context: str = Field(default="", description="Contexte utilisateur")

class ClassifyOutput(BaseModel):
    results: list[dict]
    tokens_used: int
    cost_usd: float

@Tool(name="batch_classify_items")
async def batch_classify_items(input_data: dict) -> dict:
    # Validation automatique
    validated = ClassifyInput(**input_data)
    
    # Logique métier
    results = await classifier_agent.classify(validated.items)
    
    # Retour typé
    return ClassifyOutput(
        results=results,
        tokens_used=450,
        cost_usd=0.0023
    ).dict()
```

**Bénéfices** :
- Validation automatique des inputs
- Documentation auto-générée (`.schema()`)
- Type hints pour l'IDE
- Pas d'erreurs runtime stupides

---

### Principe 3 : Métadonnées riches

Chaque tool doit exposer **au minimum** :

| Métadonnée | Description | Exemple |
|------------|-------------|---------|
| `name` | Nom unique du tool | `batch_classify_items` |
| `description` | Explication claire (1-2 phrases) | "Classifie plusieurs items en un seul appel optimisé" |
| `inputSchema` | Schéma JSON des inputs | (généré par Pydantic) |
| `outputSchema` | Schéma JSON des outputs | (optionnel mais recommandé) |
| `tags` | Catégories | `["classification", "batch", "llm"]` |

**Pourquoi ?** Un LLM ou un développeur doit pouvoir **découvrir et comprendre** le tool sans documentation externe.

---

### Principe 4 : Gestion d'erreurs explicite

```python
@Tool(name="generate_course")
async def generate_course(input_data: dict) -> dict:
    try:
        # Validation
        validated = GenerateCourseInput(**input_data)
        
        # Logique métier
        course = await course_builder.generate(validated.item_id)
        
        return GenerateCourseOutput(course=course).dict()
    
    except ItemNotFoundError as e:
        # Erreur métier (l'item n'existe pas)
        raise MCPError(
            code=-32001,  # Code custom (>= -32000)
            message=f"Item {validated.item_id} not found"
        )
    
    except Exception as e:
        # Erreur technique inattendue
        logger.error(f"Unexpected error: {e}")
        raise MCPError(
            code=-32603,  # Internal error
            message="Internal server error"
        )
```

**Point critique** : Différencie les **erreurs métier** (code custom) des **erreurs techniques** (code standard).

---

## 🚀 Implémentation dans Argos

### Structure du serveur MCP

```python
# mcp_server/server.py
from fastapi import FastAPI
from tools import TOOLS_REGISTRY

app = FastAPI(title="Argos MCP Server")

@app.post("/mcp/v1/tools/execute")
async def execute_tool(request: MCPRequest):
    """Point d'entrée principal MCP"""
    tool_name = request.params["tool"]
    tool_input = request.params["input"]
    
    if tool_name not in TOOLS_REGISTRY:
        return MCPResponse(
            id=request.id,
            error={"code": -32601, "message": f"Tool not found: {tool_name}"}
        )
    
    tool_func = TOOLS_REGISTRY[tool_name]
    result = await tool_func(tool_input)
    
    return MCPResponse(id=request.id, result=result)

@app.get("/mcp/v1/tools/list")
async def list_tools():
    """Liste tous les tools disponibles (introspection)"""
    return {
        "tools": [
            {
                "name": name,
                "description": tool.description,
                "inputSchema": tool.input_schema
            }
            for name, tool in TOOLS_REGISTRY.items()
        ]
    }
```

**Points clés** :
- `/tools/execute` : Exécuter un tool
- `/tools/list` : Introspection (découvrir les tools)
- `TOOLS_REGISTRY` : Dictionnaire Python mappant noms → fonctions

---

### Registry des tools

```python
# mcp_server/tools/__init__.py
from .classification import batch_classify_items
from .generation import generate_course
from .search import search_knowledge_base

TOOLS_REGISTRY = {
    "batch_classify_items": batch_classify_items,
    "generate_course": generate_course,
    "search_knowledge_base": search_knowledge_base,
    # ... autres tools
}
```

**Avantage** : Ajouter un nouveau tool = créer le fichier + l'ajouter au registry. Pas de refactoring global.

---

## 🔐 Sécurité MCP

### 1. Pas d'exposition publique (MVP)

Le serveur MCP doit être **privé** :
- Écoute sur `0.0.0.0:8000` mais **uniquement accessible depuis Docker network** ou localhost
- Pas de port forwarding public
- Pas de DNS externe

**Clients autorisés** :
- n8n (via réseau Docker)
- Dashboard (via API proxy Next.js)
- CLI local (pour tests)

---

### 2. Authentification (optionnelle, post-MVP)

Pour sécuriser davantage :
```python
from fastapi import Header, HTTPException

@app.post("/mcp/v1/tools/execute")
async def execute_tool(
    request: MCPRequest,
    authorization: str = Header(None)
):
    # Vérifier le token
    if authorization != f"Bearer {SECRET_TOKEN}":
        raise HTTPException(401, "Unauthorized")
    # ...
```

**Ou utilise API keys** :
```python
X-API-Key: <secret_key_depuis_.env>
```

---

### 3. Validation stricte des inputs

**Toujours valider** avec Pydantic :
```python
try:
    validated = ToolInput(**raw_input)
except ValidationError as e:
    return MCPResponse(
        error={"code": -32602, "message": str(e)}
    )
```

**Ne JAMAIS** exécuter du code arbitraire depuis les inputs.

---

## 🎓 Ce que tu DOIS retenir

### Pour être efficace avec MCP

1. **MCP = interface standardisée** : Les tools, resources, prompts sont découvrables
2. **JSON-RPC 2.0** : Format simple et robuste pour appels RPC
3. **Un tool = Une responsabilité** : Pas de tools fourre-tout
4. **Pydantic pour validation** : Schémas auto-documentés, validation automatique
5. **Gestion d'erreurs explicite** : Codes d'erreur standards + customs

### Les 5 tools critiques d'Argos

| Tool | Description | Appelé par |
|------|-------------|------------|
| `batch_classify_items` | Classifier plusieurs items (batching) | n8n (veille quotidienne) |
| `generate_course` | Générer un cours complet (3 niveaux) | Dashboard (après validation) |
| `search_knowledge_base` | Recherche RAG dans la base | Dashboard (chatbot) |
| `get_pending_items` | Lister items en attente | Dashboard (page validation) |
| `validate_item` | Enregistrer décision humaine | Dashboard (bouton Oui/Non) |

---

## 🔗 Ressources

- [Documentation officielle MCP](https://modelcontextprotocol.io)
- [Spécification JSON-RPC 2.0](https://www.jsonrpc.org/specification)
- [Notre dossier tools](../mcp_server/tools/) (à créer)
- [Exemples officiels MCP Python](https://github.com/anthropics/mcp-python)

---

## ✅ Checklist avant de coder

- [ ] Je comprends la différence entre Tool, Resource et Prompt
- [ ] Je sais structurer une requête JSON-RPC 2.0
- [ ] Je comprends pourquoi Pydantic est utilisé pour les schémas
- [ ] Je sais gérer les erreurs avec les codes standards
- [ ] Je comprends que MCP est l'interface, Agno la logique métier

**Si ces 5 points sont clairs, tu es prêt à implémenter ton serveur MCP ! 🔧**

---

[← Synthèse n8n](synthese_n8n.md) | [Retour à l'index](README.md) | [Synthèse Agno + Skills →](synthese_agno.md)
