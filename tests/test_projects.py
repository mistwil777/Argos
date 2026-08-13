"""
Tests — Projets (Phase 1)

Couvre :
- ProjectService.create_project : création, slug auto, owner assigné
- ProjectService.create_project : nom vide → ValueError
- ProjectService.get_project : projet existant → dict complet
- ProjectService.get_project : projet inexistant → None
- ProjectService.get_project : accès refusé (non-membre) → None
- ProjectService.list_projects : retourne uniquement les projets du user
- ProjectService.update_project : owner peut modifier
- ProjectService.update_project : non-owner → PermissionError
- ProjectService.delete_project : owner peut supprimer
- ProjectService.delete_project : non-owner → PermissionError
- ProjectService.add_member : owner invite par email, statut pending
- ProjectService.add_member : doublon → ValueError
- ProjectService.update_member_access : owner modifie sujet_access
- ProjectService.update_member_access : non-owner → PermissionError
- ProjectService.remove_member : owner peut retirer un membre
- ProjectService.remove_member : membre ne peut pas se retirer lui-même si owner
- SourceProposalService.propose_source : membre actif peut proposer
- SourceProposalService.propose_source : non-membre → PermissionError
- SourceProposalService.review_proposal : owner approuve → statut approved
- SourceProposalService.review_proposal : owner rejette avec note
- SourceProposalService.review_proposal : non-owner → PermissionError
- SourceProposalService.list_proposals : owner voit toutes les proposals
- SourceProposalService.list_proposals : membre ne voit que ses proposals
"""

import pytest
from unittest.mock import MagicMock, patch, call
from argos.services.project_service import ProjectService, SourceProposalService


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_db(rows=None, rowcount=1):
    """Retourne un mock DatabaseManager dont cursor.fetchone/fetchall est configurable."""
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone = MagicMock(return_value=rows[0] if rows else None)
    cur.fetchall = MagicMock(return_value=rows if rows else [])
    cur.rowcount = rowcount
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor = MagicMock(return_value=cur)
    db = MagicMock()
    db.get_connection = MagicMock(return_value=conn)
    return db


def _project_row(id=1, name="Projet Alpha", slug="projet-alpha", owner_id=10):
    return (id, name, slug, "Description", None, None, None, None, owner_id, True,
            "2026-08-13T00:00:00", "2026-08-13T00:00:00")


def _member_row(id=1, project_id=1, user_id=10, invited_email=None,
                role="owner", sujet_access=None, status="active"):
    return (id, project_id, user_id, invited_email, role, sujet_access, status,
            None, "2026-08-13T00:00:00", None)


def _proposal_row(id=1, project_id=1, sujet_id=None, url="https://ex.com",
                  source_type="website", name="Ex", proposed_by=20,
                  status="pending"):
    return (id, project_id, sujet_id, url, source_type, name, None, proposed_by,
            status, None, None, "2026-08-13T00:00:00", None)


# ── ProjectService.create_project ─────────────────────────────────────────────

class TestCreateProject:
    def test_creates_with_auto_slug(self):
        db = _make_db(rows=[_project_row()])
        svc = ProjectService(db)
        result = svc.create_project(owner_id=10, name="Projet Alpha")
        assert result["slug"] == "projet-alpha"
        assert result["owner_id"] == 10

    def test_empty_name_raises(self):
        db = _make_db()
        svc = ProjectService(db)
        with pytest.raises(ValueError, match="nom"):
            svc.create_project(owner_id=10, name="  ")

    def test_owner_auto_added_as_member(self):
        db = _make_db(rows=[_project_row()])
        svc = ProjectService(db)
        svc.create_project(owner_id=10, name="Projet Alpha")
        # Vérifie qu'un INSERT project_members a été émis
        all_calls = str(db.get_connection.return_value.__enter__.return_value.cursor
                        .return_value.__enter__.return_value.execute.call_args_list)
        assert "project_members" in all_calls


# ── ProjectService.get_project ────────────────────────────────────────────────

