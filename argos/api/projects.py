"""
API Projets — CRUD, membres, propositions de sources.
"""
import hashlib
import logging
import secrets
from typing import Optional, List
from datetime import date

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from argos.database import DatabaseManager
from argos.config import settings
from argos.api.auth import get_current_user
from argos.services.project_service import ProjectService, SourceProposalService
from argos.services.email_notifier import notify_member_invited_email, notify_proposal_reviewed_email

logger = logging.getLogger(__name__)
router = APIRouter(tags=["projects"])
db = DatabaseManager(settings.database_url)


def _svc():
    return ProjectService(db)


def _proposal_svc():
    return SourceProposalService(db)


# ── Schemas ───────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    client_name: Optional[str] = None
    deadline: Optional[date] = None
    brief_hour: Optional[int] = None
    brief_window_hours: Optional[int] = None
    brief_language: Optional[str] = None
    alert_keywords: Optional[List[str]] = None
    brief_recipients: Optional[List[str]] = None
    visibility: Optional[str] = None
    manager_name: Optional[str] = None
    manager_email: Optional[str] = None
    manager_phone: Optional[str] = None
    manager_role: Optional[str] = None


class MemberInvite(BaseModel):
    email: str
    role: str = "editor"
    sujet_access: Optional[list] = None


class MemberAccessUpdate(BaseModel):
    sujet_access: Optional[list] = None


class MemberRoleUpdate(BaseModel):
    role: str  # editor | reader


class TransferOwnership(BaseModel):
    new_owner_member_id: int


class SourceProposalCreate(BaseModel):
    url: str
    source_type: str = "website"
    name: Optional[str] = None
    description: Optional[str] = None
    sujet_id: Optional[int] = None


class ProposalReview(BaseModel):
    decision: str          # approved | rejected
    note: Optional[str] = None


# ── Projets CRUD ──────────────────────────────────────────────────────────────

@router.get("/projects")
async def list_projects(current_user=Depends(get_current_user)):
    return _svc().list_projects(user_id=current_user["id"])


