"""
Tests — API REST (routes HTTP)

Couvre :
- GET /items : content_tags présent dans la réponse
- POST /items/{id}/translate : sans langue → 400
- POST /items/{id}/translate : item inexistant → 404
- POST /items/{id}/translate : langue fournie + LLM mocké → texte traduit
- POST /admin/tag-content : sans token → 403
- GET /briefing/today : pas de briefing → exists=False
- GET /briefing/today : briefing sans top_items → top_items vide
"""

import json
import sys
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from fastapi.testclient import TestClient

# mcp n'est pas installé localement — mock avant tout import argos.server
sys.modules.setdefault("mcp", MagicMock())
sys.modules.setdefault("mcp.server", MagicMock())
sys.modules.setdefault("mcp.server.fastmcp", MagicMock())


def _make_db_with_row(row):
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone = MagicMock(return_value=row)
    cur.fetchall = MagicMock(return_value=[])
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor = MagicMock(return_value=cur)
    db = MagicMock()
    db.get_connection = MagicMock(return_value=conn)
    return db


@pytest.fixture
def client():
    """Client HTTP de test avec DB et LLM mockés."""
    from argos.server import app
    from argos.api import router as router_module

    mock_db = _make_db_with_row(None)

    with patch.object(router_module, "db", mock_db), \
         TestClient(app, raise_server_exceptions=False) as c:
        yield c, mock_db


# ─── POST /items/{id}/translate ───────────────────────────────────────────────

class TestTranslateRoute:
    def test_missing_language_returns_400(self, client):
        c, _ = client
        resp = c.post("/api/v1/items/1/translate", json={})
        assert resp.status_code == 400
        assert "language" in resp.json().get("detail", "").lower()

    def test_unknown_item_returns_404(self, client):
        c, mock_db = client
        # fetchone retourne None → item introuvable
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = None

        resp = c.post("/api/v1/items/9999/translate", json={"language": "French"})
        assert resp.status_code == 404

    def test_item_with_no_content_returns_422(self, client):
        c, mock_db = client
        # title, cleaned_content=None, summary=None
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = (
            "Some title", None, None
        )
        resp = c.post("/api/v1/items/1/translate", json={"language": "French"})
        assert resp.status_code == 422

    def test_valid_translation_returns_text(self, client):
        c, mock_db = client
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = (
            "MLflow release", "MLflow 3.0 is a major release with new features.", None
        )

        mock_llm = MagicMock()
        mock_llm.generate = AsyncMock(return_value=("MLflow 3.0 est une version majeure.", {}))

        from argos.api import router as router_module
        with patch.object(router_module, "create_llm_provider", return_value=mock_llm):
            resp = c.post("/api/v1/items/1/translate", json={"language": "French"})

        assert resp.status_code == 200
        data = resp.json()
        assert "translated" in data
        assert data["language"] == "French"


# ─── POST /admin/tag-content ──────────────────────────────────────────────────

class TestAdminTagContent:
    def test_no_token_returns_403(self, client):
        c, _ = client
        from argos.config import settings
        with patch.object(settings, "admin_token", "secret123"):
            resp = c.post("/api/v1/admin/tag-content", json={})
        assert resp.status_code == 403

    def test_wrong_token_returns_403(self, client):
        c, _ = client
        from argos.config import settings
        with patch.object(settings, "admin_token", "secret123"):
            resp = c.post(
                "/api/v1/admin/tag-content",
                json={},
                headers={"X-Admin-Token": "wrongtoken"},
            )
        assert resp.status_code == 403

    def test_no_items_to_tag_returns_zero(self, client):
        c, mock_db = client
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchall.return_value = []

        from argos.config import settings
        with patch.object(settings, "admin_token", "secret123"):
            resp = c.post(
                "/api/v1/admin/tag-content",
                json={},
                headers={"X-Admin-Token": "secret123"},
            )

        assert resp.status_code == 200
        assert resp.json()["tagged"] == 0


# ─── GET /briefing/today ──────────────────────────────────────────────────────

class TestBriefingToday:
    def test_no_briefing_returns_exists_false(self, client):
        c, mock_db = client
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = None

        resp = c.get("/api/v1/briefing/today")
        assert resp.status_code == 200
        data = resp.json()
        assert data["exists"] is False

    def test_briefing_with_empty_top_items(self, client):
        c, mock_db = client
        import datetime
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = (
            1, datetime.date.today(), "Executive summary", [],
            [], {}, 1000, 0.01, None, [], {}
        )

        resp = c.get("/api/v1/briefing/today")
        assert resp.status_code == 200
        data = resp.json()
        assert data["exists"] is True
        assert data["top_items"] == []

    def test_briefing_top_items_with_content_tags(self, client):
        c, mock_db = client
        import datetime
        top_items = [
            {"id": 1, "title": "MLflow release", "content_tags": {"category": "veille", "passages": []}}
        ]
        mock_db.get_connection.return_value.__enter__.return_value.cursor.return_value.__enter__.return_value.fetchone.return_value = (
            1, datetime.date.today(), "Executive summary", top_items,
            [], {}, 1000, 0.01, None, [], {}
        )

        resp = c.get("/api/v1/briefing/today")
        assert resp.status_code == 200
        data = resp.json()
        assert data["top_items"][0]["content_tags"]["category"] == "veille"
