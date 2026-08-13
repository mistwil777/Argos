"""
Tests — Content Tagger

Couvre :
- tag_content : classification LLM d'un article (LLM mocké)
- tag_content : contenu trop court → skip sans planter
- tag_content : JSON enveloppé dans du markdown → extrait correctement
- tag_content : catégorie invalide retournée par LLM → None
- tag_content : LLM en échec → None sans exception
- tag_items_batch : stats tagged/skipped/failed
- tag_items_batch : liste vide → 0 partout
"""

import json
import pytest
from unittest.mock import MagicMock, AsyncMock

from argos.services.content_tagger import tag_content, tag_items_batch

LONG_CONTENT = "This is a detailed technical article. " * 30  # > 100 chars


def _make_db(fetchone_return=None):
    """Construit un mock DB minimal compatible avec le context manager."""
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone = MagicMock(return_value=fetchone_return)

    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor = MagicMock(return_value=cur)

    db = MagicMock()
    db.get_connection = MagicMock(return_value=conn)
    return db, cur


def _make_llm(response: str):
    llm = MagicMock()
    llm.generate = AsyncMock(return_value=(response, {}))
    return llm


# ─── tag_content ──────────────────────────────────────────────────────────────

class TestTagContent:
    @pytest.mark.asyncio
    async def test_veille_classification(self):
        payload = json.dumps({
            "category": "veille",
            "passages": [{"text": "MLflow 3.0 released today.", "category": "veille"}]
        })
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=1, content=LONG_CONTENT, sujet_name="MLOps",
            keywords=["mlflow", "tracking"], level="intermédiaire",
            bilan_md="", learning_plan_md="", llm_provider=llm, db=db,
        )

        assert result is not None
        assert result["category"] == "veille"
        assert len(result["passages"]) == 1

    @pytest.mark.asyncio
    async def test_apprentissage_classification(self):
        payload = json.dumps({
            "category": "apprentissage",
            "passages": [{"text": "Gradient descent minimizes the loss function.", "category": "apprentissage"}]
        })
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=2, content=LONG_CONTENT, sujet_name="ML Classique",
            keywords=["gradient", "loss"], level="débutant",
            bilan_md="", learning_plan_md="", llm_provider=llm, db=db,
        )

        assert result["category"] == "apprentissage"

    @pytest.mark.asyncio
    async def test_mixed_classification(self):
        payload = json.dumps({
            "category": "mixed",
            "passages": [
                {"text": "New version announced.", "category": "veille"},
                {"text": "Here is how attention works.", "category": "apprentissage"},
            ]
        })
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=3, content=LONG_CONTENT, sujet_name="LLMs",
            keywords=["attention", "transformer"], level="avancé",
            bilan_md="User knows transformers.", learning_plan_md="Focus on RAG.",
            llm_provider=llm, db=db,
        )

        assert result["category"] == "mixed"
        assert len(result["passages"]) == 2

    @pytest.mark.asyncio
    async def test_short_content_returns_none(self):
        db, _ = _make_db()
        llm = _make_llm("{}")

        result = await tag_content(
            item_id=4, content="Too short.", sujet_name="MLOps",
            keywords=[], level="", bilan_md="", learning_plan_md="",
            llm_provider=llm, db=db,
        )

        assert result is None
        llm.generate.assert_not_called()

    @pytest.mark.asyncio
    async def test_empty_bilan_does_not_crash(self):
        payload = json.dumps({"category": "veille", "passages": []})
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=5, content=LONG_CONTENT, sujet_name="MLOps",
            keywords=[], level="", bilan_md="", learning_plan_md="",
            llm_provider=llm, db=db,
        )

        assert result is not None
        assert result["category"] == "veille"

    @pytest.mark.asyncio
    async def test_markdown_wrapped_json_extracted(self):
        payload = '```json\n{"category": "veille", "passages": []}\n```'
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=6, content=LONG_CONTENT, sujet_name="MLOps",
            keywords=[], level="", bilan_md="", learning_plan_md="",
            llm_provider=llm, db=db,
        )

        assert result is not None
        assert result["category"] == "veille"

    @pytest.mark.asyncio
    async def test_invalid_category_returns_none(self):
        payload = json.dumps({"category": "unknown_value", "passages": []})
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=7, content=LONG_CONTENT, sujet_name="MLOps",
            keywords=[], level="", bilan_md="", learning_plan_md="",
            llm_provider=llm, db=db,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_llm_failure_returns_none(self):
        db, _ = _make_db()
        llm = MagicMock()
        llm.generate = AsyncMock(side_effect=Exception("LLM unavailable"))

        result = await tag_content(
            item_id=8, content=LONG_CONTENT, sujet_name="MLOps",
            keywords=[], level="", bilan_md="", learning_plan_md="",
            llm_provider=llm, db=db,
        )

        assert result is None

    @pytest.mark.asyncio
    async def test_missing_passages_key_defaults_to_empty_list(self):
        payload = json.dumps({"category": "veille"})
        db, _ = _make_db()
        llm = _make_llm(payload)

        result = await tag_content(
            item_id=9, content=LONG_CONTENT, sujet_name="MLOps",
            keywords=[], level="", bilan_md="", learning_plan_md="",
            llm_provider=llm, db=db,
        )

        assert result is not None
        assert result["passages"] == []


