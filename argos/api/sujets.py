"""
API Sujets — CRUD + configuration d'intention + questionnaire LLM
"""
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from argos.database import DatabaseManager
from argos.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sujets"])
db = DatabaseManager(settings.database_url)


def estimate_discovery_duration(n_sources: int) -> str:
    """Retourne une fourchette de durée lisible pour N sources à découvrir."""
    if n_sources == 0:
        return "quelques secondes"
    low = max(1, round(n_sources * 15 / 60))
    high = max(low + 1, round(n_sources * 30 / 60))
    return f"{low}–{high} min"


# ── helpers ───────────────────────────────────────────────────────────────────

def _slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:150]


def _row_to_sujet(row) -> dict:
    return {
        "id": row[0],
        "workspace_id": row[1],
        "name": row[2],
        "slug": row[3],
        "description": row[4],
        "icon": row[5],
        "color": row[6],
        "knowledge_profile": row[7] or {},
        "is_active": row[8],
        "created_at": row[9].isoformat() if row[9] else None,
        "source_count": row[10] if len(row) > 10 else 0,
        "item_count": row[11] if len(row) > 11 else 0,
        "doc_count": row[12] if len(row) > 12 else 0,
        "intention_type": row[13] if len(row) > 13 else "surveiller",
        "learning_context": row[14] if len(row) > 14 else None,
        "project_context": row[15] if len(row) > 15 else None,
        "filter_config": row[16] if len(row) > 16 else {"must_match": [], "min_match_count": 1},
        "questionnaire_answers": row[17] if len(row) > 17 else None,
    }


# ── schemas ───────────────────────────────────────────────────────────────────

class SujetCreate(BaseModel):
    workspace_id: int
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "tag"
    color: Optional[str] = "#9085e9"
    intention_type: Optional[str] = "surveiller"
    knowledge_profile: Optional[dict] = None


class SujetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    knowledge_profile: Optional[dict] = None
    is_active: Optional[bool] = None
    intention_type: Optional[str] = None
    learning_context: Optional[dict] = None
    project_context: Optional[dict] = None
    filter_config: Optional[dict] = None
    questionnaire_answers: Optional[dict] = None


class KnowledgeProfileUpdate(BaseModel):
    official_domains: Optional[list[str]] = None
    recognized_domains: Optional[list[str]] = None
    trusted_queries: Optional[list[str]] = None
    keywords: Optional[list[str]] = None


# ── workspaces (dossiers) ─────────────────────────────────────────────────────

@router.get("/workspaces-list")
async def list_workspaces():
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT w.id, w.name, w.slug, w.description, w.domain,
                           w.icon, w.color, w.is_active, w.created_at,
                           COUNT(s.id) AS sujet_count
                    FROM workspaces w
                    LEFT JOIN sujets s ON s.workspace_id = w.id AND s.is_active = true
                    WHERE w.is_active = true
                    GROUP BY w.id
                    ORDER BY w.name
                """)
                rows = cur.fetchall()
                return {"workspaces": [
                    {
                        "id": r[0], "name": r[1], "slug": r[2],
                        "description": r[3], "domain": r[4],
                        "icon": r[5], "color": r[6],
                        "is_active": r[7],
                        "created_at": r[8].isoformat() if r[8] else None,
                        "sujet_count": r[9],
                    }
                    for r in rows
                ]}
    except Exception as e:
        logger.error(f"list_workspaces: {e}")
        raise HTTPException(500, str(e))


@router.post("/workspaces-list")
async def create_workspace(data: dict):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    slug = _slugify(name)
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO workspaces (name, slug, description, domain, icon, color)
                    VALUES (%s, %s, %s, %s, %s, %s)
                    ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name
                    RETURNING id, name, slug
                """, (
                    name, slug,
                    data.get("description"), data.get("domain", "general"),
                    data.get("icon", "folder"), data.get("color", "#3987e5"),
                ))
                row = cur.fetchone()
                conn.commit()
                return {"id": row[0], "name": row[1], "slug": row[2]}
    except Exception as e:
        logger.error(f"create_workspace: {e}")
        raise HTTPException(500, str(e))


# ── sujets ────────────────────────────────────────────────────────────────────

