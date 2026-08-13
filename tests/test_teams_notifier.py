"""
Tests — TeamsNotifier (Phase 3)

Couvre :
- TeamsNotifier.notify_member_invited : POST vers webhook avec card invitation
- TeamsNotifier.notify_member_invited : pas de webhook configuré → no-op silencieux
- TeamsNotifier.notify_proposal_reviewed : card avec décision approved
- TeamsNotifier.notify_proposal_reviewed : card avec décision rejected + note
- TeamsNotifier.notify_calibration_done : card avec liste des sujets créés
- TeamsNotifier : échec HTTP → log warning, pas d'exception (fire-and-forget)
- TeamsNotifier : timeout → log warning, pas d'exception
- intégration route invite_member → notifier appelé si webhook présent
- intégration route invite_member → notifier non appelé si pas de webhook
- intégration route review_proposal_route → notify_proposal_reviewed_teams appelé si webhook
- intégration route finalize_calibration → notify_calibration_done_teams appelé si webhook
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch, call


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_notifier(webhook_url="https://teams.example.com/webhook"):
    from argos.services.teams_notifier import TeamsNotifier
    return TeamsNotifier(webhook_url=webhook_url)


# ── TeamsNotifier.notify_member_invited ───────────────────────────────────────

class TestNotifyMemberInvited:
    @pytest.mark.asyncio
    async def test_posts_to_webhook(self):
        """Invitation → POST HTTP vers l'URL webhook."""
        notifier = _make_notifier()

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = AsyncMock()
            mock_resp = AsyncMock()
            mock_resp.status = 200
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = AsyncMock(return_value=mock_resp)
            mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
            mock_resp.__aexit__ = AsyncMock(return_value=False)
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)

            await notifier.notify_member_invited(
                project_name="Argos Interne",
                invited_email="alice@example.com",
                role="editor",
                invited_by="Bob",
            )

            mock_session.post.assert_called_once()
            call_args = mock_session.post.call_args
            assert call_args[0][0] == "https://teams.example.com/webhook"

    @pytest.mark.asyncio
    async def test_payload_contains_key_info(self):
        """Le payload envoyé contient le nom du projet, l'email et le rôle."""
        notifier = _make_notifier()
        sent_payload = {}

        def capture_post(url, json=None, **kwargs):
            sent_payload.update(json or {})
            resp = MagicMock()
            resp.status = 200
            resp.__aenter__ = AsyncMock(return_value=resp)
            resp.__aexit__ = AsyncMock(return_value=False)
            return resp

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = MagicMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = capture_post
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)
            mock_aiohttp.ClientTimeout = MagicMock(return_value=None)

            await notifier.notify_member_invited(
                project_name="Argos Interne",
                invited_email="alice@example.com",
                role="editor",
                invited_by="Bob",
            )

        payload_str = str(sent_payload)
        assert "Argos Interne" in payload_str
        assert "alice@example.com" in payload_str

    @pytest.mark.asyncio
    async def test_no_webhook_is_noop(self):
        """Pas d'URL webhook → aucun appel HTTP, pas d'exception."""
        from argos.services.teams_notifier import TeamsNotifier
        notifier = TeamsNotifier(webhook_url=None)

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            await notifier.notify_member_invited(
                project_name="Argos",
                invited_email="x@x.com",
                role="reader",
                invited_by="Owner",
            )
            mock_aiohttp.ClientSession.assert_not_called()

    @pytest.mark.asyncio
    async def test_http_error_does_not_raise(self):
        """Échec HTTP (500) → warning loggé, pas d'exception propagée."""
        notifier = _make_notifier()

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = AsyncMock()
            mock_resp = AsyncMock()
            mock_resp.status = 500
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = AsyncMock(return_value=mock_resp)
            mock_resp.__aenter__ = AsyncMock(return_value=mock_resp)
            mock_resp.__aexit__ = AsyncMock(return_value=False)
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)

            # Ne doit pas lever d'exception
            await notifier.notify_member_invited(
                project_name="Argos",
                invited_email="x@x.com",
                role="editor",
                invited_by="Owner",
            )

    @pytest.mark.asyncio
    async def test_connection_error_does_not_raise(self):
        """Exception réseau → warning loggé, pas d'exception propagée."""
        notifier = _make_notifier()

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = AsyncMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = AsyncMock(side_effect=Exception("Connection refused"))
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)

            await notifier.notify_member_invited(
                project_name="Argos",
                invited_email="x@x.com",
                role="editor",
                invited_by="Owner",
            )


# ── TeamsNotifier.notify_proposal_reviewed ────────────────────────────────────

