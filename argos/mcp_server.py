"""
Argos MCP Server — Model Context Protocol (Streamable HTTP)

Expose les données de veille Argos aux IDE et LLM des développeurs.
Transport : Streamable HTTP (POST /mcp + GET /mcp/sse)
Spec : modelcontextprotocol.io

Tools disponibles :
  - search_veille  : recherche hybride dans le RAG Argos
  - get_briefing   : briefing Delta du jour (ou d'une date)
  - get_item       : détail complet d'un item de veille
  - list_recent    : derniers items fiables par entité
"""

import logging
from typing import Optional

from mcp.server.fastmcp import FastMCP

logger = logging.getLogger(__name__)

# ── Création du serveur MCP ───────────────────────────────────────────────────

mcp = FastMCP(
    name="Argos Veille",
    streamable_http_path="/",  # Route interne "/" → chemin final /mcp quand monté sur /mcp
    instructions=(
        "Argos est un système de veille technologique automatisé. "
        "Il collecte, filtre (fiabilité) et indexe des sources officielles sur l'IA, "
        "les LLM, les frameworks et l'écosystème dev. "
        "Utilise search_veille pour trouver des informations récentes dans la base RAG. "
        "Utilise get_briefing pour le résumé Delta du jour. "
        "Utilise list_recent pour voir les derniers items par sujet surveillé."
    ),
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _get_db():
    from argos.api.router import db
    return db


def _get_rag():
    from argos.services.llm_provider import create_llm_provider
    from argos.services.rag import RAGService
    from argos.services.vector_store_singleton import get_vector_store
    from argos.config import settings
    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.aws_bedrock_model,
    )
    vs = get_vector_store()
    return RAGService(llm_provider=llm, vector_store=vs, db_manager=_get_db(), top_k=10)


# ── Tool 1 : search_veille ────────────────────────────────────────────────────

@mcp.tool()
async def search_veille(
    query: str,
    top_k: int = 8,
    workspace_id: Optional[int] = None,
) -> dict:
    """
    Recherche hybride (sémantique + BM25) dans la base RAG d'Argos.

    Retourne les chunks les plus pertinents avec leurs sources, URLs et tiers
    de fiabilité. Idéal pour répondre à des questions sur l'état de l'art,
    les dernières fonctionnalités ou les frameworks surveillés.

    Args:
        query: Question ou sujet à rechercher (ex: "nouvelles features Claude Code")
        top_k: Nombre de chunks à récupérer (défaut: 8, max: 20)
        workspace_id: Filtrer par workspace Argos (optionnel)

    Returns:
        dict avec:
          - answer: réponse synthétique générée par LLM
          - sources: liste des sources avec title, url, tier, chunk_text
          - rag_coverage: score de couverture 0-1
          - chunks_found: nombre de chunks récupérés
    """
    top_k = min(max(top_k, 1), 20)

    try:
        rag = _get_rag()
        result = await rag.ask(
            query=query,
            user_identifier="mcp_client",
            use_hybrid_search=True,
            workspace_id=workspace_id,
        )

        # Enrichir les sources avec tier de fiabilité depuis la DB
        db = _get_db()
        enriched_sources = []
        for src in result.get("sources", []):
            item_id = src.get("source_id")
            tier = "unknown"
            url  = src.get("url", "")
            reliability_score = None
            if item_id:
                try:
                    with db.get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute(
                                "SELECT url, reliability_tier, reliability_score FROM items WHERE id = %s",
                                (item_id,)
                            )
                            row = cur.fetchone()
                            if row:
                                url   = row[0] or url
                                tier  = row[1] or "unknown"
                                reliability_score = float(row[2]) if row[2] else None
                except Exception:
                    pass
            enriched_sources.append({
                "title":             src.get("title", ""),
                "url":               url,
                "tier":              tier,
                "reliability_score": reliability_score,
                "chunk_text":        src.get("chunk_text", "")[:500],
                "similarity_score":  src.get("similarity_score", 0.0),
            })

        # Calcul coverage
        distances = [s.get("similarity_score", 1.0) for s in result.get("sources", [])]
        avg_dist  = sum(distances) / len(distances) if distances else 1.0
        coverage  = round(max(0.0, min(1.0, 1.0 - avg_dist / 2.0)), 3)

        return {
            "answer":       result.get("answer", ""),
            "sources":      enriched_sources,
            "rag_coverage": coverage,
            "chunks_found": len(enriched_sources),
            "query":        query,
        }

    except Exception as e:
        logger.error(f"[MCP] search_veille error: {e}", exc_info=True)
        return {"error": str(e), "answer": "", "sources": [], "rag_coverage": 0.0}