@router.get("/sujets")
async def list_sujets(workspace_id: Optional[int] = None):
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                where = "WHERE s.is_active = true"
                params: list = []
                if workspace_id is not None:
                    where += " AND s.workspace_id = %s"
                    params.append(workspace_id)
                cur.execute(f"""
                    SELECT s.id, s.workspace_id, s.name, s.slug, s.description,
                           s.icon, s.color, s.knowledge_profile, s.is_active, s.created_at,
                           COUNT(DISTINCT sr.id) AS source_count,
                           COUNT(DISTINCT i.id)  AS item_count,
                           COUNT(DISTINCT d.id)  AS doc_count,
                           s.intention_type, s.learning_context, s.project_context,
                           s.filter_config, s.questionnaire_answers
                    FROM sujets s
                    LEFT JOIN sources sr ON sr.sujet_id = s.id AND sr.active = true
                    LEFT JOIN items i ON i.sujet_id = s.id
                    LEFT JOIN documents d ON d.sujet_id = s.id
                    {where}
                    GROUP BY s.id
                    ORDER BY s.name
                """, params)
                return {"sujets": [_row_to_sujet(r) for r in cur.fetchall()]}
    except Exception as e:
        logger.error(f"list_sujets: {e}")
        raise HTTPException(500, str(e))


@router.post("/sujets")
async def create_sujet(data: SujetCreate):
    slug = _slugify(data.name)
    profile = json.dumps(data.knowledge_profile or {
        "official_domains": [], "recognized_domains": [],
        "trusted_queries": [], "keywords": [],
    })
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sujets
                        (workspace_id, name, slug, description, icon, color, knowledge_profile, intention_type)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, workspace_id, name, slug, description,
                              icon, color, knowledge_profile, is_active, created_at,
                              0, 0, 0,
                              intention_type, learning_context, project_context,
                              filter_config, questionnaire_answers
                """, (
                    data.workspace_id, data.name, slug, data.description,
                    data.icon or "tag", data.color or "#9085e9", profile,
                    data.intention_type or "surveiller",
                ))
                row = cur.fetchone()
                conn.commit()
                return _row_to_sujet(row)
    except Exception as e:
        logger.error(f"create_sujet: {e}")
        raise HTTPException(500, str(e))


@router.get("/sujets/{sujet_id}")
async def get_sujet(sujet_id: int):
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.id, s.workspace_id, s.name, s.slug, s.description,
                           s.icon, s.color, s.knowledge_profile, s.is_active, s.created_at,
                           COUNT(DISTINCT sr.id), COUNT(DISTINCT i.id), 0,
                           s.intention_type, s.learning_context, s.project_context,
                           s.filter_config, s.questionnaire_answers
                    FROM sujets s
                    LEFT JOIN sources sr ON sr.sujet_id = s.id AND sr.active = true
                    LEFT JOIN items i ON i.sujet_id = s.id
                    WHERE s.id = %s
                    GROUP BY s.id
                """, (sujet_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, "Sujet not found")
                sujet = _row_to_sujet(row)
                cur.execute("""
                    SELECT id, name, url, type, category, description,
                           tags, active, created_at
                    FROM sources WHERE sujet_id = %s ORDER BY name
                """, (sujet_id,))
                sujet["sources"] = [
                    {
                        "id": r[0], "name": r[1], "url": r[2], "type": r[3],
                        "category": r[4], "description": r[5],
                        "tags": r[6] or [], "active": r[7],
                        "created_at": r[8].isoformat() if r[8] else None,
                    }
                    for r in cur.fetchall()
                ]
                return sujet
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"get_sujet: {e}")
        raise HTTPException(500, str(e))