# ─── tag_items_batch ──────────────────────────────────────────────────────────

class TestTagItemsBatch:
    @pytest.mark.asyncio
    async def test_empty_list_returns_zeros(self):
        db, _ = _make_db()
        llm = _make_llm("{}")

        stats = await tag_items_batch([], db, llm)
        assert stats == {"tagged": 0, "skipped": 0, "failed": 0}

    @pytest.mark.asyncio
    async def test_item_without_content_is_skipped(self):
        # fetchone retourne content=None
        db, _ = _make_db(fetchone_return=(None, "MLOps", {}, {}))
        llm = _make_llm("{}")

        stats = await tag_items_batch([42], db, llm)
        assert stats["skipped"] == 1
        assert stats["tagged"] == 0

    @pytest.mark.asyncio
    async def test_unknown_item_id_is_skipped(self):
        db, _ = _make_db(fetchone_return=None)
        llm = _make_llm("{}")

        stats = await tag_items_batch([999], db, llm)
        assert stats["skipped"] == 1

    @pytest.mark.asyncio
    async def test_successful_tag_counted(self):
        payload = json.dumps({"category": "veille", "passages": []})

        db, cur = _make_db(fetchone_return=(LONG_CONTENT, "MLOps", {}, {}))
        llm = _make_llm(payload)

        stats = await tag_items_batch([1], db, llm)
        assert stats["tagged"] == 1
        assert stats["failed"] == 0

    @pytest.mark.asyncio
    async def test_llm_failure_counted_as_failed(self):
        db, cur = _make_db(fetchone_return=(LONG_CONTENT, "MLOps", {}, {}))
        llm = MagicMock()
        llm.generate = AsyncMock(side_effect=Exception("LLM down"))

        stats = await tag_items_batch([1], db, llm)
        assert stats["failed"] == 1

    @pytest.mark.asyncio
    async def test_bilan_and_learning_plan_passed_from_knowledge_profile(self):
        """Vérifie que bilan_md et learning_plan_md sont lus depuis knowledge_profile."""
        payload = json.dumps({"category": "apprentissage", "passages": []})
        kp = {"bilan_md": "User knows basics.", "learning_plan_md": "Phase 2: advanced.", "keywords": ["ml"]}

        db, cur = _make_db(fetchone_return=(LONG_CONTENT, "MLOps", kp, {"current_level": "avancé"}))
        llm = _make_llm(payload)

        stats = await tag_items_batch([1], db, llm)
        assert stats["tagged"] == 1

        # Le prompt LLM doit contenir le bilan
        call_kwargs = llm.generate.call_args
        prompt_sent = call_kwargs[1].get("prompt") or call_kwargs[0][0]
        assert "User knows basics." in prompt_sent
        assert "Phase 2: advanced." in prompt_sent
