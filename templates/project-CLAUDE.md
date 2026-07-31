# Contexte du projet

<!-- Décris ici le projet : objectif, stack technique, contraintes -->

---

## Argos — Base de veille technologique

Ce projet est connecté à **Argos**, un système de veille technologique qui collecte
et indexe en continu les articles, annonces et pratiques de l'écosystème IA/dev.

### Quand consulter Argos

Avant toute décision ou génération sur les sujets suivants, appelle le tool `argos_ask` :

- Choix d'un outil, framework ou librairie
- Architecture technique ou pattern de conception
- Génération d'un CDC, PRD, ADR ou document technique
- Question sur les "meilleures pratiques" ou tendances récentes
- Comparaison de solutions (ex: "LanceDB vs Pinecone en 2026")

### Quand NE PAS consulter Argos

- Corrections syntaxiques ou typos
- Refactoring mécanique (renommage, déplacement de fichiers)
- Tests unitaires simples sans choix architectural
- Questions sur la syntaxe du langage (Python, TypeScript…)

### Exemples d'appels

```
argos_ask("meilleures pratiques RAG avec LanceDB 2026")
argos_ask("comparaison frameworks agents IA")
argos_ask("outils MCP serveur Python")
```

### Configuration MCP (à vérifier)

Le serveur MCP Argos doit être déclaré dans `.claude/settings.json` :

```json
{
  "mcpServers": {
    "argos": {
      "type": "http",
      "url": "http://localhost:8000/mcp"
    }
  }
}
```