# ── Tool 2 : get_briefing ─────────────────────────────────────────────────────

@mcp.tool()
async def get_briefing(
    date: Optional[str] = None,
    generate_if_missing: bool = False,
) -> dict:
    """
    Récupère le briefing Delta Argos pour une date donnée.

    Le briefing Delta résume ce qui a changé aujourd'hui dans l'écosystème
    surveillé, groupé par entité (Anthropic · Claude, OpenAI · GPT, etc.),
    avec sources citées et tiers de fiabilité.

    Args:
        date: Date au format YYYY-MM-DD (défaut: aujourd'hui)
        generate_if_missing: Générer le briefing s'il n'existe pas (coûte des tokens LLM)

    Returns:
        dict avec:
          - exists: bool
          - date: date du briefing
          - markdown: contenu complet du briefing en markdown
          - groups: dict {entité: [item_ids]}
          - stats: statistiques (nb items, tiers, période)
          - cited_sources: liste des sources avec URL et tier
    """
    import datetime as _dt

    db = _get_db()

    # Résoudre la date
    if date:
        try:
            target_date = _dt.date.fromisoformat(date)
        except ValueError:
            return {"error": f"Format date invalide : '{date}' — utilisez YYYY-MM-DD"}
    else:
        target_date = _dt.date.today()

    # Chercher en base
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT id, briefing_date, executive_summary, top_items, trends,
                          stats, tokens_used, generated_at, cited_sources, groups
                   FROM daily_briefings WHERE briefing_date = %s""",
                (target_date,)
            )
            row = cur.fetchone()

    if row:
        return {
            "exists":        True,
            "id":            row[0],
            "date":          str(row[1]),
            "markdown":      row[2] or "",
            "top_items":     row[3] or [],
            "trends":        row[4] or [],
            "stats":         row[5] or {},
            "tokens_used":   row[6] or 0,
            "generated_at":  row[7].isoformat() if row[7] else None,
            "cited_sources": row[8] or [],
            "groups":        row[9] or {},
        }

    if not generate_if_missing:
        return {
            "exists":  False,
            "date":    str(target_date),
            "message": (
                f"Aucun briefing disponible pour le {target_date}. "
                "Passez generate_if_missing=true pour le générer (coûte des tokens LLM), "
                "ou appelez POST /api/v1/briefing/generate depuis l'interface Argos."
            ),
        }

    # Générer à la demande
    try:
        from argos.api.router import _generate_briefing_content
        import json as _json

        result = await _generate_briefing_content(hours=24)
        if "error" in result:
            return {"exists": False, "date": str(target_date), "error": result["message"]}

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO daily_briefings
                       (briefing_date, executive_summary, top_items, trends, stats,
                        tokens_used, cited_sources, groups)
                       VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s::jsonb, %s::jsonb)
                       ON CONFLICT (briefing_date) DO UPDATE SET
                         executive_summary = EXCLUDED.executive_summary,
                         generated_at = NOW()
                       RETURNING id""",
                    (
                        target_date,
                        result["markdown"],
                        _json.dumps(result["top_items"]),
                        _json.dumps(result["trends"]),
                        _json.dumps(result["stats"]),
                        result["tokens_used"],
                        _json.dumps(result.get("cited_sources", [])),
                        _json.dumps(result.get("groups", {})),
                    )
                )
                briefing_id = cur.fetchone()[0]
                conn.commit()

        return {
            "exists":        True,
            "id":            briefing_id,
            "date":          str(target_date),
            "markdown":      result["markdown"],
            "cited_sources": result.get("cited_sources", []),
            "groups":        result.get("groups", {}),
            "stats":         result["stats"],
            "tokens_used":   result["tokens_used"],
            "generated_now": True,
        }
    except Exception as e:
        logger.error(f"[MCP] get_briefing generate error: {e}", exc_info=True)
        return {"exists": False, "date": str(target_date), "error": str(e)}


# ── Tool 3 : get_item ─────────────────────────────────────────────────────────

