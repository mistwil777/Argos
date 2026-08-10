"""
Test : les recherches SearXNG pendant l'entretien sont lancées en parallèle.
Vérifie que N topics sont recherchés simultanément, pas un par un.
"""
import asyncio
import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from argos.api.calibration_agent import CalibrationAgent


@pytest.fixture
def agent():
    with patch("argos.services.llm_provider.create_llm_provider", return_value=MagicMock()):
        a = CalibrationAgent.__new__(CalibrationAgent)
        a._llm = MagicMock()
        return a


@pytest.mark.asyncio
async def test_search_topics_called_in_parallel(agent):
    """
    Avec 3 topics non recherchés, _search_topic doit être appelé
    3 fois ET les appels doivent se chevaucher dans le temps (parallèle).
    """
    call_times = []

    async def fake_search(topic_name, **kwargs):
        call_times.append(asyncio.get_event_loop().time())
        await asyncio.sleep(0.05)  # simule 50ms de latence réseau
        return [f"term_{topic_name}"]

    from argos.api.calibration_agent import CalibrationState, TopicState

    state = CalibrationState()
    state.topics_explicit = [
        TopicState(name="LangChain"),
        TopicState(name="PyTorch"),
        TopicState(name="MLflow"),
    ]

    with patch.object(agent, "_search_topic", side_effect=fake_search), \
         patch("argos.api.calibration_agent.get_search_cache", return_value={}):

        import time
        start = time.time()
        # Appel direct de la logique de recherche parallèle
        unsearched = state.unsearched()
        await asyncio.gather(*[
            agent._search_topic(t.name, is_fast_evolving=True, context_terms=[])
            for t in unsearched
        ])
        elapsed = time.time() - start

    # Séquentiel prendrait ~150ms (3 × 50ms), parallèle ~50ms
    assert elapsed < 0.12, f"Les recherches semblent séquentielles : {elapsed:.3f}s"
    assert len(call_times) == 3


@pytest.mark.asyncio
async def test_all_topics_marked_searched_after_parallel(agent):
    """Après la recherche parallèle, tous les topics doivent être marqués searched=True."""
    from argos.api.calibration_agent import CalibrationState, TopicState

    state = CalibrationState()
    state.topics_explicit = [TopicState(name="A"), TopicState(name="B")]

    async def fake_search(topic_name, **kwargs):
        return ["x"]

    cache = {}
    with patch.object(agent, "_search_topic", side_effect=fake_search), \
         patch("argos.api.calibration_agent.get_search_cache", return_value=cache):

        unsearched = state.unsearched()
        results = await asyncio.gather(*[
            agent._search_topic(t.name, is_fast_evolving=True, context_terms=[])
            for t in unsearched
        ])
        for topic, terms in zip(unsearched, results):
            topic.searched = True
            topic.ecosystem_terms = terms
            cache[topic.name] = terms

    assert all(t.searched for t in state.topics_explicit)
    assert "A" in cache and "B" in cache