@router.patch("/sujets/{sujet_id}")
async def update_sujet(sujet_id: int, data: SujetUpdate):
    fields, vals = [], []
    if data.name is not None:
        fields.append("name = %s"); vals.append(data.name)
        fields.append("slug = %s"); vals.append(_slugify(data.name))
    if data.description is not None:
        fields.append("description = %s"); vals.append(data.description)
    if data.icon is not None:
        fields.append("icon = %s"); vals.append(data.icon)
    if data.color is not None:
        fields.append("color = %s"); vals.append(data.color)
    if data.knowledge_profile is not None:
        fields.append("knowledge_profile = %s"); vals.append(json.dumps(data.knowledge_profile))
    if data.is_active is not None:
        fields.append("is_active = %s"); vals.append(data.is_active)
    if data.intention_type is not None:
        fields.append("intention_type = %s"); vals.append(data.intention_type)
    if data.learning_context is not None:
        fields.append("learning_context = %s"); vals.append(json.dumps(data.learning_context))
    if data.project_context is not None:
        fields.append("project_context = %s"); vals.append(json.dumps(data.project_context))
    if data.filter_config is not None:
        fields.append("filter_config = %s"); vals.append(json.dumps(data.filter_config))
    if data.questionnaire_answers is not None:
        fields.append("questionnaire_answers = %s"); vals.append(json.dumps(data.questionnaire_answers))
    if not fields:
        raise HTTPException(400, "Nothing to update")
    vals.append(sujet_id)
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE sujets SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    vals,
                )
                conn.commit()
                return {"updated": True}
    except Exception as e:
        logger.error(f"update_sujet: {e}")
        raise HTTPException(500, str(e))


@router.delete("/sujets/{sujet_id}")
async def delete_sujet(sujet_id: int):
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, url FROM sources WHERE sujet_id = %s", (sujet_id,))
                sources = cur.fetchall()
                exclusive_ids, orphan_ids = [], []
                for src_id, src_url in sources:
                    cur.execute(
                        "SELECT COUNT(*) FROM sources WHERE url = %s AND sujet_id != %s AND sujet_id IS NOT NULL",
                        (src_url, sujet_id),
                    )
                    if cur.fetchone()[0] > 0:
                        orphan_ids.append(src_id)
                    else:
                        exclusive_ids.append(src_id)
                if exclusive_ids:
                    cur.execute("SELECT url FROM sources WHERE id = ANY(%s)", (exclusive_ids,))
                    exclusive_urls = [r[0] for r in cur.fetchall()]
                    if exclusive_urls:
                        cur.execute("DELETE FROM items WHERE source_url = ANY(%s)", (exclusive_urls,))
                    cur.execute("DELETE FROM sources WHERE id = ANY(%s)", (exclusive_ids,))
                if orphan_ids:
                    cur.execute("UPDATE sources SET sujet_id = NULL WHERE id = ANY(%s)", (orphan_ids,))
                cur.execute("DELETE FROM sujets WHERE id = %s", (sujet_id,))
                conn.commit()
                return {"deleted": True, "sources_deleted": len(exclusive_ids), "sources_detached": len(orphan_ids)}
    except Exception as e:
        logger.error(f"delete_sujet: {e}")
        raise HTTPException(500, str(e))


@router.delete("/workspaces-list/{workspace_id}")
async def delete_workspace(workspace_id: int):
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM sujets WHERE workspace_id = %s", (workspace_id,))
                sujet_ids = [r[0] for r in cur.fetchall()]
                all_exclusive, all_orphan = [], []
                for sid in sujet_ids:
                    cur.execute("SELECT id, url FROM sources WHERE sujet_id = %s", (sid,))
                    for src_id, src_url in cur.fetchall():
                        cur.execute(
                            "SELECT COUNT(*) FROM sources WHERE url = %s AND sujet_id != %s AND sujet_id IS NOT NULL",
                            (src_url, sid),
                        )
                        if cur.fetchone()[0] > 0:
                            all_orphan.append(src_id)
                        else:
                            all_exclusive.append(src_id)
                if all_exclusive:
                    cur.execute("SELECT url FROM sources WHERE id = ANY(%s)", (all_exclusive,))
                    all_exclusive_urls = [r[0] for r in cur.fetchall()]
                    if all_exclusive_urls:
                        cur.execute("DELETE FROM items WHERE source_url = ANY(%s)", (all_exclusive_urls,))
                    cur.execute("DELETE FROM sources WHERE id = ANY(%s)", (all_exclusive,))
                if all_orphan:
                    cur.execute("UPDATE sources SET sujet_id = NULL WHERE id = ANY(%s)", (all_orphan,))
                if sujet_ids:
                    cur.execute("DELETE FROM sujets WHERE workspace_id = %s", (workspace_id,))
                cur.execute("DELETE FROM workspaces WHERE id = %s", (workspace_id,))
                conn.commit()
                return {"deleted": True, "sujets_deleted": len(sujet_ids), "sources_deleted": len(all_exclusive), "sources_detached": len(all_orphan)}
    except Exception as e:
        logger.error(f"delete_workspace: {e}")
        raise HTTPException(500, str(e))


