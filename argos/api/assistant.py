"""
Argos Assistant API — endpoints vocaux

POST /api/v1/assistant/vocal
    Reçoit un transcript vocal, route vers RAG ou discovery, stream la réponse.

POST /api/v1/assistant/sources/feedback
    Enregistre une préférence user (rejeter un type/domaine).

GET  /api/v1/assistant/sources/preferences
    Retourne les préférences enregistrées.

DELETE /api/v1/assistant/sources/preferences/{pref_id}
    Supprime une préférence.
"""

import json
import logging
from typing import Any, AsyncGenerator, Dict, Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from argos.api.router import db
from argos.config import settings

logger = logging.getLogger(__name__)

assistant_router = APIRouter(prefix="/api/v1/assistant", tags=["assistant"])


# ─── POST /vocal ──────────────────────────────────────────────────────────────

@assistant_router.post("/vocal")
async def vocal_query(request: Dict[str, Any]):
    """
    Reçoit le transcript vocal, route vers RAG ou discovery, stream la réponse SSE.

    Corps :
        transcript   : str   — texte reconnu par STT
        workspace_id : int   — optionnel
        user_id      : str   — optionnel (défaut "default")

    Événements SSE :
        data: [FLOW]rag_direct|discovery
        data: [SOURCES]<json>
        data: [INTENT]<json>         — si discovery
        data: [DISCOVERY_START]      — si discovery (pipeline en cours)
        data: <token>                — tokens de la réponse
        data: [DONE]
    """
    transcript = request.get("transcript", "").strip()
    if not transcript:
        raise HTTPException(status_code=400, detail="transcript requis")
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY non configurée")

    workspace_id_raw = request.get("workspace_id")
    workspace_id = int(workspace_id_raw) if workspace_id_raw is not None else None
    user_id = request.get("user_id", "default")

    async def stream() -> AsyncGenerator[str, None]:
        import anthropic
        from argos.services.intent_router import route
        from argos.services.rag import RAG_SYSTEM_PROMPT, RAG_USER_PROMPT_TEMPLATE
        from argos.services.vector_store_singleton import get_vector_store

        try:
            result = await route(transcript, workspace_id=workspace_id, user_id=user_id)
            flow = result["flow"]

            yield f"data: [FLOW]{flow}\n\n"
            yield f"data: [SOURCES]{json.dumps(result['sources'], ensure_ascii=False)}\n\n"

            if result.get("intent"):
                yield f"data: [INTENT]{json.dumps(result['intent'], ensure_ascii=False)}\n\n"

            # ── RAG direct : stream la réponse ──────────────────────
            if flow == "rag_direct" and result.get("answer"):
                # Réponse déjà générée par route() — on la stream mot par mot
                # pour maintenir la cohérence UX (affichage progressif)
                words = result["answer"].split(" ")
                for i, word in enumerate(words):
                    chunk = word if i == 0 else f" {word}"
                    escaped = chunk.replace("\n", "\\n")
                    yield f"data: {escaped}\n\n"
                yield "data: [DONE]\n\n"
                return

            # ── Discovery : informer l'UI puis attendre le pipeline ──
            if flow == "discovery":
                created = result.get("new_sources_created", 0)
                yield f"data: [DISCOVERY_START]{created}\n\n"

                if created == 0:
                    answer = result.get("answer", "Aucune source trouvée pour cette demande.")
                    yield f"data: {answer.replace(chr(10), '\\n')}\n\n"
                    yield "data: [DONE]\n\n"
                    return

                # Message d'attente streamé
                msg = (
                    f"J'ai trouvé et configuré {created} source(s) pour votre demande. "
                    "La collecte et l'analyse sont en cours — cela prend quelques instants. "
                    "Vous pouvez suivre l'avancement dans l'onglet Sources."
                )
                yield f"data: {msg.replace(chr(10), '\\n')}\n\n"
                yield "data: [DONE]\n\n"
                return

        except Exception as e:
            logger.error(f"[ASSISTANT] vocal_query : {e}", exc_info=True)
            yield f"data: [ERROR]{str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ─── POST /sources/feedback ───────────────────────────────────────────────────

@assistant_router.post("/sources/feedback")
async def save_source_preference(request: Dict[str, Any]):
    """
    Enregistre une préférence utilisateur sur les sources.

    Corps :
        rule_type : "reject_domain" | "reject_type" | "prefer_type" | "prefer_domain"
        value     : ex "medium.com", "rss", "arxiv"
        reason    : explication libre (optionnel)
        user_id   : str (optionnel)
    """
    rule_type = request.get("rule_type", "").strip()
    value     = request.get("value", "").strip()
    reason    = request.get("reason", "").strip()
    user_id   = request.get("user_id", "default")

    valid_rules = {"reject_domain", "reject_type", "prefer_type", "prefer_domain"}
    if rule_type not in valid_rules:
        raise HTTPException(status_code=400, detail=f"rule_type invalide. Attendu : {valid_rules}")
    if not value:
        raise HTTPException(status_code=400, detail="value requis")

    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO user_source_preferences (user_id, rule_type, value, reason)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (user_id, rule_type, value, reason or None))
                pref_id = cur.fetchone()[0]
                conn.commit()

        logger.info(f"[ASSISTANT] Préférence enregistrée : {rule_type}={value} (user={user_id})")
        return {"id": pref_id, "rule_type": rule_type, "value": value, "reason": reason}

    except Exception as e:
        logger.error(f"[ASSISTANT] save_source_preference : {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─── GET /sources/preferences ─────────────────────────────────────────────────

@assistant_router.get("/sources/preferences")
async def get_source_preferences(user_id: str = "default"):
    """Retourne les préférences sources de l'utilisateur."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, rule_type, value, reason, created_at
                    FROM user_source_preferences
                    WHERE user_id = %s
                    ORDER BY created_at DESC
                """, (user_id,))
                rows = cur.fetchall()

        return [
            {
                "id": r[0], "rule_type": r[1], "value": r[2],
                "reason": r[3], "created_at": r[4].isoformat() if r[4] else None,
            }
            for r in rows
        ]
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── DELETE /sources/preferences/{pref_id} ───────────────────────────────────

@assistant_router.delete("/sources/preferences/{pref_id}")
async def delete_source_preference(pref_id: int):
    """Supprime une préférence source."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "DELETE FROM user_source_preferences WHERE id = %s RETURNING id",
                    (pref_id,)
                )
                deleted = cur.fetchone()
                conn.commit()

        if not deleted:
            raise HTTPException(status_code=404, detail="Préférence introuvable")

        return {"deleted": pref_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
