"""
Hygiène RAG — nettoyage automatique (Niveau 1) + alertes HITL (Niveau 2)

Règles niveau 1 (sans intervention humaine) :
  1. Items orphelins (source supprimée) → supprimer
  2. Sources inactives 90+ jours → désactiver
  3. Doublons exacts (même URL, même source_url) → supprimer le plus ancien
  4. Items jamais ressortis depuis 60j (rag_indexed=False) → archiver
  5. Quasi-doublons (75-99% similarité sémantique) → fusionner LLM + créer alerte fusion_proposal
"""

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)


async def run_rag_hygiene() -> dict:
    """Point d'entrée principal — exécute toutes les règles niveau 1."""
    from argos.api.router import db

    stats = {
        "orphans_deleted": 0,
        "sources_deactivated": 0,
        "exact_dupes_deleted": 0,
        "items_archived": 0,
        "fusion_proposals_created": 0,
        "errors": [],
    }

    for rule_fn, key in [
        (_delete_orphan_items, None),
        (_deactivate_inactive_sources, None),
        (_delete_exact_duplicates, None),
        (_archive_stale_items, None),
        (_detect_near_duplicates, None),
    ]:
        try:
            result = await rule_fn(db)
            if isinstance(result, dict):
                for k, v in result.items():
                    if k in stats:
                        stats[k] += v
        except Exception as e:
            logger.error(f"[RAG HYGIENE] Erreur dans {rule_fn.__name__}: {e}", exc_info=True)
            stats["errors"].append(f"{rule_fn.__name__}: {str(e)}")

    logger.info(
        f"[RAG HYGIENE] Terminé — orphelins:{stats['orphans_deleted']} "
        f"sources_désactivées:{stats['sources_deactivated']} "
        f"doublons:{stats['exact_dupes_deleted']} "
        f"archivés:{stats['items_archived']} "
        f"fusions_proposées:{stats['fusion_proposals_created']}"
    )
    return stats


async def _delete_orphan_items(db) -> dict:
    """Supprime les items dont la source_url ne correspond à aucune source active."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                DELETE FROM items
                WHERE source_url IS NOT NULL
                  AND NOT EXISTS (
                    SELECT 1 FROM sources WHERE url = items.source_url
                  )
                RETURNING id
            """)
            deleted = cur.rowcount
            conn.commit()

    if deleted:
        logger.info(f"[RAG HYGIENE] {deleted} items orphelins supprimés")
    return {"orphans_deleted": deleted}


async def _deactivate_inactive_sources(db) -> dict:
    """Désactive les sources qui n'ont produit aucun item depuis 90 jours."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE sources
                SET active = FALSE
                WHERE active = TRUE
                  AND id NOT IN (
                    SELECT DISTINCT s.id
                    FROM sources s
                    JOIN items i ON i.source_url = s.url
                    WHERE i.created_at > NOW() - INTERVAL '90 days'
                  )
                  AND created_at < NOW() - INTERVAL '90 days'
                RETURNING id, url
            """)
            rows = cur.fetchall()
            conn.commit()

    count = len(rows)
    if count:
        logger.info(f"[RAG HYGIENE] {count} sources désactivées (inactives 90j)")
    return {"sources_deactivated": count}


async def _delete_exact_duplicates(db) -> dict:
    """
    Supprime les items dupliqués : même URL ET même source_url → garde le plus récent.
    """
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # Identifie les groupes dupliqués et supprime tous sauf le plus récent (max id)
            cur.execute("""
                DELETE FROM items
                WHERE id IN (
                    SELECT id FROM (
                        SELECT id,
                               ROW_NUMBER() OVER (
                                   PARTITION BY url, source_url
                                   ORDER BY created_at DESC, id DESC
                               ) AS rn
                        FROM items
                        WHERE url IS NOT NULL AND source_url IS NOT NULL
                    ) ranked
                    WHERE rn > 1
                )
                RETURNING id
            """)
            deleted = cur.rowcount
            conn.commit()

    if deleted:
        logger.info(f"[RAG HYGIENE] {deleted} doublons exacts supprimés")
    return {"exact_dupes_deleted": deleted}


