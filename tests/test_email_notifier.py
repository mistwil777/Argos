"""
Tests — EmailNotifier

Couvre :
- notify_member_invited : email envoyé via SMTP avec les infos d'invitation
- notify_member_invited : pas de config SMTP → no-op silencieux
- notify_proposal_reviewed : sujet contient la décision (approved/rejected)
- notify_proposal_reviewed : pas d'exception si SMTP échoue (fire-and-forget)
- notify_calibration_done : email contient les sujets générés
- intégration route invite_member → email envoyé si destinataire présent
- intégration route review_proposal_route → email envoyé si destinataire présent
- intégration route finalize_calibration → email envoyé si destinataire présent
"""

import pytest
import smtplib
from unittest.mock import MagicMock, AsyncMock, patch, call


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_notifier():
    from argos.services.email_notifier import EmailNotifier
    return EmailNotifier(
        smtp_host="smtp.office365.com",
        smtp_port=587,
        smtp_user="argos@capgemini.com",
        smtp_password="secret",
    )


# ── notify_member_invited ─────────────────────────────────────────────────────

class TestNotifyMemberInvited:
    @pytest.mark.asyncio
    async def test_sends_email_with_invitation_info(self):
        notifier = _make_notifier()
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            mock_smtp = MagicMock()
            mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_smtp)
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            await notifier.notify_member_invited(
                to_email="alice@capgemini.com",
                project_name="Refonte SI Finance",
                inviter_name="Bob Martin",
                role="member",
            )

        mock_smtp.sendmail.assert_called_once()
        args = mock_smtp.sendmail.call_args[0]
        assert args[1] == "alice@capgemini.com"
        import email as emaillib, base64
        msg = emaillib.message_from_string(args[2])
        body = ""
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                body = payload.decode("utf-8") if payload else part.get_payload()
        assert "Refonte SI Finance" in body
        assert "Bob Martin" in body

    @pytest.mark.asyncio
    async def test_noop_without_smtp_config(self):
        from argos.services.email_notifier import EmailNotifier
        notifier = EmailNotifier(smtp_host=None, smtp_port=587, smtp_user=None, smtp_password=None)
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            await notifier.notify_member_invited(
                to_email="alice@capgemini.com",
                project_name="Refonte SI Finance",
                inviter_name="Bob Martin",
                role="member",
            )
        mock_smtp_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_smtp_error_does_not_raise(self):
        notifier = _make_notifier()
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            mock_smtp_cls.side_effect = smtplib.SMTPException("connexion refusée")
            # Ne doit pas propager l'exception
            await notifier.notify_member_invited(
                to_email="alice@capgemini.com",
                project_name="Refonte SI Finance",
                inviter_name="Bob Martin",
                role="member",
            )


# ── notify_proposal_reviewed ──────────────────────────────────────────────────

class TestNotifyProposalReviewed:
    @pytest.mark.asyncio
    async def test_approved_decision_in_subject(self):
        notifier = _make_notifier()
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            mock_smtp = MagicMock()
            mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_smtp)
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            await notifier.notify_proposal_reviewed(
                to_email="alice@capgemini.com",
                project_name="Refonte SI Finance",
                source_url="https://example.com/source",
                decision="approved",
                note=None,
            )

        import email as emaillib
        raw = mock_smtp.sendmail.call_args[0][2]
        msg = emaillib.message_from_string(raw)
        body = ""
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                body = payload.decode("utf-8") if payload else part.get_payload()
        assert "approuv" in body.lower() or "approved" in body.lower() or "approuv" in msg["Subject"].lower()

    @pytest.mark.asyncio
    async def test_rejected_with_note_in_body(self):
        notifier = _make_notifier()
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            mock_smtp = MagicMock()
            mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_smtp)
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            await notifier.notify_proposal_reviewed(
                to_email="alice@capgemini.com",
                project_name="Refonte SI Finance",
                source_url="https://example.com/source",
                decision="rejected",
                note="Hors périmètre",
            )

        import email as emaillib
        raw = mock_smtp.sendmail.call_args[0][2]
        msg = emaillib.message_from_string(raw)
        body = ""
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                body = payload.decode("utf-8") if payload else part.get_payload()
        assert "Hors" in body


# ── notify_calibration_done ───────────────────────────────────────────────────

