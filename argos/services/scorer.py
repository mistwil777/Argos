"""
Argos Scorer — Scoring de pertinence sans LLM

Calcule deux scores distincts :
  - item_score  : pertinence d'un article individuel (0.0 → 1.0)
  - source_score: performance historique d'une source  (0.0 → 1.0)

Briques utilisées : sklearn (cosine), textstat, tldextract, Tranco CSV.
Zéro appel LLM, zéro coût marginal.
"""

import csv
import logging
import os
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)

# ----------------------------------------------------------------
# Tranco — chargé une fois en mémoire (~30 MB)
# ----------------------------------------------------------------
_tranco: dict[str, int] = {}
_tranco_loaded = False

TRANCO_PATH = Path(os.getenv("TRANCO_CSV_PATH", "/data/tranco.csv"))
TRANCO_MAX_RANK = 1_000_000


def _load_tranco() -> None:
    global _tranco, _tranco_loaded
    if _tranco_loaded:
        return
    if not TRANCO_PATH.exists():
        logger.warning(f"Tranco CSV non trouvé à {TRANCO_PATH} — score domaine désactivé")
        _tranco_loaded = True
        return
    with open(TRANCO_PATH) as f:
        for rank, domain in csv.reader(f):
            _tranco[domain.lower()] = int(rank)
    _tranco_loaded = True
    logger.info(f"Tranco chargé — {len(_tranco)} domaines")


# ----------------------------------------------------------------
# Score domaine (Tranco)
# ----------------------------------------------------------------
def domain_score(url: str) -> float:
    """Score de fiabilité du domaine source. 0.0 → 1.0"""
    _load_tranco()
    if not _tranco:
        return 0.5  # pas de données = neutre

    try:
        import tldextract
        ext = tldextract.extract(url)
        domain = f"{ext.domain}.{ext.suffix}".lower()
        rank = _tranco.get(domain)
        if rank is None:
            return 0.3  # inconnu = neutre-faible
        return round(1.0 - (rank / TRANCO_MAX_RANK), 3)
    except Exception:
        return 0.3


# ----------------------------------------------------------------
# Score densité informationnelle
# ----------------------------------------------------------------
def density_score(text: str, html: str = "") -> float:
    """
    Score de richesse du contenu. 0.0 → 1.0
    Heuristiques : longueur, présence de code, structure, lisibilité.
    """
    if not text or len(text.strip()) < 50:
        return 0.0

    score = 0.0

    try:
        import textstat

        words = text.split()
        word_count = len(words)

        # Longueur utile (max à 1000 mots)
        score += min(word_count / 1000, 1.0) * 0.30

        # Densité lexicale (ratio mots uniques)
        if word_count > 0:
            unique_ratio = len(set(w.lower() for w in words)) / word_count
            score += min(unique_ratio, 1.0) * 0.20

        # Lisibilité (Flesch — plus c'est bas, plus c'est dense/technique)
        flesch = textstat.flesch_reading_ease(text)
        # Texte technique : score Flesch 0-50 → on valorise les textes difficiles
        technical_score = max(0.0, 1.0 - (flesch / 100)) if flesch > 0 else 0.5
        score += technical_score * 0.20

    except Exception as e:
        logger.debug(f"textstat indisponible : {e}")
        # Fallback : longueur seule
        score += min(len(text.split()) / 500, 1.0) * 0.70

    # Présence de code dans le HTML
    if html:
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            code_blocks = len(soup.find_all(["code", "pre"]))
            headings = len(soup.find_all(["h2", "h3", "h4"]))
            score += min(code_blocks / 5, 1.0) * 0.20
            score += min(headings / 4, 1.0) * 0.10
        except Exception:
            pass

    return round(min(score, 1.0), 3)


# ----------------------------------------------------------------
# Score nouveauté sémantique
# ----------------------------------------------------------------
def novelty_score(
    embedding: list[float],
    existing_embeddings: list[list[float]],
    threshold: float = 0.92,
) -> float:
    """
    Score de nouveauté d'un article par rapport à la base existante.
    0.0 = doublon exact, 1.0 = totalement nouveau.

    Retourne aussi un flag is_duplicate si similarité > threshold.
    """
    if not existing_embeddings:
        return 1.0

    try:
        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity

        vec = np.array(embedding).reshape(1, -1)
        matrix = np.array(existing_embeddings)
        sims = cosine_similarity(vec, matrix)[0]
        max_sim = float(sims.max())
        return round(1.0 - max_sim, 3)
    except Exception as e:
        logger.debug(f"Calcul novelty_score échoué : {e}")
        return 0.5


def is_duplicate(
    embedding: list[float],
    existing_embeddings: list[list[float]],
    threshold: float = 0.92,
) -> bool:
    return novelty_score(embedding, existing_embeddings) < (1.0 - threshold)


