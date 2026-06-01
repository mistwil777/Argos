# Guide utilisateur OpenWebMCP

## Accès à l'interface

Ouvrez http://localhost:3000 après avoir lancé `docker compose up -d`.

---

## Browse — Accéder à une page web

1. Cliquez sur **Browse** dans la barre latérale
2. Saisissez l'URL de la page à consulter
3. Choisissez le mode :
   - **Digest** (recommandé) : génère un résumé markdown lisible + JSON structuré indexé automatiquement dans le RAG
   - **Contenu brut** : affiche le texte extrait sans transformation
4. Cliquez sur **Aller**

**Cas d'usage** : consulter un article X/Twitter, un post Reddit, une page de documentation, un blog technique.

> Les URLs X et Twitter sont automatiquement redirigées via Nitter pour éviter les blocages.

---

## Search — Rechercher sur le web

1. Cliquez sur **Search**
2. Tapez votre requête
3. Sélectionnez le moteur : DuckDuckGo (défaut), Bing ou Auto
4. Cliquez **Chercher**
5. Sur chaque résultat, cliquez **Digest** pour générer un digest de la page correspondante

**Cas d'usage** : trouver les dernières actualités sur un sujet, rechercher des articles sans connaître l'URL.

---

## Feed — Consulter le flux de contenus

La page **Feed** affiche tous les contenus collectés (via Browse, Search ou sources automatiques).

- Filtrez par importance (critical, high, medium, low)
- Cliquez sur l'icône livre pour afficher le digest d'un item
- Les liens ouvrent la source originale

---

## Sources — Gérer les sources automatiques

1. Cliquez sur **Sources**
2. Cliquez **Ajouter** pour configurer une source :
   - **Website** : page web à surveiller pour détecter les changements
   - **RSS** : flux RSS collecté automatiquement
   - **GitHub** : dépôts GitHub à surveiller
3. Activez la surveillance pour recevoir des alertes lors des changements
4. Définissez l'intervalle de vérification (minimum 5 minutes)

---

## Assistant — Poser des questions

La page **Assistant** est un chatbot RAG qui répond à deux types de questions :

1. **Questions sur les contenus collectés** : "Quelles sont les dernières avancées en MCP ?"
2. **Questions sur l'utilisation de l'outil** : "Comment surveiller une page ?"

Les docs de l'outil sont indexées automatiquement au démarrage, ce qui en fait une notice interactive.

---

## Intégration avec un agent IA

OpenWebMCP expose son API via JSON-RPC 2.0. Depuis Claude Desktop ou n'importe quel agent compatible MCP :

```json
// Dans votre config MCP (claude_desktop_config.json)
{
  "mcpServers": {
    "openwebmcp": {
      "url": "http://localhost:8000/rpc"
    }
  }
}
```

Votre agent peut alors appeler `web.browse`, `web.search`, `web.digest` directement.