@router.patch("/workspaces-list/{workspace_id}")
async def update_workspace(workspace_id: int, data: dict):
    name = (data.get("name") or "").strip()
    if not name:
        raise HTTPException(400, "name required")
    slug = _slugify(name)
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE workspaces SET name = %s, slug = %s WHERE id = %s",
                    (name, slug, workspace_id),
                )
                conn.commit()
                return {"updated": True, "name": name, "slug": slug}
    except Exception as e:
        logger.error(f"update_workspace: {e}")
        raise HTTPException(500, str(e))


# ── décomposition du besoin en sujets ────────────────────────────────────────

@router.post("/decompose-needs")
async def decompose_needs(data: dict):
    """
    Analyse la description libre d'un besoin et propose un découpage en sujets distincts.
    Input:  { description: str }
    Output: { workspace_name: str, sujets: [{name, intention_type, rationale}] }
    """
    description = (data.get("description") or "").strip()
    if not description:
        raise HTTPException(400, "description required")

    from argos.services.llm_provider import create_llm_provider
    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.aws_bedrock_model,
    )

    prompt = f"""L'utilisateur a décrit ses besoins de veille :

"{description}"

Analyse ce besoin et décompose-le en sujets de veille distincts et cohérents.

Règles :
- Un sujet = un périmètre thématique homogène avec une intention claire
- Intentions possibles : "apprendre" (monter en compétence), "surveiller" (rester informé), "projets" (veille pour un projet concret)
- Sépare systématiquement les besoins d'apprentissage des besoins de surveillance même si le domaine est similaire
- Nom du sujet : court (1-3 mots), sans article, sans verbe
- Propose un nom de dossier principal qui regroupe tous ces sujets (1-2 mots)
- Entre 1 et 5 sujets maximum

Réponds UNIQUEMENT avec ce JSON :
{{
  "workspace_name": "nom du dossier principal",
  "sujets": [
    {{
      "name": "nom court du sujet",
      "intention_type": "apprendre" | "surveiller" | "projets",
      "rationale": "une phrase expliquant pourquoi ce sujet mérite une veille séparée"
    }}
  ]
}}"""

    try:
        response, _ = await llm.generate(
            prompt=prompt,
            system_prompt="Tu es expert en organisation de veille technologique. Tu décomposes les besoins avec précision. Réponds uniquement avec du JSON valide.",
            temperature=0.3, max_tokens=1000, top_p=0.9,
        )
        raw = response.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        return json.loads(raw)
    except json.JSONDecodeError as e:
        logger.error(f"decompose_needs JSON error: {e}\nRaw: {response[:500]}")
        raise HTTPException(500, "Réponse LLM invalide")
    except Exception as e:
        logger.error(f"decompose_needs: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ── questionnaire de configuration ───────────────────────────────────────────

@router.post("/sujets/{sujet_id}/next-question")
async def next_question(sujet_id: int, data: dict):
    from argos.api.calibration_agent import get_agent
    try:
        return await get_agent().next_question(
            sujet_name=data.get("sujet_name", ""),
            intention=data.get("intention_type", "surveiller"),
            initial_context=(data.get("initial_context") or "").strip(),
            qa_history=data.get("previous_qa", []),
            sujet_id=sujet_id,
        )
    except Exception as e:
        logger.error(f"next_question: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/sujets/{sujet_id}/generate-summary")
async def generate_summary(sujet_id: int, data: dict):
    from argos.api.calibration_agent import get_agent
    try:
        result = await get_agent().generate_summary(
            sujet_name=data.get("sujet_name", ""),
            intention=data.get("intention_type", "surveiller"),
            initial_context=(data.get("initial_context") or "").strip(),
            qa_history=data.get("previous_qa", []),
            extra_info=(data.get("extra_info") or "").strip(),
        )
        # Sauvegarder le bilan dans knowledge_profile
        summary_md = result.get("summary_md", "")
        bilan_title = result.get("bilan_title", "")
        learning_plan_md = result.get("learning_plan_md", "")
        if summary_md:
            try:
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT knowledge_profile FROM sujets WHERE id = %s", (sujet_id,))
                        row = cur.fetchone()
                        existing = row[0] if row else {}
                        updated = {**(existing or {}), "bilan_md": summary_md, "bilan_title": bilan_title}
                        if learning_plan_md:
                            updated["learning_plan_md"] = learning_plan_md
                        cur.execute(
                            "UPDATE sujets SET knowledge_profile = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                            (json.dumps(updated), sujet_id),
                        )
                        conn.commit()
            except Exception as _save_err:
                logger.warning(f"generate_summary: could not save bilan to DB: {_save_err}")
        return result
    except Exception as e:
        logger.error(f"generate_summary: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/sujets/{sujet_id}/generate-questionnaire")
async def generate_questionnaire(sujet_id: int, data: dict):
    """
    Génère un questionnaire adapté à l'intention du sujet.
    data: { intention_type, user_description, partial_answers? }
    Retourne: { questions: [{id, text, type, options?, allow_recommendation}] }
    """
    intention = data.get("intention_type", "surveiller")
    description = (data.get("user_description") or "").strip()
    partial = data.get("partial_answers", {})

    if not description:
        raise HTTPException(400, "user_description required")

    from argos.services.llm_provider import create_llm_provider
    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.aws_bedrock_model,
    )

    context_by_intention = {
        "apprendre": f"""L'utilisateur veut monter en compétence. Il a décrit son besoin : "{description}"

Génère 6 à 8 questions pour comprendre :
- Ce qu'il cherche concrètement à savoir faire (pas juste "connaître")
- Son niveau de départ GLOBAL sur le domaine (une seule question de niveau, pas une par concept)
- Les sujets ou sous-domaines qui l'intéressent le plus
- Le type de contenu qui l'aide le mieux (tutoriels, articles de fond, exemples de code, cas réels)
- La profondeur souhaitée (notions générales vs maîtrise opérationnelle)

INTERDIT : ne pas poser une question par terme technique. Une seule question de niveau global suffit.""",

        "projets": f"""L'utilisateur fait de la veille pour un projet. Il a décrit : "{description}"

Génère 6 à 8 questions pour comprendre :
- L'objectif final du projet et le problème qu'il résout
- La stack technique actuelle ou envisagée
- La phase du projet (exploration / construction / mise en prod)
- Les types de contenus utiles (benchmarks, retours d'expérience, guides d'intégration, alternatives)
- Les contraintes à respecter (temps, budget, équipe, régulation)""",

        "surveiller": f"""L'utilisateur veut surveiller un domaine. Il a décrit : "{description}"

Génère 6 à 8 questions pour comprendre :
- Les sous-domaines ou angles qui l'intéressent
- Les types d'acteurs à suivre (entreprises, chercheurs, open source, régulateurs)
- Les types d'événements pertinents (releases, annonces, articles de fond, régulation)
- La fréquence et la profondeur souhaitées (tout suivre vs signaux forts uniquement)
- Ce qu'il veut exclure (trop basique, hors périmètre, bruit)""",
    }

    partial_ctx = ""
    if partial:
        partial_ctx = "\n\nRéponses déjà fournies :\n" + "\n".join(
            f"- Q{k}: {v}" for k, v in partial.items()
        )

    prompt = f"""{context_by_intention.get(intention, context_by_intention['surveiller'])}{partial_ctx}

Règles absolues :
- Questions courtes, directes, sans jargon non expliqué
- Chaque question porte sur UN seul aspect
- Varier les types : open pour les réponses libres, multiselect quand les options sont connues à l'avance, scale5 UNIQUEMENT pour le niveau global (une seule fois max)
- Aucune question redondante

Réponds UNIQUEMENT avec du JSON valide, sans commentaire :
{{
  "questions": [
    {{
      "id": "q1",
      "text": "texte de la question",
      "type": "open",
      "allow_recommendation": false
    }},
    {{
      "id": "q2",
      "text": "texte de la question",
      "type": "multiselect",
      "options": ["option1", "option2", "option3"],
      "allow_recommendation": true
    }}
  ]
}}"""

    try:
        response, _ = await llm.generate(
            prompt=prompt,
            system_prompt="Tu es un expert en conception pédagogique et en veille technologique. Tu génères des questionnaires précis et actionnables. Réponds uniquement avec du JSON valide.",
            temperature=0.3, max_tokens=3000, top_p=0.9,
        )
        raw = response.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        result = json.loads(raw)
        return result
    except json.JSONDecodeError as e:
        logger.error(f"generate_questionnaire JSON error: {e}\nRaw: {response[:500]}")
        raise HTTPException(500, "Réponse LLM invalide")
    except Exception as e:
        logger.error(f"generate_questionnaire: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.post("/sujets/{sujet_id}/recommend-answer")
async def recommend_answer(sujet_id: int, data: dict):
    """
    Génère une recommandation justifiée pour une question du questionnaire.
    data: { question_text, intention_type, user_description, previous_answers }
    Retourne: { recommendation: str, justification: str, suggested_value: any }
    """
    question = data.get("question_text", "")
    intention = data.get("intention_type", "surveiller")
    description = data.get("user_description", "")
    previous = data.get("previous_answers", {})

    from argos.services.llm_provider import create_llm_provider
    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.aws_bedrock_model,
    )

    prev_ctx = "\n".join(f"- {k}: {v}" for k, v in previous.items()) if previous else "Aucune"

    prompt = f"""L'utilisateur configure une veille de type "{intention}".
Il a décrit son besoin : "{description}"

Réponses déjà données :
{prev_ctx}

Question en cours : "{question}"

Donne une recommandation justifiée et concrète pour cette question.
Réponds UNIQUEMENT avec ce JSON :
{{
  "recommendation": "valeur ou réponse recommandée (concise)",
  "justification": "explication en 2-3 phrases pourquoi cette recommandation, basée sur le contexte et les réponses précédentes",
  "suggested_value": "valeur suggérée (texte, niveau, ou liste selon le type de question)"
}}"""

    try:
        response, _ = await llm.generate(
            prompt=prompt,
            system_prompt="Tu es un expert en veille technologique et en apprentissage. Tes recommandations sont toujours justifiées et contextualisées. Réponds uniquement avec du JSON valide.",
            temperature=0.4, max_tokens=800, top_p=0.9,
        )
        raw = response.strip()
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        return json.loads(raw)
    except Exception as e:
        logger.error(f"recommend_answer: {e}", exc_info=True)
        raise HTTPException(500, str(e))