# ----------------------------------------------------------------
# Score composite par item
# ----------------------------------------------------------------
def compute_item_score(
    url: str,
    text: str,
    html: str = "",
    embedding: Optional[list[float]] = None,
    existing_embeddings: Optional[list[list[float]]] = None,
) -> dict:
    """
    Score composite d'un item. Retourne le score global et ses composantes.

    Poids :
      - domaine      25%
      - densité      25%
      - nouveauté    30%
      - (cross-source validation : à implémenter en P2 avec HDBSCAN)
    """
    d_score = domain_score(url)
    dens_score = density_score(text, html)

    if embedding and existing_embeddings is not None:
        nov_score = novelty_score(embedding, existing_embeddings)
    else:
        nov_score = 0.5  # neutre si pas d'embedding dispo

    total = (
        d_score   * 0.25
        + dens_score * 0.25
        + nov_score  * 0.30
        # cross_score * 0.20  → P2
        + 0.5 * 0.20  # cross-source neutre pour l'instant
    )

    return {
        "score": round(min(total, 1.0), 3),
        "domain_score": d_score,
        "density_score": dens_score,
        "novelty_score": nov_score,
    }


# ----------------------------------------------------------------
# Scoring des sources (appelé par le scheduler)
# ----------------------------------------------------------------
async def score_all_sources() -> None:
    """
    Recalcule le score de pertinence de chaque source active.
    Appelé par le job nocturne du scheduler.
    """
    from argos.api.router import db

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT id FROM sources WHERE active = TRUE")
            source_ids = [r[0] for r in cur.fetchall()]

    logger.info(f"[SCORER] Scoring de {len(source_ids)} sources actives")

    for source_id in source_ids:
        try:
            await _score_single_source(source_id)
        except Exception as e:
            logger.warning(f"[SCORER] Source {source_id} : {e}")

    logger.info("[SCORER] Scoring terminé")


async def _score_single_source(source_id: int) -> None:
    from argos.api.router import db

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # Stats sur les 30 derniers jours (jointure via source_url)
            cur.execute("""
                SELECT
                    COUNT(*) AS total,
                    COUNT(*) FILTER (WHERE i.importance IN ('high','critical')) AS high_count,
                    AVG(COALESCE(i.relevance_score, 0.5)) AS avg_density
                FROM items i
                JOIN sources s ON i.source_url = s.url
                WHERE s.id = %s
                  AND i.created_at > NOW() - INTERVAL '30 days'
            """, (source_id,))
            row = cur.fetchone()

    total, high_count, avg_density = row
    total = total or 0
    high_count = high_count or 0
    avg_density = float(avg_density or 0.5)

    if total == 0:
        score = 0.3  # source sans activité récente
        ratio_high = 0.0
    else:
        ratio_high = high_count / total
        score = round(
            ratio_high  * 0.50
            + avg_density * 0.30
            + min(total / 100, 1.0) * 0.20,  # bonus activité
            3,
        )

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO source_scores (source_id, score, ratio_high, avg_density, total_items, high_items, computed_at)
                VALUES (%s, %s, %s, %s, %s, %s, NOW())
                ON CONFLICT (source_id) DO UPDATE SET
                    score        = EXCLUDED.score,
                    ratio_high   = EXCLUDED.ratio_high,
                    avg_density  = EXCLUDED.avg_density,
                    total_items  = EXCLUDED.total_items,
                    high_items   = EXCLUDED.high_items,
                    computed_at  = NOW()
            """, (source_id, score, ratio_high, avg_density, total, high_count))
            conn.commit()


# ----------------------------------------------------------------
# Decay (appelé par le scheduler hebdomadaire)
# ----------------------------------------------------------------
async def decay_low_performing_sources() -> None:
    """
    Baisse la priorité des sources avec score < 0.2 depuis 14 jours.
    Augmente la priorité des sources avec score > 0.7.
    """
    from argos.api.router import db

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # Decay : score faible depuis 14 jours → priorité low
            cur.execute("""
                UPDATE sources
                SET priority = 'low'
                WHERE id IN (
                    SELECT source_id FROM source_scores
                    WHERE score < 0.2
                      AND computed_at < NOW() - INTERVAL '14 days'
                )
                AND priority != 'low'
            """)
            decayed = cur.rowcount

            # Boost : score élevé → priorité high
            cur.execute("""
                UPDATE sources
                SET priority = 'high'
                WHERE id IN (
                    SELECT source_id FROM source_scores
                    WHERE score > 0.7
                )
                AND priority = 'normal'
            """)
            boosted = cur.rowcount

            conn.commit()

    logger.info(f"[SCORER] Decay : {decayed} sources → low, {boosted} sources → high")
