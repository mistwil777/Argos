"""
Tests — Pipeline steps

Couvre :
- _step_classify : aucun item pending → retourne liste vide
- _step_classify : item classifié → _step_tag_content appelé
- _step_classify : échec sur un item → item conservé, pipeline continue
- _step_tag_content : aucun item eligible → tag_items_batch non appelé
- _step_tag_content : items eligible → tag_items_batch appelé
- _step_verify_domains : aucun domaine unknown → LLM non appelé
- _step_verify_domains : domaine unknown avec token dans titre → LLM appelé
- _step_verify_domains : domaine déjà dans cache llm → skip
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch


def _make_db(fetchall_return=None, fetchone_return=None):
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchall = MagicMock(return_value=fetchall_return or [])
    cur.fetchone = MagicMock(return_value=fetchone_return)

    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor = MagicMock(return_value=cur)

    db = MagicMock()
    db.get_connection = MagicMock(return_value=conn)
    return db, cur


# ─── _step_classify ───────────────────────────────────────────────────────────

class TestStepClassify:
    @pytest.mark.asyncio
    async def test_no_pending_items_returns_empty(self):
        db, _ = _make_db(fetchall_return=[])

        with patch("argos.services.pipeline._make_llm", return_value=MagicMock()):
            from argos.services.pipeline import _step_classify
            result = await _step_classify("https://example.com", db)

        assert result == []

    @pytest.mark.asyncio
    async def test_classified_item_triggers_tag_content(self):
        db, _ = _make_db(fetchall_return=[(10,)])

        mock_llm = MagicMock()
        mock_classifier = MagicMock()
        mock_classifier.classify_item = AsyncMock(return_value=None)

        with patch("argos.services.pipeline._make_llm", return_value=mock_llm), \
             patch("argos.services.classifier.ClassifierService", return_value=mock_classifier), \
             patch("argos.services.pipeline._step_tag_content", new_callable=AsyncMock) as mock_tag:

            from argos.services.pipeline import _step_classify
            result = await _step_classify("https://example.com", db)

        assert 10 in result
        mock_tag.assert_called_once()

    @pytest.mark.asyncio
    async def test_classify_failure_does_not_stop_pipeline(self):
        db, _ = _make_db(fetchall_return=[(10,), (11,)])

        mock_llm = MagicMock()
        call_count = {"n": 0}

        async def side_effect(item_id):
            call_count["n"] += 1
            if item_id == 10:
                raise Exception("LLM error on item 10")

        mock_classifier = MagicMock()
        mock_classifier.classify_item = AsyncMock(side_effect=side_effect)

        with patch("argos.services.pipeline._make_llm", return_value=mock_llm), \
             patch("argos.services.classifier.ClassifierService", return_value=mock_classifier), \
             patch("argos.services.pipeline._step_tag_content", new_callable=AsyncMock):

            from argos.services.pipeline import _step_classify
            result = await _step_classify("https://example.com", db)

        # Item 10 a échoué, item 11 doit quand même avoir été traité
        assert call_count["n"] == 2
        assert 10 not in result
        assert 11 in result


# ─── _step_tag_content ────────────────────────────────────────────────────────

class TestStepTagContent:
    @pytest.mark.asyncio
    async def test_no_eligible_items_skips_batch(self):
        db, _ = _make_db(fetchall_return=[])

        with patch("argos.services.pipeline._make_llm", return_value=MagicMock()), \
             patch("argos.services.content_tagger.tag_items_batch", new_callable=AsyncMock) as mock_batch:

            from argos.services.pipeline import _step_tag_content
            await _step_tag_content([1, 2, 3], db)

        mock_batch.assert_not_called()

    @pytest.mark.asyncio
    async def test_eligible_items_calls_batch(self):
        db, _ = _make_db(fetchall_return=[(5,), (6,)])

        mock_llm = MagicMock()

        with patch("argos.services.pipeline._make_llm", return_value=mock_llm), \
             patch("argos.services.content_tagger.tag_items_batch",
                   new_callable=AsyncMock,
                   return_value={"tagged": 2, "skipped": 0, "failed": 0}) as mock_batch:

            from argos.services.pipeline import _step_tag_content
            await _step_tag_content([5, 6], db)

        mock_batch.assert_called_once()
        called_ids = mock_batch.call_args[0][0]
        assert 5 in called_ids
        assert 6 in called_ids


# ─── _step_verify_domains ─────────────────────────────────────────────────────

class TestStepVerifyDomains:
    @pytest.mark.asyncio
    async def test_no_unknown_domains_skips_llm(self):
        db, _ = _make_db(fetchall_return=[])

        with patch("argos.services.pipeline._make_llm", return_value=MagicMock()), \
             patch("argos.services.reliability_scorer.verify_domain_with_llm",
                   new_callable=AsyncMock) as mock_llm_verify:

            from argos.services.pipeline import _step_verify_domains
            await _step_verify_domains("https://example.com", db)

        mock_llm_verify.assert_not_called()

    @pytest.mark.asyncio
    async def test_unknown_domain_with_token_in_title_triggers_llm(self):
        # Item avec url mlflow.org, titre contenant "mlflow", domaine pas en cache
        rows = [("https://mlflow.org/news", "MLflow 3.0 new release", ["mlflow", "tracking"])]
        db, _ = _make_db(fetchall_return=rows)

        mock_llm = MagicMock()

        with patch("argos.services.pipeline._make_llm", return_value=mock_llm), \
             patch("argos.services.reliability_scorer._get_cached_reputation", return_value=None), \
             patch("argos.services.reliability_scorer.verify_domain_with_llm",
                   new_callable=AsyncMock, return_value="official") as mock_verify:

            from argos.services.pipeline import _step_verify_domains
            await _step_verify_domains("https://mlflow.org", db)

        mock_verify.assert_called_once()
        args = mock_verify.call_args[0]
        assert "mlflow" in args[0]  # domaine
        assert args[1] == "mlflow"  # token

    @pytest.mark.asyncio
    async def test_cached_llm_domain_is_skipped(self):
        rows = [("https://mlflow.org/news", "MLflow release", ["mlflow"])]
        db, _ = _make_db(fetchall_return=rows)

        mock_llm = MagicMock()
        cached = {"tier": "official", "confidence": 0.95, "verified_by": "llm"}

        with patch("argos.services.pipeline._make_llm", return_value=mock_llm), \
             patch("argos.services.reliability_scorer._get_cached_reputation", return_value=cached), \
             patch("argos.services.reliability_scorer.verify_domain_with_llm",
                   new_callable=AsyncMock) as mock_verify:

            from argos.services.pipeline import _step_verify_domains
            await _step_verify_domains("https://mlflow.org", db)

        mock_verify.assert_not_called()