class TestNotifyProposalReviewed:
    @pytest.mark.asyncio
    async def test_approved_card_posted(self):
        """Décision approved → POST avec mention approved dans payload."""
        notifier = _make_notifier()
        sent_payload = {}

        def capture_post(url, json=None, **kwargs):
            sent_payload.update(json or {})
            resp = MagicMock()
            resp.status = 200
            resp.__aenter__ = AsyncMock(return_value=resp)
            resp.__aexit__ = AsyncMock(return_value=False)
            return resp

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = MagicMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = capture_post
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)
            mock_aiohttp.ClientTimeout = MagicMock(return_value=None)

            await notifier.notify_proposal_reviewed(
                project_name="Argos Interne",
                source_url="https://openai.com/blog",
                decision="approved",
                note=None,
                reviewed_by="Alice",
            )

        payload_str = str(sent_payload)
        assert "approved" in payload_str.lower() or "approuv" in payload_str.lower()

    @pytest.mark.asyncio
    async def test_rejected_with_note(self):
        """Décision rejected + note → note incluse dans le payload."""
        notifier = _make_notifier()
        sent_payload = {}

        def capture_post(url, json=None, **kwargs):
            sent_payload.update(json or {})
            resp = MagicMock()
            resp.status = 200
            resp.__aenter__ = AsyncMock(return_value=resp)
            resp.__aexit__ = AsyncMock(return_value=False)
            return resp

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = MagicMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = capture_post
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)
            mock_aiohttp.ClientTimeout = MagicMock(return_value=None)

            await notifier.notify_proposal_reviewed(
                project_name="Argos Interne",
                source_url="https://example.com",
                decision="rejected",
                note="Hors périmètre projet",
                reviewed_by="Alice",
            )

        payload_str = str(sent_payload)
        assert "Hors périmètre projet" in payload_str


# ── TeamsNotifier.notify_calibration_done ────────────────────────────────────

class TestNotifyCalibrationDone:
    @pytest.mark.asyncio
    async def test_posts_subjects_list(self):
        """Calibration finalisée → card avec les noms des sujets créés."""
        notifier = _make_notifier()
        sent_payload = {}

        def capture_post(url, json=None, **kwargs):
            sent_payload.update(json or {})
            resp = MagicMock()
            resp.status = 200
            resp.__aenter__ = AsyncMock(return_value=resp)
            resp.__aexit__ = AsyncMock(return_value=False)
            return resp

        with patch("argos.services.teams_notifier.aiohttp") as mock_aiohttp:
            mock_session = MagicMock()
            mock_session.__aenter__ = AsyncMock(return_value=mock_session)
            mock_session.__aexit__ = AsyncMock(return_value=False)
            mock_session.post = capture_post
            mock_aiohttp.ClientSession = MagicMock(return_value=mock_session)
            mock_aiohttp.ClientTimeout = MagicMock(return_value=None)

            await notifier.notify_calibration_done(
                project_name="Argos Interne",
                subjects=["IA générative", "MLOps", "Cybersécurité"],
                n_sources=5,
            )

        payload_str = str(sent_payload)
        assert "IA générative" in payload_str
        assert "MLOps" in payload_str


# ── Intégration route API invite_member ──────────────────────────────────────