def _launch_source_discovery(sujet_id: int, source_candidates: list[dict], sujet_name: str) -> list[str]:
    """
    Lance les tâches Celery de découverte pour chaque source candidate.
    Retourne la liste des task_ids Celery.
    """
    from argos.tasks.source_discovery import discover_source
    task_ids = []
    for candidate in source_candidates:
        if not candidate.get("url"):
            continue
        try:
            task = discover_source.delay(sujet_id, candidate, sujet_name)
            task_ids.append(task.id)
            logger.info(f"Launched discovery task {task.id} for {candidate['url']}")
        except Exception as e:
            logger.warning(f"Could not launch discovery task for {candidate.get('url')}: {e}")
    return task_ids


@router.post("/sujets/{sujet_id}/generate-filter")
async def generate_filter_config(sujet_id: int, data: dict):
    from argos.api.calibration_agent import get_agent, clear_search_cache
    intention = data.get("intention_type", "surveiller")
    previous_qa = data.get("previous_qa", [])
    extra_info = (data.get("extra_info") or "").strip()

    try:
        result = await get_agent().generate_output(
            sujet_name=data.get("sujet_name", ""),
            intention=intention,
            initial_context=(data.get("initial_context") or "").strip(),
            qa_history=previous_qa,
            extra_info=extra_info,
            sujet_id=sujet_id,
        )

        filter_cfg = result.get("filter_config", {"must_match": [], "min_match_count": 1})
        source_candidates = result.get("source_candidates", [])
        learning_ctx = result.get("learning_context")
        project_ctx = result.get("project_context")
        sujet_name_str = data.get("sujet_name", "")

        confirmed = filter_cfg.get("must_match_confirmed") or filter_cfg.get("must_match") or []
        suggested = filter_cfg.get("must_match_suggested") or []

        # ── Embedding de profil (silencieux, best-effort) ─────────────────────
        profile_embedding: list = []
        try:
            from argos.services.vector_store_singleton import get_vector_store
            vs = get_vector_store()
            if vs and vs.model:
                profile_text = f"{sujet_name_str} {' '.join(confirmed)}".strip()
                emb = vs.model.embed_text(profile_text)
                profile_embedding = emb.tolist() if hasattr(emb, "tolist") else list(emb)
        except Exception as _emb_err:
            logger.warning(f"generate_filter: could not compute profile embedding: {_emb_err}")

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT knowledge_profile FROM sujets WHERE id = %s", (sujet_id,))
                row = cur.fetchone()
                existing_profile = row[0] if row else {}
                updated_profile = {
                    **(existing_profile or {}),
                    "source_candidates": source_candidates,
                    "keywords": confirmed,
                    "keywords_suggested": suggested,
                }
                if profile_embedding:
                    updated_profile["profile_embedding"] = profile_embedding

                cur.execute("""
                    UPDATE sujets SET
                        intention_type = %s,
                        filter_config = %s,
                        knowledge_profile = %s,
                        learning_context = %s,
                        project_context = %s,
                        questionnaire_answers = %s,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (
                    intention,
                    json.dumps(filter_cfg),
                    json.dumps(updated_profile),
                    json.dumps(learning_ctx) if learning_ctx else None,
                    json.dumps(project_ctx) if project_ctx else None,
                    json.dumps({"qa": previous_qa, "extra_info": extra_info}),
                    sujet_id,
                ))
                conn.commit()

        # ── Lancer la découverte asynchrone (Celery) ─────────────────────────
        task_ids = _launch_source_discovery(sujet_id, source_candidates, sujet_name_str)

        clear_search_cache(sujet_id)

        return {
            "filter_config": filter_cfg,
            "learning_context": learning_ctx,
            "project_context": project_ctx,
            "summary": result.get("summary", ""),
            "discovery_task_ids": task_ids,
            "source_candidates_count": len(source_candidates),
        }
    except Exception as e:
        logger.error(f"generate_filter: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ── profil de connaissance (legacy — conservé pour compatibilité) ─────────────

@router.patch("/sujets/{sujet_id}/knowledge-profile")
async def update_knowledge_profile(sujet_id: int, data: KnowledgeProfileUpdate):
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT knowledge_profile FROM sujets WHERE id = %s", (sujet_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, "Sujet not found")
                profile: dict = row[0] or {}
                if data.official_domains is not None:
                    profile["official_domains"] = data.official_domains
                if data.recognized_domains is not None:
                    profile["recognized_domains"] = data.recognized_domains
                if data.trusted_queries is not None:
                    profile["trusted_queries"] = data.trusted_queries
                if data.keywords is not None:
                    profile["keywords"] = data.keywords
                cur.execute(
                    "UPDATE sujets SET knowledge_profile = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (json.dumps(profile), sujet_id),
                )
                conn.commit()
                return {"knowledge_profile": profile}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"update_knowledge_profile: {e}")
        raise HTTPException(500, str(e))


@router.post("/sujets/{sujet_id}/suggest-profile")
async def suggest_knowledge_profile(sujet_id: int):
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.name, s.description, w.name as workspace_name,
                           ARRAY_AGG(DISTINCT src.url) FILTER (WHERE src.url IS NOT NULL) as source_urls
                    FROM sujets s
                    LEFT JOIN workspaces w ON w.id = s.workspace_id
                    LEFT JOIN sources src ON src.sujet_id = s.id
                    WHERE s.id = %s
                    GROUP BY s.id, w.name
                """, (sujet_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(404, "Sujet not found")
                sujet_name, sujet_desc, ws_name, source_urls = row
                source_urls = source_urls or []

        from argos.services.llm_provider import create_llm_provider
        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        urls_ctx = "\n".join(f"- {u}" for u in source_urls[:20]) if source_urls else "Aucune source encore assignée."
        prompt = f"""Pour le sujet "{sujet_name}" (dossier: {ws_name}), génère un profil de connaissance structuré.
Sources actuellement surveillées :
{urls_ctx}

Argos est un système de veille tech qui collecte des articles d'actualité récents (<3 mois) depuis des sites officiels.

Règles strictes :
- official_domains : UNIQUEMENT les sites officiels des acteurs tech du domaine (ex: anthropic.com, pytorch.org, huggingface.co). JAMAIS arxiv.org, medium.com, towardsdatascience.com, blogs agrégateurs ou sites de cours.
- recognized_domains : flux RSS ou blogs techniques officiels de ces mêmes acteurs uniquement
- trusted_queries : 5-8 requêtes précises pour SearXNG (actualité récente, pas de cours ni tutoriels)
- keywords : 10-20 termes techniques spécifiques au domaine

Génère un JSON avec exactement ces 4 clés.
Réponds UNIQUEMENT avec le JSON."""

        response, _ = await llm.generate(
            prompt=prompt,
            system_prompt="Tu es un assistant de veille technologique. Réponds uniquement avec du JSON valide.",
            temperature=0.3, max_tokens=2048, top_p=0.9,
        )
        raw = response.strip()
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    raw = part
                    break
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        profile = json.loads(raw)
        for key in ("official_domains", "recognized_domains", "trusted_queries", "keywords"):
            if key not in profile:
                profile[key] = []
        return {"knowledge_profile": profile}

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"suggest_profile JSON parse error: {e}")
        raise HTTPException(500, "La réponse de l'IA n'est pas un JSON valide")
    except Exception as e:
        logger.error(f"suggest_profile: {e}", exc_info=True)
        raise HTTPException(500, str(e))


@router.patch("/sources/{source_id}/sujet")
async def assign_source_sujet(source_id: int, data: dict):
    sujet_id = data.get("sujet_id")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE sources SET sujet_id = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (sujet_id, source_id),
                )
                conn.commit()
                return {"updated": True}
    except Exception as e:
        logger.error(f"assign_source_sujet: {e}")
        raise HTTPException(500, str(e))


