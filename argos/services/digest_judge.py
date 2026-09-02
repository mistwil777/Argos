"""
LLM-as-judge — évalue la qualité des digests générés par Nova Pro.

Critères (1-5) :
- Fidélité    : rien dans le digest qui ne soit dans l'article source
- Complétude  : les points importants sont couverts
- Pertinence  : met en avant ce qui compte pour le profil projet
- Concision   : exploitable en 30 secondes
"""
import json
import logging
from typing import Optional

from argos.services.llm_provider import create_llm_provider

logger = logging.getLogger(__name__)

JUDGE_MODEL = "claude-sonnet-4-5"

_JUDGE_SYSTEM = """Tu es un évaluateur rigoureux de la qualité des résumés automatiques.
Tu reçois un article source et un digest généré automatiquement.
Tu évalues ce digest sur 4 critères, chacun noté de 1 à 5.
Tu retournes UNIQUEMENT un objet JSON valide, sans aucun texte autour."""

_JUDGE_PROMPT = """Évalue ce digest par rapport à l'article source.

=== ARTICLE SOURCE ===
{article_content}

=== DIGEST GÉNÉRÉ ===
{digest_markdown}

=== CONTEXTE PROJET (facultatif) ===
{context_profile}

Retourne exactement ce JSON :
{{
  "score_fidelity": <1-5>,
  "score_completeness": <1-5>,
  "score_relevance": <1-5>,
  "score_concision": <1-5>,
  "rationale": "<explication courte en 2-3 phrases>"
}}

Critères :
- score_fidelity (1=inventions, 5=strictement fidèle)
- score_completeness (1=incomplet, 5=points clés couverts)
- score_relevance (1=hors sujet, 5=très pertinent pour le contexte)
- score_concision (1=trop long ou trop court, 5=parfaitement calibré)"""


async def judge_digest(
    article_content: str,
    digest_markdown: str,
    context_profile: str,
    item_id: int,
    workspace_id: Optional[int],
    db,
) -> Optional[dict]:
    """
    Évalue un digest via create_llm_provider() et stocke le score dans digest_scores.
    Conçu pour être lancé en fire-and-forget via asyncio.create_task().
    """
    try:
        from argos.config import settings

        # Résoudre workspace_id depuis l'item si non fourni
        if workspace_id is None and item_id:
            try:
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT workspace_id FROM items WHERE id = %s", (item_id,))
                        row = cur.fetchone()
                        if row:
                            workspace_id = row[0]
            except Exception:
                pass

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.anthropic.claude-sonnet-4-20250514-v1:0",
        )

        article_trimmed = article_content[:6000] if article_content else ""
        digest_trimmed = digest_markdown[:3000] if digest_markdown else ""
        context_trimmed = context_profile[:500] if context_profile else "Non fourni"

        prompt = _JUDGE_PROMPT.format(
            article_content=article_trimmed,
            digest_markdown=digest_trimmed,
            context_profile=context_trimmed,
        )

        raw, usage = await llm.generate(
            prompt=prompt,
            system_prompt=_JUDGE_SYSTEM,
            temperature=0.2,
            max_tokens=512,
        )

        raw = raw.strip()
        if "```" in raw:
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        scores = json.loads(raw)

        fidelity = int(scores.get("score_fidelity", 3))
        completeness = int(scores.get("score_completeness", 3))
        relevance = int(scores.get("score_relevance", 3))
        concision = int(scores.get("score_concision", 3))
        global_score = round((fidelity + completeness + relevance + concision) / 4, 2)
        rationale = scores.get("rationale", "")

        prompt_tokens = usage.get("prompt_tokens", 0) if usage else 0
        completion_tokens = usage.get("completion_tokens", 0) if usage else 0
        cost_usd = (prompt_tokens * 0.003 + completion_tokens * 0.015) / 1000

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO digest_scores
                        (item_id, judge_model, score_fidelity, score_completeness,
                         score_relevance, score_concision, score_global, rationale, workspace_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
                """, (item_id, JUDGE_MODEL, fidelity, completeness,
                      relevance, concision, global_score, rationale, workspace_id))

                cur.execute("""
                    INSERT INTO llm_usage
                        (operation_type, entity_type, entity_id, model, tokens_used, cost_usd)
                    VALUES ('digest_judge', 'workspace', %s, %s, %s, %s)
                """, (workspace_id, JUDGE_MODEL, prompt_tokens + completion_tokens, cost_usd))

            conn.commit()

        logger.info(
            "digest_judge item_id=%s global=%.2f fidelity=%s completeness=%s relevance=%s concision=%s",
            item_id, global_score, fidelity, completeness, relevance, concision
        )
        return {"global": global_score, "fidelity": fidelity, "completeness": completeness,
                "relevance": relevance, "concision": concision}

    except Exception as e:
        logger.error("digest_judge failed item_id=%s: %s", item_id, e)
        return None
