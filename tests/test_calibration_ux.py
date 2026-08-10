"""
Tests — CalibrationAgent : qualité des questions générées.
1. Pas de rappel d'historique en début de question
2. Une demande directe de recommandation déclenche une réponse, pas une nouvelle question
"""
import pytest
from unittest.mock import MagicMock, AsyncMock, patch
from argos.api.calibration_agent import CalibrationAgent, CalibrationState, TopicState


REPETITION_PREFIXES = [
    "tu as d'abord", "tu as sélectionné", "tu as mentionné",
    "tu as choisi", "comme tu l'as dit", "tu avais",
    "tu répètes", "tu demandes", "tu viens de", "tu questionnes",
    "tu optes", "tu veux", "tu as raison", "tu as exprimé",
    "tu as indiqué", "tu as précisé", "tu as confirmé",
]

RECOMMENDATION_TRIGGERS = [
    "recommande-moi directement",
    "donne-moi tes recommandations",
    "quels sont tes recommandations",
    "fais-moi une recommandation",
    "conseille-moi directement",
]

VALIDATION_TRIGGERS = [
    "je valide", "je valide cette configuration", "c'est bon",
    "ok", "ça me convient", "parfait", "valide", "c'est parfait",
    "go", "oui je valide", "non je valide",
]


@pytest.fixture
def agent():
    with patch("argos.services.llm_provider.create_llm_provider", return_value=MagicMock()):
        a = CalibrationAgent.__new__(CalibrationAgent)
        a._llm = MagicMock()
        return a


def _make_state_ready() -> CalibrationState:
    """State avec angles manquants pour forcer le passage par le LLM décideur."""
    state = CalibrationState()
    state.topics_explicit = [TopicState(name="DeepEval", level_current="novice", level_target="expert", searched=True)]
    state.tools = ["DeepEval"]
    state.actors = ["HuggingFace"]
    state.out_of_scope = []  # vide → missing_angles() retourne un angle manquant
    return state


# ── Test 1 : pas de rappel d'historique ──────────────────────────────────────

@pytest.mark.asyncio
async def test_question_does_not_repeat_history(agent):
    """
    La question générée ne doit pas commencer par un rappel de ce que
    l'utilisateur a dit précédemment ("Tu as d'abord sélectionné…").
    """
    question_text = "Tu as d'abord sélectionné 5 outils sans critères, puis demandé de réduire."

    agent._llm.generate = AsyncMock(return_value=(
        '{"question": {"text": "' + question_text + '", "type": "open", "options": []}}',
        {},
    ))

    state = _make_state_ready()
    with patch.object(agent, "_read_state", new=AsyncMock(return_value=state)):
        result = await agent._decide_next_action(
            sujet_name="Eval_Benchmark",
            intention="apprendre",
            initial_context="je débute en évaluation LLM",
            qa_history=[{"q": "Quels outils ?", "a": "DeepEval et Promptfoo"}] * 10,
            state=state,
        )

    question = result.get("question", {}).get("text", "").lower()
    for prefix in REPETITION_PREFIXES:
        assert not question.startswith(prefix), (
            f"La question commence par un rappel interdit : '{prefix}'"
        )


# ── Test 2 : demande directe → réponse avec recommandation ───────────────────

@pytest.mark.asyncio
async def test_direct_recommendation_request_yields_answer(agent):
    """
    Si la dernière réponse de l'utilisateur contient une demande directe
    de recommandation, la question suivante doit contenir une recommandation
    concrète (un nom d'outil) — pas une nouvelle question ouverte sur la méthode.
    """
    recommendation_response = '{"question": {"text": "Je te recommande DeepEval pour sa simplicité : il couvre les métriques essentielles avec peu de configuration. Veux-tu l\'inclure ?", "type": "multiselect", "options": ["Oui, inclure DeepEval", "Non, autre choix"]}}'

    agent._llm.generate = AsyncMock(return_value=(recommendation_response, {}))

    qa_with_direct_request = [{"q": "Quels outils ?", "a": "DeepEval"}] * 9 + [
        {"q": "Veux-tu que je te recommande ?", "a": "Recommande-moi directement les 2 outils les plus simples"}
    ]

    state = _make_state_ready()
    with patch.object(agent, "_read_state", new=AsyncMock(return_value=state)):
        result = await agent._decide_next_action(
            sujet_name="Eval_Benchmark",
            intention="apprendre",
            initial_context="je débute",
            qa_history=qa_with_direct_request,
            state=state,
        )

    question_text = result.get("question", {}).get("text", "").lower()
    # La réponse doit contenir un nom d'outil concret — signe d'une recommandation
    assert any(tool in question_text for tool in ["deepeval", "promptfoo", "lm-evaluation", "ragas"]), (
        "Une demande directe de recommandation doit produire une réponse avec un outil concret"
    )


# ── Test 3 : validation explicite → done ─────────────────────────────────────

@pytest.mark.asyncio
async def test_explicit_validation_returns_done(agent):
    """
    Si la dernière réponse de l'utilisateur est un signal de validation explicite
    ("je valide", "ok", "c'est bon"…) après qu'une question de confirmation
    a été posée, next_question doit retourner {"done": True}.
    """
    # On n'a pas besoin de mocker le LLM — la détection doit se faire avant
    qa_with_validation = [{"q": "Quels outils ?", "a": "DeepEval"}] * 10 + [
        {"q": "Veux-tu valider cette configuration ?", "a": "je valide cette configuration"}
    ]

    with patch.object(agent, "_read_state", new=AsyncMock(return_value=_make_state_ready())):
        with patch.object(agent, "_decide_next_action", new=AsyncMock()) as mock_decide:
            result = await agent.next_question(
                sujet_name="Eval_Benchmark",
                intention="apprendre",
                initial_context="je débute",
                qa_history=qa_with_validation,
                sujet_id=0,
            )

    assert result.get("done") is True, "Un signal de validation explicite doit retourner done=True"
    mock_decide.assert_not_called()  # ne doit pas passer par le LLM
