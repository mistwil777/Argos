"""
Routes — ProjectCalibrationAgent
"""
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from argos.database import DatabaseManager
from argos.config import settings
from argos.api.auth import get_current_user
from argos.services.project_calibration_agent import CdcAnalyzer, ProjectCalibrationAgent
from argos.services.teams_notifier import notify_calibration_done_teams
from argos.services.project_service import ProjectService

logger = logging.getLogger(__name__)
router = APIRouter(tags=["project-calibration"])
db = DatabaseManager(settings.database_url)


def _analyzer():
    a = CdcAnalyzer.__new__(CdcAnalyzer)
    a._db = db
    from argos.services.llm_provider import create_llm_provider
    a._llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model="us.anthropic.claude-sonnet-4-20250514-v1:0",
    )
    return a


def _agent():
    ag = ProjectCalibrationAgent.__new__(ProjectCalibrationAgent)
    ag._db = db
    from argos.services.llm_provider import create_llm_provider
    ag._llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model="us.anthropic.claude-sonnet-4-20250514-v1:0",
    )
    return ag


# ── Schemas ───────────────────────────────────────────────────────────────────

class CdcAnalyzeRequest(BaseModel):
    cdc_text: str


class CalibrationQuestionRequest(BaseModel):
    project_name: str
    cdc_analysis: dict
    qa_history: list = []


class CalibrationFinalizeRequest(BaseModel):
    project_name: str
    cdc_analysis: dict
    qa_history: list = []


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/projects/{project_id}/calibration/analyze")
async def analyze_cdc(
    project_id: int,
    body: CdcAnalyzeRequest,
    current_user=Depends(get_current_user),
):
    try:
        result = await _analyzer().analyze_and_save(
            project_id=project_id,
            user_id=current_user["id"],
            cdc_text=body.cdc_text,
        )
        return result
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"analyze_cdc error: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de l'analyse du CDC")


@router.post("/projects/{project_id}/calibration/question")
async def next_question(
    project_id: int,
    body: CalibrationQuestionRequest,
    current_user=Depends(get_current_user),
):
    try:
        return await _agent().next_question(
            project_name=body.project_name,
            cdc_analysis=body.cdc_analysis,
            qa_history=body.qa_history,
        )
    except Exception as e:
        logger.error(f"next_question error: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la génération de la question")


@router.post("/projects/{project_id}/calibration/finalize", status_code=201)
async def finalize_calibration(
    project_id: int,
    body: CalibrationFinalizeRequest,
    current_user=Depends(get_current_user),
):
    try:
        result = await _agent().generate_subjects(
            project_id=project_id,
            project_name=body.project_name,
            cdc_analysis=body.cdc_analysis,
            qa_history=body.qa_history,
        )
        # Notification Teams fire-and-forget
        project = ProjectService(db).get_project(project_id=project_id, user_id=current_user["id"])
        if project and project.get("teams_webhook_url"):
            try:
                await notify_calibration_done_teams(
                    webhook_url=project["teams_webhook_url"],
                    project_name=body.project_name,
                    subjects=[s["name"] for s in result.get("subjects", [])],
                    n_sources=len(result.get("source_candidates", [])),
                )
            except Exception as e:
                logger.warning(f"Teams calibration notification failed: {e}")
        return result
    except Exception as e:
        logger.error(f"finalize_calibration error: {e}")
        raise HTTPException(status_code=500, detail="Erreur lors de la finalisation")