class TestProjectServiceTeamsIntegration:
    @pytest.mark.asyncio
    async def test_notifier_called_when_webhook_set(self):
        """Route invite_member avec webhook configuré → notify_member_invited_teams appelé."""
        from tests.test_projects import _member_row, _project_row
        from argos.services.project_service import ProjectService

        owner_row = _member_row(role="owner", status="active")
        new_member = _member_row(id=2, role="editor", status="pending")
        project_with_webhook = _project_row()
        # Injecter un webhook_url dans le projet retourné par get_project
        project_dict = {
            "id": 1, "name": "Argos Interne", "slug": "argos-interne",
            "description": None, "cdc_content": None, "cdc_analysis": None,
            "knowledge_profile": None, "teams_webhook_url": "https://teams.example.com/hook",
            "owner_id": 10, "is_active": True,
            "created_at": "2026-08-13T00:00:00", "updated_at": "2026-08-13T00:00:00",
        }

        mock_svc = MagicMock()
        mock_svc.add_member.return_value = {"id": 2, "role": "editor", "status": "pending"}
        mock_svc.get_project.return_value = project_dict

        mock_notifier = AsyncMock()

        with patch("argos.api.projects._svc", return_value=mock_svc), \
             patch("argos.api.projects.notify_member_invited_teams", mock_notifier):

            from argos.api.projects import invite_member
            from pydantic import BaseModel

            class FakeBody:
                email = "alice@example.com"
                role = "editor"
                sujet_access = None

            class FakeUser:
                def __getitem__(self, key):
                    return {"id": 10, "email": "owner@example.com"}[key]
                def get(self, key, default=None):
                    return {"id": 10, "email": "owner@example.com"}.get(key, default)

            await invite_member(project_id=1, body=FakeBody(), current_user=FakeUser())

        mock_notifier.assert_called_once()

    @pytest.mark.asyncio
    async def test_notifier_not_called_when_no_webhook(self):
        """Route invite_member sans webhook → notify_member_invited_teams non appelé."""
        project_no_webhook = {
            "id": 1, "name": "Argos", "slug": "argos",
            "description": None, "cdc_content": None, "cdc_analysis": None,
            "knowledge_profile": None, "teams_webhook_url": None,
            "owner_id": 10, "is_active": True,
            "created_at": "2026-08-13T00:00:00", "updated_at": "2026-08-13T00:00:00",
        }

        mock_svc = MagicMock()
        mock_svc.add_member.return_value = {"id": 2, "role": "reader", "status": "pending"}
        mock_svc.get_project.return_value = project_no_webhook

        mock_notifier = AsyncMock()

        with patch("argos.api.projects._svc", return_value=mock_svc), \
             patch("argos.api.projects.notify_member_invited_teams", mock_notifier):

            from argos.api.projects import invite_member

            class FakeBody:
                email = "bob@example.com"
                role = "reader"
                sujet_access = None

            class FakeUser:
                def __getitem__(self, key):
                    return {"id": 10, "email": "owner@example.com"}[key]
                def get(self, key, default=None):
                    return {"id": 10, "email": "owner@example.com"}.get(key, default)

            await invite_member(project_id=1, body=FakeBody(), current_user=FakeUser())

        mock_notifier.assert_not_called()


# ── Intégration route review_proposal_route ──────────────────────────────────

class TestReviewProposalTeamsIntegration:
    @pytest.mark.asyncio
    async def test_notifier_called_on_review_with_webhook(self):
        """review_proposal_route avec webhook → notify_proposal_reviewed_teams appelé."""
        project_with_webhook = {
            "id": 1, "name": "Argos Interne", "slug": "argos-interne",
            "description": None, "cdc_content": None, "cdc_analysis": None,
            "knowledge_profile": None, "teams_webhook_url": "https://teams.example.com/hook",
            "owner_id": 10, "is_active": True,
            "created_at": "2026-08-13T00:00:00", "updated_at": "2026-08-13T00:00:00",
        }
        proposal_result = {
            "id": 5, "project_id": 1, "sujet_id": None,
            "url": "https://openai.com/blog", "source_type": "website",
            "name": "OpenAI Blog", "description": None, "proposed_by": 20,
            "status": "approved", "reviewed_by": 10, "review_note": None,
            "proposed_at": "2026-08-13T00:00:00", "reviewed_at": "2026-08-13T00:00:00",
        }

        mock_svc = MagicMock()
        mock_svc.get_project.return_value = project_with_webhook
        mock_proposal_svc = MagicMock()
        mock_proposal_svc.review_proposal.return_value = proposal_result
        mock_notifier = AsyncMock()

        with patch("argos.api.projects._svc", return_value=mock_svc), \
             patch("argos.api.projects._proposal_svc", return_value=mock_proposal_svc), \
             patch("argos.api.projects.notify_proposal_reviewed_teams", mock_notifier):

            from argos.api.projects import review_proposal_route

            class FakeBody:
                decision = "approved"
                note = None

            class FakeUser:
                def __getitem__(self, key):
                    return {"id": 10, "email": "owner@example.com"}[key]
                def get(self, key, default=None):
                    return {"id": 10, "email": "owner@example.com"}.get(key, default)

            await review_proposal_route(
                project_id=1, proposal_id=5,
                body=FakeBody(), current_user=FakeUser(),
            )

        mock_notifier.assert_called_once()

    @pytest.mark.asyncio
    async def test_notifier_not_called_on_review_without_webhook(self):
        """review_proposal_route sans webhook → notify_proposal_reviewed_teams non appelé."""
        project_no_webhook = {
            "id": 1, "name": "Argos", "slug": "argos",
            "description": None, "cdc_content": None, "cdc_analysis": None,
            "knowledge_profile": None, "teams_webhook_url": None,
            "owner_id": 10, "is_active": True,
            "created_at": "2026-08-13T00:00:00", "updated_at": "2026-08-13T00:00:00",
        }
        mock_svc = MagicMock()
        mock_svc.get_project.return_value = project_no_webhook
        mock_proposal_svc = MagicMock()
        mock_proposal_svc.review_proposal.return_value = {"id": 5, "url": "https://x.com", "status": "rejected"}
        mock_notifier = AsyncMock()

        with patch("argos.api.projects._svc", return_value=mock_svc), \
             patch("argos.api.projects._proposal_svc", return_value=mock_proposal_svc), \
             patch("argos.api.projects.notify_proposal_reviewed_teams", mock_notifier):

            from argos.api.projects import review_proposal_route

            class FakeBody:
                decision = "rejected"
                note = "Hors périmètre"

            class FakeUser:
                def __getitem__(self, key): return {"id": 10}[key]
                def get(self, key, default=None): return {"id": 10}.get(key, default)

            await review_proposal_route(
                project_id=1, proposal_id=5,
                body=FakeBody(), current_user=FakeUser(),
            )

        mock_notifier.assert_not_called()


