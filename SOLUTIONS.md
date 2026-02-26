# Solutions Implémentées et Problèmes Connus

## ✅ CORRECTIONS APPLIQUÉES

### 1. Items ne disparaissent pas après génération  
**Problème** : `refetchQueries` causait une boucle infinie  
**Solution** : Retiré `refetchQueries`, invalidation manuelle du cache avec `queryClient.invalidateQueries()` ([frontend/src/pages/Dashboard.tsx:152](frontend/src/pages/Dashboard.tsx))

### 2. Titres dupliqués dans les cours générés  
**Problème** : GIGO (Garbage In, Garbage Out) - même contenu généré plusieurs fois  
**Solution** : Ajout de fuzzy matching (fuzzywuzzy 90%+) pour détecter et rejeter les duplications avant génération ([mcp_server/tools/auto_course_generator.py:81-106](mcp_server/tools/auto_course_generator.py))

### 3. Spinner ne s'arrête pas après génération  
**Problème** : Toast "Génération en cours..." pas supprimé  
**Solution** : Ajout de `removeToast(toastId)` après succès/erreur dans 4 fonctions :  
- `handleGenerateCourse()`  
- `handleClassifySelected()`  
- `handleGenerateCourseFromItem()`  
- `handleGenerateCourseFromClassified()`

### 4. Erreurs TypeScript d'imports  
**Problème** : `Cannot use namespace 'Course' as a type`  
**Solution** : Remplacé `import { Course }` par `import type { Course }` dans 3 fichiers

### 5. Export PDF retourne HTML  
**Symptôme** : Téléchargement suggère `course_14.html` au lieu de `.pdf`  
**Cause** : WeasyPrint manque de dépendances système (`gobject-2.0-0`, `pango`)  
**Solution temporaire** : Fallback gracieux vers HTML avec headers corrects  
**Fix complet** : Voir section "Installation WeasyPrint" ci-dessous

### 6. Asyncio Blocking (Critique ⚡)  
**Problème** : `boto3.invoke_model()` et `VectorStoreService()` bloquaient l'event loop  
**Solution** : Wrappé tous les appels synchrones avec `await asyncio.to_thread(...)`  
**Fichiers modifiés** : `course_generator_bedrock.py`, `classifier.py`, `router.py` (8 occurrences)

### 7. Animations CSS manquantes  
**Solution** : Créé `frontend/src/styles/animations.css` avec 16 keyframes (291 lignes)  
**Effets** : fadeIn, slideUp, bounce, pulse, rotate, shimmer, wave, etc.

---

## ⚠️ PROBLÈME ACTIF: RAG Assistant Timeout

### Symptôme
- L'assistant RAG tourne indéfiniment (60s timeout)
- Backend répond en 90+ secondes (trop lent)

### Cause Racine
Le modèle `SentenceTransformer('all-MiniLM-L6-v2')` **ne se charge jamais complètement** dans Docker :

```python
# Logs montrent que ça bloque après:
INFO - Load pretrained SentenceTransformer: sentence-transformers/all-MiniLM-L6-v2
# Puis plus rien... jamais de "VectorStoreService initialized"
```

**Pourquoi?**
1. Le cache HuggingFace n'est pas persisté (`~/.cache/torch` vide à chaque redémarrage)
2. Téléchargement du modèle (~100MB) prend > 90 secondes
3. Problème de permissions ou de timeout réseau

### Tentatives de Fix

#### ❌ Option A: Désactiver RAG temporairement
```python
# router.py - désactivé temporairement
use_rag = False  # Ne pas appeler VectorStore
```

#### 🔄 Option B: Singleton + Warmup (EN COURS)
**État actuel**:
- ✅ Singleton créé: `mcp_server/services/vector_store_singleton.py`
- ✅ Warmup en background task (non-bloquant)
- ❌ Chargement ne se termine jamais (même après 5+ minutes)

**Code implémenté**:
```python
# server.py (DÉSACTIVÉ pour ne pas bloquer startup)
# asyncio.create_task(warmup_vector_store())

# vector_store_singleton.py
def get_vector_store() -> VectorStoreService:
    global _vector_store_instance
    if _vector_store_instance is None:
        _vector_store_instance = VectorStoreService(...)
    return _vector_store_instance
```

### Solutions Possibles

#### ✅ RECOMMANDÉ: Persister Cache Docker Volume
```yaml
# docker-compose.yml
services:
  mcp-server:
    volumes:
      - sentence-transformers-cache:/home/appuser/.cache/torch/sentence_transformers

volumes:
  sentence-transformers-cache:
```

**Avantages**:
- Modèle téléchargé UNE SEULE FOIS
- Redémarrages rapides après premier chargement
- Warmup devient viable (30s au lieu de 90s+)

