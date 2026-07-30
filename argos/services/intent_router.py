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
    on_status=None,   # callable async optionnel : on_status(msg: str)
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

    async def _status(msg: str):
        if on_status:
            await on_status(msg)
        logger.info(f"[ROUTER STATUS] {msg}")

    # ── 0. Détection intent d'action (pipeline, collecte, indexation) ──
    action_intent = _detect_action_intent(transcript)
    if action_intent:
        result = await _handle_action_intent(action_intent, transcript, db, workspace_id, on_status=on_status)
        if result is not None:
            return result

    # ── 1. Essai RAG rapide ──────────────────────────────────────────
    await _status("Je cherche dans votre base de connaissances…")
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
        await _status(f"J'ai trouvé {len(search_results)} passages pertinents dans votre base. Je formule une réponse…")
        from argos.services.llm_provider import create_llm_provider

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

    # ── 2b. Vérifier sources existantes avant de relancer une discovery ──
    await _status("Ma base est vide sur ce sujet. Je vérifie si des sources configurées correspondent…")

    existing_matching = _find_matching_sources(db, transcript)
    if existing_matching:
        await _status(f"{len(existing_matching)} source(s) existante(s) détectée(s). Je relance la collecte et l'indexation…")
        from argos.services.pipeline import run_pipeline_for_source
        import asyncio as _aio
        async def _repipeline():
            for src_id in existing_matching[:5]:
                try:
                    await run_pipeline_for_source(src_id)
                except Exception as e:
                    logger.warning(f"[ROUTER] Re-pipeline source {src_id} : {e}")
        _aio.ensure_future(_repipeline())
        return {
            "flow":                "discovery",
            "answer":              f"J'ai trouvé {len(existing_matching)} source(s) déjà configurée(s) sur ce sujet. Je relance la collecte et l'indexation. Relancez votre question dans quelques instants pour obtenir une réponse.",
            "sources":             [{"id": sid} for sid in existing_matching],
            "confidence":          0.0,
            "intent":              None,
            "new_sources_created": 0,
        }

    await _status("Aucune source existante. Je lance la recherche de nouvelles sources…")

    from argos.services.intent_discovery import IntentService, DiscoveryService
    from argos.services.pipeline import run_pipeline_for_source

    intent_svc    = IntentService(anthropic_api_key=settings.anthropic_api_key)
    discovery_svc = DiscoveryService(db_manager=db)

    await _status("J'analyse votre demande pour identifier les axes de recherche…")
    intent_data = await intent_svc.decompose(transcript)

    themes = intent_data.get("themes", [])
    if themes:
        await _status(f"Axes identifiés : {', '.join(themes[:3])}. Je cherche les meilleures sources…")
    else:
        await _status("Recherche de sources en cours, cela peut prendre quelques secondes…")

    # Appliquer les préférences utilisateur pour filtrer les sources
    user_prefs = _load_user_preferences(db, user_id)
    candidates  = await discovery_svc.find_sources(intent_data, workspace_id=workspace_id)
    candidates  = _apply_preferences(candidates, user_prefs)

    if not candidates:
        await _status("Aucune source pertinente trouvée. Voulez-vous reformuler votre demande ?")
        return {
            "flow":                "discovery",
            "answer":              "Je n'ai pas trouvé de sources pertinentes pour cette demande. Voulez-vous reformuler ?",
            "sources":             [],
            "confidence":          0.0,
            "intent":              intent_data,
            "new_sources_created": 0,
        }

    await _status(f"{len(candidates)} sources trouvées. Je les configure et lance la collecte…")

    # Créer les sources et collecter en background
    created = await discovery_svc.create_sources(candidates[:10])
    await _status(f"{len(created)} source(s) configurée(s). Collecte et analyse du contenu lancées en arrière-plan.")

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

    # Résumé synthétique des sources
    summary_parts = []
    by_type: dict = {}
    for c in candidates[:10]:
        t = c.get("type", "website")
        by_type[t] = by_type.get(t, 0) + 1
    for t, n in by_type.items():
        summary_parts.append(f"{n} {t}")
    summary = f"Sources : {', '.join(summary_parts)}."

    return {
        "flow":                "discovery",
        "answer":              None,
        "sources":             candidates,
        "confidence":          0.0,
        "intent":              intent_data,
        "new_sources_created": len(created),
        "sources_summary":     summary,
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


_ACTION_PATTERNS = [
    # (regex, action_type)
    (r"(transforme|indexe|pipeline|traite|collecte|analyse)\s+(toutes?\s+les?\s+)?sources?", "pipeline_all"),
    (r"(transforme|indexe|pipeline|traite|collecte|analyse)\s+(ce(tte)?|les?|ces)\s+sources?", "pipeline_all"),
    (r"(lance|démarre|exécute|run)\s+(le\s+)?(pipeline|traitement|collecte)", "pipeline_all"),
    (r"(met[sz]?\s+à\s+jour|actualise|rafraîchi[st]?)\s+(les?\s+)?sources?", "pipeline_all"),
    (r"(génère|crée|produis?)\s+(un\s+)?(résumé|rapport|synthèse|document|fiche)", "generate_doc"),
    (r"(liste|montre|affiche|quelles?)\s+(sont\s+)?(les?\s+)?(mes?\s+)?sources?", "list_sources"),
]

import re as _re

def _detect_action_intent(transcript: str) -> str | None:
    """Retourne le type d'action si le transcript est une commande d'action, None sinon."""
    lower = transcript.lower().strip()
    for pattern, action in _ACTION_PATTERNS:
        if _re.search(pattern, lower):
            return action
    return None


async def _handle_action_intent(action: str, transcript: str, db, workspace_id, on_status=None) -> dict:
    """Exécute une action directe sans passer par le RAG."""
    async def _status(msg: str):
        if on_status:
            await on_status(msg)
        logger.info(f"[ACTION] {msg}")

    if action == "pipeline_all":
        await _status("Je lance le pipeline sur toutes vos sources actives : collecte, classification et indexation…")
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT id, name FROM sources WHERE active = TRUE")
                    rows = cur.fetchall()

            if not rows:
                return {
                    "flow": "action",
                    "answer": "Aucune source active trouvée. Ajoutez des sources depuis la page Sources.",
                    "sources": [], "confidence": 1.0, "intent": None, "new_sources_created": 0,
                }

            await _status(f"{len(rows)} source(s) active(s) détectée(s). Pipeline en cours en arrière-plan…")

            from argos.services.pipeline import run_pipeline_for_source
            import asyncio as _aio

            async def _run_all():
                for src_id, _ in rows:
                    try:
                        await run_pipeline_for_source(src_id)
                    except Exception as e:
                        logger.warning(f"[ACTION] pipeline source {src_id} : {e}")

            _aio.ensure_future(_run_all())

            names = ", ".join(r[1] for r in rows[:5])
            suffix = f" (et {len(rows) - 5} autres)" if len(rows) > 5 else ""
            answer = (
                f"Pipeline lancé sur {len(rows)} source(s) : {names}{suffix}. "
                f"La collecte, la classification et l'indexation se font en arrière-plan. "
                f"Dans quelques minutes, vous pourrez interroger l'assistant sur le contenu collecté."
            )
            return {
                "flow": "action",
                "answer": answer,
                "sources": [{"id": r[0], "name": r[1]} for r in rows],
                "confidence": 1.0, "intent": None, "new_sources_created": 0,
            }
        except Exception as e:
            return {
                "flow": "action",
                "answer": f"Erreur lors du pipeline : {e}",
                "sources": [], "confidence": 0.0, "intent": None, "new_sources_created": 0,
            }

    if action == "list_sources":
        await _status("Je récupère la liste de vos sources…")
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT name, type, url FROM sources WHERE active = TRUE ORDER BY name")
                    rows = cur.fetchall()
            if not rows:
                answer = "Aucune source active configurée. Utilisez la page Sources pour en ajouter."
            else:
                lines = "\n".join(f"- **{r[0]}** ({r[1]}) — {r[2]}" for r in rows)
                answer = f"Vos {len(rows)} source(s) active(s) :\n\n{lines}"
            return {"flow": "action", "answer": answer, "sources": [], "confidence": 1.0, "intent": None, "new_sources_created": 0}
        except Exception as e:
            return {"flow": "action", "answer": f"Erreur : {e}", "sources": [], "confidence": 0.0, "intent": None, "new_sources_created": 0}

    # generate_doc → tombe dans le RAG normal
    return None


def _find_matching_sources(db, transcript: str) -> list[int]:
    """
    Cherche des sources existantes dont le nom ou l'URL contient des mots du transcript.
    Retourne une liste d'IDs (max 10).
    """
    try:
        words = [w for w in transcript.lower().split() if len(w) > 3]
        if not words:
            return []
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Recherche ILIKE sur nom + url pour chaque mot significatif
                conditions = " OR ".join(
                    [f"(LOWER(name) LIKE %s OR LOWER(url) LIKE %s)" for _ in words]
                )
                params = [p for w in words for p in (f"%{w}%", f"%{w}%")]
                cur.execute(
                    f"SELECT id FROM sources WHERE active = TRUE AND ({conditions}) LIMIT 10",
                    params
                )
                return [r[0] for r in cur.fetchall()]
    except Exception as e:
        logger.debug(f"[ROUTER] _find_matching_sources : {e}")
        return []


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
