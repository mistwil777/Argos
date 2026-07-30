"""
Argos Pipeline — chaîne event-driven collect → classify → score → digest → RAG

Principe : chaque étape déclenche la suivante immédiatement, sans attendre
un scheduler. Le scheduler déclenche uniquement le collect initial.

Point d'entrée principal : run_pipeline_for_source(source_id)
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _make_llm():
    """Instancie le LLM provider depuis la config."""
    from argos.services.llm_provider import create_llm_provider
    from argos.config import settings
    return create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.default_classification_model,
    )


async def run_pipeline_for_source(source_id: int) -> dict:
    """
    Pipeline complet pour une source :
      1. Collecte
      2. Classification des items pending
      3. Score + ingest (digest + RAG) des items high/critical

    Remplace _auto_collect_and_classify dans router.py.
    """
    from argos.api.router import db

    # Charger la source
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name, url, type, workspace_id FROM sources WHERE id = %s AND active = TRUE",
                (source_id,)
            )
            row = cur.fetchone()

    if not row:
        logger.warning(f"[PIPELINE] Source {source_id} introuvable ou inactive")
        return {"error": "source_not_found"}

    src_id, src_name, src_url, src_type, src_wid = row
    logger.info(f"[PIPELINE] Démarrage source={source_id} ({src_type}) — {src_url}")

    # ── Étape 1 : Collecte ──────────────────────────────────────────
    inserted = await _step_collect(src_id, src_name, src_url, src_type, src_wid, db)

    if inserted == 0:
        logger.info(f"[PIPELINE] Source {source_id} — aucun nouvel item")
        return {"source_id": source_id, "inserted": 0, "classified": 0, "ingested": 0}

    # ── Étape 2 : Classification ─────────────────────────────────────
    classified_ids = await _step_classify(src_url, db)

    # ── Étape 3 : Score + Ingest des high/critical ───────────────────
    ingested = await _step_ingest_priority(src_url, src_wid, db)

    result = {
        "source_id": source_id,
        "inserted": inserted,
        "classified": len(classified_ids),
        "ingested": ingested,
    }
    logger.info(f"[PIPELINE] Source {source_id} terminée — {result}")
    return result


async def _step_collect(
    src_id: int, src_name: str, src_url: str,
    src_type: str, src_wid: Optional[int], db
) -> int:
    """Collecte les items d'une source. Retourne le nombre d'items insérés."""
    from argos.services.collector import CollectorService

    collector = CollectorService(db_manager=db)
    items = []

    if src_type == "rss":
        config = {"url": src_url, "name": src_name or src_url, "enabled": True}
        items = collector.fetch_rss_feed(config)
        for i in items:
            i.update({"workspace_id": src_wid, "source_url": src_url})

    elif src_type == "website":
        items = collector.fetch_website_page(src_url, workspace_id=src_wid)

    elif src_type == "github":
        config = {"type": "github", "url": src_url, "name": src_name or src_url, "enabled": True}
        items = collector.fetch_github_repos(config)
        for i in items:
            i.update({"workspace_id": src_wid, "source_url": src_url})

    else:
        logger.warning(f"[PIPELINE] Type source '{src_type}' non supporté")
        return 0

    # ── Filtre de fiabilité ───────────────────────────────────────────
    items, rejected = _filter_reliable_items(items)
    if rejected:
        logger.info(f"[PIPELINE] Reliability — {rejected} item(s) rejeté(s) avant insertion")

    inserted, duplicates = collector.insert_items(items)
    logger.info(f"[PIPELINE] Collect — fetched={len(items)+rejected} inserted={inserted} dupes={duplicates} rejected={rejected}")
    return inserted


def _filter_reliable_items(items: list[dict]) -> tuple[list[dict], int]:
    """
    Filtre les items via le reliability scorer avant insertion.
    Retourne (items_acceptés, nb_rejetés).
    """
    from argos.services.reliability_scorer import check_item_reliability, log_rejection

    accepted = []
    rejected = 0

    for item in items:
        url    = item.get("url") or item.get("source_url") or ""
        text   = item.get("content") or item.get("summary") or item.get("description") or ""
        title  = item.get("title") or ""
        author = item.get("author") or ""
        date   = item.get("published") or item.get("published_date") or ""

        result = check_item_reliability(url=url, text=text, title=title, author=author, published_date=date)

        if result.passed:
            # Stocker le score dans l'item pour traçabilité en base
            item["_reliability_score"] = result.score
            item["_reliability_tier"]  = result.domain_tier
            item["_reliability_reason"] = result.reason
            accepted.append(item)
        else:
            rejected += 1
            log_rejection(None, url, result.reason)
            logger.debug(f"[RELIABILITY] REJETÉ {url[:80]} — {result.reason}")

    return accepted, rejected


async def _step_classify(src_url: str, db) -> list[int]:
    """Classifie tous les items pending de cette source. Retourne les IDs classifiés."""
    from argos.services.classifier import ClassifierService

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM items WHERE source_url = %s AND classification_status = 'pending'",
                (src_url,)
            )
            pending_ids = [r[0] for r in cur.fetchall()]

    if not pending_ids:
        return []

    llm = _make_llm()
    classifier = ClassifierService(llm_provider=llm, db_manager=db, temperature=0.5, max_tokens=800)
    classified = []

    for item_id in pending_ids:
        try:
            await classifier.classify_item(item_id)
            classified.append(item_id)
        except Exception as e:
            logger.warning(f"[PIPELINE] Classify item {item_id} échoué : {e}")

    logger.info(f"[PIPELINE] Classify — {len(classified)}/{len(pending_ids)} classifiés")
    return classified


async def _step_ingest_priority(src_url: str, workspace_id: Optional[int], db) -> int:
    """
    Génère digest + indexe dans RAG pour les items high/critical sans digest.
    Calcule aussi le score de pertinence de chaque item.
    Retourne le nombre d'items ingérés.
    """
    from argos.services.digest_generator import generate_digest
    from argos.services.rag import RAGService
    from argos.services.vector_store_singleton import get_vector_store
    from argos.services.scorer import compute_item_score

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, url, summary
                FROM items
                WHERE source_url = %s
                  AND classification_status = 'classified'
                  AND importance IN ('high', 'critical')
                  AND digest_markdown IS NULL
                ORDER BY created_at DESC
                LIMIT 10
            """, (src_url,))
            items = cur.fetchall()

    if not items:
        logger.info("[PIPELINE] Ingest — aucun item high/critical à ingérer")
        return 0

    llm = _make_llm()
    vs = get_vector_store()
    rag = RAGService(llm_provider=llm, vector_store=vs, db_manager=db)
    ingested = 0

    for item_id, title, url, summary in items:
        try:
            # Score de pertinence (sans embedding pour l'instant — P2 HDBSCAN)
            score_data = compute_item_score(
                url=url or "",
                text=summary or "",
            )

            # Digest LLM
            digest = await generate_digest(
                url=url or "",
                title=title or "",
                content=summary or "",
                llm_provider=llm,
            )

            # Sauvegarder digest + score
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("""
                        UPDATE items
                        SET digest_markdown     = %s,
                            digest_json         = %s::jsonb,
                            digest_generated_at = NOW(),
                            relevance_score     = %s
                        WHERE id = %s
                    """, (
                        digest.get("markdown", ""),
                        json.dumps(digest.get("json", {})),
                        score_data["score"],
                        item_id,
                    ))
                    conn.commit()

            # Indexer dans RAG
            rag.index_item(item_id)
            ingested += 1
            logger.info(
                f"[PIPELINE] Item {item_id} ingéré — score={score_data['score']} "
                f"domain={score_data['domain_score']} density={score_data['density_score']}"
            )

        except Exception as e:
            logger.warning(f"[PIPELINE] Ingest item {item_id} échoué : {e}")

    logger.info(f"[PIPELINE] Ingest — {ingested}/{len(items)} items ingérés")
    return ingested


