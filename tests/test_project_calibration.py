"""
Tests — ProjectCalibrationAgent (Phase 2)

Couvre :
- CdcAnalyzer.analyze_cdc : texte CDC → sujets, sous-sujets, domaines, lacunes
- CdcAnalyzer.analyze_cdc : CDC vide → ValueError
- CdcAnalyzer.analyze_cdc : résultat stocké dans projects.cdc_analysis
- ProjectCalibrationAgent.next_question : premier appel sans historique → question libre
- ProjectCalibrationAgent.next_question : avec historique → décision LLM
- ProjectCalibrationAgent.next_question : signal de validation → done=True
- ProjectCalibrationAgent.generate_subjects : arborescence créée dans workspaces
- ProjectCalibrationAgent.generate_subjects : retourne liste des sujets créés
- ProjectCalibrationAgent.generate_subjects : knowledge_profile sauvegardé
- ProjectCalibrationAgent.generate_subjects : sources suggérées retournées
- Routes API : POST /projects/{id}/calibration/analyze → 200 + cdc_analysis
- Routes API : POST /projects/{id}/calibration/analyze → 403 si non-owner
- Routes API : POST /projects/{id}/calibration/question → 200 + question
- Routes API : POST /projects/{id}/calibration/finalize → 201 + sujets créés
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, MagicMock, patch


# ── helpers ───────────────────────────────────────────────────────────────────

def _make_db(rows=None):
    cur = MagicMock()
    cur.__enter__ = MagicMock(return_value=cur)
    cur.__exit__ = MagicMock(return_value=False)
    cur.fetchone = MagicMock(return_value=rows[0] if rows else None)
    cur.fetchall = MagicMock(return_value=rows if rows else [])
    conn = MagicMock()
    conn.__enter__ = MagicMock(return_value=conn)
    conn.__exit__ = MagicMock(return_value=False)
    conn.cursor = MagicMock(return_value=cur)
    db = MagicMock()
    db.get_connection = MagicMock(return_value=conn)
    return db


def _project_row(id=1, name="Projet Alpha", owner_id=10, cdc_content=None, cdc_analysis=None):
    return (id, name, "projet-alpha", "Description", cdc_content, cdc_analysis,
            None, None, owner_id, True, "2026-08-13T00:00:00", "2026-08-13T00:00:00")


def _member_row(id=1, project_id=1, user_id=10, role="owner", status="active"):
    return (id, project_id, user_id, None, role, None, status, None,
            "2026-08-13T00:00:00", None)


def _workspace_row(id=101, name="IA générative", project_id=1):
    return (id, name, project_id)


def _make_agent_with_llm(llm_response: str):
    """Crée un ProjectCalibrationAgent avec un LLM mocké qui retourne llm_response."""
    from argos.services.project_calibration_agent import ProjectCalibrationAgent
    agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
    mock_llm = MagicMock()
    mock_llm.generate = AsyncMock(return_value=(llm_response, {}))
    agent._llm = mock_llm
    return agent


# ── CdcAnalyzer ───────────────────────────────────────────────────────────────

class TestCdcAnalyze:
    @pytest.mark.asyncio
    async def test_analyze_returns_structured_result(self):
        """CDC textuel → résultat structuré avec sujets et lacunes."""
        import json
        from argos.services.project_calibration_agent import CdcAnalyzer

        llm_output = json.dumps({
            "subjects": [
                {"name": "IA générative", "sub_subjects": ["LLM", "RAG"], "priority": "high"},
                {"name": "MLOps", "sub_subjects": ["CI/CD modèles"], "priority": "medium"},
            ],
            "domains": ["GenAI", "infrastructure IA"],
            "gaps": ["niveaux non précisés", "périmètre applicatif flou"],
            "constraints": ["budget limité", "équipe de 4 personnes"],
            "suggested_sources": ["https://openai.com/blog", "https://huggingface.co/blog"],
        })

        analyzer = CdcAnalyzer.__new__(CdcAnalyzer)
        analyzer._llm = MagicMock()
        analyzer._llm.generate = AsyncMock(return_value=(llm_output, {}))

        cdc_text = "Nous développons un assistant IA pour notre DSI..."
        result = await analyzer.analyze_cdc(cdc_text)

        assert "subjects" in result
        assert len(result["subjects"]) == 2
        assert result["subjects"][0]["name"] == "IA générative"
        assert "gaps" in result
        assert len(result["gaps"]) > 0

    @pytest.mark.asyncio
    async def test_analyze_empty_cdc_raises(self):
        """CDC vide → ValueError."""
        from argos.services.project_calibration_agent import CdcAnalyzer

        analyzer = CdcAnalyzer.__new__(CdcAnalyzer)
        analyzer._llm = MagicMock()

        with pytest.raises(ValueError, match="CDC"):
            await analyzer.analyze_cdc("")

    @pytest.mark.asyncio
    async def test_analyze_cdc_too_short_raises(self):
        """CDC trop court (<50 caractères) → ValueError."""
        from argos.services.project_calibration_agent import CdcAnalyzer

        analyzer = CdcAnalyzer.__new__(CdcAnalyzer)
        analyzer._llm = MagicMock()

        with pytest.raises(ValueError, match="CDC"):
            await analyzer.analyze_cdc("trop court")

    @pytest.mark.asyncio
    async def test_analyze_saves_to_project(self):
        """Résultat analyse sauvegardé dans projects.cdc_analysis via DB."""
        import json
        from argos.services.project_calibration_agent import CdcAnalyzer

        llm_output = json.dumps({
            "subjects": [{"name": "IA", "sub_subjects": [], "priority": "high"}],
            "domains": ["IA"],
            "gaps": [],
            "constraints": [],
            "suggested_sources": [],
        })

        # DB : owner check (member row) + project row + update
        member = _member_row(role="owner", status="active")
        project = _project_row()
        updated = _project_row(cdc_analysis=llm_output)

        db = _make_db(rows=[member, project, updated])

        # fetchone appelé plusieurs fois — séquencer les retours
        db.get_connection().__enter__().cursor().__enter__().fetchone.side_effect = [
            member, project, updated,
        ]

        analyzer = CdcAnalyzer.__new__(CdcAnalyzer)
        analyzer._llm = MagicMock()
        analyzer._llm.generate = AsyncMock(return_value=(llm_output, {}))
        analyzer._db = db

        cdc_text = "Nous développons un assistant IA pour accompagner nos collaborateurs."
        result = await analyzer.analyze_and_save(
            project_id=1, user_id=10, cdc_text=cdc_text
        )

        assert result["subjects"][0]["name"] == "IA"
        # La requête UPDATE a bien été lancée
        cur = db.get_connection().__enter__().cursor().__enter__()
        assert any("UPDATE" in str(c) for c in cur.execute.call_args_list)


# ── ProjectCalibrationAgent.next_question ────────────────────────────────────

class TestProjectCalibrationNextQuestion:
    @pytest.mark.asyncio
    async def test_first_question_no_history(self):
        """Sans historique : question libre sur le contexte projet."""
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
        agent._llm = MagicMock()

        result = await agent.next_question(
            project_name="Argos Interne",
            cdc_analysis={
                "subjects": [{"name": "IA générative", "sub_subjects": [], "priority": "high"}],
                "gaps": ["niveaux non précisés"],
                "domains": [],
                "constraints": [],
            },
            qa_history=[],
        )

        assert "question" in result
        assert result["question"]["type"] in ("open", "multiselect", "level_pair")

    @pytest.mark.asyncio
    async def test_with_history_returns_question(self):
        """Avec historique → question générée par LLM."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        llm_output = json.dumps({"question": {"text": "Quels outils utilisez-vous ?", "type": "open", "options": []}})
        agent = _make_agent_with_llm(llm_output)

        result = await agent.next_question(
            project_name="Argos Interne",
            cdc_analysis={
                "subjects": [{"name": "IA", "sub_subjects": [], "priority": "high"}],
                "gaps": ["périmètre flou"],
                "domains": [],
                "constraints": [],
            },
            qa_history=[{"q": "Décris ton contexte", "a": "On fait du RAG avec LangChain."}],
        )

        assert "question" in result
        assert result["question"]["text"]

    @pytest.mark.asyncio
    async def test_validation_signal_returns_done(self):
        """Signal de validation dans la dernière réponse → done=True."""
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
        agent._llm = MagicMock()

        qa_history = [
            {"q": "Comment puis-je confirmer la configuration ?", "a": "je valide"},
        ]

        result = await agent.next_question(
            project_name="Argos Interne",
            cdc_analysis={"subjects": [], "gaps": [], "domains": [], "constraints": []},
            qa_history=qa_history,
        )

        assert result.get("done") is True

    @pytest.mark.asyncio
    async def test_min_questions_before_done(self):
        """Moins de 5 questions → ne peut pas finaliser même si LLM le veut."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        # LLM répond "finalize" mais on a seulement 2 questions
        llm_output = json.dumps({"action": "finalize"})
        agent = _make_agent_with_llm(llm_output)

        qa_history = [
            {"q": "Q1", "a": "A1"},
            {"q": "Q2", "a": "A2"},
        ]

        result = await agent.next_question(
            project_name="Argos Interne",
            cdc_analysis={"subjects": [{"name": "IA", "sub_subjects": [], "priority": "high"}],
                          "gaps": ["lacune 1"], "domains": [], "constraints": []},
            qa_history=qa_history,
        )

        # Trop peu de questions : doit continuer à demander, pas finaliser
        assert "question" in result or result.get("done") is False

    @pytest.mark.asyncio
    async def test_llm_can_return_done_after_min_questions(self):
        """Après MIN_QUESTIONS, le LLM peut retourner done=True quand toutes les lacunes sont couvertes."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent, MIN_QUESTIONS

        llm_output = json.dumps({"done": True, "reason": "Toutes les lacunes sont couvertes."})
        agent = _make_agent_with_llm(llm_output)

        qa_history = [{"q": f"Q{i}", "a": f"A{i}"} for i in range(MIN_QUESTIONS + 1)]

        result = await agent.next_question(
            project_name="Argos Interne",
            cdc_analysis={"subjects": [], "gaps": ["lacune 1"], "domains": [], "constraints": []},
            qa_history=qa_history,
        )

        assert result.get("done") is True

    @pytest.mark.asyncio
    async def test_llm_done_accepted_even_at_first_question(self):
        """Sans lacune dans le CDC, le LLM peut terminer dès la première question."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        llm_output = json.dumps({"done": True, "reason": "Aucune lacune à combler."})
        agent = _make_agent_with_llm(llm_output)

        result = await agent.next_question(
            project_name="Argos Interne",
            cdc_analysis={"subjects": [{"name": "IA", "sub_subjects": [], "priority": "high"}],
                          "gaps": [], "domains": [], "constraints": []},
            qa_history=[{"q": "Q1", "a": "CDC très complet, rien à préciser."}],
        )

        assert result.get("done") is True


# ── ProjectCalibrationAgent.generate_subjects ────────────────────────────────

class TestGenerateSubjects:
    @pytest.mark.asyncio
    async def test_creates_workspace_rows(self):
        """generate_subjects insère des lignes dans workspaces avec project_id."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        llm_output = json.dumps({
            "subjects": [
                {"name": "IA générative", "description": "LLM, RAG, agents"},
                {"name": "MLOps", "description": "CI/CD modèles, monitoring"},
            ],
            "knowledge_profile": {"bilan_md": "Projet axé IA...", "learning_plan_md": "..."},
            "source_candidates": [
                {"url": "https://openai.com/blog", "type": "rss", "name": "OpenAI Blog"},
            ],
        })

        workspace_row_1 = _workspace_row(id=101, name="IA générative")
        workspace_row_2 = _workspace_row(id=102, name="MLOps")

        agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
        agent._llm = MagicMock()
        agent._llm.generate = AsyncMock(return_value=(llm_output, {}))

        # DB mock : fetchone retourne les lignes insérées
        db = _make_db()
        db.get_connection().__enter__().cursor().__enter__().fetchone.side_effect = [
            workspace_row_1,
            workspace_row_2,
        ]
        agent._db = db

        result = await agent.generate_subjects(
            project_id=1,
            project_name="Argos Interne",
            cdc_analysis={
                "subjects": [{"name": "IA générative", "sub_subjects": [], "priority": "high"}],
                "gaps": [],
                "domains": [],
                "constraints": [],
            },
            qa_history=[{"q": "Q", "a": "A"}],
        )

        assert "subjects" in result
        assert len(result["subjects"]) == 2
        # Vérifie que des INSERT workspaces ont été lancés
        cur = db.get_connection().__enter__().cursor().__enter__()
        insert_calls = [c for c in cur.execute.call_args_list if "INSERT" in str(c)]
        assert len(insert_calls) >= 2

    @pytest.mark.asyncio
    async def test_returns_knowledge_profile(self):
        """generate_subjects retourne un knowledge_profile non vide."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        llm_output = json.dumps({
            "subjects": [{"name": "IA", "description": "desc"}],
            "knowledge_profile": {"bilan_md": "Bilan projet.", "learning_plan_md": "Plan."},
            "source_candidates": [],
        })

        agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
        agent._llm = MagicMock()
        agent._llm.generate = AsyncMock(return_value=(llm_output, {}))

        db = _make_db()
        db.get_connection().__enter__().cursor().__enter__().fetchone.return_value = _workspace_row()
        agent._db = db

        result = await agent.generate_subjects(
            project_id=1, project_name="Argos",
            cdc_analysis={"subjects": [], "gaps": [], "domains": [], "constraints": []},
            qa_history=[],
        )

        assert result["knowledge_profile"]["bilan_md"] == "Bilan projet."

    @pytest.mark.asyncio
    async def test_returns_source_candidates(self):
        """generate_subjects retourne les sources suggérées par le LLM."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        llm_output = json.dumps({
            "subjects": [{"name": "IA", "description": "desc"}],
            "knowledge_profile": {"bilan_md": "", "learning_plan_md": ""},
            "source_candidates": [
                {"url": "https://anthropic.com/news", "type": "website", "name": "Anthropic News"},
            ],
        })

        agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
        agent._llm = MagicMock()
        agent._llm.generate = AsyncMock(return_value=(llm_output, {}))

        db = _make_db()
        db.get_connection().__enter__().cursor().__enter__().fetchone.return_value = _workspace_row()
        agent._db = db

        result = await agent.generate_subjects(
            project_id=1, project_name="Argos",
            cdc_analysis={"subjects": [], "gaps": [], "domains": [], "constraints": []},
            qa_history=[],
        )

        assert len(result["source_candidates"]) == 1
        assert result["source_candidates"][0]["url"] == "https://anthropic.com/news"

    @pytest.mark.asyncio
    async def test_saves_knowledge_profile_to_project(self):
        """knowledge_profile sauvegardé via UPDATE projects."""
        import json
        from argos.services.project_calibration_agent import ProjectCalibrationAgent

        llm_output = json.dumps({
            "subjects": [{"name": "IA", "description": "desc"}],
            "knowledge_profile": {"bilan_md": "Bilan.", "learning_plan_md": "Plan."},
            "source_candidates": [],
        })

        agent = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
        agent._llm = MagicMock()
        agent._llm.generate = AsyncMock(return_value=(llm_output, {}))

        db = _make_db()
        db.get_connection().__enter__().cursor().__enter__().fetchone.return_value = _workspace_row()
        agent._db = db

        await agent.generate_subjects(
            project_id=1, project_name="Argos",
            cdc_analysis={"subjects": [], "gaps": [], "domains": [], "constraints": []},
            qa_history=[],
        )

        cur = db.get_connection().__enter__().cursor().__enter__()
        update_calls = [c for c in cur.execute.call_args_list if "UPDATE" in str(c)]
        assert len(update_calls) >= 1
