"""
Argos Intent Router

Décide si une demande vocale doit être traitée par :
  A) RAG direct     — la base contient déjà des réponses suffisantes
  B) Discovery flow — la base est vide ou peu confiante : on découvre de nouvelles
                      sources, on collecte, on classe, puis on répond

Critères pour RAG direct :
  - Au moins MIN_SOURCES chunks retournés par hybrid_search
  - Confidence score >= CONFIDENCE_THRESHOLD

Sinon → discovery.
"""

import logging
import asyncio
from typing import Optional

logger = logging.getLogger(__name__)

CONFIDENCE_THRESHOLD = 0.40
MIN_SOURCES          = 3


async def route(
    transcript: str,
    workspace_id: Optional[int] = None,
    user_id: str = "default",
) -> dict:
    """
    Point d'entrée principal du router vocal.

    Retourne :
        {
            "flow"      : "rag_direct" | "discovery",
            "answer"    : str | None,       # présent si rag_direct
            "sources"   : list,
            "confidence": float,
            "intent"    : dict | None,      # présent si discovery
            "new_sources_created": int,
        }
    """
    from argos.api.router import db
    from argos.services.rag import RAGService
    from argos.services.vector_store_singleton import get_vector_store
    from argos.config import settings

    # ── 1. Essai RAG rapide ──────────────────────────────────────────
    vs = get_vector_store()
    search_results = await asyncio.to_thread(
        vs.hybrid_search,
        query=transcript,
        limit=MIN_SOURCES + 2,
        workspace_id=workspace_id,
    )

    rag_confidence = _estimate_confidence(search_results)
    rag_viable = len(search_results) >= MIN_SOURCES and rag_confidence >= CONFIDENCE_THRESHOLD

    logger.info(
        f"[ROUTER] transcript={transcript[:60]} "
        f"chunks={len(search_results)} confidence={rag_confidence:.2f} "
        f"→ {'RAG direct' if rag_viable else 'discovery'}"
    )

    _log_session(db, transcript, "rag_direct" if rag_viable else "discovery", user_id)

    # ── 2a. RAG direct ───────────────────────────────────────────────
    if rag_viable:
        from argos.services.llm_provider import create_llm_provider
        from argos.services.rag import RAG_SYSTEM_PROMPT, RAG_USER_PROMPT_TEMPLATE

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model,
        )
        rag = RAGService(llm_provider=llm, vector_store=vs, db_manager=db, top_k=8)
        result = await rag.ask(query=transcript, use_hybrid_search=True, workspace_id=workspace_id)

        return {
            "flow":                "rag_direct",
            "answer":              result.get("answer", ""),
            "sources":             result.get("sources", []),
            "confidence":          result.get("confidence_score", rag_confidence),
            "intent":              None,
            "new_sources_created": 0,
        }

    # ── 2b. Discovery flow ───────────────────────────────────────────
    from argos.services.intent_discovery import IntentService, DiscoveryService
    from argos.services.pipeline import run_pipeline_for_source

    intent_svc    = IntentService(anthropic_api_key=settings.anthropic_api_key)
    discovery_svc = DiscoveryService(db_manager=db)

    intent_data = await intent_svc.decompose(transcript)

    # Appliquer les préférences utilisateur pour filtrer les sources
    user_prefs = _load_user_preferences(db, user_id)
    candidates  = await discovery_svc.find_sources(intent_data, workspace_id=workspace_id)
    candidates  = _apply_preferences(candidates, user_prefs)

    if not candidates:
        return {
            "flow":                "discovery",
            "answer":              "Je n'ai pas trouvé de sources pertinentes pour cette demande. Voulez-vous reformuler ?",
            "sources":             [],
            "confidence":          0.0,
            "intent":              intent_data,
            "new_sources_created": 0,
        }

    # Créer les sources et collecter en background
    created = await discovery_svc.create_sources(candidates[:10])

    # Lancer le pipeline sur chaque source créée (asyncio background)
    async def _run_pipelines():
        for src in created:
            src_id = src.get("id")
            if src_id:
                try:
                    await run_pipeline_for_source(src_id)
                except Exception as e:
                    logger.warning(f"[ROUTER] Pipeline source {src_id} : {e}")

    asyncio.ensure_future(_run_pipelines())

    return {
        "flow":                "discovery",
        "answer":              None,
        "sources":             candidates,
        "confidence":          0.0,
        "intent":              intent_data,
        "new_sources_created": len(created),
    }


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _estimate_confidence(search_results: list) -> float:
    if not search_results:
        return 0.0
    scores = [r.get("score", 0.0) for r in search_results if isinstance(r, dict)]
    return round(sum(scores) / len(scores), 3) if scores else 0.0


def _load_user_preferences(db, user_id: str) -> list[dict]:
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT rule_type, value FROM user_source_preferences WHERE user_id = %s",
                    (user_id,)
                )
                return [{"rule_type": r[0], "value": r[1]} for r in cur.fetchall()]
    except Exception:
        return []


def _apply_preferences(candidates: list[dict], prefs: list[dict]) -> list[dict]:
    if not prefs:
        return candidates

    reject_domains = {p["value"] for p in prefs if p["rule_type"] == "reject_domain"}
    reject_types   = {p["value"] for p in prefs if p["rule_type"] == "reject_type"}
    prefer_types   = {p["value"] for p in prefs if p["rule_type"] == "prefer_type"}

    filtered = []
    for c in candidates:
        from argos.services.intent_discovery import _extract_domain
        domain = _extract_domain(c.get("url", ""))
        src_type = c.get("type", "")

        if domain in reject_domains:
            logger.info(f"[ROUTER] Source {domain} rejetée (préférence utilisateur)")
            continue
        if src_type in reject_types:
            logger.info(f"[ROUTER] Type {src_type} rejeté (préférence utilisateur)")
            continue

        # Bonus de score si type préféré
        if prefer_types and src_type in prefer_types:
            c["relevance_score"] = min(c.get("relevance_score", 0.5) + 0.15, 1.0)

        filtered.append(c)

    return filtered


def _log_session(db, transcript: str, flow: str, user_id: str) -> None:
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO vocal_sessions (user_id, transcript, flow) VALUES (%s, %s, %s)",
                    (user_id, transcript[:500], flow)
                )
                conn.commit()
    except Exception as e:
        logger.debug(f"[ROUTER] Log session : {e}")
