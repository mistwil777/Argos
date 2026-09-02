"""
Project Relevance Filter — score la pertinence d'articles par rapport au bilan projet.

Le prompt de scoring est généré par le LLM à la calibration du projet et stocké dans
projects.knowledge_profile['relevance_scoring_prompt'].

Si ce prompt n'existe pas (projet non calibré), le filtre est désactivé : tous les items passent.
"""

import json
import logging
from typing import Optional

logger = logging.getLogger(__name__)

RELEVANCE_THRESHOLD = 2        # score <= seuil → item ignoré (1=hors sujet, 2=adjacent inutile)
SOURCE_RELEVANCE_THRESHOLD = 2 # score <= seuil → source filtrée avant proposition

_USER_TEMPLATE = """## Article à évaluer
Titre : {title}
Résumé : {summary}

Réponds UNIQUEMENT avec un JSON valide : {{"score": <1-5>, "reason": "<une phrase>"}}"""


async def score_item_relevance(
    item_id: int,
    title: str,
    summary: str,
    scoring_prompt: str,
    llm,
) -> tuple[int, str]:
    """Retourne (score 1-5, raison). scoring_prompt = prompt généré à la calibration."""
    user_msg = _USER_TEMPLATE.format(
        title=title[:200],
        summary=(summary or "")[:400],
    )
    try:
        raw, _ = await llm.generate(
            prompt=user_msg,
            system_prompt=scoring_prompt,
            temperature=0.1,
            max_tokens=120,
        )
        raw = raw.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            data = json.loads(raw[start:end])
            return int(data.get("score", 3)), str(data.get("reason", ""))
        return 3, ""
    except Exception as e:
        logger.warning(f"[RELEVANCE] Erreur scoring item {item_id}: {e}")
        return 3, "scoring_error"


async def filter_items_by_relevance(
    item_ids: list[int],
    workspace_id: int,
    db,
) -> dict:
    """
    Pour chaque item, score la pertinence par rapport au prompt de calibration du projet.
    Si le projet n'a pas de relevance_scoring_prompt → filtre désactivé, tous les items passent.
    """
    from argos.services.llm_provider import create_llm_provider
    from argos.config import settings

    llm_config = getattr(settings, "llm_config", None) or {}
    try:
        llm = create_llm_provider(
            provider=llm_config.get("provider", "anthropic"),
            api_key=llm_config.get("api_key") or settings.anthropic_api_key or "",
            model=llm_config.get("model", "claude-haiku-4-5-20251001"),
        )
    except Exception as e:
        logger.warning(f"[RELEVANCE] Impossible de créer le LLM provider : {e} — filtre désactivé")
        return {"scored": 0, "ignored": 0, "kept": len(item_ids)}

    scoring_prompt = await _get_relevance_scoring_prompt(workspace_id, db, llm)

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
            scoring_prompt=scoring_prompt,
            llm=llm,
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


async def _get_relevance_scoring_prompt(workspace_id: int, db, llm) -> str:
    """
    Lit le prompt de scoring depuis knowledge_profile du projet.
    Si absent, le génère à la volée depuis le CDC/bilan et le stocke.
    Toujours retourne un prompt valide — le filtre est toujours actif.
    """
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT p.id, p.knowledge_profile
                   FROM projects p
                   JOIN workspaces w ON w.project_id = p.id
                   WHERE w.id = %s""",
                (workspace_id,),
            )
            row = cur.fetchone()

    if not row:
        raise ValueError(f"Aucun projet trouvé pour workspace {workspace_id}")

    project_id, kp = row
    kp = kp or {}
    existing = kp.get("relevance_scoring_prompt", "").strip()
    if existing:
        return existing

    # Générer à la volée depuis le CDC/bilan
    bilan = kp.get("bilan_md", "")
    watch_focus = kp.get("watch_focus_md", "")
    if not bilan and not watch_focus:
        raise ValueError(f"Projet {project_id} sans bilan ni CDC — calibration requise avant filtrage")

    logger.info(f"[RELEVANCE] Génération du prompt de scoring pour projet {project_id} (workspace {workspace_id})")
    prompt_input = f"""Tu vas créer un prompt de scoring de pertinence pour un système de veille automatique.

Voici le contexte du projet :

## Bilan
{bilan[:1500]}

## Angles de surveillance
{watch_focus[:600]}

Génère un prompt SYSTEM (2-4 paragraphes) qui sera injecté dans un LLM pour qu'il évalue si un article de veille est pertinent pour CE projet spécifique.

