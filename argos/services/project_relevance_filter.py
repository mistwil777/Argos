"""
Project Relevance Filter — score la pertinence d'un article par rapport au bilan projet.

Utilise Haiku pour évaluer chaque item sur une échelle 1-5.
Les items avec score <= 2 sont marqués ignored=True en base (pas supprimés).

Déclenché uniquement pour les sources liées à un workspace projet (workspace_id non nul
et lié à un project_id avec bilan calibré).
"""

import json
import logging
from typing import Optional

import anthropic

logger = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"
RELEVANCE_THRESHOLD = 2  # score <= seuil → ignoré

_SYSTEM_PROMPT = """Tu es un système de filtrage de pertinence pour un projet de veille technologique.
Tu reçois le contexte d'un projet et un article collecté. Tu dois évaluer si l'article est pertinent pour ce projet.

Réponds UNIQUEMENT avec un JSON valide : {"score": <1-5>, "reason": "<une phrase>"}

Échelle :
1 = hors sujet total
2 = domaine adjacent mais n'apporte rien au projet
3 = pertinent en contexte général
4 = directement utile pour un des objectifs du projet
5 = exactement ce que le projet cherche"""

_USER_TEMPLATE = """## Contexte du projet
{project_context}

## Article à évaluer
Titre : {title}
Résumé : {summary}

Évalue la pertinence de cet article pour ce projet."""


async def score_item_relevance(
    item_id: int,
    title: str,
    summary: str,
    project_context: str,
    api_key: str,
) -> tuple[int, str]:
    """Retourne (score 1-5, raison)."""
    client = anthropic.AsyncAnthropic(api_key=api_key)
    user_msg = _USER_TEMPLATE.format(
        project_context=project_context[:1200],
        title=title[:200],
        summary=(summary or "")[:400],
    )
    try:
        msg = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=120,
            system=_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": "{"},
            ],
        )
        raw = "{" + msg.content[0].text.strip()
        # nettoyer éventuelles virgules finales
        raw = raw.rstrip().rstrip(",").rstrip()
        if not raw.endswith("}"):
            raw += "}"
        data = json.loads(raw)
        return int(data.get("score", 3)), str(data.get("reason", ""))
    except Exception as e:
        logger.warning(f"[RELEVANCE] Erreur scoring item {item_id}: {e}")
        return 3, "scoring_error"


async def filter_items_by_relevance(
    item_ids: list[int],
    workspace_id: int,
    db,
) -> dict:
    """
    Pour chaque item, score la pertinence par rapport au bilan projet.
    Marque ignored=True les items avec score <= RELEVANCE_THRESHOLD.
    Retourne {"scored": n, "ignored": n, "kept": n}.
    """
    from argos.config import settings

    if not settings.anthropic_api_key:
        logger.warning("[RELEVANCE] Pas de clé Anthropic — filtre désactivé")
        return {"scored": 0, "ignored": 0, "kept": len(item_ids)}

    # Récupérer le bilan projet depuis workspace_id
    project_context = _get_project_context(workspace_id, db)
    if not project_context:
        logger.info(f"[RELEVANCE] Workspace {workspace_id} sans bilan projet — filtre ignoré")
        return {"scored": 0, "ignored": 0, "kept": len(item_ids)}

    # Récupérer titres + résumés des items
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, title, summary FROM items WHERE id = ANY(%s)",
                (item_ids,),
            )
            rows = {r[0]: (r[1] or "", r[2] or "") for r in cur.fetchall()}

    scored = ignored = kept = 0
    for item_id in item_ids:
        if item_id not in rows:
            continue
        title, summary = rows[item_id]
        score, reason = await score_item_relevance(
            item_id=item_id,
            title=title,
            summary=summary,
            project_context=project_context,
            api_key=settings.anthropic_api_key,
        )
        scored += 1
        if score <= RELEVANCE_THRESHOLD:
            _mark_ignored(item_id, score, reason, db)
            ignored += 1
            logger.debug(f"[RELEVANCE] item {item_id} ignoré (score={score}) — {reason}")
        else:
            kept += 1
            logger.debug(f"[RELEVANCE] item {item_id} conservé (score={score})")

    logger.info(f"[RELEVANCE] workspace={workspace_id} scored={scored} kept={kept} ignored={ignored}")
    return {"scored": scored, "ignored": ignored, "kept": kept}


def _get_project_context(workspace_id: int, db) -> Optional[str]:
    """Retourne le bilan/watch_focus du projet lié à ce workspace, ou None."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.name, p.knowledge_profile, p.alert_keywords
                   FROM projects p
                   JOIN workspaces w ON w.project_id = p.id
                   WHERE w.id = %s""",
                (workspace_id,),
            )
            row = cur.fetchone()

    if not row:
        return None

    name, kp, alert_keywords = row
    kp = kp or {}
    bilan = kp.get("bilan_md", "")
    watch_focus = kp.get("watch_focus_md", "")
    keywords = alert_keywords or []

    parts = []
    if name:
        parts.append(f"Projet : {name}")
    if watch_focus:
        parts.append(watch_focus[:600])
    elif bilan:
        parts.append(bilan[:600])
    if keywords:
        parts.append(f"Mots-clés : {', '.join(keywords)}")

    return "\n".join(parts) if parts else None


def _mark_ignored(item_id: int, score: int, reason: str, db) -> None:
    """Marque un item comme ignoré par le filtre de pertinence projet."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE items SET user_action = 'ignored' WHERE id = %s",
                (item_id,),
            )
            conn.commit()
