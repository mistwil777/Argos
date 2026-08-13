"""
ProjectService — CRUD projets, gestion membres, propositions de sources.
"""
import json
import re
import logging
from typing import Optional

logger = logging.getLogger(__name__)


def _slugify(text: str) -> str:
    s = text.lower().strip()
    s = re.sub(r"[^\w\s-]", "", s)
    s = re.sub(r"[\s_-]+", "-", s)
    return s[:150]


def _row_to_project(row) -> dict:
    return {
        "id": row[0],
        "name": row[1],
        "slug": row[2],
        "description": row[3],
        "cdc_content": row[4],
        "cdc_analysis": row[5],
        "knowledge_profile": row[6],
        "owner_id": row[7],
        "is_active": row[8],
        "created_at": row[9].isoformat() if row[9] and hasattr(row[9], "isoformat") else row[9],
        "updated_at": row[10].isoformat() if row[10] and hasattr(row[10], "isoformat") else row[10],
    }


def _row_to_member(row) -> dict:
    return {
        "id": row[0],
        "project_id": row[1],
        "user_id": row[2],
        "invited_email": row[3],
        "role": row[4],
        "sujet_access": row[5],
        "status": row[6],
        "invited_by": row[7],
        "invited_at": row[8].isoformat() if row[8] and hasattr(row[8], "isoformat") else row[8],
        "joined_at": row[9].isoformat() if row[9] and hasattr(row[9], "isoformat") else row[9],
    }


def _row_to_proposal(row) -> dict:
    return {
        "id": row[0],
        "project_id": row[1],
        "sujet_id": row[2],
        "url": row[3],
        "source_type": row[4],
        "name": row[5],
        "description": row[6],
        "proposed_by": row[7],
        "status": row[8],
        "reviewed_by": row[9],
        "review_note": row[10],
        "proposed_at": row[11].isoformat() if row[11] and hasattr(row[11], "isoformat") else row[11],
        "reviewed_at": row[12].isoformat() if row[12] and hasattr(row[12], "isoformat") else row[12],
    }


def _get_member_role(cur, project_id: int, user_id: int) -> Optional[dict]:
    cur.execute(
        "SELECT id, project_id, user_id, invited_email, role, sujet_access, status, "
        "invited_by, invited_at, joined_at "
        "FROM project_members WHERE project_id = %s AND user_id = %s",
        (project_id, user_id),
    )
    row = cur.fetchone()
    return _row_to_member(row) if row else None


class ProjectService:
    def __init__(self, db):
        self.db = db

    # ── CRUD ──────────────────────────────────────────────────────────────────

    def create_project(self, owner_id: int, name: str,
                       description: str = None) -> dict:
        name = (name or "").strip()
        if not name:
            raise ValueError("Le nom du projet est obligatoire")
        slug = _slugify(name)
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO projects (name, slug, description, owner_id) "
                    "VALUES (%s, %s, %s, %s) RETURNING id, name, slug, description, "
                    "cdc_content, cdc_analysis, knowledge_profile, "
                    "owner_id, is_active, created_at, updated_at",
                    (name, slug, description, owner_id),
                )
                row = cur.fetchone()
                project = _row_to_project(row)
                # Ajouter l'owner comme membre actif
                cur.execute(
                    "INSERT INTO project_members (project_id, user_id, role, status, joined_at) "
                    "VALUES (%s, %s, 'owner', 'active', NOW())",
                    (project["id"], owner_id),
                )
        return project

    def get_project(self, project_id: int, user_id: int) -> Optional[dict]:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, slug, description, cdc_content, cdc_analysis, "
                    "knowledge_profile, owner_id, is_active, "
                    "created_at, updated_at FROM projects WHERE id = %s",
                    (project_id,),
                )
                row = cur.fetchone()
                if not row:
                    return None
                member = _get_member_role(cur, project_id, user_id)
                if not member:
                    return None
                return _row_to_project(row)

    def list_projects(self, user_id: int) -> list:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT p.id, p.name, p.slug, p.description, p.cdc_content, "
                    "p.cdc_analysis, p.knowledge_profile, "
                    "p.owner_id, p.is_active, p.created_at, p.updated_at "
                    "FROM projects p "
                    "JOIN project_members pm ON pm.project_id = p.id "
                    "WHERE pm.user_id = %s AND pm.status = 'active' AND p.is_active = TRUE "
                    "ORDER BY p.created_at DESC",
                    (user_id,),
                )
                return [_row_to_project(r) for r in cur.fetchall()]

    def update_project(self, project_id: int, user_id: int, **kwargs) -> dict:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                member = _get_member_role(cur, project_id, user_id)
                if not member or member["role"] != "owner":
                    raise PermissionError("Seul le propriétaire peut modifier le projet")
                allowed = {"name", "description", "cdc_content",
                           "cdc_analysis", "knowledge_profile"}
                fields = {k: v for k, v in kwargs.items() if k in allowed}
                if not fields:
                    pass
                sets = ", ".join(f"{k} = %s" for k in fields)
                values = list(fields.values()) + [project_id]
                cur.execute(
                    f"UPDATE projects SET {sets}, updated_at = NOW() WHERE id = %s "
                    "RETURNING id, name, slug, description, cdc_content, cdc_analysis, "
                    "knowledge_profile, owner_id, is_active, "
                    "created_at, updated_at",
                    values,
                )
                row = cur.fetchone()
                return _row_to_project(row)

    def delete_project(self, project_id: int, user_id: int) -> None:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                member = _get_member_role(cur, project_id, user_id)
                if not member or member["role"] != "owner":
                    raise PermissionError("Seul le propriétaire peut supprimer le projet")
                cur.execute("UPDATE projects SET is_active = FALSE WHERE id = %s", (project_id,))

    # ── Membres ───────────────────────────────────────────────────────────────

    def add_member(self, project_id: int, inviter_id: int,
                   invited_email: str, role: str = "editor",
                   sujet_access: list = None) -> dict:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                member = _get_member_role(cur, project_id, inviter_id)
                if not member or member["role"] != "owner":
                    raise PermissionError("Seul le propriétaire peut inviter des membres")
                # Vérifier doublon
                cur.execute(
                    "SELECT id FROM project_members WHERE project_id = %s AND invited_email = %s",
                    (project_id, invited_email),
                )
                if cur.fetchone():
                    raise ValueError(f"{invited_email} est déjà invité sur ce projet")
                sujet_access_json = json.dumps(sujet_access) if sujet_access else None
                cur.execute(
                    "INSERT INTO project_members "
                    "(project_id, invited_email, role, sujet_access, status, invited_by) "
                    "VALUES (%s, %s, %s, %s, 'pending', %s) "
                    "RETURNING id, project_id, user_id, invited_email, role, sujet_access, "
                    "status, invited_by, invited_at, joined_at",
                    (project_id, invited_email, role, sujet_access_json, inviter_id),
                )
                return _row_to_member(cur.fetchone())

    def update_member_access(self, project_id: int, owner_id: int,
                             member_id: int, sujet_access: list) -> dict:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                owner = _get_member_role(cur, project_id, owner_id)
                if not owner or owner["role"] != "owner":
                    raise PermissionError("Seul le propriétaire peut modifier les accès")
                sujet_access_json = json.dumps(sujet_access)
                cur.execute(
                    "UPDATE project_members SET sujet_access = %s WHERE id = %s "
                    "RETURNING id, project_id, user_id, invited_email, role, sujet_access, "
                    "status, invited_by, invited_at, joined_at",
                    (sujet_access_json, member_id),
                )
                return _row_to_member(cur.fetchone())

    def remove_member(self, project_id: int, owner_id: int, member_user_id: int) -> None:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                owner = _get_member_role(cur, project_id, owner_id)
                if not owner or owner["role"] != "owner":
                    raise PermissionError("Seul le propriétaire peut retirer des membres")
                if owner_id == member_user_id:
                    raise ValueError("Le propriétaire ne peut pas se retirer lui-même")
                cur.execute(
                    "DELETE FROM project_members WHERE project_id = %s AND user_id = %s",
                    (project_id, member_user_id),
                )


