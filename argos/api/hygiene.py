"""
API RAG Hygiene — lecture et résolution des alertes HITL.
"""

import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hygiene", tags=["hygiene"])


class AlertResolveRequest(BaseModel):
    status: str  # ignored | archived | confirmed


@router.get("/alerts")
async def list_alerts(
    status: Optional[str] = Query(None, description="pending|ignored|archived|confirmed"),
    limit: int = Query(20, le=100),
):
    """Retourne les alertes RAG Hygiene (défaut : pending uniquement)."""
    from argos.api.router import db

    filter_status = status or "pending"

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT id, type, item_ids, source_url, message, proposed_content,
                       status, created_at, resolved_at
                FROM rag_hygiene_alerts
                WHERE status = %s
                ORDER BY created_at DESC
                LIMIT %s
            """, (filter_status, limit))
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description]

    alerts = []
    for row in rows:
        a = dict(zip(cols, row))
        a["created_at"] = a["created_at"].isoformat() if a["created_at"] else None
        a["resolved_at"] = a["resolved_at"].isoformat() if a["resolved_at"] else None
        alerts.append(a)

    return {"alerts": alerts, "count": len(alerts)}


@router.patch("/alerts/{alert_id}")
async def resolve_alert(alert_id: int, body: AlertResolveRequest):
    """
    Résout une alerte :
    - ignored : l'humain a vérifié, pas d'action nécessaire
    - archived : contenu archivé hors RAG
    - confirmed : fusion validée → les items originaux sont désindexés du RAG
    """
    from argos.api.router import db

    if body.status not in ("ignored", "archived", "confirmed"):
        raise HTTPException(status_code=400, detail="status doit être : ignored | archived | confirmed")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            # Récupère l'alerte
            cur.execute("""
                SELECT id, type, item_ids, proposed_content, status
                FROM rag_hygiene_alerts
                WHERE id = %s
            """, (alert_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(status_code=404, detail="Alerte introuvable")

            alert_id_db, alert_type, item_ids, proposed_content, current_status = row

            if current_status != "pending":
                raise HTTPException(status_code=409, detail=f"Alerte déjà résolue ({current_status})")

            # Si fusion confirmée → désindexer les originaux + insérer l'item synthétique
            if body.status == "confirmed" and alert_type == "fusion_proposal" and item_ids and proposed_content:
                cur.execute("""
                    UPDATE items
                    SET rag_indexed = FALSE
                    WHERE id = ANY(%s::integer[])
                """, (item_ids,))

                # Récupère la source_url du premier item pour l'item synthétique
                if item_ids:
                    cur.execute("SELECT source_url FROM items WHERE id = %s", (item_ids[0],))
                    src_row = cur.fetchone()
                    source_url = src_row[0] if src_row else None

                    if source_url and proposed_content:
                        cur.execute("""
                            INSERT INTO items
                            (title, content, source_url, source_type, score, rag_indexed, created_at)
                            VALUES ('Synthèse fusionnée (hygiène RAG)', %s, %s, 'fused', 0.7, TRUE, NOW())
                        """, (proposed_content, source_url))

            # Marque l'alerte résolue
            cur.execute("""
                UPDATE rag_hygiene_alerts
                SET status = %s, resolved_at = NOW()
                WHERE id = %s
            """, (body.status, alert_id_db))
            conn.commit()

    return {"ok": True, "alert_id": alert_id_db, "status": body.status}
