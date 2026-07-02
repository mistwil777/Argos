# Référence des outils MCP

Tous les outils sont accessibles via JSON-RPC 2.0 sur `POST http://localhost:8000/rpc`.

## Format de requête

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "web.browse",
  "params": { "url": "https://example.com" }
}
```

---

## web.browse

Fetch une URL avec Playwright (rendu JS complet, anti-détection).

**Paramètres**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `url` | string | requis | URL à fetcher |
| `use_playwright` | bool | `true` | Utiliser Playwright (false = requests simple) |
| `timeout_ms` | int | `30000` | Timeout en ms |
| `workspace_id` | int | null | Workspace de destination |

**Réponse**
```json
{
  "success": true,
  "url": "https://example.com",
  "title": "Page title",
  "content": "Contenu textuel extrait...",
  "content_length": 12500,
  "links": ["https://...", "..."],
  "engine": "playwright",
  "via_nitter": false,
  "duration_ms": 1840
}
```

**Notes**
- Les URLs `x.com` et `twitter.com` sont automatiquement redirigées vers une instance Nitter.
- Fallback automatique vers `requests` si Playwright échoue.

---

## web.search

Recherche web sans API key.

**Paramètres**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `query` | string | requis | Requête de recherche |
| `engine` | string | `duckduckgo` | `duckduckgo`, `bing`, `auto` |
| `max_results` | int | `10` | Nombre maximum de résultats (max 50) |

**Réponse**
```json
{
  "success": true,
  "query": "Claude MCP tools 2025",
  "engine": "duckduckgo",
  "results": [
    {
      "url": "https://...",
      "title": "...",
      "snippet": "..."
    }
  ],
  "results_count": 8,
  "duration_ms": 620
}
```

---

## web.digest

Browse une URL et génère un digest lisible + JSON structuré pour RAG.

**Paramètres**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `url` | string | requis | URL à digester |
| `save_item` | bool | `true` | Sauvegarder en base + indexer RAG |
| `workspace_id` | int | null | Workspace de destination |

**Réponse**
```json
{
  "success": true,
  "url": "https://...",
  "title": "Article title",
  "markdown": "## Résumé\n...\n## Points clés\n- ...",
  "json": {
    "title": "...",
    "date": "2025-06-01",
    "source_domain": "example.com",
    "content_type": "news",
    "language": "fr",
    "summary": "...",
    "key_points": ["...", "..."],
    "entities": { "people": [], "organizations": [], "technologies": ["Claude", "MCP"] },
    "tags": ["ia", "mcp", "agents"],
    "importance": "high",
    "sentiment": "positive"
  },
  "item_id": 42,
  "engine": "playwright"
}
```

---

## web.watch

Enregistre une URL pour surveillance périodique (détection de changements par hash SHA-256).

**Paramètres**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `url` | string | requis | URL à surveiller |
| `name` | string | url | Nom d'affichage |
| `interval_minutes` | int | `60` | Fréquence de vérification (min 5) |
| `workspace_id` | int | null | Workspace |

**Réponse**
```json
{
  "success": true,
  "source_id": 7,
  "url": "https://...",
  "interval_minutes": 60,
  "message": "Now watching https://... every 60 minutes"
}
```

---

## web.watched_pages

Liste toutes les URLs surveillées.

**Paramètres**

| Param | Type | Défaut | Description |
|---|---|---|---|
| `workspace_id` | int | null | Filtrer par workspace |

**Réponse**
```json
{
  "success": true,
  "pages": [
    {
      "id": 7,
      "name": "OpenAI Blog",
      "url": "https://openai.com/blog",
      "interval_minutes": 60,
      "last_checked_at": "2025-06-01T10:30:00Z",
      "active": true
    }
  ],
  "count": 1
}
```

---

## rag.ask

Q&A sur le corpus indexé (digests + documentation).

**Via REST** `POST /api/v1/rag/ask`

```json
{
  "query": "Comment ajouter une source RSS ?",
  "user_identifier": "user@example.com"
}
```

**Réponse**
```json
{
  "answer": "Pour ajouter une source RSS...",
  "sources": [
    { "title": "Guide utilisateur", "score": 0.92 }
  ],
  "confidence_score": 0.87
}
```
