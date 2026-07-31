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

    # ── 0a. Questions méta sur l'état de la base ────────────────────
    meta_intent = _detect_meta_intent(transcript)
    if meta_intent:
        result = await _handle_meta_intent(meta_intent, transcript, db, workspace_id, on_status=on_status)
        if result is not None:
            return result

    # ── 0b. Détection intent d'action (pipeline, collecte, indexation) ──
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

    # ── 2b. Confiance insuffisante → réponse honnête, pas de discovery ──
    chunk_count = len(search_results)
    if chunk_count > 0:
        await _status(f"J'ai trouvé {chunk_count} passage(s) mais la confiance est faible ({rag_confidence:.0%}). Je tente quand même une réponse…")
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
            "confidence":          rag_confidence,
            "intent":              None,
            "new_sources_created": 0,
        }

    await _status("Aucun contenu indexé sur ce sujet.")
    return {
        "flow":                "rag_direct",
        "answer":              "Je n'ai pas de contenu indexé sur ce sujet. Vérifiez que vos sources sont actives et que le pipeline a été lancé récemment (commande : \"lance le pipeline\").",
        "sources":             [],
        "confidence":          0.0,
        "intent":              None,
        "new_sources_created": 0,
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


_META_PATTERNS = [
    # Questions sur l'état de la base / ce qui a été collecté
    (r"(qu[ei]ls?|combien|liste|montre|affiche|quoi|qu'est[- ]ce).*(collect[ée]|index[ée]|récup[ée]r|ingér|ajout)", "meta_collected"),
    (r"(qu[ei]ls?|combien|liste|montre|affiche).*(article|document|source|sujet|contenu).*(semaine|jour|hier|récent|derni|cette)", "meta_collected"),
    (r"(cette semaine|cette année|aujourd'hui|dernière[s]? (jours?|semaines?|heures?)).*(collect|article|sujet|ajout|index)", "meta_collected"),
    (r"(état|status|résumé).*(base|collect|index|source)", "meta_collected"),
    (r"(quoi de neuf|nouveaut[ée]s?|qu'est[- ]ce.*(nouveau|récent))", "meta_collected"),
]

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


def _detect_meta_intent(transcript: str) -> str | None:
    lower = transcript.lower().strip()
    for pattern, intent_type in _META_PATTERNS:
        if _re.search(pattern, lower):
            return intent_type
    return None


async def _handle_meta_intent(intent: str, transcript: str, db, workspace_id, on_status=None) -> dict | None:
    async def _status(msg: str):
        if on_status:
            await on_status(msg)

    if intent == "meta_collected":
        await _status("Je consulte votre base pour lister le contenu collecté récemment…")
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    # Articles des 7 derniers jours
                    cur.execute("""
                        SELECT i.title, i.source_url, i.published_at, s.name as source_name
                        FROM items i
                        LEFT JOIN sources s ON i.source_id = s.id
                        WHERE i.published_at >= NOW() - INTERVAL '7 days'
                           OR i.created_at  >= NOW() - INTERVAL '7 days'
                        ORDER BY COALESCE(i.published_at, i.created_at) DESC
                        LIMIT 30
                    """)
                    rows = cur.fetchall()

                    # Compte par source
                    cur.execute("""
                        SELECT s.name, COUNT(*) as cnt
                        FROM items i
                        JOIN sources s ON i.source_id = s.id
                        WHERE i.created_at >= NOW() - INTERVAL '7 days'
                        GROUP BY s.name
                        ORDER BY cnt DESC
                        LIMIT 10
                    """)
                    by_source = cur.fetchall()

            if not rows:
                answer = "Aucun article collecté au cours des 7 derniers jours. Vérifiez que vos sources sont actives et que le pipeline a été lancé."
            else:
                lines = []
                for title, url, pub_at, src_name in rows:
                    date_str = pub_at.strftime("%d/%m") if pub_at else "?"
                    src = f" ({src_name})" if src_name else ""
                    lines.append(f"- **{title}**{src} — {date_str}")

                summary_parts = [f"{cnt} de {name}" for name, cnt in by_source]
                summary = f"\n\n**Répartition :** {', '.join(summary_parts)}." if summary_parts else ""

                answer = f"**{len(rows)} articles collectés cette semaine :**\n\n" + "\n".join(lines) + summary

            return {
                "flow": "action",
                "answer": answer,
                "sources": [],
                "confidence": 1.0,
                "intent": None,
                "new_sources_created": 0,
            }
        except Exception as e:
            logger.warning(f"[META] Erreur : {e}")
            return None  # fallback vers RAG normal

    return None


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
