"""
Tests — source_discovery : logique de sondage et fallback website.
"""
import pytest
from unittest.mock import patch, MagicMock


# ── Test 1 : HTTP retourne HTML vide (SPA) → Playwright lancé ─────────────────

def test_playwright_called_when_http_returns_spa_html():
    """
    Quand HTTP retourne du HTML sans RSS (cas SPA : mistral.ai, anthropic.com...),
    Playwright doit être lancé pour rendre le JavaScript.
    """
    from argos.tasks.source_discovery import discover_source

    # HTTP retourne un HTML vide de SPA (pas de RSS, pas vide)
    spa_html = "<html><body><div id='root'></div></body></html>"

    with patch("argos.tasks.source_discovery._probe_http", return_value=(None, spa_html)) as mock_http, \
         patch("argos.tasks.source_discovery._probe_playwright", return_value=(None, spa_html)) as mock_pw, \
         patch("argos.tasks.source_discovery._llm_confirm_source", return_value={"valid": True, "reason": "ok", "final_url": "https://mistral.ai/news"}), \
         patch("argos.tasks.source_discovery._save_source", return_value={"status": "found"}), \
         patch("argos.tasks.source_discovery._push_status"):

        discover_source.__wrapped__(
            sujet_id=1,
            candidate={"url": "https://mistral.ai/news", "type": "website", "name": "Mistral AI News"},
            sujet_name="Eval_Benchmark",
        )

    mock_pw.assert_called_once()


# ── Test 2 : HTTP trouve un RSS → Playwright non lancé ───────────────────────

def test_playwright_not_called_when_rss_found_via_http():
    """
    Quand HTTP trouve un flux RSS, Playwright ne doit pas être lancé.
    """
    from argos.tasks.source_discovery import discover_source

    with patch("argos.tasks.source_discovery._probe_http", return_value=("https://blog.eleuther.ai/index.xml", "")), \
         patch("argos.tasks.source_discovery._probe_playwright") as mock_pw, \
         patch("argos.tasks.source_discovery._save_source", return_value={"status": "found"}), \
         patch("argos.tasks.source_discovery._push_status"):

        discover_source.__wrapped__(
            sujet_id=1,
            candidate={"url": "https://blog.eleuther.ai", "type": "rss", "name": "Eleuther AI"},
            sujet_name="Eval_Benchmark",
        )

    mock_pw.assert_not_called()


# ── Test 3 : Playwright trouve un RSS → source enregistrée en rss ─────────────

def test_playwright_finds_rss():
    """
    Quand Playwright trouve un RSS, la source est enregistrée en type rss.
    """
    from argos.tasks.source_discovery import discover_source

    with patch("argos.tasks.source_discovery._probe_http", return_value=(None, "")), \
         patch("argos.tasks.source_discovery._probe_playwright", return_value=("https://example.com/feed.xml", "<html/>")), \
         patch("argos.tasks.source_discovery._save_source", return_value={"status": "found"}) as mock_save, \
         patch("argos.tasks.source_discovery._push_status"):

        discover_source.__wrapped__(
            sujet_id=1,
            candidate={"url": "https://example.com/news", "type": "website", "name": "Example"},
            sujet_name="Test",
        )

    mock_save.assert_called_once()
    assert mock_save.call_args[0][3] == "rss"
