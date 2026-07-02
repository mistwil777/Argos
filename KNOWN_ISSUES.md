# Known Issues & Limitations

## 🐛 Active Issues

### 1. RAG Assistant Timeout (Critical)
**Status**: ✅ **FIXED** (02/06/2026)

**Root Cause**: 
- `SentenceTransformer` charge le modèle `all-MiniLM-L6-v2` (~100MB) de manière synchrone
- `warmup_vector_store()` existait mais n'était jamais appelé au démarrage
- `rag_tools.py` instanciait `VectorStoreService()` directement, ignorant le singleton
- `rag.py` appelait `hybrid_search` / `search` de façon synchrone, bloquant l'event loop

**Solution Applied**:
1. `server.py` — `warmup_vector_store()` lancé en background via `asyncio.ensure_future()` au démarrage
2. `rag_tools.py` — utilise `get_vector_store()` (singleton) au lieu de `VectorStoreService()`
3. `rag.py` — appels sync wrappés avec `asyncio.to_thread()` dans `ask()` et `search_only()`
4. `router.py` `rag_stats` — utilise le singleton au lieu de recréer une instance

---

### 2. PDF Export Returns HTML
**Status**: ✅ **FIXED** (26/02/2026)

**Solution Applied**: 
- Détecte l'erreur WeasyPrint (dépendances système manquantes)
- Retourne HTML avec `Content-Disposition: attachment; filename=*.html`
- Headers corrects: `Content-Type: text/html; charset=utf-8`

**Alternative Future**: 
- Installer bibliothèques système (pango, gobject) dans Dockerfile
- Ou utiliser html2pdf.js côté frontend

---

## 📝 Technical Debt

### Refetch Loop Prevention
**Fixed**: Supprimé `refetchQueries()` après `invalidateQueries()` dans useApi.ts
**Added**: `staleTime: 10000` pour éviter refetch excessifs

### Toast Loading Spinner
**Fixed**: Ajouté `removeToast(toastId)` dans 4 fonctions (Items.tsx)

### TypeScript Imports
**Fixed**: `import type { ... }` pour respecter `verbatimModuleSyntax: true`

### Asyncio Blocking Calls
**Fixed**: 
- `boto3.invoke_model()` → `await asyncio.to_thread()`
- `vector_store.index_item()` → `await asyncio.to_thread()`
- `vector_store.search()` → `await asyncio.to_thread()`

---

## 🚀 Recommendations

1. **RAG Optimization**: Implémenter un service singleton avec warmup au démarrage
2. **PDF Export**: Migrer vers solution frontend ou installer dépendances système
3. **Monitoring**: Ajouter logging des temps de réponse pour identifier bottlenecks
4. **Tests**: Ajouter tests e2e pour génération cours et classification
