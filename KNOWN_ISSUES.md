# Known Issues & Limitations

## 🐛 Active Issues

### 1. RAG Assistant Timeout (Critical)
**Symptom**: L'assistant RAG timeout après 60 secondes sans réponse.

**Root Cause**: 
- `SentenceTransformer` charge le modèle `all-MiniLM-L6-v2` (~100MB) de manière synchrone
- Premier chargement prend 2-3 minutes
- Même avec `asyncio.to_thread()`, le timeout curl arrive avant la fin

**Solutions Possibles**:
1. **Pré-charger le modèle au démarrage** du serveur FastAPI (event startup)
2. **Singleton VectorStoreService** avec lazy loading et caching
3. **Utiliser une API externe** pour embeddings (OpenAI, Cohere) au lieu de local
4. **Modèle plus léger** ou quantized version
5. **Augmenter le timeout** frontend/backend à 180s

**Workaround Temporaire**: RAG désactivé dans auto_course_generator.py (lignes 252-295)

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