@router.post("/projects", status_code=201)
async def create_project(body: ProjectCreate, current_user=Depends(get_current_user)):
    try:
        return _svc().create_project(
            owner_id=current_user["id"],
            name=body.name,
            description=body.description,
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.get("/projects/{project_id}")
async def get_project(project_id: int, current_user=Depends(get_current_user)):
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")
    return project


@router.patch("/projects/{project_id}")
async def update_project(project_id: int, body: ProjectUpdate,
                         current_user=Depends(get_current_user)):
    try:
        return _svc().update_project(
            project_id=project_id,
            user_id=current_user["id"],
            **body.dict(exclude_none=True),
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.delete("/projects/{project_id}", status_code=204)
async def delete_project(project_id: int, current_user=Depends(get_current_user)):
    try:
        _svc().delete_project(project_id=project_id, user_id=current_user["id"])
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ── Membres ───────────────────────────────────────────────────────────────────

@router.get("/projects/{project_id}/members")
async def list_members(project_id: int, current_user=Depends(get_current_user)):
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")
    svc = _svc()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT pm.id, pm.project_id, pm.user_id,
                          COALESCE(pm.invited_email, u.email) AS invited_email,
                          pm.role, pm.sujet_access,
                          pm.status, pm.invited_by, pm.invited_at, pm.joined_at,
                          u.full_name
                   FROM project_members pm
                   LEFT JOIN users u ON u.id = pm.user_id
                   WHERE pm.project_id = %s ORDER BY pm.invited_at""",
                (project_id,),
            )
            rows = cur.fetchall()
            result = []
            from argos.services.project_service import _row_to_member
            for r in rows:
                m = _row_to_member(r)
                m['full_name'] = r[10] if len(r) > 10 else None
                result.append(m)
            return result


@router.post("/projects/{project_id}/members", status_code=201)
async def invite_member(project_id: int, body: MemberInvite,
                        current_user=Depends(get_current_user)):
    try:
        svc = _svc()
        member = svc.add_member(
            project_id=project_id,
            inviter_id=current_user["id"],
            invited_email=body.email,
            role=body.role,
            sujet_access=body.sujet_access,
        )
        # Notification email fire-and-forget
        project = svc.get_project(project_id=project_id, user_id=current_user["id"])
        try:
            await notify_member_invited_email(
                to_email=member.get("email"),
                project_name=project["name"] if project else body.email,
                inviter_name=current_user.get("full_name") or current_user.get("email", ""),
                role=body.role,
            )
        except Exception as e:
            logger.warning(f"Email invite notification failed: {e}")
        return member
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.patch("/projects/{project_id}/members/{member_id}/access")
async def update_member_access(project_id: int, member_id: int,
                               body: MemberAccessUpdate,
                               current_user=Depends(get_current_user)):
    try:
        return _svc().update_member_access(
            project_id=project_id,
            owner_id=current_user["id"],
            member_id=member_id,
            sujet_access=body.sujet_access,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


@router.patch("/projects/{project_id}/members/{member_id}/role")
async def update_member_role(project_id: int, member_id: int, body: MemberRoleUpdate,
                             current_user=Depends(get_current_user)):
    try:
        return _svc().update_member_role(
            project_id=project_id,
            owner_id=current_user["id"],
            member_id=member_id,
            role=body.role,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.delete("/projects/{project_id}/members/{member_id}", status_code=204)
async def remove_member(project_id: int, member_id: int,
                        current_user=Depends(get_current_user)):
    try:
        _svc().remove_member_by_id(
            project_id=project_id,
            owner_id=current_user["id"],
            member_id=member_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.post("/projects/{project_id}/suggest-sources")
async def suggest_sources_for_project(project_id: int, current_user=Depends(get_current_user)):
    """
    Génère des suggestions de sources via LLM (domain knowledge), les valide par HTTP,
    les sauvegarde comme source_proposals (status='pending') liées aux sujets du projet.
    """
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")

    kp = project.get("knowledge_profile") or {}
    watch_focus = kp.get("watch_focus_md", "")
    bilan = kp.get("bilan_md", "")
    alert_keywords = project.get("alert_keywords") or []

    if not watch_focus and not bilan and not alert_keywords:
        raise HTTPException(
            status_code=422,
            detail="Le projet n'a pas encore de bilan calibré. Finalisez l'entretien de configuration d'abord."
        )

    # Récupérer les workspaces (= sujets) du projet
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM workspaces WHERE project_id = %s ORDER BY id",
                (project_id,),
            )
            workspaces = [{"id": r[0], "name": r[1]} for r in cur.fetchall()]

    workspace_names = [w["name"] for w in workspaces]

    # Construire l'intent en incluant les sujets pour que le LLM puisse tagger chaque source
    intent_parts = []
    if project.get("name"):
        intent_parts.append(f"Projet : {project['name']}")
    if workspace_names:
        intent_parts.append(f"Sujets de surveillance : {', '.join(workspace_names)}")
    if alert_keywords:
        intent_parts.append(f"Mots-clés d'alerte : {', '.join(alert_keywords)}")
    if watch_focus:
        intent_parts.append(watch_focus[:800])
    elif bilan:
        intent_parts.append(bilan[:800])
    if workspace_names:
        intent_parts.append(
            f"\nPour chaque source suggérée, ajoute un champ 'subject' contenant le nom exact "
            f"du sujet le plus pertinent parmi : {', '.join(workspace_names)}"
        )

    intent_text = "\n".join(intent_parts)

    try:
        from argos.services.intent_discovery import IntentService, DiscoveryService
        from argos.config import settings as cfg

        intent_svc = IntentService(anthropic_api_key=cfg.anthropic_api_key)
        # Onglet Propositions = exploration SearXNG avec requêtes LLM ciblées
        intent_data = await intent_svc.decompose_for_search(intent_text, subjects=workspace_names)
        intent_data["source_types"] = ["blog", "documentation", "github", "news", "rss"]

        discovery_svc = DiscoveryService(db_manager=db)
        candidates = await discovery_svc.find_sources(intent_data=intent_data, use_searxng=True)

        # Sauvegarder les candidats comme source_proposals liés aux sujets
        saved = []
        ws_by_name = {w["name"].lower(): w["id"] for w in workspaces}

        def _match_workspace(candidate: dict) -> Optional[int]:
            subject_hint = (candidate.get("subject") or candidate.get("rationale") or "").lower()
            for name, wid in ws_by_name.items():
                if any(word in subject_hint for word in name.lower().split() if len(word) > 3):
                    return wid
            return workspaces[0]["id"] if workspaces else None

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                for c in candidates:
                    url = c.get("url", "").strip()
                    if not url:
                        continue
                    # Éviter les doublons
                    cur.execute(
                        "SELECT id FROM source_proposals WHERE project_id = %s AND url = %s",
                        (project_id, url),
                    )
                    if cur.fetchone():
                        continue
                    sujet_id = _match_workspace(c)
                    cur.execute(
                        """INSERT INTO source_proposals
                           (project_id, sujet_id, url, source_type, name, description, proposed_by, status)
                           VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending')
                           RETURNING id, sujet_id, url, source_type, name, description, status""",
                        (project_id, sujet_id, url, c.get("type", "website"),
                         c.get("name", url)[:255], c.get("reason", "")[:500],
                         current_user["id"]),
                    )
                    row = cur.fetchone()
                    if row:
                        saved.append({
                            "id": row[0], "sujet_id": row[1], "url": row[2],
                            "source_type": row[3], "name": row[4],
                            "description": row[5], "status": row[6],
                        })
            conn.commit()

        return {"saved": len(saved), "proposals": saved}

    except Exception as e:
        logger.error(f"[PROJECT-SOURCES] {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/source-proposals")
async def list_source_proposals(project_id: int, grouped: bool = False, current_user=Depends(get_current_user)):
    """Retourne les source_proposals. grouped=true → structure par sujet."""
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, name FROM workspaces WHERE project_id = %s ORDER BY id",
                (project_id,),
            )
            workspaces = [{"id": r[0], "name": r[1], "proposals": []} for r in cur.fetchall()]

            cur.execute(
                """SELECT id, sujet_id, url, source_type, name, description, status, proposed_at
                   FROM source_proposals WHERE project_id = %s ORDER BY proposed_at DESC""",
                (project_id,),
            )
            proposals = cur.fetchall()

    ws_map = {w["id"]: w for w in workspaces}
    flat = []
    for p in proposals:
        prop = {
            "id": p[0], "sujet_id": p[1], "url": p[2], "source_type": p[3],
            "name": p[4], "description": p[5], "status": p[6],
            "proposed_at": p[7].isoformat() if p[7] else None,
        }
        flat.append(prop)
        if p[1] and p[1] in ws_map:
            ws_map[p[1]]["proposals"].append(prop)

    if grouped:
        return {"subjects": workspaces, "unassigned": [p for p in flat if not p["sujet_id"] or p["sujet_id"] not in ws_map]}
    return flat


@router.post("/projects/{project_id}/transfer-ownership")
async def transfer_ownership(project_id: int, body: TransferOwnership,
                             current_user=Depends(get_current_user)):
    try:
        return _svc().transfer_ownership(
            project_id=project_id,
            current_owner_id=current_user["id"],
            new_owner_member_id=body.new_owner_member_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@router.patch("/projects/{project_id}/source-proposals/{proposal_id}/review")
async def review_proposal_route(project_id: int, proposal_id: int,
                                body: ProposalReview,
                                current_user=Depends(get_current_user)):
    try:
        svc = _svc()
        proposal = _proposal_svc().review_proposal(
            project_id=project_id,
            owner_id=current_user["id"],
            proposal_id=proposal_id,
            decision=body.decision,
            note=body.note,
        )
        project = svc.get_project(project_id=project_id, user_id=current_user["id"])
        try:
            proposer_email = proposal.get("proposed_by_email") or proposal.get("proposed_by")
            await notify_proposal_reviewed_email(
                to_email=proposer_email,
                project_name=project["name"] if project else "",
                source_url=proposal.get("url", ""),
                decision=body.decision,
                note=body.note,
            )
        except Exception as e:
            logger.warning(f"Email proposal notification failed: {e}")
        return proposal
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


# ── Propositions de sources ───────────────────────────────────────────────────

@router.get("/projects/{project_id}/source-proposals")
async def list_proposals(project_id: int, status: Optional[str] = None,
                         current_user=Depends(get_current_user)):
    try:
        return _proposal_svc().list_proposals(
            project_id=project_id,
            user_id=current_user["id"],
            status=status,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))


# ── API Keys IDE ──────────────────────────────────────────────────────────────

def _resolve_project_workspace(project_id: int) -> Optional[int]:
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id FROM workspaces WHERE project_id = %s LIMIT 1",
                (project_id,),
            )
            row = cur.fetchone()
            return row[0] if row else None


@router.post("/projects/{project_id}/api-keys", status_code=201)
async def create_api_key(project_id: int, current_user=Depends(get_current_user)):
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")

    workspace_id = _resolve_project_workspace(project_id)
    if not workspace_id:
        raise HTTPException(status_code=422, detail="Aucun workspace associé à ce projet")

    raw_key = "arg_" + secrets.token_urlsafe(32)
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO api_keys (key_hash, key_prefix, workspace_id, permissions)
                   VALUES (%s, %s, %s, %s)
                   RETURNING id, created_at""",
                (key_hash, key_prefix, workspace_id, '["read"]'),
            )
            row = cur.fetchone()
            conn.commit()

    return {
        "id": row[0],
        "key": raw_key,
        "key_prefix": key_prefix,
        "workspace_id": workspace_id,
        "created_at": row[1].isoformat(),
        "warning": "Copiez cette clé maintenant — elle ne sera plus affichée.",
    }


@router.get("/projects/{project_id}/api-keys")
async def list_api_keys(project_id: int, current_user=Depends(get_current_user)):
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")

    workspace_id = _resolve_project_workspace(project_id)
    if not workspace_id:
        return []

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, key_prefix, created_at, last_used_at, is_active
                   FROM api_keys
                   WHERE workspace_id = %s AND is_active = TRUE
                   ORDER BY created_at DESC""",
                (workspace_id,),
            )
            rows = cur.fetchall()

    return [
        {
            "id": r[0],
            "key_prefix": r[1],
            "created_at": r[2].isoformat() if r[2] else None,
            "last_used_at": r[3].isoformat() if r[3] else None,
            "is_active": r[4],
        }
        for r in rows
    ]


@router.delete("/projects/{project_id}/api-keys/{key_id}", status_code=204)
async def revoke_api_key(project_id: int, key_id: int, current_user=Depends(get_current_user)):
    project = _svc().get_project(project_id=project_id, user_id=current_user["id"])
    if not project:
        raise HTTPException(status_code=404, detail="Projet introuvable ou accès refusé")

    workspace_id = _resolve_project_workspace(project_id)
    if not workspace_id:
        raise HTTPException(status_code=404, detail="Workspace introuvable")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE api_keys SET is_active = FALSE
                   WHERE id = %s AND workspace_id = %s""",
                (key_id, workspace_id),
            )
            if cur.rowcount == 0:
                raise HTTPException(status_code=404, detail="Clé introuvable")
            conn.commit()


