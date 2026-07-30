"""
API Sujets — CRUD + profil de connaissance
"""
import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from argos.database import DatabaseManager
from argos.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["sujets"])
db = DatabaseManager(settings.database_url)


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
    }


# ── schemas ───────────────────────────────────────────────────────────────────

class SujetCreate(BaseModel):
    workspace_id: int
    name: str
    description: Optional[str] = None
    icon: Optional[str] = "tag"
    color: Optional[str] = "#9085e9"
    knowledge_profile: Optional[dict] = None


class SujetUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None
    knowledge_profile: Optional[dict] = None
    is_active: Optional[bool] = None


class KnowledgeProfileUpdate(BaseModel):
    official_domains: Optional[list[str]] = None
    recognized_domains: Optional[list[str]] = None
    trusted_queries: Optional[list[str]] = None
    keywords: Optional[list[str]] = None


# ── workspaces (dossiers) ─────────────────────────────────────────────────────

@router.get("/workspaces-list")
async def list_workspaces():
    """Liste tous les dossiers avec le nombre de sujets."""
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
    """Crée un nouveau dossier."""
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
    """Liste les sujets, optionnellement filtrés par dossier."""
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
                           COUNT(DISTINCT i.id)  AS item_count
                    FROM sujets s
                    LEFT JOIN sources sr ON sr.sujet_id = s.id AND sr.active = true
                    LEFT JOIN items i ON i.sujet_id = s.id
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
    """Crée un nouveau sujet dans un dossier."""
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
                        (workspace_id, name, slug, description, icon, color, knowledge_profile)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id, workspace_id, name, slug, description,
                              icon, color, knowledge_profile, is_active, created_at
                """, (
                    data.workspace_id, data.name, slug, data.description,
                    data.icon or "tag", data.color or "#9085e9", profile,
                ))
                row = cur.fetchone()
                conn.commit()
                return _row_to_sujet(row)
    except Exception as e:
        logger.error(f"create_sujet: {e}")
        raise HTTPException(500, str(e))


@router.get("/sujets/{sujet_id}")
async def get_sujet(sujet_id: int):
    """Détail d'un sujet avec ses sources."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT s.id, s.workspace_id, s.name, s.slug, s.description,
                           s.icon, s.color, s.knowledge_profile, s.is_active, s.created_at,
                           COUNT(DISTINCT sr.id), COUNT(DISTINCT i.id)
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
    """Met à jour un sujet."""
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
    """
    Supprime un sujet.
    - Sources exclusives à ce sujet → supprimées (+ items RAG associés)
    - Sources partagées (même URL dans un autre sujet) → conservées, sujet_id = NULL
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Sources rattachées à ce sujet
                cur.execute("SELECT id, url FROM sources WHERE sujet_id = %s", (sujet_id,))
                sources = cur.fetchall()

                exclusive_ids = []
                orphan_ids = []
                for src_id, src_url in sources:
                    cur.execute(
                        "SELECT COUNT(*) FROM sources WHERE url = %s AND sujet_id != %s AND sujet_id IS NOT NULL",
                        (src_url, sujet_id),
                    )
                    shared = cur.fetchone()[0]
                    if shared > 0:
                        orphan_ids.append(src_id)   # URL existe ailleurs → détacher seulement
                    else:
                        exclusive_ids.append(src_id)  # Exclusive → supprimer avec items

                # Supprimer items RAG des sources exclusives (jointure par source_url)
                if exclusive_ids:
                    cur.execute("SELECT url FROM sources WHERE id = ANY(%s)", (exclusive_ids,))
                    exclusive_urls = [r[0] for r in cur.fetchall()]
                    if exclusive_urls:
                        cur.execute("DELETE FROM items WHERE source_url = ANY(%s)", (exclusive_urls,))
                    cur.execute("DELETE FROM sources WHERE id = ANY(%s)", (exclusive_ids,))

                # Détacher les sources partagées
                if orphan_ids:
                    cur.execute("UPDATE sources SET sujet_id = NULL WHERE id = ANY(%s)", (orphan_ids,))

                cur.execute("DELETE FROM sujets WHERE id = %s", (sujet_id,))
                conn.commit()
                return {
                    "deleted": True,
                    "sources_deleted": len(exclusive_ids),
                    "sources_detached": len(orphan_ids),
                }
    except Exception as e:
        logger.error(f"delete_sujet: {e}")
        raise HTTPException(500, str(e))


@router.delete("/workspaces-list/{workspace_id}")
async def delete_workspace(workspace_id: int):
    """
    Supprime un dossier et tous ses sujets.
    Même logique de croisement : sources exclusives supprimées, partagées détachées.
    """
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
                return {
                    "deleted": True,
                    "sujets_deleted": len(sujet_ids),
                    "sources_deleted": len(all_exclusive),
                    "sources_detached": len(all_orphan),
                }
    except Exception as e:
        logger.error(f"delete_workspace: {e}")
        raise HTTPException(500, str(e))


@router.patch("/workspaces-list/{workspace_id}")
async def update_workspace(workspace_id: int, data: dict):
    """Renomme un dossier."""
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


@router.patch("/sujets/{sujet_id}/knowledge-profile")
async def update_knowledge_profile(sujet_id: int, data: KnowledgeProfileUpdate):
    """Met à jour le profil de connaissance d'un sujet (merge partiel)."""
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
    """Demande à Claude de suggérer un profil de connaissance pour ce sujet."""
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

        import anthropic
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        urls_ctx = "\n".join(f"- {u}" for u in source_urls[:20]) if source_urls else "Aucune source encore assignée."
        prompt = f"""Tu es un assistant de veille technologique. Pour le sujet "{sujet_name}" (dossier: {ws_name}), génère un profil de connaissance structuré.

Sources actuellement surveillées :
{urls_ctx}

Génère un JSON avec exactement ces 4 clés :
- official_domains : liste des domaines officiels/autoritatifs à toujours indexer (ex: anthropic.com, claude.ai)
- recognized_domains : communautés et médias secondaires pertinents (ex: reddit.com/r/claudeai, news.ycombinator.com)
- trusted_queries : 5-8 requêtes de recherche précises pour découvrir de nouveaux contenus sur ce sujet
- keywords : 8-15 mots-clés pour filtrer la pertinence des articles collectés

Réponds UNIQUEMENT avec le JSON, sans texte autour."""

        message = client.messages.create(
            model="claude-opus-5",
            max_tokens=2048,
            messages=[{"role": "user", "content": prompt}],
        )
        text_block = next((b for b in message.content if hasattr(b, "text")), None)
        if not text_block:
            raise ValueError("No text block in response")
        raw = text_block.text.strip()
        # Extraire le JSON (code block ou brut)
        if "```" in raw:
            parts = raw.split("```")
            for part in parts:
                part = part.strip()
                if part.startswith("json"):
                    part = part[4:].strip()
                if part.startswith("{"):
                    raw = part
                    break
        # Extraire uniquement la portion JSON si précédée de texte
        start = raw.find("{")
        end = raw.rfind("}") + 1
        if start >= 0 and end > start:
            raw = raw[start:end]
        profile = json.loads(raw)
        # S'assurer que les 4 clés existent
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
    """Rattache une source à un sujet."""
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