@mcp.tool()
async def get_item(item_id: int) -> dict:
    """
    Récupère le détail complet d'un item de veille par son ID.

    Retourne le titre, résumé, URL, digest markdown, tiers de fiabilité,
    importance, type, mots-clés et score de pertinence.

    Args:
        item_id: Identifiant de l'item (visible dans search_veille et get_briefing)

    Returns:
        dict avec tous les champs de l'item, ou {"error": "..."} si introuvable
    """
    db = _get_db()
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, title, summary, url, importance, item_type,
                              keywords, source_type, classification_status,
                              reliability_passed, reliability_score, reliability_tier,
                              reliability_reason, digest_markdown, relevance_score,
                              created_at, source_url
                       FROM items WHERE id = %s""",
                    (item_id,)
                )
                row = cur.fetchone()

        if not row:
            return {"error": f"Item {item_id} introuvable"}

        return {
            "id":                   row[0],
            "title":                row[1] or "",
            "summary":              row[2] or "",
            "url":                  row[3] or "",
            "importance":           row[4] or "",
            "item_type":            row[5] or "",
            "keywords":             row[6] or [],
            "source_type":          row[7] or "",
            "classification_status": row[8] or "",
            "reliability_passed":   row[9],
            "reliability_score":    float(row[10]) if row[10] else None,
            "reliability_tier":     row[11] or "unknown",
            "reliability_reason":   row[12] or "",
            "digest_markdown":      row[13] or "",
            "relevance_score":      float(row[14]) if row[14] else None,
            "created_at":           row[15].isoformat() if row[15] else None,
            "source_url":           row[16] or "",
        }
    except Exception as e:
        logger.error(f"[MCP] get_item {item_id} error: {e}", exc_info=True)
        return {"error": str(e)}


# ── Tool 4 : list_recent ──────────────────────────────────────────────────────

@mcp.tool()
async def list_recent(
    entity: Optional[str] = None,
    hours: int = 48,
    limit: int = 20,
    reliability_only: bool = True,
) -> dict:
    """
    Liste les derniers items de veille, filtrés par entité et fenêtre temporelle.

    Permet de voir ce qui a été collecté récemment sur un sujet précis,
    utile pour alimenter un agent ou vérifier la fraîcheur du RAG.

    Args:
        entity: Filtre par entité (ex: "anthropic", "openai", "langchain") — optionnel
        hours: Fenêtre temporelle en heures (défaut: 48)
        limit: Nombre max d'items (défaut: 20, max: 50)
        reliability_only: N'inclure que les items reliability_passed=TRUE (défaut: true)

    Returns:
        dict avec:
          - items: liste d'items (id, title, url, importance, tier, created_at)
          - total: nombre d'items retournés
          - period_hours: fenêtre temporelle utilisée
    """
    limit = min(max(limit, 1), 50)
    db = _get_db()

    try:
        conditions = [f"created_at > NOW() - INTERVAL '{hours} hours'"]
        params: list = []

        if reliability_only:
            conditions.append("reliability_passed = TRUE")

        if entity:
            entity_lower = entity.lower()
            conditions.append(
                "(LOWER(title) LIKE %s OR LOWER(source_url) LIKE %s OR "
                " %s = ANY(SELECT LOWER(k) FROM unnest(keywords) k))"
            )
            pattern = f"%{entity_lower}%"
            params.extend([pattern, pattern, entity_lower])

        where = " AND ".join(conditions)

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, title, url, importance, item_type,
                               reliability_tier, reliability_score, created_at
                        FROM items
                        WHERE {where}
                        ORDER BY created_at DESC
                        LIMIT %s""",
                    params + [limit],
                )
                rows = cur.fetchall()

        items = [
            {
                "id":                row[0],
                "title":             row[1] or "",
                "url":               row[2] or "",
                "importance":        row[3] or "",
                "item_type":         row[4] or "",
                "reliability_tier":  row[5] or "unknown",
                "reliability_score": float(row[6]) if row[6] else None,
                "created_at":        row[7].isoformat() if row[7] else None,
            }
            for row in rows
        ]

        return {
            "items":        items,
            "total":        len(items),
            "period_hours": hours,
            "entity_filter": entity,
            "reliability_only": reliability_only,
        }

    except Exception as e:
        logger.error(f"[MCP] list_recent error: {e}", exc_info=True)
        return {"error": str(e), "items": [], "total": 0}