@router.post("/projects/{project_id}/source-proposals", status_code=201)
async def propose_source(project_id: int, body: SourceProposalCreate,
                         current_user=Depends(get_current_user)):
    try:
        return _proposal_svc().propose_source(
            project_id=project_id,
            user_id=current_user["id"],
            url=body.url,
            source_type=body.source_type,
            name=body.name,
            description=body.description,
            sujet_id=body.sujet_id,
        )
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))




class RunPipelineBody(BaseModel):
    proposal_ids: Optional[List[int]] = None  # None = toutes les approuvées


@router.post("/projects/{project_id}/run-pipeline")
async def run_project_pipeline(
    project_id: int,
    body: RunPipelineBody = RunPipelineBody(),
    current_user=Depends(get_current_user),
):
    """Lance le pipeline sur les proposal_ids fournis (ou toutes les approuvées si None)."""
    import asyncio
    from argos.services.pipeline import run_pipeline_for_source

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role FROM project_members WHERE project_id = %s AND user_id = %s AND status = 'active'",
                (project_id, current_user["id"]),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Accès refusé")

            if body.proposal_ids:
                # Approuver les propositions sélectionnées puis les récupérer
                cur.execute(
                    """UPDATE source_proposals SET status = 'approved', reviewed_by = %s, reviewed_at = NOW()
                       WHERE project_id = %s AND id = ANY(%s)""",
                    (current_user["id"], project_id, body.proposal_ids),
                )
                cur.execute(
                    "SELECT id, url, source_type, name, sujet_id FROM source_proposals WHERE id = ANY(%s)",
                    (body.proposal_ids,),
                )
            else:
                cur.execute(
                    "SELECT id, url, source_type, name, sujet_id FROM source_proposals WHERE project_id = %s AND status = 'approved'",
                    (project_id,),
                )
            proposals = cur.fetchall()
        conn.commit()

    if not proposals:
        return {"launched": 0, "message": "Aucune source à lancer"}

    launched = 0
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            for prop_id, url, source_type, name, sujet_id in proposals:
                # Le workspace cible = sujet_id de la proposition, sinon workspace principal du projet
                target_workspace = sujet_id or _resolve_project_workspace(project_id)
                if not target_workspace:
                    continue
                cur.execute(
                    "SELECT id FROM sources WHERE url = %s AND workspace_id = %s",
                    (url, target_workspace),
                )
                row = cur.fetchone()
                if row:
                    source_id = row[0]
                else:
                    _ALLOWED_TYPES = {'rss', 'website', 'github', 'api'}
                    safe_type = source_type if source_type in _ALLOWED_TYPES else 'website'
                    cur.execute(
                        """INSERT INTO sources (name, url, type, active, workspace_id)
                           VALUES (%s, %s, %s, TRUE, %s) RETURNING id""",
                        (name or url, url, safe_type, target_workspace),
                    )
                    source_id = cur.fetchone()[0]
                    conn.commit()

                asyncio.create_task(run_pipeline_for_source(source_id))
                launched += 1

    return {"launched": launched}


