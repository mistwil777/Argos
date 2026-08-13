"""
Tests — Reliability Scorer

Couvre :
- _domain_token : extraction du token principal d'un domaine
- _heuristic_tier : logique pure sans DB ni LLM
- score_domain : priorités cache → whitelist → heuristique
- score_item : longueur, signaux commerciaux, score final
- verify_domain_with_llm : LLM mocké
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch

from argos.services.reliability_scorer import (
    _domain_token,
    _heuristic_tier,
    score_domain,
    score_item,
    verify_domain_with_llm,
    ReliabilityResult,
)


# ─── _domain_token ────────────────────────────────────────────────────────────

class TestDomainToken:
    def test_simple_domain(self):
        assert _domain_token("mlflow.org") == "mlflow"

    def test_strips_www(self):
        assert _domain_token("www.pytorch.org") == "pytorch"

    def test_strips_docs_subdomain(self):
        assert _domain_token("docs.ray.io") == "ray"

    def test_strips_blog_subdomain(self):
        assert _domain_token("blog.langchain.dev") == "langchain"

    def test_short_tld_only(self):
        # domaine sans token lisible → retourne le premier segment
        token = _domain_token("io.io")
        assert isinstance(token, str)


# ─── _heuristic_tier ──────────────────────────────────────────────────────────

class TestHeuristicTier:
    def test_gov_tld_is_official(self):
        tier, score, _ = _heuristic_tier("data.gouv.fr")
        assert tier == "official"
        assert score == 1.0

    def test_edu_tld_is_official(self):
        tier, score, _ = _heuristic_tier("mit.edu")
        assert tier == "official"
        assert score == 1.0

    def test_token_in_title_is_official(self):
        tier, score, _ = _heuristic_tier("mlflow.org", title="MLflow 3.0 release notes")
        assert tier == "official"
        assert score == 0.85

    def test_docs_subdomain_with_token_in_title(self):
        tier, score, _ = _heuristic_tier("docs.ray.io", title="Ray distributed computing")
        assert tier == "official"
        assert score == 0.95

    def test_org_without_token_match_is_recognized(self):
        tier, score, _ = _heuristic_tier("someproject.org", title="Unrelated article")
        assert tier == "recognized"
        assert score == 0.7

    def test_unknown_domain_no_match(self):
        tier, score, _ = _heuristic_tier("randomtech.io", title="Unrelated article")
        assert tier == "unknown"
        assert score == 0.4

    def test_rejected_shop_domain(self):
        tier, score, _ = _heuristic_tier("bestdeals.shop")
        assert tier == "rejected"
        assert score == 0.0

    def test_token_in_keywords(self):
        tier, _, _ = _heuristic_tier("wandb.ai", title="Experiment tracking", keywords=["wandb", "mlops"])
        assert tier == "official"

    def test_github_is_recognized(self):
        tier, score, _ = _heuristic_tier("github.com")
        assert tier == "recognized"
        assert score == 0.8


# ─── score_domain ─────────────────────────────────────────────────────────────

class TestScoreDomain:
    def test_whitelist_domain_no_db(self):
        result = score_domain("https://arxiv.org/abs/2310.00001")
        assert result.passed is True
        assert result.score == 1.0
        assert result.domain_tier == "official"

    def test_whitelist_subdomain(self):
        result = score_domain("https://docs.anthropic.com/claude/reference")
        assert result.passed is True
        assert result.domain_tier == "official"

    def test_invalid_url(self):
        result = score_domain("")
        assert result.passed is False
        assert result.domain_tier == "rejected"

    def test_cache_hit_returns_cached_result(self):
        db = MagicMock()
        db.get_connection.return_value.__enter__ = MagicMock(return_value=MagicMock(
            cursor=MagicMock(return_value=MagicMock(
                __enter__=MagicMock(return_value=MagicMock(
                    fetchone=MagicMock(return_value=("official", 0.95, "llm"))
                )),
                __exit__=MagicMock(return_value=False),
            ))
        ))
        db.get_connection.return_value.__exit__ = MagicMock(return_value=False)

        result = score_domain("https://mlflow.org/docs", db=db)
        assert result.passed is True
        assert result.domain_tier == "official"

    def test_cache_rejected_returns_false(self):
        db = MagicMock()
        db.get_connection.return_value.__enter__ = MagicMock(return_value=MagicMock(
            cursor=MagicMock(return_value=MagicMock(
                __enter__=MagicMock(return_value=MagicMock(
                    fetchone=MagicMock(return_value=("rejected", 0.0, "heuristic"))
                )),
                __exit__=MagicMock(return_value=False),
            ))
        ))
        db.get_connection.return_value.__exit__ = MagicMock(return_value=False)

        result = score_domain("https://badsite.shop", db=db)
        assert result.passed is False

    def test_heuristic_fallback_unknown(self):
        result = score_domain("https://unknowndomain12345.io", title="Some random article")
        assert result.domain_tier == "unknown"
        assert result.passed is True  # unknown n'est pas rejeté, juste score bas

    def test_rejected_domain_pattern(self):
        result = score_domain("https://bestdeals.shop/promo")
        assert result.passed is False
        assert result.domain_tier == "rejected"


# ─── score_item ───────────────────────────────────────────────────────────────

class TestScoreItem:
    VALID_TEXT = " ".join(["word"] * 300)  # 300 mots, au-dessus du minimum

    def test_valid_item_passes(self):
        result = score_item(
            url="https://arxiv.org/abs/2310.00001",
            text=self.VALID_TEXT,
            title="A new paper on transformers",
            author="Jane Doe",
            published_date="2024-01-01",
        )
        assert result.passed is True
        assert result.score > 0.5

    def test_short_content_rejected(self):
        result = score_item(
            url="https://arxiv.org/abs/2310.00001",
            text="Too short content.",
        )
        assert result.passed is False
        assert "court" in result.reason

    def test_changelog_url_bypasses_length_check(self):
        result = score_item(
            url="https://github.com/org/repo/releases/tag/v1.0.0",
            text="v1.0.0 released.",
        )
        assert result.passed is True

    def test_hard_commercial_signal_rejected(self):
        result = score_item(
            url="https://arxiv.org/abs/2310.00001",
            text=self.VALID_TEXT + " request a demo for our enterprise plan.",
        )
        assert result.passed is False
        assert "commercial" in result.reason.lower()

    def test_low_github_stars_rejected(self):
        result = score_item(
            url="https://github.com/nobody/toy-project",
            text=self.VALID_TEXT,
            github_stars=10,
        )
        assert result.passed is False

    def test_high_github_stars_pass(self):
        result = score_item(
            url="https://github.com/huggingface/transformers",
            text=self.VALID_TEXT,
            github_stars=5000,
        )
        assert result.passed is True

    def test_author_and_date_increase_score(self):
        base = score_item(url="https://arxiv.org/abs/1", text=self.VALID_TEXT)
        enriched = score_item(
            url="https://arxiv.org/abs/1",
            text=self.VALID_TEXT,
            author="Alice",
            published_date="2024-01-01",
        )
        assert enriched.score >= base.score


# ─── verify_domain_with_llm ───────────────────────────────────────────────────

class TestVerifyDomainWithLLM:
    @pytest.mark.asyncio
    async def test_llm_yes_returns_official(self):
        llm = MagicMock()
        llm.generate = AsyncMock(return_value=("yes", {}))
        db = MagicMock()
        db.get_connection.return_value.__enter__ = MagicMock(return_value=MagicMock(
            cursor=MagicMock(return_value=MagicMock(
                __enter__=MagicMock(return_value=MagicMock()),
                __exit__=MagicMock(return_value=False),
            ))
        ))
        db.get_connection.return_value.__exit__ = MagicMock(return_value=False)

        tier = await verify_domain_with_llm("mlflow.org", "mlflow", llm, db)
        assert tier == "official"

    @pytest.mark.asyncio
    async def test_llm_no_returns_unknown(self):
        llm = MagicMock()
        llm.generate = AsyncMock(return_value=("no", {}))
        db = MagicMock()
        db.get_connection.return_value.__enter__ = MagicMock(return_value=MagicMock(
            cursor=MagicMock(return_value=MagicMock(
                __enter__=MagicMock(return_value=MagicMock()),
                __exit__=MagicMock(return_value=False),
            ))
        ))
        db.get_connection.return_value.__exit__ = MagicMock(return_value=False)

        tier = await verify_domain_with_llm("randomsite.io", "randomsite", llm, db)
        assert tier == "unknown"

    @pytest.mark.asyncio
    async def test_llm_failure_returns_unknown(self):
        llm = MagicMock()
        llm.generate = AsyncMock(side_effect=Exception("LLM unavailable"))
        db = MagicMock()

        tier = await verify_domain_with_llm("somesite.io", "somesite", llm, db)
        assert tier == "unknown"