async def run_pipeline_batch(limit: int = 20) -> dict:
    """
    Pipeline batch pour le scheduler : classifie tous les items pending
    (toutes sources) puis ingère les high/critical sans digest.
    Utilisé par les jobs classify_pending et ingest_high_priority.
    """
    from argos.api.router import db
    from argos.services.classifier import ClassifierService
    from argos.services.digest_generator import generate_digest
    from argos.services.rag import RAGService
    from argos.services.vector_store_singleton import get_vector_store
    from argos.services.scorer import compute_item_score

    # ── Classification batch ─────────────────────────────────────────
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id FROM items
                WHERE classification_status = 'pending'
                ORDER BY created_at DESC
                LIMIT %s
            """, (limit,))
            pending_ids = [r[0] for r in cur.fetchall()]

    classified = 0
    if pending_ids:
        llm = _make_llm()
        classifier = ClassifierService(llm_provider=llm, db_manager=db, temperature=0.5, max_tokens=800)
        for item_id in pending_ids:
            try:
                await classifier.classify_item(item_id)
                classified += 1
            except Exception as e:
                logger.warning(f"[PIPELINE-BATCH] Classify {item_id} : {e}")

    # ── Ingest high/critical ──────────────────────────────────────────
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, title, url, summary FROM items
                WHERE classification_status = 'classified'
                  AND importance IN ('high', 'critical')
                  AND digest_markdown IS NULL
                ORDER BY created_at DESC
                LIMIT 10
            """)
            to_ingest = cur.fetchall()

    ingested = 0
    if to_ingest:
        llm = _make_llm()
        vs = get_vector_store()
        rag = RAGService(llm_provider=llm, vector_store=vs, db_manager=db)

        for item_id, title, url, summary in to_ingest:
            try:
                score_data = compute_item_score(url=url or "", text=summary or "")
                digest = await generate_digest(
                    url=url or "", title=title or "",
                    content=summary or "", llm_provider=llm,
                )
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            UPDATE items
                            SET digest_markdown = %s, digest_json = %s::jsonb,
                                digest_generated_at = NOW(), relevance_score = %s
                            WHERE id = %s
                        """, (
                            digest.get("markdown", ""),
                            json.dumps(digest.get("json", {})),
                            score_data["score"], item_id,
                        ))
                        conn.commit()
                rag.index_item(item_id)
                ingested += 1
            except Exception as e:
                logger.warning(f"[PIPELINE-BATCH] Ingest {item_id} : {e}")

    logger.info(f"[PIPELINE-BATCH] classified={classified} ingested={ingested}")
    return {"classified": classified, "ingested": ingested}