def _check_project_access(project_id: int, user_id: int) -> int:
    """Vérifie l'accès au projet et retourne le workspace_id. Lève HTTPException sinon."""
    workspace_id = _resolve_project_workspace(project_id)
    if not workspace_id:
        raise HTTPException(status_code=404, detail="Projet ou workspace introuvable")
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT role FROM project_members WHERE project_id = %s AND user_id = %s AND status = 'active'",
                (project_id, user_id),
            )
            if not cur.fetchone():
                raise HTTPException(status_code=403, detail="Accès refusé")
    return workspace_id


@router.get("/projects/{project_id}/briefing/today")
async def get_project_briefing_today(
    project_id: int,
    current_user=Depends(get_current_user),
):
    """Brief du jour pour le workspace du projet, sans régénérer."""
    import datetime as _dt
    workspace_id = _check_project_access(project_id, current_user["id"])
    today = _dt.date.today()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, briefing_date, executive_summary, top_items, trends, stats,
                          tokens_used, cost_usd, generated_at, cited_sources, groups, no_new_content
                   FROM daily_briefings
                   WHERE briefing_date = %s AND workspace_id = %s
                   ORDER BY generated_at DESC LIMIT 1""",
                (today, workspace_id),
            )
            row = cur.fetchone()
    if not row:
        return {"exists": False, "date": str(today)}
    return {
        "exists": True,
        "id": row[0], "date": str(row[1]),
        "markdown": row[2], "top_items": row[3] or [],
        "trends": row[4] or [], "stats": row[5] or {},
        "tokens_used": row[6], "cost_usd": float(row[7] or 0),
        "generated_at": row[8].isoformat() if row[8] else None,
        "cited_sources": row[9] or [], "groups": row[10] or {},
        "no_new_content": bool(row[11]),
    }


@router.post("/projects/{project_id}/briefing/generate")
async def generate_project_briefing(
    project_id: int,
    data: dict = {},
    current_user=Depends(get_current_user),
):
    """Génère et persiste un brief pour le workspace du projet."""
    import datetime as _dt
    import json as _json
    from argos.api.router import _generate_briefing_content

    workspace_id = _check_project_access(project_id, current_user["id"])
    hours = int(data.get("hours", 72))
    force = bool(data.get("force", False))
    today = _dt.date.today()

    if not force:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM daily_briefings WHERE briefing_date = %s AND workspace_id = %s",
                    (today, workspace_id),
                )
                existing = cur.fetchone()
        if existing:
            return {"already_exists": True, "date": str(today), "id": existing[0]}

    result = await _generate_briefing_content(hours=hours, workspace_id=workspace_id)
    if "error" in result:
        raise HTTPException(status_code=422, detail=result.get("message", "Erreur génération"))
    if result.get("no_new_content"):
        return {"no_new_content": True, "date": str(today)}

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM daily_briefings WHERE briefing_date = %s AND workspace_id = %s",
                (today, workspace_id),
            )
            cur.execute(
                """INSERT INTO daily_briefings
                   (briefing_date, executive_summary, top_items, trends, stats,
                    workspace_id, sujet_id, tokens_used, cost_usd, cited_sources, groups, no_new_content)
                   VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, NULL, %s, %s,
                           %s::jsonb, %s::jsonb, %s)
                   RETURNING id""",
                (
                    today,
                    result["markdown"],
                    _json.dumps(result["top_items"]),
                    _json.dumps(result["trends"]),
                    _json.dumps(result["stats"]),
                    workspace_id,
                    result["tokens_used"],
                    result["cost_usd"],
                    _json.dumps(result.get("cited_sources", [])),
                    _json.dumps(result.get("groups", {})),
                    len(result.get("top_items", [])) == 0,
                ),
            )
            briefing_id = cur.fetchone()[0]
            conn.commit()

    return {
        "success": True, "id": briefing_id, "date": str(today),
        "markdown": result["markdown"],
        "top_items": result["top_items"],
        "cited_sources": result.get("cited_sources", []),
        "groups": result.get("groups", {}),
        "trends": result["trends"],
        "stats": result["stats"],
        "tokens_used": result["tokens_used"],
    }


@router.get("/projects/{project_id}/briefing/list")
async def list_project_briefings(
    project_id: int,
    limit: int = 30,
    current_user=Depends(get_current_user),
):
    """Historique des briefs du workspace du projet."""
    workspace_id = _check_project_access(project_id, current_user["id"])
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, briefing_date, stats, tokens_used, generated_at,
                          LEFT(executive_summary, 300)
                   FROM daily_briefings
                   WHERE workspace_id = %s
                   ORDER BY briefing_date DESC, generated_at DESC
                   LIMIT %s""",
                (workspace_id, limit),
            )
            rows = cur.fetchall()
    return [
        {
            "id": r[0], "date": str(r[1]), "stats": r[2] or {},
            "tokens_used": r[3],
            "generated_at": r[4].isoformat() if r[4] else None,
            "excerpt": r[5] or "",
        }
        for r in rows
    ]


