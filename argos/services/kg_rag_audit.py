"""
Job nocturne KG→RAG — audit hebdomadaire automatique.

Trois étapes :
1. Déduplication des nœuds KG quasi-doublons (embedding cosine + Haiku)
2. Réaffectation des items mal affectés (KG signal + Haiku)
3. Enrichissement des whitelists par sujet (nœuds fréquents non encore dans must_match)

Seuil de déclenchement par sujet : ≥ 50 items indexés ET ≥ 1 nœud avec source_count >= 3.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

# Seuil minimum d'items par sujet pour déclencher l'audit
MIN_ITEMS_PER_SUJET = 50
# Seuil minimum de source_count sur un nœud pour qu'il soit considéré comme signal fiable
MIN_NODE_SOURCE_COUNT = 3
# Nombre minimum de nœuds "étrangers" dans un item pour le considérer suspect
MIN_FOREIGN_NODES = 2
# Seuil de similarité cosinus pour soumettre une paire à Haiku
DEDUP_SIMILARITY_THRESHOLD = 0.85


async def run_kg_rag_audit(db, llm, vs, rag_service) -> dict:
    """
    Point d'entrée principal du job nocturne.
    Retourne les stats de l'exécution.
    """
    stats = {
        "dedup_merges": 0,
        "items_reassigned": 0,
        "terms_added": 0,
        "sujets_audited": 0,
        "sujets_skipped": 0,
    }

    # Récupérer tous les sujets actifs
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.id, s.name, s.intention_type, s.filter_config,
                           COUNT(i.id) as item_count
                    FROM sujets s
                    LEFT JOIN items i ON i.sujet_id = s.id AND i.rag_indexed = TRUE
                    WHERE s.is_active = TRUE
                    GROUP BY s.id, s.name, s.intention_type, s.filter_config
                """)
                sujets = cur.fetchall()
    except Exception as e:
        logger.error(f"KG audit: impossible de récupérer les sujets: {e}")
        return stats

    eligible_sujets = []
    for row in sujets:
        sujet_id, sujet_name, intention, filter_cfg, item_count = row
        if item_count < MIN_ITEMS_PER_SUJET:
            stats["sujets_skipped"] += 1
            logger.info(f"KG audit: sujet '{sujet_name}' ignoré ({item_count} items < {MIN_ITEMS_PER_SUJET})")
            continue
        # Vérifier qu'au moins un nœud a source_count >= MIN_NODE_SOURCE_COUNT
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT COUNT(*) FROM kg_nodes n
                        JOIN kg_node_sources ks ON ks.node_id = n.id
                        JOIN items i ON i.id = ks.item_id
                        WHERE i.sujet_id = %s AND n.source_count >= %s
                    """, (sujet_id, MIN_NODE_SOURCE_COUNT))
                    node_count = cur.fetchone()[0]
        except Exception:
            node_count = 0

        if node_count == 0:
            stats["sujets_skipped"] += 1
            logger.info(f"KG audit: sujet '{sujet_name}' ignoré (pas de nœud mature)")
            continue

        eligible_sujets.append({
            "id": sujet_id,
            "name": sujet_name,
            "intention": intention,
            "filter_config": filter_cfg or {},
            "item_count": item_count,
        })
        stats["sujets_audited"] += 1

    if not eligible_sujets:
        logger.info("KG audit: aucun sujet éligible cette semaine")
        return stats

    logger.info(f"KG audit: {len(eligible_sujets)} sujet(s) éligible(s)")

    # ── Étape 1 : Déduplication des nœuds ────────────────────────────────────
    merges = await _dedup_kg_nodes(db, llm, vs)
    stats["dedup_merges"] = merges

    # ── Étape 2 : Réaffectation des items mal affectés ────────────────────────
    reassigned = await _audit_item_assignments(db, llm, vs, rag_service, eligible_sujets)
    stats["items_reassigned"] = reassigned

    # ── Étape 3 : Enrichissement des whitelists ───────────────────────────────
    added = await _enrich_whitelists(db, llm, eligible_sujets)
    stats["terms_added"] = added

    logger.info(f"KG audit terminé: {stats}")
    return stats


# ── Étape 1 ───────────────────────────────────────────────────────────────────

async def _dedup_kg_nodes(db, llm, vs) -> int:
    """
    Fusionne les nœuds KG quasi-doublons.
    Pre-filtre embedding cosine (gratuit) → Haiku uniquement pour paires > 0.85.
    """
    import numpy as np
    from sklearn.metrics.pairwise import cosine_similarity

    # Récupérer tous les nœuds
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, label, type, source_count, item_ids
                    FROM kg_nodes
                    ORDER BY source_count DESC
                """)
                nodes = cur.fetchall()
    except Exception as e:
        logger.error(f"KG dedup: impossible de récupérer les nœuds: {e}")
        return 0

    if len(nodes) < 2:
        return 0

    logger.info(f"KG dedup: {len(nodes)} nœuds à analyser")

    # Calculer les embeddings localement
    try:
        labels = [n[1] for n in nodes]
        embeddings = []
        for label in labels:
            emb = vs.model.embed_text(label)
            embeddings.append(emb)
        embeddings = np.array(embeddings)
    except Exception as e:
        logger.warning(f"KG dedup: embedding échoué: {e}")
        return 0

    # Identifier les paires candidates (similarité > seuil)
    sim_matrix = cosine_similarity(embeddings)
    candidates = []
    for i in range(len(nodes)):
        for j in range(i + 1, len(nodes)):
            if sim_matrix[i][j] > DEDUP_SIMILARITY_THRESHOLD:
                # Ne pas fusionner des nœuds de types différents
                if nodes[i][2] == nodes[j][2]:
                    candidates.append((nodes[i], nodes[j], sim_matrix[i][j]))

    if not candidates:
        logger.info("KG dedup: aucune paire candidate")
        return 0

    logger.info(f"KG dedup: {len(candidates)} paire(s) candidate(s) soumises à Haiku")

    merges = 0
    for node_a, node_b, sim in candidates:
        id_a, label_a, type_a, count_a, items_a = node_a
        id_b, label_b, type_b, count_b, items_b = node_b

        try:
            text, _ = await llm.generate(
                prompt=f"Ces deux nœuds sont-ils le même concept ? '{label_a}' / '{label_b}' — réponds: merge|distinct",
                system_prompt="Tu décides si deux termes désignent le même concept. Réponds uniquement avec 'merge' ou 'distinct'.",
                max_tokens=10,
                temperature=0.0,
            )
            decision = text.strip().lower()
        except Exception as e:
            logger.warning(f"KG dedup: Haiku échoué pour ({label_a}, {label_b}): {e}")
            continue

        if "merge" not in decision:
            continue

        # Conserver le nœud avec le plus grand source_count, supprimer l'autre
        keep_id = id_a if count_a >= count_b else id_b
        drop_id = id_b if keep_id == id_a else id_a
        drop_items = items_b if keep_id == id_a else items_a
        keep_items = items_a if keep_id == id_a else items_b

        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    # Transférer les edges du nœud supprimé vers le conservé
                    cur.execute("""
                        UPDATE kg_edges SET source_node_id = %s
                        WHERE source_node_id = %s
                    """, (keep_id, drop_id))
                    cur.execute("""
                        UPDATE kg_edges SET target_node_id = %s
                        WHERE target_node_id = %s
                    """, (keep_id, drop_id))
                    # Supprimer les self-loops créés
                    cur.execute("""
                        DELETE FROM kg_edges
                        WHERE source_node_id = target_node_id
                    """)
                    # Fusionner les item_ids
                    merged_items = list(set((keep_items or []) + (drop_items or [])))
                    cur.execute("""
                        UPDATE kg_nodes
                        SET source_count = source_count + %s,
                            item_ids = %s,
                            last_updated_at = NOW()
                        WHERE id = %s
                    """, (count_b if keep_id == id_a else count_a, merged_items, keep_id))
                    # Supprimer le nœud doublon
                    cur.execute("DELETE FROM kg_node_sources WHERE node_id = %s", (drop_id,))
                    cur.execute("DELETE FROM kg_nodes WHERE id = %s", (drop_id,))
                    conn.commit()
            merges += 1
            logger.info(f"KG dedup: fusion '{label_a}' + '{label_b}' → nœud {keep_id} (sim={sim:.2f})")
        except Exception as e:
            logger.warning(f"KG dedup: fusion échouée pour ({label_a}, {label_b}): {e}")

    return merges


