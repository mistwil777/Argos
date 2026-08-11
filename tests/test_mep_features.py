"""
Tests TDD — 3 features MEP :
1. Bilan sauvegardé en DB après generate-summary
2. Agnosticité CalibrationAgent — pas d'exemples IA hardcodés dans generate_output
3. Estimation durée découverte sources
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch


# ─────────────────────────────────────────────────────────────────────────────
# Feature 1 — Bilan sauvegardé en DB
# ─────────────────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_generate_summary_saves_to_db():
    """
    Après generate_summary, summary_md et bilan_title doivent être
    sauvegardés dans knowledge_profile en DB.
    """
    from argos.api import sujets as sujets_module

    mock_db = MagicMock()
    mock_conn = MagicMock()
    mock_cur = MagicMock()
    mock_conn.__enter__ = MagicMock(return_value=mock_conn)
    mock_conn.__exit__ = MagicMock(return_value=False)
    mock_cur.__enter__ = MagicMock(return_value=mock_cur)
    mock_cur.__exit__ = MagicMock(return_value=False)
    mock_conn.cursor.return_value = mock_cur
    mock_cur.fetchone.return_value = ({},)  # knowledge_profile existant vide
    mock_db.get_connection.return_value = mock_conn

    mock_agent = MagicMock()
    mock_agent.generate_summary = AsyncMock(return_value={
        "summary_md": "## Bilan\nContenu du bilan.",
        "bilan_title": "Évaluation LLM",
    })

    with patch.object(sujets_module, "db", mock_db), \
         patch("argos.api.calibration_agent.get_agent", return_value=mock_agent):
        from argos.api.sujets import generate_summary
        result = await generate_summary(
            sujet_id=42,
            data={
                "sujet_name": "Eval_Benchmark",
                "intention_type": "apprendre",
                "previous_qa": [],
                "extra_info": "",
            }
        )

    # Vérifie que summary_md est retourné
    assert result.get("summary_md") == "## Bilan\nContenu du bilan."
    assert result.get("bilan_title") == "Évaluation LLM"

    # Vérifie qu'un UPDATE a été exécuté avec bilan_md dans knowledge_profile
    executed_sql = mock_cur.execute.call_args_list
    update_calls = [c for c in executed_sql if "UPDATE" in str(c)]
    assert len(update_calls) > 0, "Un UPDATE doit être exécuté pour sauvegarder le bilan"

    # Le knowledge_profile passé doit contenir bilan_md
    import json
    for call in update_calls:
        args = call[0]
        if len(args) > 1:
            for arg in args[1]:
                try:
                    parsed = json.loads(arg) if isinstance(arg, str) else arg
                    if isinstance(parsed, dict) and "bilan_md" in parsed:
                        assert parsed["bilan_md"] == "## Bilan\nContenu du bilan."
                        return
                except Exception:
                    pass
    pytest.fail("bilan_md non trouvé dans le knowledge_profile sauvegardé")


# ─────────────────────────────────────────────────────────────────────────────
# Feature 2 — Agnosticité : pas d'exemples IA hardcodés dans generate_output
# ─────────────────────────────────────────────────────────────────────────────

def test_generate_output_prompt_is_agnostic():
    """
    Le prompt de generate_output ne doit pas contenir de listes d'outils
    IA hardcodées (scikit-learn, PyTorch, LangChain, etc.).
    Ces exemples brisent l'agnosticité pour des sujets non-IA.
    """
    import inspect
    from argos.api.calibration_agent import CalibrationAgent

    source = inspect.getsource(CalibrationAgent.generate_output)

    # Ces termes ne doivent pas apparaître comme exemples hardcodés dans le prompt
    forbidden_hardcoded = [
        "scikit-learn", "XGBoost", "LightGBM", "CatBoost",
        "PyTorch", "TensorFlow", "Keras",
        "LangChain", "LangGraph", "AutoGen", "CrewAI",
        "MLflow", "DVC", "Kubeflow",
    ]
    found = [t for t in forbidden_hardcoded if t in source]
    assert not found, (
        f"Le prompt generate_output contient des exemples IA hardcodés : {found}. "
        "Remplacer par des instructions génériques."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Feature 3 — Estimation durée découverte sources
# ─────────────────────────────────────────────────────────────────────────────

def test_discovery_duration_estimate():
    """
    Étant donné N sources candidates, l'estimation de durée doit être calculée
    correctement : entre N*15s et N*30s, exprimée en minutes arrondies.
    """
    from argos.api.sujets import estimate_discovery_duration

    assert estimate_discovery_duration(4) == "1–2 min"
    assert estimate_discovery_duration(9) == "2–4 min"
    assert estimate_discovery_duration(0) == "quelques secondes"
