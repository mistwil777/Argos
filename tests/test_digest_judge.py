"""
Tests LLM-as-judge — évaluation qualité des digests.

Tests rapides (mock) : vérification du flux sans appel LLM réel.
Tests slow (marqués slow) : nécessitent ANTHROPIC_API_KEY et DB.
"""
import json
import sys
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

# Stub anthropic si non installé localement (tests dans CI ou dev local sans venv Docker)
if "anthropic" not in sys.modules:
    _anthropic_stub = MagicMock()
    sys.modules["anthropic"] = _anthropic_stub


SAMPLE_ARTICLE = """
Les grands modèles de langage (LLM) comme GPT-4 et Claude montrent des capacités
émergentes impressionnantes en raisonnement et génération de code.
Des études récentes montrent que le fine-tuning sur des données synthétiques
peut significativement améliorer leurs performances sur des tâches spécifiques.
Les architectures transformer restent dominantes malgré l'émergence d'alternatives
basées sur des SSM (State Space Models) comme Mamba.
"""

SAMPLE_DIGEST = """
## Résumé
Les LLM modernes démontrent des capacités émergentes en raisonnement. Le fine-tuning
sur données synthétiques améliore les performances sur tâches spécifiques.

## Points clés
- GPT-4 et Claude montrent des capacités de raisonnement avancées
- Fine-tuning sur données synthétiques efficace
- Architectures transformer toujours dominantes

## Pourquoi c'est important
Pertinent pour les équipes IA cherchant à optimiser leurs modèles sans données réelles massives.
"""


def _make_fake_response(scores: dict) -> MagicMock:
    content = MagicMock()
    content.text = json.dumps(scores)
    usage = MagicMock()
    usage.input_tokens = 100
    usage.output_tokens = 50
    resp = MagicMock()
    resp.content = [content]
    resp.usage = usage
    return resp


def _make_mock_db():
    mock_db = MagicMock()
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.__enter__ = lambda s: mock_conn
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_cur.__enter__ = lambda s: mock_cur
    mock_cur.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cur
    mock_db.get_connection.return_value = mock_conn
    return mock_db, mock_cur


def _make_mock_llm(response_text: str):
    mock_llm = AsyncMock()
    mock_llm.generate = AsyncMock(return_value=(
        response_text,
        {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
    ))
    return mock_llm


@pytest.mark.asyncio
async def test_judge_digest_mock():
    """Vérifie que judge_digest insère bien dans digest_scores (sans LLM réel)."""
    mock_db, mock_cur = _make_mock_db()
    scores_json = json.dumps({
        "score_fidelity": 4, "score_completeness": 4,
        "score_relevance": 3, "score_concision": 5,
        "rationale": "Digest fidèle et concis."
    })
    mock_llm = _make_mock_llm(scores_json)

    with patch("argos.services.digest_judge.create_llm_provider", return_value=mock_llm):
        from argos.services.digest_judge import judge_digest
        result = await judge_digest(
            article_content=SAMPLE_ARTICLE,
            digest_markdown=SAMPLE_DIGEST,
            context_profile="Équipe IA avionique",
            item_id=42,
            workspace_id=1,
            db=mock_db,
        )

    assert result is not None
    assert 3.0 <= result["global"] <= 5.0
    assert 1 <= result["fidelity"] <= 5

    insert_calls = [str(c) for c in mock_cur.execute.call_args_list]
    assert any("digest_scores" in c for c in insert_calls), \
        "INSERT dans digest_scores non appelé"
    assert any("llm_usage" in c for c in insert_calls), \
        "INSERT dans llm_usage non appelé"


@pytest.mark.asyncio
async def test_judge_digest_malformed_json():
    """Si le modèle retourne du JSON invalide, retourne None sans planter."""
    mock_db, _ = _make_mock_db()
    mock_llm = _make_mock_llm("Voici ma réponse en français sans JSON.")

    with patch("argos.services.digest_judge.create_llm_provider", return_value=mock_llm):
        from argos.services.digest_judge import judge_digest
        result = await judge_digest(
            article_content=SAMPLE_ARTICLE,
            digest_markdown=SAMPLE_DIGEST,
            context_profile="",
            item_id=1,
            workspace_id=None,
            db=mock_db,
        )

    assert result is None


@pytest.mark.slow
@pytest.mark.asyncio
async def test_judge_real_llm_quality():
    """
    Test d'évaluation réel — nécessite ANTHROPIC_API_KEY et DB.
    Vérifie score global >= 3.0 pour un digest de qualité raisonnable.
    """
    import os
    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY non configurée")

    from argos.database import DatabaseManager
    from argos.config import settings as app_settings
    from argos.services.digest_judge import judge_digest

    db = DatabaseManager(app_settings.database_url)
    result = await judge_digest(
        article_content=SAMPLE_ARTICLE,
        digest_markdown=SAMPLE_DIGEST,
        context_profile="Équipe IA cherchant à améliorer leurs modèles",
        item_id=1,
        workspace_id=None,
        db=db,
    )

    assert result is not None, "Le judge n'a pas retourné de résultat"
    assert result["global"] >= 3.0, \
        f"Score global trop faible ({result['global']}) pour un digest de qualité raisonnable"
    assert 1 <= result["fidelity"] <= 5
    assert 1 <= result["completeness"] <= 5
