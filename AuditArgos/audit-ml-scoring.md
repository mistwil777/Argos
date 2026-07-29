# Audit — Scoring de pertinence sans LLM

## 1. Détection de duplicats sémantiques

| Librairie | Licence | Verdict MVP |
|---|---|---|
| **sklearn** `cosine_similarity` | BSD-3 | Suffisant < 10k articles |
| **hnswlib** | Apache-2.0 | Au-delà de 10k |
| FAISS | MIT | Overkill < 100k vecteurs |

**Recommandation** : sklearn pour le MVP, hnswlib si la base grossit.  
Seuil pratique : similarité > 0.92 = doublon sémantique.

---

## 2. Densité informationnelle

Pas de librairie tout-en-un — score composite custom avec :

| Signal | Librairie | Licence |
|---|---|---|
| Extraction texte propre | **trafilatura** | MIT |
| Ratio termes techniques | **yake** | MIT |
| Présence de code | **pygments** | BSD |
| Lisibilité / densité lexicale | **textstat** | MIT |
| Structure HTML | beautifulsoup4 | MIT |

Score composite : longueur (30%) + code (25%) + structure (15%) + lisibilité (15%) + densité lexicale (15%).

---

## 3. Fiabilité de domaine

| Source | Type | Offline | Licence |
|---|---|---|---|
| **Tranco** (ranking 1M domaines) | CSV hebdo | Oui | Open académique |
| **python-whois** (âge domaine) | Requête réseau | Non | MIT |
| **tldextract** | Offline | Oui | BSD |

**Recommandation** : Tranco CSV + tldextract. Pas de librairie tout-en-un, c'est un lookup de dictionnaire (~30 Mo en RAM).

---

## 4. Cross-source validation

| Librairie | Licence | Verdict |
|---|---|---|
| **HDBSCAN** | BSD-3 | Recommandé — pas de k fixe, gère le bruit |
| sklearn DBSCAN | BSD-3 | Moins robuste sur texte |
| BERTopic | MIT | Trop lourd (50 Mo+ transformers) |

`min_cluster_size=2`, `metric='cosine'`, fenêtre 7 jours.  
Score : article dans cluster de taille N → `min(N/5, 1.0)`

---

## 5. Signaux comportementaux implicites

Pas de librairie dédiée — custom DB systématiquement.  
**Pattern MVP** : table PostgreSQL `interactions(article_id, event_type, duration_sec, ts)`.  
Events : `click`, `read`, `save`, `skip`.  
Score : clicks (30%) + temps de lecture moyen (50%) + saves (20%).

---

## Stack final recommandé

| Besoin | Librairie | Priorité |
|---|---|---|
| Similarité cosine | sklearn / hnswlib | P0 |
| Extraction texte | trafilatura | P0 |
| Richesse article | textstat + bs4 | P1 |
| Réputation domaine | tldextract + Tranco CSV | P1 |
| Clustering cross-source | hdbscan | P2 |
| Signaux comportementaux | PostgreSQL custom | P2 |

**Toutes MIT ou BSD. Zéro LLM. < 100 Mo installées.**