Le prompt doit :
- Décrire précisément les sujets, technologies, normes et enjeux qui comptent pour ce projet
- Définir une échelle 1-5 calibrée sur le contexte (ex: 5 = article sur DO-178C pour un projet avionique)
- Indiquer ce qui doit être éliminé (hors-domaine, marketing sans fond technique, etc.)
- Rester agnostique au modèle LLM utilisé

Réponds UNIQUEMENT avec le texte du prompt, sans balises ni JSON."""

    generated, _ = await llm.generate(
        prompt=prompt_input,
        system_prompt="Tu es un expert en systèmes de veille automatique. Tu génères des prompts de scoring précis et calibrés.",
        temperature=0.3,
        max_tokens=800,
    )
    generated = generated.strip()

    # Stocker pour les prochaines fois
    kp["relevance_scoring_prompt"] = generated
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            import json as _json
            cur.execute(
                "UPDATE projects SET knowledge_profile = %s WHERE id = %s",
                (_json.dumps(kp), project_id),
            )
            conn.commit()

    logger.info(f"[RELEVANCE] Prompt généré et stocké pour projet {project_id}")
    return generated


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


_SOURCE_SYSTEM_PROMPT = """Tu es un système de sélection de sources pour un projet de veille technologique.
Tu reçois le contexte d'un projet et une source candidate (URL, nom, description).
Tu dois évaluer si cette source va régulièrement produire des articles utiles pour ce projet.

Réponds UNIQUEMENT avec un JSON valide : {"score": <1-5>, "reason": "<une phrase>"}

Échelle :
1 = domaine sans rapport avec le projet (ex: gaming, audio, généraliste grand public)
2 = domaine adjacent mais produira rarement du contenu utile
3 = source généraliste IA qui couvre parfois le sujet mais sans ciblage
4 = source spécialisée dans un domaine clé du projet
5 = source de référence directe pour les objectifs du projet (normes, institutions, publications spécialisées)"""

_SOURCE_USER_TEMPLATE = """## Contexte du projet
{project_context}

## Source candidate
URL : {url}
Nom : {name}
Description : {description}

Cette source va-t-elle produire régulièrement des articles utiles pour ce projet ?"""


async def score_source_relevance(
    url: str,
    name: str,
    description: str,
    project_context: str,
    api_key: str,
) -> tuple[int, str]:
    """Évalue si une source candidate est pertinente pour le projet. Retourne (score 1-5, raison)."""
    client = anthropic.AsyncAnthropic(api_key=api_key)
    user_msg = _SOURCE_USER_TEMPLATE.format(
        project_context=project_context[:1200],
        url=url[:200],
        name=(name or url)[:150],
        description=(description or "")[:300],
    )
    try:
        msg = await client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=120,
            system=_SOURCE_SYSTEM_PROMPT,
            messages=[
                {"role": "user", "content": user_msg},
                {"role": "assistant", "content": "{"},
            ],
        )
        raw = "{" + msg.content[0].text.strip()
        raw = raw.rstrip().rstrip(",").rstrip()
        if not raw.endswith("}"):
            raw += "}"
        data = json.loads(raw)
        return int(data.get("score", 3)), str(data.get("reason", ""))
    except Exception as e:
        logger.warning(f"[SOURCE-FILTER] Erreur scoring {url}: {e}")
        return 3, "scoring_error"


async def filter_candidates_by_relevance(
    candidates: list[dict],
    project_context: str,
    api_key: str,
) -> list[dict]:
    """
    Filtre les sources candidates par pertinence projet.
    Retourne uniquement les sources avec score > SOURCE_RELEVANCE_THRESHOLD.
    Ajoute 'relevance_score_llm' et 'relevance_reason' sur chaque candidat conservé.
    """
    if not candidates or not project_context:
        return candidates

    kept = []
    for c in candidates:
        url = c.get("url", "")
        name = c.get("name", "")
        description = c.get("reason") or c.get("description") or ""
        score, reason = await score_source_relevance(url, name, description, project_context, api_key)
        if score > SOURCE_RELEVANCE_THRESHOLD:
            c["relevance_score_llm"] = score
            c["relevance_reason"] = reason
            kept.append(c)
            logger.debug(f"[SOURCE-FILTER] CONSERVÉE score={score} — {url[:60]}")
        else:
            logger.info(f"[SOURCE-FILTER] FILTRÉE score={score} ({reason[:60]}) — {url[:60]}")

    logger.info(f"[SOURCE-FILTER] {len(kept)}/{len(candidates)} sources conservées après filtre LLM")
    return kept


def _mark_ignored(item_id: int, score: int, reason: str, db) -> None:
    """Marque un item comme ignoré par le filtre de pertinence projet."""
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE items SET user_action = 'ignored' WHERE id = %s",
                (item_id,),
            )
            conn.commit()
