"""
Tests unitaires — CollectorService : logique de filtrage pure (sans DB, sans LLM).
"""
import pytest
from unittest.mock import MagicMock, patch
from argos.services.collector import CollectorService


@pytest.fixture
def collector():
    """CollectorService avec DB mockée et config vide."""
    mock_db = MagicMock()
    with patch.object(CollectorService, "_load_config", return_value={"rss_feeds": [], "apis": [], "settings": {}}):
        svc = CollectorService(db_manager=mock_db, config_path="/dev/null")
    return svc


# ── _max_depth_level ──────────────────────────────────────────────────────────

class TestMaxDepthLevel:
    def test_returns_highest_level(self):
        depth = {"ml": "intermédiaire", "dl": "expert", "genai": "avancé"}
        assert CollectorService._max_depth_level(depth) == "expert"

    def test_single_topic(self):
        assert CollectorService._max_depth_level({"ml": "avancé"}) == "avancé"

    def test_empty_dict(self):
        assert CollectorService._max_depth_level({}) is None

    def test_none_values_ignored(self):
        depth = {"ml": None, "dl": "intermédiaire"}
        assert CollectorService._max_depth_level(depth) == "intermédiaire"

    def test_unknown_level_ignored(self):
        depth = {"ml": "inconnu", "dl": "novice"}
        assert CollectorService._max_depth_level(depth) == "novice"

    def test_case_insensitive(self):
        depth = {"ml": "Expert"}
        assert CollectorService._max_depth_level(depth) == "expert"


# ── _passes_depth_filter ──────────────────────────────────────────────────────

class TestPassesDepthFilter:
    def test_introductory_rejected_for_expert(self):
        text = "Introduction à Python pour les débutants"
        assert CollectorService._passes_depth_filter(text, {"ml": "expert"}) is False

    def test_introductory_rejected_for_avance(self):
        text = "Getting started with transformers"
        assert CollectorService._passes_depth_filter(text, {"ml": "avancé"}) is False

    def test_technical_article_passes_for_expert(self):
        text = "LoRA fine-tuning with quantization on LLaMA 3"
        assert CollectorService._passes_depth_filter(text, {"ml": "expert"}) is True

    def test_any_article_passes_for_intermediaire(self):
        text = "Introduction à Python pour les débutants"
        assert CollectorService._passes_depth_filter(text, {"ml": "intermédiaire"}) is True

    def test_any_article_passes_with_empty_depth(self):
        text = "Getting started with neural nets"
        assert CollectorService._passes_depth_filter(text, {}) is True

    def test_what_is_marker_rejected_for_expert(self):
        text = "What is a transformer model?"
        assert CollectorService._passes_depth_filter(text, {"nlp": "expert"}) is False

    def test_mixed_levels_uses_max(self):
        # max level = expert → filtre actif
        text = "Introduction to deep learning"
        depth = {"ml": "novice", "dl": "expert"}
        assert CollectorService._passes_depth_filter(text, depth) is False


# ── _clean_html ───────────────────────────────────────────────────────────────

class TestCleanHtml:
    def test_strips_tags(self, collector):
        assert collector._clean_html("<p>Hello <b>world</b></p>") == "Hello world"

    def test_collapses_whitespace(self, collector):
        assert collector._clean_html("  foo   bar  ") == "foo bar"

    def test_empty_string(self, collector):
        assert collector._clean_html("") == ""

    def test_no_tags(self, collector):
        assert collector._clean_html("plain text") == "plain text"


# ── _extract_summary ──────────────────────────────────────────────────────────

class TestExtractSummary:
    def test_short_content_unchanged(self, collector):
        text = "Short content."
        assert collector._extract_summary(text, max_length=1500) == text

    def test_cuts_at_sentence_boundary(self, collector):
        # _extract_summary slices at max_length then finds the last '.'.
        # The final result may be slightly shorter than max_length (cut before the period).
        text = "First sentence. Second sentence. " + "x" * 200
        result = collector._extract_summary(text, max_length=100)
        assert result.endswith(".")
        # The cut happens at the last '.' found within the first max_length chars
        assert len(result) < len(text)

    def test_appends_ellipsis_when_no_boundary(self, collector):
        # No period in the first max_length chars within last 30%
        text = "a" * 200
        result = collector._extract_summary(text, max_length=100)
        assert result.endswith("...")

    def test_exact_length_unchanged(self, collector):
        text = "a" * 1500
        result = collector._extract_summary(text, max_length=1500)
        assert result == text