class TestGetProject:
    def test_returns_project_for_member(self):
        db = _make_db(rows=[_project_row(), _member_row()])
        svc = ProjectService(db)
        # Premier fetchone → projet, second → membre
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [_project_row(), _member_row()]
        result = svc.get_project(project_id=1, user_id=10)
        assert result is not None
        assert result["id"] == 1

    def test_returns_none_for_nonexistent(self):
        db = _make_db(rows=[None])
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = None
        assert svc.get_project(project_id=999, user_id=10) is None

    def test_returns_none_if_not_member(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [_project_row(), None]  # projet trouvé, pas membre
        assert svc.get_project(project_id=1, user_id=99) is None


# ── ProjectService.list_projects ──────────────────────────────────────────────

class TestListProjects:
    def test_returns_only_user_projects(self):
        rows = [_project_row(id=1), _project_row(id=2, name="Projet Beta", slug="projet-beta")]
        db = _make_db(rows=rows)
        svc = ProjectService(db)
        results = svc.list_projects(user_id=10)
        assert len(results) == 2

    def test_empty_if_no_projects(self):
        db = _make_db(rows=[])
        svc = ProjectService(db)
        assert svc.list_projects(user_id=10) == []


# ── ProjectService.update_project ────────────────────────────────────────────

class TestUpdateProject:
    def test_owner_can_update(self):
        db = _make_db(rows=[_project_row()])
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        # is_owner retourne True
        cur.fetchone.side_effect = [_member_row(role="owner"), _project_row(name="Nouveau nom")]
        result = svc.update_project(project_id=1, user_id=10, name="Nouveau nom")
        assert result["name"] == "Nouveau nom"

    def test_non_owner_raises(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="editor")
        with pytest.raises(PermissionError):
            svc.update_project(project_id=1, user_id=20, name="Hack")


# ── ProjectService.delete_project ────────────────────────────────────────────

class TestDeleteProject:
    def test_owner_can_delete(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="owner")
        svc.delete_project(project_id=1, user_id=10)  # ne doit pas lever

    def test_non_owner_raises(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="reader")
        with pytest.raises(PermissionError):
            svc.delete_project(project_id=1, user_id=20)


# ── ProjectService.add_member ─────────────────────────────────────────────────

class TestAddMember:
    def test_owner_can_invite_by_email(self):
        db = _make_db(rows=[_member_row(role="owner")])
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [
            _member_row(role="owner"),   # vérif owner
            None,                        # pas de doublon
            _member_row(invited_email="new@ex.com", role="editor", status="pending"),
        ]
        result = svc.add_member(project_id=1, inviter_id=10,
                                invited_email="new@ex.com", role="editor")
        assert result["status"] == "pending"
        assert result["role"] == "editor"

    def test_duplicate_invite_raises(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [
            _member_row(role="owner"),
            _member_row(invited_email="dup@ex.com"),  # doublon existant
        ]
        with pytest.raises(ValueError, match="déjà"):
            svc.add_member(project_id=1, inviter_id=10,
                           invited_email="dup@ex.com", role="editor")

    def test_non_owner_cannot_invite(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="editor")
        with pytest.raises(PermissionError):
            svc.add_member(project_id=1, inviter_id=20,
                           invited_email="new@ex.com", role="reader")


# ── ProjectService.update_member_access ──────────────────────────────────────

class TestUpdateMemberAccess:
    def test_owner_sets_sujet_access(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [
            _member_row(role="owner"),
            _member_row(sujet_access=[1, 2]),
        ]
        result = svc.update_member_access(project_id=1, owner_id=10,
                                          member_id=2, sujet_access=[1, 2])
        assert result["sujet_access"] == [1, 2]

    def test_non_owner_raises(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="editor")
        with pytest.raises(PermissionError):
            svc.update_member_access(project_id=1, owner_id=20,
                                     member_id=3, sujet_access=[1])


# ── ProjectService.remove_member ─────────────────────────────────────────────

class TestRemoveMember:
    def test_owner_removes_member(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="owner")
        svc.remove_member(project_id=1, owner_id=10, member_user_id=20)

    def test_owner_cannot_remove_themselves(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="owner", user_id=10)
        with pytest.raises(ValueError, match="propriétaire"):
            svc.remove_member(project_id=1, owner_id=10, member_user_id=10)

    def test_non_owner_raises(self):
        db = _make_db()
        svc = ProjectService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="reader")
        with pytest.raises(PermissionError):
            svc.remove_member(project_id=1, owner_id=20, member_user_id=30)


# ── SourceProposalService ─────────────────────────────────────────────────────

class TestProposeSource:
    def test_active_member_can_propose(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [
            _member_row(user_id=20, role="editor", status="active"),
            _proposal_row(proposed_by=20),
        ]
        result = svc.propose_source(project_id=1, user_id=20,
                                    url="https://ex.com", source_type="rss")
        assert result["status"] == "pending"
        assert result["proposed_by"] == 20

    def test_non_member_raises(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = None  # pas membre
        with pytest.raises(PermissionError):
            svc.propose_source(project_id=1, user_id=99,
                               url="https://ex.com", source_type="website")

    def test_pending_member_cannot_propose(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(status="pending")
        with pytest.raises(PermissionError):
            svc.propose_source(project_id=1, user_id=20,
                               url="https://ex.com", source_type="website")


class TestReviewProposal:
    def test_owner_approves(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [
            _member_row(role="owner"),
            _proposal_row(status="approved"),
        ]
        result = svc.review_proposal(project_id=1, owner_id=10,
                                     proposal_id=1, decision="approved")
        assert result["status"] == "approved"

    def test_owner_rejects_with_note(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.side_effect = [
            _member_row(role="owner"),
            _proposal_row(status="rejected"),
        ]
        result = svc.review_proposal(project_id=1, owner_id=10,
                                     proposal_id=1, decision="rejected",
                                     note="Hors périmètre")
        assert result["status"] == "rejected"

    def test_non_owner_cannot_review(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="editor")
        with pytest.raises(PermissionError):
            svc.review_proposal(project_id=1, owner_id=20,
                                 proposal_id=1, decision="approved")

    def test_invalid_decision_raises(self):
        db = _make_db()
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="owner")
        with pytest.raises(ValueError):
            svc.review_proposal(project_id=1, owner_id=10,
                                 proposal_id=1, decision="maybe")


class TestListProposals:
    def test_owner_sees_all(self):
        rows = [_proposal_row(id=1), _proposal_row(id=2, proposed_by=30)]
        db = _make_db(rows=rows)
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(role="owner")
        cur.fetchall.return_value = rows
        results = svc.list_proposals(project_id=1, user_id=10)
        assert len(results) == 2

    def test_member_sees_only_own(self):
        own = [_proposal_row(id=1, proposed_by=20)]
        db = _make_db(rows=own)
        svc = SourceProposalService(db)
        cur = db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value
        cur.fetchone.return_value = _member_row(user_id=20, role="editor")
        cur.fetchall.return_value = own
        results = svc.list_proposals(project_id=1, user_id=20)
        assert len(results) == 1