# ── Étape 2 ───────────────────────────────────────────────────────────────────

async def _audit_item_assignments(db, llm, vs, rag_service, eligible_sujets) -> int:
    """
    Détecte et corrige les items dont les nœuds KG pointent majoritairement
    vers un autre sujet.
    """
    sujet_names = {s["id"]: s["name"] for s in eligible_sujets}
    reassigned = 0

    for sujet in eligible_sujets:
        sujet_id = sujet["id"]
        sujet_name = sujet["name"]

        # Items suspects : ≥ MIN_FOREIGN_NODES nœuds avec source_count >= 3
        # qui apparaissent surtout dans d'autres sujets
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT
                            i.id,
                            i.title,
                            i.summary,
                            array_agg(DISTINCT n.label) FILTER (WHERE n.source_count >= %s) as node_labels,
                            array_agg(DISTINCT i2.sujet_id) FILTER (
                                WHERE i2.sujet_id IS NOT NULL AND i2.sujet_id != i.sujet_id
                            ) as foreign_sujet_ids
                        FROM items i
                        JOIN kg_node_sources ks ON ks.item_id = i.id
                        JOIN kg_nodes n ON n.id = ks.node_id AND n.source_count >= %s
                        JOIN kg_node_sources ks2 ON ks2.node_id = n.id
                        JOIN items i2 ON i2.id = ks2.item_id AND i2.sujet_id != i.sujet_id
                        WHERE i.sujet_id = %s
                          AND i.rag_indexed = TRUE
                        GROUP BY i.id, i.title, i.summary
                        HAVING COUNT(DISTINCT n.id) FILTER (
                            WHERE EXISTS (
                                SELECT 1 FROM kg_node_sources ks3
                                JOIN items i3 ON i3.id = ks3.item_id
                                WHERE ks3.node_id = n.id AND i3.sujet_id != i.sujet_id
                            )
                        ) >= %s
                    """, (MIN_NODE_SOURCE_COUNT, MIN_NODE_SOURCE_COUNT, sujet_id, MIN_FOREIGN_NODES))
                    suspects = cur.fetchall()
        except Exception as e:
            logger.warning(f"KG audit reassign: requête échouée pour sujet {sujet_name}: {e}")
            continue

        if not suspects:
            continue

        logger.info(f"KG audit reassign: {len(suspects)} item(s) suspect(s) dans '{sujet_name}'")

        other_names = [s["name"] for s in eligible_sujets if s["id"] != sujet_id]
        if not other_names:
            continue

        for item_id, title, summary, node_labels, foreign_sujet_ids in suspects:
            summary_short = (summary or "")[:300]
            node_str = ", ".join(node_labels or [])

            try:
                text, _ = await llm.generate(
                    prompt=(
                        f"Sujet actuel : {sujet_name}\n"
                        f"Autres sujets disponibles : {', '.join(other_names)}\n"
                        f"Entités KG détectées dans cet article : {node_str}\n"
                        f"Titre : {title}\n"
                        f"Résumé : {summary_short}\n\n"
                        f"Dans quel sujet cet article devrait-il être classé ? "
                        f"Réponds uniquement avec le nom exact d'un des sujets listés."
                    ),
                    system_prompt="Tu es un classificateur de contenu. Réponds uniquement avec le nom du sujet.",
                    max_tokens=30,
                    temperature=0.1,
                )
                suggested = text.strip()
            except Exception as e:
                logger.warning(f"KG audit reassign: Haiku échoué pour item {item_id}: {e}")
                continue

            # Trouver le sujet_id correspondant au nom suggéré
            new_sujet = next(
                (s for s in eligible_sujets if s["name"].lower() == suggested.lower()),
                None
            )
            if not new_sujet or new_sujet["id"] == sujet_id:
                continue

            # Réaffecter l'item en DB
            try:
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE items SET sujet_id = %s WHERE id = %s",
                            (new_sujet["id"], item_id)
                        )
                        conn.commit()

                # Réindexer dans le bon espace RAG
                vs.delete_item(item_id)
                rag_service.index_item(item_id)

                reassigned += 1
                logger.info(
                    f"KG audit reassign: item {item_id} ('{title[:60]}') "
                    f"'{sujet_name}' → '{new_sujet['name']}'"
                )
            except Exception as e:
                logger.warning(f"KG audit reassign: réaffectation échouée pour item {item_id}: {e}")

    return reassigned


# ── Étape 3 ───────────────────────────────────────────────────────────────────

async def _enrich_whitelists(db, llm, eligible_sujets) -> int:
    """
    Ajoute aux filter_config.must_match_confirmed les nœuds KG fréquents
    du sujet qui n'y sont pas encore.
    """
    total_added = 0

    for sujet in eligible_sujets:
        sujet_id = sujet["id"]
        sujet_name = sujet["name"]
        filter_cfg = sujet["filter_config"] or {}
        current_confirmed = [t.lower() for t in (
            filter_cfg.get("must_match_confirmed")
            or filter_cfg.get("must_match")
            or []
        )]

        # Nœuds technology/product fréquents dans ce sujet non encore dans la whitelist
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        SELECT DISTINCT n.label
                        FROM kg_nodes n
                        JOIN kg_node_sources ks ON ks.node_id = n.id
                        JOIN items i ON i.id = ks.item_id
                        WHERE i.sujet_id = %s
                          AND n.source_count >= %s
                          AND n.type IN ('technology', 'product')
                        ORDER BY n.label
                    """, (sujet_id, MIN_NODE_SOURCE_COUNT))
                    candidates = [r[0] for r in cur.fetchall()]
        except Exception as e:
            logger.warning(f"KG whitelist: requête échouée pour '{sujet_name}': {e}")
            continue

        # Filtrer ceux déjà présents
        new_candidates = [c for c in candidates if c.lower() not in current_confirmed]
        if not new_candidates:
            continue

        logger.info(f"KG whitelist: {len(new_candidates)} candidat(s) pour '{sujet_name}'")

        try:
            text, _ = await llm.generate(
                prompt=(
                    f"Sujet de veille : {sujet_name} ({sujet['intention']})\n"
                    f"Whitelist actuelle : {json.dumps(current_confirmed[:20], ensure_ascii=False)}\n"
                    f"Nouveaux termes candidats issus du KG : {json.dumps(new_candidates, ensure_ascii=False)}\n\n"
                    f"Quels termes candidats sont pertinents pour ce sujet et méritent d'être ajoutés à la whitelist ?\n"
                    f"Réponds uniquement avec une liste JSON de strings. Si aucun n'est pertinent, réponds []."
                ),
                system_prompt="Tu enrichis des whitelists de veille technologique. Réponds uniquement avec une liste JSON.",
                max_tokens=200,
                temperature=0.2,
            )
            raw = text.strip()
            start = raw.find("[")
            end = raw.rfind("]") + 1
            if start < 0 or end <= 0:
                continue
            to_add = json.loads(raw[start:end])
            if not isinstance(to_add, list):
                continue
        except Exception as e:
            logger.warning(f"KG whitelist: Haiku échoué pour '{sujet_name}': {e}")
            continue

        if not to_add:
            continue

        # Ajouter à must_match_confirmed
        updated_confirmed = list(filter_cfg.get("must_match_confirmed") or filter_cfg.get("must_match") or [])
        before = len(updated_confirmed)
        for term in to_add:
            if isinstance(term, str) and term.lower() not in current_confirmed:
                updated_confirmed.append(term)
        added = len(updated_confirmed) - before

        if added == 0:
            continue

        filter_cfg["must_match_confirmed"] = updated_confirmed
        filter_cfg["must_match"] = updated_confirmed  # champ actif

        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE sujets SET filter_config = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                        (json.dumps(filter_cfg), sujet_id)
                    )
                    conn.commit()
            total_added += added
            logger.info(f"KG whitelist: +{added} termes ajoutés à '{sujet_name}': {to_add}")
        except Exception as e:
            logger.warning(f"KG whitelist: UPDATE échoué pour '{sujet_name}': {e}")

    return total_added
