# Synthèse des audits — Argos MVP

## Décisions par brique

| Brique | Décision | Condition |
|---|---|---|
| **APScheduler v3** | Intégrer | Job store PostgreSQL interne uniquement — 2 CVE 9.8 non patchées (RCE via désérialisation), risque faible si DB non exposée |
| **trafilatura** | Intégrer | Apache 2.0, meilleur extracteur du marché (F-Score 0.909), actif, utilisé par HuggingFace/IBM |
| **trafilatura.feeds** | Intégrer | Découverte RSS native, remplace feedsearch-crawler (orphelin) |
| **feedparser** | Intégrer | Parse le contenu des feeds, complément naturel de trafilatura |
| **faster-whisper** | Intégrer | STT local MIT, `small`+`int8` pour MVP, `medium` si WER insuffisant |
| **silero-vad** | Intégrer | MIT, maintenu juillet 2026, meilleur de sa catégorie sur bruit léger |
| **sklearn** (cosine) | Intégrer | Déjà dans le stack probable, suffisant < 10k articles |
| **textstat** | Intégrer | Score densité informationnelle, 2 lignes |
| **tldextract + Tranco** | Intégrer | Fiabilité domaine offline, ~30 MB RAM |
| **hdbscan** | Intégrer (P2) | Clustering cross-source, pas de k fixe |
| **Kokoro TTS** | **Suspendre** | Aucun benchmark français publié, silence post-avril 2025 — tester localement avant tout engagement |
| **Coqui TTS** | Rejeter | Abandonné fév. 2024 |
| **Piper TTS** | Rejeter | Archivé, migré GPL |
| **feedsearch-crawler** | Rejeter | Repo introuvable (404) |
| **newspaper4k** | Optionnel | Utile uniquement pour sites de presse avec métadonnées riches (auteur, date) |

---

## Stack final MVP — dépendances à ajouter

```
apscheduler[sqlalchemy]   # scheduling persistant PostgreSQL
trafilatura               # extraction web + découverte RSS
feedparser                # parsing feeds RSS/Atom
faster-whisper            # STT local
silero-vad                # VAD (détection voix)
textstat                  # densité informationnelle
tldextract                # extraction domaine
hdbscan                   # clustering sémantique (P2)
```

TTS : **OpenAI TTS via clé API existante** en attendant validation de Kokoro.  
Toutes les briques retenues : MIT ou Apache 2.0. Zéro GPL.

---

## Points de vigilance

1. **APScheduler CVE 9.8** : non patchées. Surveiller le repo. Acceptable en MVP job store interne.
2. **faster-whisper parallélisme** : ne pas transcire en parallèle sur CPU (fuite mémoire #1055). Singleton obligatoire.
3. **Kokoro TTS français** : tester avant tout engagement — qualité et latence inconnues sur CPU.
4. **trafilatura + SPA** : sites React/Vue nécessitent Playwright en amont. Playwright est déjà dans le stack Argos.
5. **faster-whisper pas de release 2025** : surveiller l'activité du repo.

---

## Ce qui reste custom (pas de brique)

- Score comportemental implicite → table PostgreSQL `interactions`
- Scoring composite de pertinence → ~60 lignes Python
- Intent → discovery (décomposition LLM → une seule fois par veille créée)
- Pipeline automatique collect → classify → ingest → RAG
