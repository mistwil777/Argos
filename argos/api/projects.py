"""
API Projets — CRUD, membres, propositions de sources.
"""
import logging
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


class MemberInvite(BaseModel):
    email: str
    role: str = "editor"
    sujet_access: Optional[list] = None


class MemberAccessUpdate(BaseModel):
    sujet_access: Optional[list] = None


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
                "SELECT id, project_id, user_id, invited_email, role, sujet_access, "
                "status, invited_by, invited_at, joined_at "
                "FROM project_members WHERE project_id = %s ORDER BY invited_at",
                (project_id,),
            )
            from argos.services.project_service import _row_to_member
            return [_row_to_member(r) for r in cur.fetchall()]


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


@router.delete("/projects/{project_id}/members/{user_id}", status_code=204)
async def remove_member(project_id: int, user_id: int,
                        current_user=Depends(get_current_user)):
    try:
        _svc().remove_member(
            project_id=project_id,
            owner_id=current_user["id"],
            member_user_id=user_id,
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


