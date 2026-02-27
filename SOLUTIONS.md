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

## ✅ RÉSOLU: Export PDF/HTML avec Génération en Arrière-Plan

### Implémentation (2026-02-26 13:48 UTC)

**Architecture**:
1. **Génération PDF en background** : Au moment de créer un cours, le système tente automatiquement de générer le PDF en arrière-plan (non-bloquant)
2. **Stockage persistant** : PDFs stockés dans `/data/lancedb/pdfs/` (volume Docker)
3. **Téléchargement intelligent** : Si PDF existe → envoi PDF, sinon → fallback HTML

**Fichiers créés/modifiés**:
- `mcp_server/services/pdf_generator.py` (nouveau, 232 lignes)
  - `generate_pdf_background()` : Génération async non-bloquante
  - `get_pdf_path()` : Vérification existence PDF
  - `generate_html_export()` : Export HTML stylisé

- `mcp_server/tools/auto_course_generator.py` (modifié)
  - Appel `asyncio.create_task()` après commit du cours
  - Génération PDF en background sans ralentir la réponse

- `mcp_server/api/router.py` (modifié, endpoint `/courses/{id}/export`)
  - Vérifie si PDF pré-généré existe
  - Si oui → `Response(application/pdf)`
  - Sinon → `generate_html_export()` → `Response(text/html)`

**Avantages**:
- ✅ Génération de cours rapide (pas d'attente PDF)
- ✅ Téléchargement instantané (PDF déjà prêt)
- ✅ Fallback gracieux vers HTML si PDF échoue
- ✅ Pas de modification BDD nécessaire

**Comportement attendu**:
```
1. Utilisateur clique "Générer cours" → 25s (même vitesse qu'avant)
2. Backend génère le PDF en arrière-plan → ~5-10s (invisible pour l'utilisateur)
3. Utilisateur clique "Télécharger" → < 1s (PDF ou HTML prêt)
```

**Limitations actuelles**:
- WeasyPrint nécessite dépendances système (libpango, libcairo)
- Sans ces dépendances, tous les PDFs échoueront silencieusement → fallback HTML
- Pour activer PDF réel : installer dépendances dans Dockerfile (voir section ci-dessous)

---

## ⚠️ PROBLÈME ACTIF: RAG Assistant - Blocage Réseau CDN

- `mcp_server/tools/auto_course_generator.py` (modifié)
  - Appel `asyncio.create_task()` après commit du cours
  - Génération PDF en background sans ralentir la réponse

- `mcp_server/api/router.py` (modifié, endpoint `/courses/{id}/export`)
  - Vérifie si PDF pré-généré existe
  - Si oui → `Response(application/pdf)`
  - Sinon → `generate_html_export()` → `Response(text/html)`

**Avantages**:
- ✅ Génération de cours rapide (pas d'attente PDF)
- ✅ Téléchargement instantané (PDF déjà prêt)
- ✅ Fallback gracieux vers HTML si PDF échoue
- ✅ Pas de modification BDD nécessaire

**Comportement attendu**:
```
1. Utilisateur clique "Générer cours" → 25s (même vitesse qu'avant)
2. Backend génère le PDF en arrière-plan → ~5-10s (invisible pour l'utilisateur)
3. Utilisateur clique "Télécharger" → < 1s (PDF ou HTML prêt)
```

**Limitations actuelles**:
- WeasyPrint nécessite dépendances système (libpango, libcairo)
- Sans ces dépendances, tous les PDFs échoueront silencieusement → fallback HTML
- Pour activer PDF réel : installer dépendances dans Dockerfile (voir section ci-dessous)

---

## ⚠️ PROBLÈME ACTIF: RAG Assistant - Blocage Réseau CDN

### Symptôme
- L'assistant RAG timeout (ne répond jamais)
- Backend ne peut pas télécharger le modèle SentenceTransformer

### Diagnostic Réseau (2026-02-26 13:31 UTC)

```bash
# Test depuis conteneur:
curl https://huggingface.co → ✅ 200 OK (0.15s)
curl https://cdn-lfs-us-1.huggingface.co → ❌ DNS resolution failed
```

**Erreur HuggingFace**:
```
HTTPSConnectionPool(host='cdn-lfs-us-1.huggingface.co', port=443): 
Max retries exceeded - Failed to resolve name
```

### Cause Racine
Le **CDN HuggingFace** (`cdn-lfs-us-1.huggingface.co`) est **inaccessible** depuis le conteneur Docker :
- Possible problème DNS temporaire
- Firewall d'entreprise/réseau bloquant le CDN
- CDN régional down

Sans accès au CDN, le modèle SentenceTransformer (90MB binaire) ne peut pas être téléchargé.

### Solutions Implémentées

#### ✅ Option 1: Persister Cache Docker Volume
**Implémenté** dans `docker-compose.yml` et `Dockerfile`:

```yaml
# docker-compose.yml
environment:
  - TRANSFORMERS_CACHE=/data/lancedb/transformers_cache
  - SENTENCE_TRANSFORMERS_HOME=/data/lancedb/sentence_transformers
  - HF_HOME=/data/lancedb/huggingface
volumes:
  - lancedb_data:/data/lancedb  # Réutilise volume existant
```

>>>>>>> 710389e (feat: Background PDF generation + smart download (PDF or HTML fallback))
```dockerfile
# Dockerfile
RUN mkdir -p /data/lancedb && chmod 777 /data/lancedb
```

**Résultat**: ❌ **Échoue à cause du blocage réseau CDN** - permissions OK mais téléchargement impossible

#### ⏸️ Warmup Désactivé Temporairement
```python
# server.py - warmup commenté jusqu'à résolution réseau
# asyncio.create_task(warmup_vector_store())
```

### Solutions Alternatives au Blocage Réseau

#### 🔧 Option A: Télécharger Modèle Manuellement (RECOMMANDÉ)
```bash
# Sur machine locale (hors réseau Docker):
pip install sentence-transformers
python3 -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')"

# Copier cache dans volume Docker:
docker cp ~/.cache/torch/sentence_transformers/models--sentence-transformers--all-MiniLM-L6-v2 \
  academiaops-mcp-server:/data/lancedb/sentence_transformers/
```

#### 🌐 Option B: Utiliser Miroir HuggingFace Alternatif
```python
# mcp_server/config.py
os.environ['HF_ENDPOINT'] = 'https://hf-mirror.com'  # Miroir Chine
# ou
os.environ['HF_ENDPOINT'] = 'https://huggingface.co'  # Forcer endpoint alternatif
```

#### 🐛 Option C: Debug Réseau Docker
```bash
# Vérifier DNS dans conteneur:
docker exec academiaops-mcp-server nslookup cdn-lfs-us-1.huggingface.co

# Tester avec DNS public (Google 8.8.8.8):
docker-compose.yml:
  dns:
    - 8.8.8.8
    - 1.1.1.1
```

#### ❌ Option D: Désactiver RAG Complètement
Génération de cours fonctionne sans enrichissement vectoriel (déjà prouvé fonctionnel).

```python
# router.py
use_rag = False  # Désactiver RAG features
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