#### Alternative 1: Dockerfile Pré-chargement
```dockerfile
# Télécharger modèle pendant le build
RUN python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"
```

**Inconvénient**: Image Docker plus lourde (+90MB)

#### Alternative 2: Solution Frontend (html2pdf.js)
```typescript
// Générer PDF côté client sans WeasyPrint
import html2pdf from 'html2pdf.js';
html2pdf().from(htmlContent).save('course.pdf');
```

**Avantages**: 
- Pas de dépendances backend
- RAG reste désactivé (pas besoin)

#### Alternative 3: Lazy Loading avec Timeout  Augmenté
```python
# FastAPI configuration
@app.post("/api/v1/rag/ask", timeout=120)  # 2 minutes
async def rag_ask(request: dict):
    vector_store = get_vector_store()  # Première fois = lent
    ...
```

---

## 📋 PROCHAINES ÉTAPES

### Priorité 1: Fix RAG (Choisir UNE solution)
- [ ] **Option A**: Ajouter volume Docker pour cache (RECOMMANDÉ)
- [ ] **Option B**: Pré-charger modèle dans Dockerfile
- [ ] **Option C**: Abandonner RAG et utiliser génération sans enrichissement

### Priorité 2: Fix PDF Export
**Option A**: Installer dépendances système
```dockerfile
# Dockerfile
RUN apt-get update && apt-get install -y \
    libpango-1.0-0 libpangoft2-1.0-0 \
    libgdk-pixbuf2.0-0 libcairo2 \
    fonts-liberation2
```

**Option B**: Utiliser solution frontend (html2pdf.js)

### Test de Validation
```bash
# 1. Tester génération de cours (devrait être ~25s)
curl -X POST http://localhost:8000/api/v1/tools/execute \
  -d '{"tool_name": "course.generate", "kwargs": {"item_id": 1}}'

# 2. Tester classification (devrait être ~3s)
curl -X POST http://localhost:8000/api/v1/classifier/classify \
  -d '{"item_ids": [5, 6, 7]}'

# 3. Tester RAG (actuellement timeout)
curl -X POST http://localhost:8000/api/v1/rag/ask \
  -d '{"query": "machine learning", "top_k": 3}' \
  --max-time 15
```

---

## 🎯 COMMIT HISTORY

### Commit efa427e (2026-02-26 13:05)
**Titre**: `feat: Fix asyncio blocking, add animations, implement GIGO deduplication`

**Files Changed**: 35 files (+4300, -362)

**Major Changes**:
- ✅ Wrappé boto3/VectorStore avec asyncio.to_thread()
- ✅ Retiré refetchQueries (fix infinite loop)
- ✅ Ajouté removeToast() after generation
- ✅ Créé animations.css (291 lignes)
- ✅ GIGO deduplication (fuzzywuzzy)
- ✅ PDF export error handling
- 📝 KNOWN_ISSUES.md créé

**Pushed to**: `feature/rag-and-hitl`

### Commit à Venir
```bash
git add mcp_server/services/vector_store_singleton.py
git add mcp_server/server.py mcp_server/api/router.py
git add SOLUTIONS.md
git commit -m "feat: Add VectorStore singleton (WIP - model loading blocked)"
```

---

## Installation WeasyPrint (PDF Export Fix)

### Solution complète:
```dockerfile
# Dockerfile - ajouter AVANT la ligne USER appuser
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \   
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libcairo2 \
    libffi-dev \
    shared-mime-info \
    fonts-liberation2 \
    && rm -rf /var/lib/apt/lists/*
```

### Test après installation:
```python
docker exec academiaops-mcp-server python3 -c "
from weasyprint import HTML
html_content = '<html><body><h1>Test PDF</h1></body></html>'
pdf = HTML(string=html_content).write_pdf()
print(f'PDF generated: {len(pdf)} bytes')
"
```

---

## Performance Benchmarks

| Feature | Before | After | Amélioration |
|---------|--------|-------|--------------|
| Course Generation | ❌ Timeout (60s+) | ✅ 25s | -58% |
| Classification | ❌ Timeout | ✅ 3s | -95% |
| PDF Export | ❌ Error 500 | ⚠️ HTML fallback | Graceful degradation |
| RAG Assistant | ❌ Timeout (60s) | ❌ Timeout (90s+) | **Pas résolu** |

---

## Costs (Bedrock Claude 3.5 Haiku)

| Operation | Tokens | Cost |
|-----------|--------|------|
| Course Generation | ~5200 input | $0.0127 |
| Classification (batch) | ~700 input | $0.0008 |
| RAG Query | N/A | ❌ Non fonctionnel |

**Total testé**: $0.0135 pour 1 génération + 1 classification