class SourceProposalService:
    def __init__(self, db):
        self.db = db

    def propose_source(self, project_id: int, user_id: int,
                       url: str, source_type: str = "website",
                       name: str = None, description: str = None,
                       sujet_id: int = None) -> dict:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                member = _get_member_role(cur, project_id, user_id)
                if not member or member["status"] != "active":
                    raise PermissionError("Seuls les membres actifs peuvent proposer des sources")
                cur.execute(
                    "INSERT INTO source_proposals "
                    "(project_id, sujet_id, url, source_type, name, description, proposed_by) "
                    "VALUES (%s, %s, %s, %s, %s, %s, %s) "
                    "RETURNING id, project_id, sujet_id, url, source_type, name, description, "
                    "proposed_by, status, reviewed_by, review_note, proposed_at, reviewed_at",
                    (project_id, sujet_id, url, source_type, name, description, user_id),
                )
                return _row_to_proposal(cur.fetchone())

    def review_proposal(self, project_id: int, owner_id: int,
                        proposal_id: int, decision: str,
                        note: str = None) -> dict:
        if decision not in ("approved", "rejected"):
            raise ValueError("La décision doit être 'approved' ou 'rejected'")
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                member = _get_member_role(cur, project_id, owner_id)
                if not member or member["role"] != "owner":
                    raise PermissionError("Seul le propriétaire peut valider les propositions")
                cur.execute(
                    "UPDATE source_proposals SET status = %s, reviewed_by = %s, "
                    "review_note = %s, reviewed_at = NOW() WHERE id = %s "
                    "RETURNING id, project_id, sujet_id, url, source_type, name, description, "
                    "proposed_by, status, reviewed_by, review_note, proposed_at, reviewed_at",
                    (decision, owner_id, note, proposal_id),
                )
                return _row_to_proposal(cur.fetchone())

    def list_proposals(self, project_id: int, user_id: int,
                       status: str = None) -> list:
        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                member = _get_member_role(cur, project_id, user_id)
                if not member:
                    raise PermissionError("Accès refusé")
                is_owner = member["role"] == "owner"
                base = (
                    "SELECT id, project_id, sujet_id, url, source_type, name, description, "
                    "proposed_by, status, reviewed_by, review_note, proposed_at, reviewed_at "
                    "FROM source_proposals WHERE project_id = %s"
                )
                params = [project_id]
                if not is_owner:
                    base += " AND proposed_by = %s"
                    params.append(user_id)
                if status:
                    base += " AND status = %s"
                    params.append(status)
                base += " ORDER BY proposed_at DESC"
                cur.execute(base, params)
                return [_row_to_proposal(r) for r in cur.fetchall()]
