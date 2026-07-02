# Feature 6 : Web Interface - Spécifications

## Vue d'ensemble

Dashboard web interactif pour visualiser, gérer et interagir avec l'ensemble du système Argos.

## Objectifs

1. **Visualisation** : Dashboard avec métriques et statistiques en temps réel
2. **Gestion** : Interface pour gérer items, classifications, cours
3. **Interaction** : Interface RAG pour poser des questions
4. **Monitoring** : Suivi des coûts, performances, décisions HITL
5. **Administration** : Configuration système, gestion sources, workflows

---

## Stack Technique

### Frontend
- **React 18** avec TypeScript
- **Vite** pour le build
- **TailwindCSS** pour le styling
- **Recharts** pour les visualisations
- **React Query (TanStack Query)** pour le state management
- **React Router** pour la navigation
- **Axios** pour les requêtes API

### Backend
- **FastAPI** (déjà en place avec le serveur MCP)
- **Endpoints REST API** en plus du JSON-RPC
- **CORS** configuré pour le développement

### Déploiement
- **Frontend** : Serveur statique (Nginx ou Vite preview)
- **Backend** : uvicorn (déjà configuré)
- **Docker** : Ajout du service frontend au docker-compose.yml

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   React Web App                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Dashboard │ │ Items    │ │ Courses  │ │   RAG    │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐  │
│  │Analytics │ │  HITL    │ │  Admin   │ │Settings  │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘  │
└─────────┬───────────────────────────────────────────────┘
          │ Axios + React Query
          │
┌─────────▼───────────────────────────────────────────────┐
│              FastAPI Backend                            │
│  ┌──────────────────────────────────────────────────┐  │
│  │  JSON-RPC Endpoint (existing)                    │  │
│  │  /rpc                                             │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │  REST API Endpoints (new)                        │  │
│  │  /api/v1/items, /api/v1/courses, /api/v1/rag    │  │
│  │  /api/v1/stats, /api/v1/decisions                │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Pages et Fonctionnalités

### 1. Dashboard (Page d'accueil)

**URL** : `/`

**Widgets** :
- **Métriques globales** (cartes)
  * Total items collectés
  * Items classifiés / non classifiés
  * Cours générés / publiés
  * Coût total LLM ce mois-ci
  
- **Graphiques**
  * Items collectés par jour (7 derniers jours)
  * Distribution des topics (top 10)
  * Coûts LLM par feature (pie chart)
  * QA scores des cours (histogram)
  
- **Activité récente** (timeline)
  * 10 derniers items collectés
  * 5 dernières classifications
  * 3 derniers cours générés
  
- **Alertes**
  * Items en attente de classification (> 50)
  * Cours en attente de review
  * Erreurs récentes

**API nécessaires** :
- `GET /api/v1/stats/global`
- `GET /api/v1/stats/timeline?days=7`
- `GET /api/v1/stats/topics?limit=10`
- `GET /api/v1/stats/costs?period=month`
- `GET /api/v1/activity/recent?limit=20`

### 2. Items Manager

**URL** : `/items`

**Fonctionnalités** :
- **Liste paginée** avec filtres
  * Status : pending, classified, rejected
  * Source : RSS, API, manual
  * Date range picker
  * Topic filter (multi-select)
  
- **Vue détail** par item (modal ou page)
  * Titre, résumé, URL
  * Classification actuelle
  * Boutons d'action :
    * Reclassifier
    * Rejeter
    * Voir le cours lié
    
- **Actions batch**
  * Sélection multiple
  * Classifier plusieurs items
  * Supprimer

**API nécessaires** :
- `GET /api/v1/items?page=1&limit=20&status=pending`
- `GET /api/v1/items/{id}`
- `POST /api/v1/items/{id}/classify`
- `DELETE /api/v1/items/{id}`
- `POST /api/v1/items/batch/classify`

### 3. Courses Manager

**URL** : `/courses`

**Fonctionnalités** :
- **Liste des cours** avec filtres
  * Status : draft, review, published, archived
  * Topic
  * Niveau : beginner, intermediate, advanced
  * QA score range (slider)
  
- **Vue détail** (page dédiée)
  * Titre, description, objectifs
  * Sections avec contenus
  * QA report
  * Boutons d'action :
    * Publier
    * Archiver
    * Régénérer
    * Éditer (pour v2)
    
- **Preview mode**
  * Rendu markdown des sections
  * Exercices formatés

**API nécessaires** :
- `GET /api/v1/courses?page=1&limit=20&status=draft`
- `GET /api/v1/courses/{id}`
- `GET /api/v1/courses/{id}/content` (full content with sections)
- `POST /api/v1/courses/{id}/publish`
- `POST /api/v1/courses/{id}/regenerate`

### 4. RAG Interface

**URL** : `/rag`

**Fonctionnalités** :
- **Chat-like interface**
  * Input textbox (avec autocompletion suggestions)
  * Historique des questions/réponses
  * Bouton "New conversation"
  
- **Résultats enrichis**
  * Réponse formatée (markdown)
  * Sources affichées avec liens
  * Confidence score (barre de progression)
  * Toggle : vector-only / hybrid search
  