# ── SSE : flux de découverte de sources en temps réel ────────────────────────

@router.get("/sujets/{sujet_id}/sources-discovery-stream")
async def sources_discovery_stream(sujet_id: int):
    """
    SSE endpoint : publie les statuts de découverte de sources en temps réel.
    Le client se connecte après avoir lancé generate-filter.
    Les tâches Celery publient dans Redis ; ce handler lit le channel pub/sub.
    """
    import asyncio
    import os

    async def event_generator():
        import redis.asyncio as aioredis

        redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
        channel = f"argos:discovery:{sujet_id}"

        r = aioredis.from_url(redis_url, decode_responses=True)
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)

        # Envoyer d'abord les tâches déjà terminées (état snapshot dans Redis)
        snapshot_pattern = f"argos:discovery:{sujet_id}:*"
        try:
            async for key in r.scan_iter(snapshot_pattern):
                value = await r.get(key)
                if value:
                    yield f"data: {value}\n\n"
        except Exception:
            pass

        # Puis écouter les nouvelles notifications
        try:
            timeout = 300  # 5 minutes max
            start = asyncio.get_event_loop().time()
            async for message in pubsub.listen():
                if asyncio.get_event_loop().time() - start > timeout:
                    break
                if message["type"] == "message":
                    yield f"data: {message['data']}\n\n"
                    # Vérifier si toutes les tâches sont terminées
                    try:
                        data = json.loads(message["data"])
                        if data.get("status") in ("rss_found", "website_found", "not_found", "error"):
                            # Compter les tâches actives restantes
                            remaining = 0
                            async for _ in r.scan_iter(snapshot_pattern):
                                val = await r.get(_)
                                if val:
                                    s = json.loads(val).get("status", "")
                                    if s in ("pending", "probing"):
                                        remaining += 1
                            if remaining == 0:
                                yield f"data: {json.dumps({'status': 'complete', 'sujet_id': sujet_id})}\n\n"
                                break
                    except Exception:
                        pass
        finally:
            await pubsub.unsubscribe(channel)
            await r.aclose()

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