@router.get("/projects/{project_id}/metrics")
async def get_project_metrics(
    project_id: int,
    days: int = 30,
    current_user=Depends(get_current_user),
):
    """Métriques qualité digests + coûts LLM scopés au projet."""
    workspace_id = _resolve_project_workspace(project_id)
    if not workspace_id:
        raise HTTPException(status_code=404, detail="Projet ou workspace introuvable")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    COUNT(*) as total,
                    ROUND(AVG(score_global)::numeric, 2) as avg_global,
                    ROUND(AVG(score_fidelity)::numeric, 2) as avg_fidelity,
                    ROUND(AVG(score_completeness)::numeric, 2) as avg_completeness,
                    ROUND(AVG(score_relevance)::numeric, 2) as avg_relevance,
                    ROUND(AVG(score_concision)::numeric, 2) as avg_concision,
                    COUNT(*) FILTER (WHERE score_global < 3) as low_quality_count
                FROM digest_scores
                WHERE workspace_id = %s AND created_at >= NOW() - INTERVAL '%s days'
            """, (workspace_id, days))
            r = cur.fetchone()
            quality = {
                "total_scored": r[0], "avg_global": float(r[1] or 0),
                "avg_fidelity": float(r[2] or 0), "avg_completeness": float(r[3] or 0),
                "avg_relevance": float(r[4] or 0), "avg_concision": float(r[5] or 0),
                "low_quality_count": r[6],
            }

            cur.execute("""
                SELECT DATE_TRUNC('day', created_at)::date as day,
                       ROUND(AVG(score_global)::numeric, 2) as avg
                FROM digest_scores
                WHERE workspace_id = %s AND created_at >= NOW() - INTERVAL '%s days'
                GROUP BY day ORDER BY day
            """, (workspace_id, days))
            quality_trend = [{"date": str(r[0]), "avg_global": float(r[1] or 0)} for r in cur.fetchall()]

            cur.execute("""
                SELECT operation_type, ROUND(SUM(cost_usd)::numeric, 4) as cost,
                       SUM(tokens_used) as tokens
                FROM llm_usage
                WHERE entity_type = 'workspace' AND entity_id = %s
                  AND created_at >= NOW() - INTERVAL '%s days'
                GROUP BY operation_type ORDER BY cost DESC
            """, (workspace_id, days))
            costs = [
                {"operation_type": r[0], "cost_usd": float(r[1] or 0), "tokens": r[2]}
                for r in cur.fetchall()
            ]

            cur.execute("""
                SELECT ROUND(SUM(cost_usd)::numeric, 4)
                FROM llm_usage
                WHERE entity_type = 'workspace' AND entity_id = %s
                  AND created_at >= NOW() - INTERVAL '%s days'
            """, (workspace_id, days))
            total_cost = float(cur.fetchone()[0] or 0)

    return {
        "project_id": project_id,
        "workspace_id": workspace_id,
        "period_days": days,
        "quality": quality,
        "quality_trend": quality_trend,
        "costs": {"total_usd": total_cost, "by_operation": costs},
    }
