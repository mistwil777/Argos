"""
Routes de création de veille par intention (intent → discovery).
"""

import logging
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from argos.api.router import db
from argos.config import settings

logger = logging.getLogger(__name__)

veille_router = APIRouter(prefix="/api/v1/veille", tags=["veille"])


class VeilleCreateRequest(BaseModel):
    description: str
    workspace_id: Optional[int] = None
    auto_create: bool = False  # si True, crée les sources directement sans confirmation


class VeilleCreateResponse(BaseModel):
    intent: Dict[str, Any]
    sources: list[Dict[str, Any]]
    created: bool
    message: str


@veille_router.post("/create", response_model=VeilleCreateResponse)
async def create_veille(body: VeilleCreateRequest):
    """
    Crée une veille à partir d'une intention en langage naturel.

    Flux :
      1. Décompose l'intent (Claude)
      2. Découvre les sources candidates (SearXNG + trafilatura)
      3. Si auto_create=True : crée les sources et déclenche le premier collect
         Sinon : retourne les candidats pour validation par l'utilisateur
    """
    if not body.description or len(body.description.strip()) < 10:
        raise HTTPException(status_code=422, detail="La description est trop courte (10 caractères minimum)")

    try:
        from argos.services.intent_discovery import IntentService, DiscoveryService

        # 1. Décomposer l'intent
        intent_svc = IntentService(anthropic_api_key=settings.anthropic_api_key)
        intent_data = await intent_svc.decompose(body.description.strip())

        # 2. Découvrir les sources
        discovery_svc = DiscoveryService(db_manager=db)
        candidates = await discovery_svc.find_sources(
            intent_data=intent_data,
            workspace_id=body.workspace_id,
        )

        created = False
        message = f"{len(candidates)} sources trouvées — en attente de confirmation"

        # 3. Créer automatiquement si demandé
        if body.auto_create and candidates:
            created_sources = await discovery_svc.create_sources(candidates)
            candidates = created_sources
            created = True
            message = f"{len(candidates)} sources créées — premier collect en cours"

        return VeilleCreateResponse(
            intent=intent_data,
            sources=candidates,
            created=created,
            message=message,
        )

    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"[VEILLE] Erreur create_veille : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@veille_router.post("/confirm")
async def confirm_veille(body: Dict[str, Any]):
    """
    Confirme et crée les sources sélectionnées par l'utilisateur
    après la phase de découverte.
    """
    sources = body.get("sources", [])
    workspace_id = body.get("workspace_id")

    if not sources:
        raise HTTPException(status_code=422, detail="Aucune source à confirmer")

    try:
        from argos.services.intent_discovery import DiscoveryService
        discovery_svc = DiscoveryService(db_manager=db)

        # Injecter workspace_id si fourni
        for s in sources:
            s["workspace_id"] = workspace_id

        created = await discovery_svc.create_sources(sources)
        return {
            "created": len(created),
            "sources": created,
            "message": f"{len(created)} sources créées — premier collect en cours",
        }

    except Exception as e:
        logger.error(f"[VEILLE] Erreur confirm_veille : {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