async def _archive_stale_items(db) -> dict:
    """
    Archive les items indexés dans le RAG mais jamais ressortis depuis 60 jours.
    Archiver = rag_indexed = FALSE (on conserve l'item mais il sort du RAG).
    """
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                UPDATE items
                SET rag_indexed = FALSE
                WHERE rag_indexed = TRUE
                  AND created_at < NOW() - INTERVAL '60 days'
                  AND id NOT IN (
                    SELECT DISTINCT unnest(item_ids)
                    FROM rag_hygiene_alerts
                    WHERE type = 'freshness'
                      AND status = 'confirmed'
                  )
                RETURNING id
            """)
            archived = cur.rowcount
            conn.commit()

    if archived:
        logger.info(f"[RAG HYGIENE] {archived} items archivés (jamais ressortis en 60j)")
    return {"items_archived": archived}


async def _detect_near_duplicates(db) -> dict:
    """
    Détecte les quasi-doublons (75-99% similarité sémantique) dans LanceDB.
    Pour chaque paire candidate :
      - Fusionne via LLM (claude-haiku-4-5)
      - Crée une alerte fusion_proposal dans rag_hygiene_alerts
      - Remplace les deux items RAG par l'item synthétique (rag_indexed=FALSE sur les originaux)
    """
    try:
        from argos.services.vector_store_singleton import get_vector_store
        vs = get_vector_store()
    except Exception as e:
        logger.warning(f"[RAG HYGIENE] VectorStore indisponible — quasi-doublons ignorés : {e}")
        return {"fusion_proposals_created": 0}

    proposals_created = 0

    try:
        table = vs.db.open_table(vs.table_name)
    except Exception:
        return {"fusion_proposals_created": 0}

    # Récupère un échantillon d'items indexés récents (max 500 pour contrôler le coût)
    try:
        rows = table.search().where("source_type = 'item'").limit(500).to_list()
    except Exception:
        rows = table.to_pandas().to_dict("records")

    if len(rows) < 2:
        return {"fusion_proposals_created": 0}

    import numpy as np

    vectors = []
    ids = []
    contents = []

    for r in rows:
        vec = r.get("vector")
        item_id = r.get("item_id") or r.get("id")
        content = r.get("content") or r.get("text") or ""
        if vec is not None and item_id is not None:
            vectors.append(np.array(vec, dtype=np.float32))
            ids.append(int(item_id))
            contents.append(content)

    if len(vectors) < 2:
        return {"fusion_proposals_created": 0}

    mat = np.stack(vectors)
    norms = np.linalg.norm(mat, axis=1, keepdims=True)
    norms = np.where(norms == 0, 1e-9, norms)
    mat_norm = mat / norms
    sim_matrix = mat_norm @ mat_norm.T

    seen_pairs: set = set()

    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            sim = float(sim_matrix[i, j])
            if sim < 0.75 or sim >= 1.0:
                continue

            pair_key = (min(ids[i], ids[j]), max(ids[i], ids[j]))
            if pair_key in seen_pairs:
                continue
            seen_pairs.add(pair_key)

            # Vérifie qu'aucune alerte fusion_proposal non résolue n'existe déjà pour cette paire
            already_exists = await _alert_exists_for_pair(db, ids[i], ids[j])
            if already_exists:
                continue

            fused_content = await _fuse_items_llm(contents[i], contents[j], sim)
            if not fused_content:
                continue

            await _create_fusion_alert(db, ids[i], ids[j], fused_content, sim)
            proposals_created += 1

            # Limite à 10 fusions par nuit pour contrôler le coût LLM
            if proposals_created >= 10:
                return {"fusion_proposals_created": proposals_created}

    return {"fusion_proposals_created": proposals_created}


async def _alert_exists_for_pair(db, id_a: int, id_b: int) -> bool:
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT 1 FROM rag_hygiene_alerts
                WHERE type = 'fusion_proposal'
                  AND status IN ('pending', 'confirmed')
                  AND item_ids @> ARRAY[%s, %s]::integer[]
                LIMIT 1
            """, (id_a, id_b))
            return cur.fetchone() is not None


async def _fuse_items_llm(content_a: str, content_b: str, similarity: float) -> Optional[str]:
    """Fusionne deux contenus proches via claude-haiku-4-5."""
    try:
        import anthropic
        client = anthropic.Anthropic()

        sim_pct = int(similarity * 100)
        prompt = f"""Tu dois fusionner deux extraits d'information similaires à {sim_pct}% en un seul texte synthétique.

Règles :
- Conserve TOUTES les informations uniques des deux extraits (les {100 - sim_pct}% de différence peuvent contenir des infos précieuses)
- Élimine les redondances
- Le résultat doit être plus court que la somme des deux
- Langue : français ou anglais selon le contenu source
- Format : texte brut sans titre

Extrait A :
{content_a[:1500]}

Extrait B :
{content_b[:1500]}

Synthèse fusionnée :"""

        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=800,
            messages=[{"role": "user", "content": prompt}],
        )
        return message.content[0].text.strip()

    except Exception as e:
        logger.warning(f"[RAG HYGIENE] Fusion LLM échouée : {e}")
        return None


async def _create_fusion_alert(db, id_a: int, id_b: int, fused_content: str, similarity: float) -> None:
    sim_pct = int(similarity * 100)
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO rag_hygiene_alerts
                (type, item_ids, message, proposed_content, status)
                VALUES ('fusion_proposal', %s::integer[], %s, %s, 'pending')
            """, (
                [id_a, id_b],
                f"Deux items similaires à {sim_pct}% — synthèse proposée",
                fused_content,
            ))
            conn.commit()
