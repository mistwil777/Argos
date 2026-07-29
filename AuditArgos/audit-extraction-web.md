# Audit — Extraction web et découverte RSS

## trafilatura

**Licence** : Apache 2.0 (v1.8.0+). Compatible commercial.  
**Activité** : 6 400 stars, v2.1.0 juin 2026, commits juillet 2026. Utilisé par HuggingFace, IBM, Microsoft Research.

### Qualité d'extraction (benchmark 750 docs)

| Outil | F-Score | Notes |
|---|---|---|
| **trafilatura** | **0.909** | Référence du domaine |
| ReadabiliPy | 0.874 | — |
| Goose3 | 0.793 | — |
| newspaper3k | 0.713 | — |

BeautifulSoup n'est pas comparable — c'est un parser HTML, pas un extracteur de contenu.

### Limites réelles
- **Paywalls** : pas de support, aucun bypass
- **SPA/JavaScript** : pas de rendu JS — nécessite Playwright en amont pour les sites React/Vue
- Sites très courts ou tableaux seuls : le filtre longueur peut rejeter du contenu légitime
- Anti-scraping agressif (Cloudflare challenge) : hors scope

### Parallélisme
Thread-safe. 100 URLs avec `ThreadPoolExecutor(max_workers=20)` est documenté comme viable. La limite est la bande passante et les rate limits cibles, pas la lib.

---

## Découverte RSS

**feedsearch-crawler** : repo GitHub introuvable (404), package orphelin. **Ne pas utiliser.**

**Solution** : trafilatura intègre nativement la découverte de feeds.

```python
from trafilatura.feeds import find_feed_urls
urls = find_feed_urls("https://mistral.ai")
```

Supporte RSS, Atom, RDF, JSON Feed. Détection via `<link rel="alternate">` + heuristiques.

**feedparser** (MIT, 2 400 stars) : parse le contenu d'un feed une fois l'URL connue. Complément naturel.

---

## newspaper4k

**Licence** : MIT + Apache-2.0. **Activité** : v0.9.6, commit juillet 2026, 1 100 stars.

Meilleur que newspaper3k mais F-Score inférieur à trafilatura. Utile pour les sites de presse (titre, auteur, date, résumé out-of-the-box). Dépendances lourdes (NLTK, pillow...).

---

## Stack recommandé

| Besoin | Outil |
|---|---|
| Extraction contenu principal | **trafilatura** |
| Sites de presse (métadonnées riches) | newspaper4k en complément |
| Découverte RSS sur un domaine | `trafilatura.feeds.find_feed_urls()` |
| Parsing feeds | feedparser |
| Sites SPA/JS | Playwright → HTML → trafilatura |
| Paywalls | Hors scope OSS |