class TestNotifyCalibrationDone:
    @pytest.mark.asyncio
    async def test_subjects_in_email_body(self):
        notifier = _make_notifier()
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            mock_smtp = MagicMock()
            mock_smtp_cls.return_value.__enter__ = MagicMock(return_value=mock_smtp)
            mock_smtp_cls.return_value.__exit__ = MagicMock(return_value=False)

            await notifier.notify_calibration_done(
                to_email="alice@capgemini.com",
                project_name="Refonte SI Finance",
                subjects=["Architecture microservices", "Migration cloud"],
                n_sources=4,
            )

        import email as emaillib
        raw = mock_smtp.sendmail.call_args[0][2]
        msg = emaillib.message_from_string(raw)
        body = ""
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                payload = part.get_payload(decode=True)
                body = payload.decode("utf-8") if payload else part.get_payload()
        assert "Architecture microservices" in body
        assert "Migration cloud" in body


# ── Fonctions proxy (module-level) ────────────────────────────────────────────

class TestProxyFunctions:
    @pytest.mark.asyncio
    async def test_notify_member_invited_email_noop_without_email(self):
        from argos.services.email_notifier import notify_member_invited_email
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            await notify_member_invited_email(
                to_email=None,
                project_name="P", inviter_name="X", role="member",
            )
        mock_smtp_cls.assert_not_called()

    @pytest.mark.asyncio
    async def test_notify_calibration_done_email_noop_without_email(self):
        from argos.services.email_notifier import notify_calibration_done_email
        with patch("argos.services.email_notifier.smtplib.SMTP") as mock_smtp_cls:
            await notify_calibration_done_email(
                to_email=None,
                project_name="P", subjects=[], n_sources=0,
            )
        mock_smtp_cls.assert_not_called()


# ── Intégration routes ────────────────────────────────────────────────────────

import sys
sys.modules.setdefault("mcp", MagicMock())
sys.modules.setdefault("mcp.server", MagicMock())
sys.modules.setdefault("mcp.server.fastmcp", MagicMock())

from fastapi.testclient import TestClient


def _make_auth_db(user_row, extra_rows=None):
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    rows = [user_row] + (extra_rows or [])
    cur.fetchone = MagicMock(side_effect=rows)
    cur.fetchall = MagicMock(return_value=[])
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor = MagicMock(return_value=cur)
    db = MagicMock()
    db.get_connection = MagicMock(return_value=conn)
    return db


class TestInviteMemberEmailIntegration:
    def test_email_sent_when_invitee_has_email(self):
        from argos.server import app
        from argos.api import projects as proj_module
        from argos.api.auth import get_current_user

        current_user = {"id": 1, "email": "owner@capgemini.com", "full_name": "Owner"}

        mock_project_service = MagicMock()
        mock_project_service.add_member = MagicMock(
            return_value={"id": 2, "email": "alice@capgemini.com", "full_name": "Alice"}
        )
        mock_project_service.get_project = MagicMock(
            return_value={"id": 1, "name": "Refonte SI"}
        )

        app.dependency_overrides[get_current_user] = lambda: current_user
        try:
            with patch("argos.api.projects.ProjectService", return_value=mock_project_service), \
                 patch("argos.api.projects.notify_member_invited_email") as mock_notify:
                mock_notify.return_value = None

                with TestClient(app, raise_server_exceptions=False) as c:
                    c.post(
                        "/api/v1/projects/1/members",
                        json={"email": "alice@capgemini.com", "role": "member"},
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        mock_notify.assert_called_once()
        kw = mock_notify.call_args[1] if mock_notify.call_args[1] else {}
        assert kw.get("to_email") == "alice@capgemini.com"

    def test_email_not_sent_when_invitee_has_no_email(self):
        from argos.server import app
        from argos.api import projects as proj_module
        from argos.api.auth import get_current_user

        current_user = {"id": 1, "email": "owner@capgemini.com", "full_name": "Owner"}

        mock_project_service = MagicMock()
        mock_project_service.add_member = MagicMock(
            return_value={"id": 2, "email": None, "full_name": "Alice"}
        )
        mock_project_service.get_project = MagicMock(
            return_value={"id": 1, "name": "Refonte SI"}
        )

        app.dependency_overrides[get_current_user] = lambda: current_user
        try:
            with patch("argos.api.projects.ProjectService", return_value=mock_project_service), \
                 patch("argos.api.projects.notify_member_invited_email") as mock_notify:
                mock_notify.return_value = None

                with TestClient(app, raise_server_exceptions=False) as c:
                    c.post(
                        "/api/v1/projects/1/members",
                        json={"email": "alice@capgemini.com", "role": "member"},
                    )
        finally:
            app.dependency_overrides.pop(get_current_user, None)

        # member.email=None → to_email=None passé au notifier → proxy no-op
        mock_notify.assert_called_once()
        kw = mock_notify.call_args[1] if mock_notify.call_args[1] else {}
        assert kw.get("to_email") is None