# ── Intégration route finalize_calibration ────────────────────────────────────

class TestFinalizeCalibrationTeamsIntegration:
    @pytest.mark.asyncio
    async def test_notifier_called_on_finalize_with_webhook(self):
        """finalize_calibration avec webhook → notify_calibration_done_teams appelé."""
        project_with_webhook = {
            "id": 1, "name": "Argos Interne", "slug": "argos-interne",
            "description": None, "cdc_content": None, "cdc_analysis": None,
            "knowledge_profile": None, "teams_webhook_url": "https://teams.example.com/hook",
            "owner_id": 10, "is_active": True,
            "created_at": "2026-08-13T00:00:00", "updated_at": "2026-08-13T00:00:00",
        }
        finalize_result = {
            "subjects": [
                {"id": 1, "name": "IA générative", "project_id": 1, "description": ""},
                {"id": 2, "name": "MLOps", "project_id": 1, "description": ""},
            ],
            "knowledge_profile": {"bilan_md": "...", "learning_plan_md": "..."},
            "source_candidates": [{"url": "https://openai.com/blog", "type": "rss", "name": "OpenAI"}],
        }

        mock_agent = MagicMock()
        mock_agent.generate_subjects = AsyncMock(return_value=finalize_result)
        mock_project_svc = MagicMock()
        mock_project_svc.get_project.return_value = project_with_webhook
        mock_notifier = AsyncMock()

        with patch("argos.api.project_calibration._agent", return_value=mock_agent), \
             patch("argos.api.project_calibration.ProjectService", return_value=mock_project_svc), \
             patch("argos.api.project_calibration.notify_calibration_done_teams", mock_notifier):

            from argos.api.project_calibration import finalize_calibration

            class FakeBody:
                project_name = "Argos Interne"
                cdc_analysis = {"subjects": [], "gaps": [], "domains": [], "constraints": []}
                qa_history = []

            class FakeUser:
                def __getitem__(self, key): return {"id": 10}[key]
                def get(self, key, default=None): return {"id": 10}.get(key, default)

            await finalize_calibration(
                project_id=1, body=FakeBody(), current_user=FakeUser(),
            )

        mock_notifier.assert_called_once()
        call_kwargs = mock_notifier.call_args
        assert "IA générative" in str(call_kwargs)
        assert "MLOps" in str(call_kwargs)

    @pytest.mark.asyncio
    async def test_notifier_not_called_on_finalize_without_webhook(self):
        """finalize_calibration sans webhook → notify_calibration_done_teams non appelé."""
        project_no_webhook = {
            "id": 1, "name": "Argos", "slug": "argos",
            "description": None, "cdc_content": None, "cdc_analysis": None,
            "knowledge_profile": None, "teams_webhook_url": None,
            "owner_id": 10, "is_active": True,
            "created_at": "2026-08-13T00:00:00", "updated_at": "2026-08-13T00:00:00",
        }
        mock_agent = MagicMock()
        mock_agent.generate_subjects = AsyncMock(return_value={"subjects": [], "knowledge_profile": {}, "source_candidates": []})
        mock_project_svc = MagicMock()
        mock_project_svc.get_project.return_value = project_no_webhook
        mock_notifier = AsyncMock()

        with patch("argos.api.project_calibration._agent", return_value=mock_agent), \
             patch("argos.api.project_calibration.ProjectService", return_value=mock_project_svc), \
             patch("argos.api.project_calibration.notify_calibration_done_teams", mock_notifier):

            from argos.api.project_calibration import finalize_calibration

            class FakeBody:
                project_name = "Argos"
                cdc_analysis = {"subjects": [], "gaps": [], "domains": [], "constraints": []}
                qa_history = []

            class FakeUser:
                def __getitem__(self, key): return {"id": 10}[key]
                def get(self, key, default=None): return {"id": 10}.get(key, default)

            await finalize_calibration(project_id=1, body=FakeBody(), current_user=FakeUser())

        mock_notifier.assert_not_called()