- **Feedback**
  * Thumbs up/down par réponse
  * Bouton "Copy answer"
  * Bouton "Share conversation"

**API nécessaires** :
- `POST /api/v1/rag/ask`
- `POST /api/v1/rag/search`
- `POST /api/v1/rag/feedback`
- `GET /api/v1/rag/history?limit=50`

### 5. Analytics

**URL** : `/analytics`

**Fonctionnalités** :
- **Coûts LLM**
  * Graphique temporel (jour/semaine/mois)
  * Breakdown par feature
  * Breakdown par provider (AWS Nova, Anthropic)
  * Projection du mois en cours
  
- **Performance**
  * Classification accuracy (si ground truth disponible)
  * Course QA scores over time
  * RAG confidence scores distribution
  
- **Utilisation**
  * Nombre de requêtes par feature
  * Top topics générés
  * Sources les plus collectées

**API nécessaires** :
- `GET /api/v1/analytics/costs?period=month&granularity=day`
- `GET /api/v1/analytics/performance?metric=qa_score&days=30`
- `GET /api/v1/analytics/usage?days=30`

### 6. HITL Manager

**URL** : `/hitl`

**Fonctionnalités** :
- **Pending decisions**
  * Liste items en attente validation
  * Liste cours en attente review
  * Boutons approve/reject inline
  
- **Decisions history**
  * Table avec filtres
  * Qui a décidé (Telegram admin, auto, webhook)
  * Quand
  * Type de décision
  
- **Configuration Telegram**
  * Status du bot (connecté/déconnecté)
  * Bouton Start/Stop bot
  * Voir le chat ID admin configuré
  * Tester une notification

**API nécessaires** :
- `GET /api/v1/hitl/pending`
- `GET /api/v1/hitl/decisions?page=1&limit=20`
- `POST /api/v1/hitl/decide`
- `GET /api/v1/hitl/bot/status`
- `POST /api/v1/hitl/bot/start`
- `POST /api/v1/hitl/bot/stop`

### 7. Admin / Settings

**URL** : `/admin`

**Fonctionnalités** :
- **Sources management**
  * Liste des sources RSS/API
  * Ajouter/supprimer
  * Activer/désactiver
  * Tester une source
  
- **System configuration**
  * Voir les variables d'environnement (masquées)
  * Changer le log level
  * Configuration coûts LLM
  
- **Database tools**
  * Statistiques tables
  * Rebuild RAG index (bouton)
  * Backup database (button)

**API nécessaires** :
- `GET /api/v1/sources`
- `POST /api/v1/sources`
- `DELETE /api/v1/sources/{id}`
- `GET /api/v1/config`
- `POST /api/v1/admin/rebuild-rag-index`

---

## Wireframes

### Dashboard
```
┌────────────────────────────────────────────────────────────────┐
│  Argos                                    [User] [Logout] │
├─────────┬──────────────────────────────────────────────────────┤
│Dashboard│  📊 Métriques Globales                               │
│Items    │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │
│Courses  │  │  Items   │ │Classified│ │ Courses  │ │  Cost  │ │
│RAG      │  │   142    │ │   98     │ │    12    │ │ $12.45 │ │
│Analytics│  └──────────┘ └──────────┘ └──────────┘ └────────┘ │
│HITL     │                                                       │
│Admin    │  📈 Items collectés (7 jours)                        │
│         │  [Line chart showing daily collection]               │
│         │                                                       │
│         │  🏷️  Top Topics           ⚡ Activité récente        │
│         │  [Bar chart topics]       [Timeline of events]       │
└─────────┴──────────────────────────────────────────────────────┘
```

### RAG Interface
```
┌────────────────────────────────────────────────────────────────┐
│  Argos                                    [User] [Logout] │
├─────────┬──────────────────────────────────────────────────────┤
│Dashboard│  💬 RAG Assistant                     [New Chat]     │
│Items    │  ┌────────────────────────────────────────────────┐ │
│Courses  │  │ 🤖: Bonjour ! Posez votre question sur AI/ML  │ │
│RAG ❯    │  │                                                │ │
│Analytics│  │ 👤: Qu'est-ce que le RAG?                      │ │
│HITL     │  │                                                │ │
│Admin    │  │ 🤖: RAG (Retrieval Augmented Generation)...   │ │
│         │  │     Sources: [cours #3] [item #42]            │ │
│         │  │     Confidence: ████████░░ 80%                │ │
│         │  │     [👍] [👎] [📋 Copy]                        │ │
│         │  │                                                │ │
│         │  ├────────────────────────────────────────────────┤ │
│         │  │ Your question...          [🔍 Hybrid ▼] [Send]│ │
│         │  └────────────────────────────────────────────────┘ │
└─────────┴──────────────────────────────────────────────────────┘
```

---

## Implémentation - Étapes

### Phase 1 : Setup & Infrastructure (1-2h)
- [ ] Créer projet React avec Vite
- [ ] Configurer TailwindCSS
- [ ] Installer dépendances (React Query, React Router, etc.)
- [ ] Configurer structure de dossiers
- [ ] Ajouter service frontend au docker-compose.yml
- [ ] Configurer proxy Vite vers backend

### Phase 2 : Backend REST API (2-3h)
- [ ] Créer router REST `/api/v1/`
- [ ] Endpoints stats (global, timeline, costs)
- [ ] Endpoints items (list, get, update, delete)
- [ ] Endpoints courses (list, get, publish)
- [ ] Endpoints RAG (ask, search, feedback)
- [ ] Endpoints HITL (pending, decisions, bot control)
- [ ] Activer CORS pour le frontend
- [ ] Tests API avec curl/Postman

### Phase 3 : Frontend - Core (2-3h)
- [ ] Layout principal avec sidebar
- [ ] Routing (React Router)
- [ ] Composants réutilisables (Card, Button, Table)
- [ ] Service API (axios client)
- [ ] React Query setup et hooks

### Phase 4 : Pages principales (3-4h)
- [ ] Dashboard avec widgets
- [ ] Items manager (liste + filtres)
- [ ] Courses manager (liste + preview)
- [ ] RAG interface (chat UI)

### Phase 5 : Analytics & Admin (2h)
- [ ] Page Analytics avec graphiques
- [ ] Page HITL manager
- [ ] Page Admin/Settings

### Phase 6 : Polish & Tests (1-2h)
- [ ] Responsive design
- [ ] Loading states & error handling
- [ ] Tests E2E basiques
- [ ] Documentation utilisateur

**Total estimé** : 11-16 heures de développement

---

## Technologies détaillées

### Frontend dependencies
```json
{
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "@tanstack/react-query": "^5.17.0",
    "axios": "^1.6.2",
    "recharts": "^2.10.3",
    "react-markdown": "^9.0.1",
    "date-fns": "^3.0.6",
    "lucide-react": "^0.303.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.10",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.16",
    "postcss": "^8.4.32",
    "typescript": "^5.3.3",
    "@types/react": "^18.2.46",
    "@types/react-dom": "^18.2.18"
  }
}
```

### Vite config (proxy)
```ts
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:8000',
      '/rpc': 'http://localhost:8000'
    }
  }
})
```

---

## Sécurité

### Authentification (Phase 2)
- **Basic Auth** ou **JWT** pour protéger l'API
- **Session management** côté frontend
- **CSRF protection** pour les actions sensibles

### CORS
- Autoriser uniquement `http://localhost:3000` (dev)
- En production : domaine spécifique

### Rate Limiting
- Limiter les requêtes RAG (coûteuses)
- Limiter les actions HITL

---

## Déploiement

### Docker Compose
```yaml
services:
  frontend:
    build: ./frontend
    ports:
      - "3000:3000"
    environment:
      - VITE_API_URL=http://mcp-server:8000
    depends_on:
      - mcp-server
```

### Production
- **Build** : `npm run build`
- **Serveur statique** : Nginx ou Vite preview
- **CDN** : Optionnel pour assets

---

## Roadmap post-MVP

### Feature 6.1 : Éditeur de cours
- Édition inline des sections
- Drag & drop pour réordonner
- Preview live

### Feature 6.2 : Auth & Permissions
- Login/logout
- Rôles : Admin, Reviewer, Viewer
- Permissions granulaires

### Feature 6.3 : Exports
- Export cours en PDF
- Export données en CSV/JSON
- API publique pour intégrations

### Feature 6.4 : Notifications temps réel
- WebSocket pour updates live
- Notifications browser
- Intégration avec Telegram

---

## Métriques de succès

- **Performance** : Temps de chargement < 2s
- **Utilisabilité** : Toutes les actions principales en < 3 clics
- **Responsive** : Fonctionne sur mobile/tablette
- **Accessibilité** : Score Lighthouse > 90

---

## Fichiers à créer

```
frontend/
├── public/
│   └── favicon.ico
├── src/
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   ├── Header.tsx
│   │   │   └── Layout.tsx
│   │   ├── ui/
│   │   │   ├── Card.tsx
│   │   │   ├── Button.tsx
│   │   │   ├── Table.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── Input.tsx
│   │   └── widgets/
│   │       ├── MetricCard.tsx
│   │       ├── TimelineChart.tsx
│   │       └── TopicsChart.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Items.tsx
│   │   ├── Courses.tsx
│   │   ├── RAG.tsx
│   │   ├── Analytics.tsx
│   │   ├── HITL.tsx
│   │   └── Admin.tsx
│   ├── services/
│   │   └── api.ts
│   ├── hooks/
│   │   ├── useItems.ts
│   │   ├── useCourses.ts
│   │   ├── useRAG.ts
│   │   └── useStats.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
└── Dockerfile
```

Backend:
```
mcp_server/
├── api/
│   ├── __init__.py
│   ├── router.py (nouveau)
│   ├── items.py
│   ├── courses.py
│   ├── rag.py
│   ├── stats.py
│   ├── hitl.py
│   └── admin.py
└── server.py (modifier pour ajouter les routes REST)
```

---

Prêt à démarrer Feature 6 ! 🚀
