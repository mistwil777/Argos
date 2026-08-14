"""
REST API Router for Argos Web Interface

Provides REST endpoints alongside the existing JSON-RPC interface.
"""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, UploadFile, File, Form, Header
from fastapi.responses import StreamingResponse
from typing import Optional, Dict, Any, AsyncGenerator
import logging
from datetime import datetime, timezone
from pathlib import Path

from argos.database import DatabaseManager
from argos.config import settings
from argos.services.llm_provider import create_llm_provider

logger = logging.getLogger(__name__)

# Create router
api_router = APIRouter(prefix="/api/v1", tags=["api"])

# Import and include sub-routers
from argos.api.workspaces import router as workspaces_router
api_router.include_router(workspaces_router)

from argos.api.sujets import router as sujets_router
api_router.include_router(sujets_router)

from argos.api.hygiene import router as hygiene_router
api_router.include_router(hygiene_router)

# Database instance
db = DatabaseManager(settings.database_url)


# ===========================================
# Background: auto-collect + auto-classify
# ===========================================

async def _auto_collect_and_classify(source_id: int):
    """Background task: pipeline complet collect → classify → score → digest → RAG."""
    from argos.services.pipeline import run_pipeline_for_source
    await run_pipeline_for_source(source_id)


# ===========================================
# Stats Endpoints
# ===========================================

@api_router.get("/stats/global")
async def get_global_stats():
    """Get global statistics."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM items")
                total_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM items WHERE classification_status = 'classified'")
                classified_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM items WHERE classification_status = 'pending'")
                pending_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM browse_sessions")
                total_browses = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM search_sessions")
                total_searches = cur.fetchone()[0]

                cur.execute("SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage")
                total_cost = float(cur.fetchone()[0] or 0)

                cur.execute("""
                    SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage
                    WHERE created_at >= CURRENT_DATE
                """)
                cost_today = float(cur.fetchone()[0] or 0)

                cur.execute("""
                    SELECT COALESCE(SUM(cost_usd), 0) FROM llm_usage
                    WHERE created_at >= date_trunc('month', CURRENT_DATE)
                """)
                cost_this_month = float(cur.fetchone()[0] or 0)

        return {
            "total_items": total_items,
            "classified_items": classified_items,
            "pending_items": pending_items,
            "total_browses": total_browses,
            "total_searches": total_searches,
            "total_cost": total_cost,
            "cost_today": cost_today,
            "cost_this_month": cost_this_month,
        }
    except Exception as e:
        logger.error(f"Error fetching global stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/timeline")
async def get_timeline_stats(days: int = Query(default=7, ge=1, le=90)):
    """Get timeline statistics for the last N days."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE(created_at) as date,
                        COUNT(*) as items_collected,
                        COUNT(CASE WHEN classification_status = 'classified' THEN 1 END) as items_classified
                    FROM items
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                    ORDER BY date DESC
                    LIMIT %s
                """, (days, days))
                items_data = cur.fetchall()

                cur.execute("""
                    SELECT DATE(created_at) as date, COUNT(*) as browses
                    FROM browse_sessions
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                """, (days,))
                browses_data = {row[0]: row[1] for row in cur.fetchall()}

        timeline = []
        for row in items_data:
            date_str = row[0].strftime("%Y-%m-%d") if hasattr(row[0], 'strftime') else str(row[0])
            timeline.append({
                "date": date_str,
                "items_collected": row[1],
                "items_classified": row[2],
                "browses": browses_data.get(row[0], 0),
            })

        return timeline
    except Exception as e:
        logger.error(f"Error fetching timeline stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/topics")
async def get_topics_stats(limit: int = Query(default=10, ge=1, le=50)):
    """Get top topics by item and course count."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        item_type as topic,
                        COUNT(*) as item_count,
                        COUNT(DISTINCT CASE WHEN classification_status = 'classified' THEN id END) as classified_count
                    FROM items
                    WHERE item_type IS NOT NULL
                    GROUP BY item_type
                    ORDER BY item_count DESC
                    LIMIT %s
                """, (limit,))
                
                results = []
                for row in cur.fetchall():
                    results.append({
                        "topic": row[0],
                        "item_count": row[1],
                        "course_count": row[2]
                    })
                
                return results
    except Exception as e:
        logger.error(f"Error fetching topics stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/trends")
async def get_trends(
    window: int = Query(default=7, ge=1, le=90),
    limit: int = Query(default=30, ge=5, le=100),
    workspace_id: Optional[int] = Query(default=None),
):
    """
    Keyword trend analysis over a sliding window.
    Returns top keywords with frequency in current window vs previous window,
    plus a daily timeline for sparklines.
    """
    try:
        ws_filter = "AND workspace_id = %(ws)s" if workspace_id is not None else ""
        params = {"window": window, "limit": limit, "ws": workspace_id}

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Current window frequency
                cur.execute(f"""
                    SELECT lower(kw) as keyword, COUNT(*) as freq
                    FROM items, unnest(keywords) AS kw
                    WHERE classification_status = 'classified'
                      AND created_at > NOW() - INTERVAL '%(window)s days'
                      {ws_filter}
                    GROUP BY lower(kw)
                    ORDER BY freq DESC
                    LIMIT %(limit)s
                """, params)
                current = {r[0]: r[1] for r in cur.fetchall()}

                # Previous window (same duration, just before)
                cur.execute(f"""
                    SELECT lower(kw) as keyword, COUNT(*) as freq
                    FROM items, unnest(keywords) AS kw
                    WHERE classification_status = 'classified'
                      AND created_at BETWEEN NOW() - INTERVAL '%(double)s days'
                                         AND NOW() - INTERVAL '%(window)s days'
                      {ws_filter}
                    GROUP BY lower(kw)
                """, {**params, "double": window * 2})
                previous = {r[0]: r[1] for r in cur.fetchall()}

                # Daily timeline for top 5 keywords (sparkline data)
                top5 = list(current.keys())[:5]
                timeline = []
                if top5:
                    cur.execute(f"""
                        SELECT DATE(created_at) as day,
                               lower(kw) as keyword,
                               COUNT(*) as freq
                        FROM items, unnest(keywords) AS kw
                        WHERE classification_status = 'classified'
                          AND created_at > NOW() - INTERVAL '%(window)s days'
                          AND lower(kw) = ANY(%(top5)s)
                          {ws_filter}
                        GROUP BY day, lower(kw)
                        ORDER BY day ASC
                    """, {**params, "top5": top5})
                    for r in cur.fetchall():
                        timeline.append({
                            "date": r[0].strftime("%Y-%m-%d"),
                            "keyword": r[1],
                            "freq": r[2],
                        })

                # Item count per day for volume chart
                cur.execute(f"""
                    SELECT DATE(created_at) as day, COUNT(*) as count
                    FROM items
                    WHERE classification_status = 'classified'
                      AND created_at > NOW() - INTERVAL '%(window)s days'
                      {ws_filter}
                    GROUP BY day ORDER BY day ASC
                """, params)
                daily_volume = [{"date": r[0].strftime("%Y-%m-%d"), "count": r[1]} for r in cur.fetchall()]

        # Build trend objects with delta
        trends = []
        all_keywords = set(current.keys()) | set(previous.keys())
        for kw in sorted(all_keywords, key=lambda k: current.get(k, 0), reverse=True)[:limit]:
            cur_freq = current.get(kw, 0)
            prev_freq = previous.get(kw, 0)
            if cur_freq == 0:
                continue
            if prev_freq == 0:
                delta = "new"
                delta_pct = None
            else:
                pct = round(((cur_freq - prev_freq) / prev_freq) * 100)
                delta = "up" if pct > 10 else "down" if pct < -10 else "stable"
                delta_pct = pct
            trends.append({
                "keyword": kw,
                "freq": cur_freq,
                "prev_freq": prev_freq,
                "delta": delta,
                "delta_pct": delta_pct,
            })

        return {
            "window_days": window,
            "trends": trends,
            "timeline": timeline,
            "daily_volume": daily_volume,
            "total_keywords": len(current),
        }
    except Exception as e:
        logger.error(f"Error fetching trends: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/costs")
async def get_costs_stats(period: str = Query(default="month", regex="^(week|month|year)$")):
    """Get daily cost breakdown over the requested period."""
    try:
        days = {"week": 7, "month": 30, "year": 365}.get(period, 30)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE(created_at) as date,
                        COALESCE(SUM(cost_usd), 0) as total,
                        SUM(CASE WHEN operation_type = 'classification' THEN cost_usd ELSE 0 END) as classifier_cost,
                        SUM(CASE WHEN operation_type = 'digest' THEN cost_usd ELSE 0 END) as digest_cost,
                        SUM(CASE WHEN operation_type = 'rag' THEN cost_usd ELSE 0 END) as rag_cost
                    FROM llm_usage
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                    ORDER BY date ASC
                    LIMIT %s
                """, (days, days))
                rows = cur.fetchall()

        return [
            {
                "date": row[0].strftime("%Y-%m-%d") if hasattr(row[0], "strftime") else str(row[0]),
                "classifier_cost": float(row[2] or 0),
                "digest_cost": float(row[3] or 0),
                "rag_cost": float(row[4] or 0),
                "total": float(row[1] or 0),
            }
            for row in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching costs stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/tools")
async def get_tools_list():
    """Return all registered MCP tools with metadata + source code."""
    try:
        import inspect as _inspect
        from argos.server import tool_registry

        tools = []
        for meta in tool_registry.list_tools():
            name = meta.get("name", "")
            func = tool_registry.get_tool(name)
            source = None
            source_file = None
            # Unwrap wrappers to get to the real function
            real_func = func
            for _ in range(5):  # max 5 levels of wrapping
                if real_func is None:
                    break
                try:
                    source = _inspect.getsource(real_func)
                    source_file = _inspect.getfile(real_func)
                    # Strip venv paths to show only project-relative
                    if "argos" in (source_file or ""):
                        idx = source_file.find("argos")
                        source_file = source_file[idx:]
                    else:
                        source_file = None  # don't expose external lib paths
                    break
                except (TypeError, OSError):
                    # Try to unwrap one level
                    wrapped = getattr(real_func, "__wrapped__", None) or getattr(real_func, "func", None)
                    if wrapped and wrapped is not real_func:
                        real_func = wrapped
                    else:
                        break
            tools.append({**meta, "source": source, "source_file": source_file})

        categorized: dict = {}
        for t in tools:
            cat = t["name"].split(".")[0] if "." in t["name"] else "other"
            categorized.setdefault(cat, []).append(t)

        return {"tools": tools, "by_category": categorized, "total": len(tools)}
    except Exception as e:
        logger.error(f"Error listing tools: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/costs/detail")
async def get_costs_detail():
    """Cost breakdown by model and operation type."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT model, operation_type,
                           COUNT(*) as calls,
                           SUM(tokens_used) as total_tokens,
                           SUM(cost_usd) as total_cost
                    FROM llm_usage
                    GROUP BY model, operation_type
                    ORDER BY total_cost DESC
                """)
                rows = cur.fetchall()
                cur.execute("SELECT SUM(cost_usd) FROM llm_usage WHERE created_at >= date_trunc('month', NOW())")
                month_cost = float(cur.fetchone()[0] or 0)
                cur.execute("SELECT SUM(cost_usd) FROM llm_usage")
                total_cost = float(cur.fetchone()[0] or 0)
        return {
            "breakdown": [
                {"model": r[0], "operation": r[1], "calls": r[2],
                 "tokens": r[3] or 0, "cost_usd": float(r[4] or 0)}
                for r in rows
            ],
            "month_total": month_cost,
            "all_time_total": total_cost,
        }
    except Exception as e:
        logger.error(f"Error fetching cost detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/stats/rag-queries")
async def get_rag_queries(limit: int = Query(default=20, ge=1, le=100)):
    """Recent RAG queries with answers."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, query, answer, confidence_score, created_at
                       FROM rag_queries ORDER BY created_at DESC LIMIT %s""",
                    (limit,)
                )
                rows = cur.fetchall()
        return [
            {"id": r[0], "query": r[1], "answer": r[2],
             "confidence": float(r[3] or 0),
             "created_at": r[4].isoformat() if r[4] else None}
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching RAG queries: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Items Endpoints
# ============================================

@api_router.get("/items")
async def list_items(
    status: str = Query(default="all", description="Filter by status: all, pending, classified"),
    source: str = Query(default="all", description="Filter by source"),
    importance: str = Query(default="all", description="Filter by importance: all, critical, high, medium, low"),
    workspace_id: Optional[int] = Query(default=None, description="Filter by workspace ID"),
    sujet_id: Optional[int] = Query(default=None, description="Filter by sujet ID"),
    content_tag: Optional[str] = Query(default=None, description="Filter by content tag: veille or apprentissage"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0)
):
    """List items with optional filters."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Build query with filters
                where_conditions = []
                params = []
                
                if status != "all":
                    where_conditions.append("classification_status = %s")
                    params.append(status)

                if importance != "all":
                    where_conditions.append("importance = %s")
                    params.append(importance)

                if source != "all":
                    where_conditions.append("source_type = %s")
                    params.append(source)
                
                if workspace_id is not None:
                    where_conditions.append("workspace_id = %s")
                    params.append(workspace_id)

                if sujet_id is not None:
                    where_conditions.append("sujet_id = %s")
                    params.append(sujet_id)

                if content_tag == "veille":
                    where_conditions.append("(content_tags->>'category' = %s OR content_tags->>'category' = %s)")
                    params.extend(["veille", "mixed"])
                elif content_tag == "apprentissage":
                    where_conditions.append("(content_tags->>'category' = %s OR content_tags->>'category' = %s)")
                    params.extend(["apprentissage", "mixed"])

                where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
                
                query = f"""
                    SELECT
                        id, title, summary, url, source_type, source_url,
                        item_type, importance, classification_status,
                        published_at, created_at, workspace_id,
                        keywords, digest_markdown, rag_indexed, sujet_id,
                        content_tags
                    FROM items
                    WHERE {where_clause}
                    ORDER BY created_at DESC
                    LIMIT %s OFFSET %s
                """

                params.extend([limit, offset])
                cur.execute(query, params)

                items = []
                for row in cur.fetchall():
                    items.append({
                        "id": row[0],
                        "title": row[1],
                        "summary": row[2],
                        "url": row[3],
                        "source_type": row[4],
                        "source_url": row[5],
                        "subject": row[6],
                        "item_type": row[6],
                        "importance": row[7],
                        "classification_status": row[8],
                        "status": row[8],
                        "published_at": row[9].isoformat() if row[9] else None,
                        "created_at": row[10].isoformat() if row[10] else None,
                        "workspace_id": row[11],
                        "topics": row[12] or [],
                        "digest_markdown": row[13],
                        "rag_indexed": bool(row[14]),
                        "sujet_id": row[15],
                        "content_tags": row[16] or {},
                    })
                
                # Get total count
                count_query = f"SELECT COUNT(*) FROM items WHERE {where_clause}"
                cur.execute(count_query, params[:-2])  # Exclude limit and offset
                total = cur.fetchone()[0]
                
                return {"items": items, "total": total}
    except Exception as e:
        logger.error(f"Error listing items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items")
async def create_item(data: Dict[str, Any]):
    """Ingest a single item (from n8n or external sources). Deduplicates by URL."""
    required = ['url', 'title', 'workspace_id']
    missing = [f for f in required if not data.get(f)]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required fields: {missing}")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO items (
                        title, summary, url, source_type, source_url,
                        workspace_id, published_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (url) DO NOTHING
                    RETURNING id
                """, (
                    data['title'],
                    data.get('summary') or data.get('description') or '',
                    data['url'],
                    data.get('source_type', 'rss'),
                    data.get('source_url'),
                    data['workspace_id'],
                    data.get('published_at'),
                ))
                row = cur.fetchone()
                conn.commit()
                if row:
                    return {"id": row[0], "created": True}
                return {"id": None, "created": False, "reason": "duplicate"}
    except Exception as e:
        logger.error(f"Error creating item: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/items/batch/workspace")
async def batch_assign_workspace(data: Dict[str, Any]):
    """Assign / move a batch of items to a workspace."""
    item_ids = data.get("item_ids", [])
    target_workspace_id = data.get("workspace_id")
    if not item_ids or target_workspace_id is None:
        raise HTTPException(status_code=400, detail="item_ids and workspace_id are required")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET workspace_id = %s WHERE id = ANY(%s::int[])",
                    (target_workspace_id, item_ids)
                )
                updated = cur.rowcount
                conn.commit()
                return {"updated": updated, "workspace_id": target_workspace_id}
    except Exception as e:
        logger.error(f"Error batch-assigning workspace: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/items/lookup")
async def lookup_item_by_url(url: str = Query(...)):
    """Check if a URL already exists in the database. Returns item metadata or null."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, title, digest_markdown IS NOT NULL, rag_indexed, created_at
                       FROM items WHERE url = %s LIMIT 1""",
                    (url,)
                )
                row = cur.fetchone()
        if not row:
            return {"exists": False}
        return {
            "exists": True,
            "id": row[0],
            "title": row[1],
            "has_digest": bool(row[2]),
            "rag_indexed": bool(row[3]),
            "created_at": row[4].isoformat() if row[4] else None,
        }
    except Exception as e:
        logger.error(f"Error in lookup: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/items/{item_id}")
async def get_item(item_id: int):
    """Get a single item by ID."""
    try:
        item = db.get_item_by_id(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/batch/classify")
async def classify_items_batch(data: Dict[str, Any]):
    """Classify multiple items using LLM."""
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(status_code=400, detail="item_ids is required")
    try:
        from argos.services.classifier import ClassifierService
        from argos.services.llm_provider import create_llm_provider

        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        classifier = ClassifierService(
            llm_provider=llm_provider,
            db_manager=db,
            temperature=0.5,
            max_tokens=800
        )

        results = []
        errors = []
        for item_id in item_ids:
            try:
                result = await classifier.classify_item(item_id)
                results.append({"item_id": item_id, "status": "classified", "topics": result.get("topics", [])})
            except Exception as e:
                logger.error(f"Failed to classify item {item_id}: {e}")
                errors.append({"item_id": item_id, "error": str(e)})

        return {"classified": len(results), "errors": len(errors), "results": results, "error_details": errors}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch classify: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Batch classification failed: {str(e)}")


@api_router.post("/items/{item_id}/classify")
async def classify_item(item_id: int):
    """Classify a single item using LLM."""
    try:
        from argos.services.classifier import ClassifierService
        from argos.services.llm_provider import create_llm_provider
        
        item = db.get_item_by_id(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        
        classifier = ClassifierService(
            llm_provider=llm_provider,
            db_manager=db,
            temperature=0.5,
            max_tokens=800
        )
        
        result = await classifier.classify_item(item_id)
        
        logger.info(f"Item {item_id} classified: topics={result.get('topics')}, importance={result.get('importance')}")
        
        return {
            "message": "Item classified successfully",
            "item_id": item_id,
            "topics": result.get("topics", []),
            "importance": result.get("importance"),
            "item_type": result.get("item_type"),
            "summary_fr": result.get("summary_fr", ""),
            "tokens_used": result.get("tokens_used", 0),
            "cost_usd": result.get("cost_usd", 0.0)
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error classifying item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Classification failed: {str(e)}")


@api_router.get("/items/{item_id}/raw-content")
async def get_item_raw_content(item_id: int, translate: bool = Query(default=False)):
    """Fetch the raw scraped content of an item URL. translate=true runs LLM translation to French."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url, title FROM items WHERE id = %s", (item_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        url, title = row

        from argos.services.web_browser import browse_with_requests
        from urllib.parse import urljoin, urlparse
        import asyncio as _asyncio
        import re as _re

        def _find_pdf_links(html_links: list, base_url: str) -> list:
            """Extract PDF URLs from a list of links."""
            pdfs = []
            seen = set()
            for link in html_links:
                abs_link = urljoin(base_url, link)
                if abs_link.lower().endswith(".pdf") and abs_link not in seen:
                    seen.add(abs_link)
                    pdfs.append(abs_link)
            return pdfs[:10]

        async def _translate_if_needed(text: str) -> str:
            """Translate text to French via LLM if it's not already in French."""
            if not translate or not text or len(text) < 50:
                return text
            # Quick heuristic: if >30% of words are French, skip translation
            french_markers = {'le','la','les','de','du','des','et','en','un','une','est','pour','avec','par','sur','dans','que','qui','il','elle','ils','elles','nous','vous','mais','ou','donc','car'}
            words = set(text.lower().split()[:100])
            if len(words & french_markers) / max(len(words), 1) > 0.1:
                return text
            from argos.services.llm_provider import create_llm_provider
            llm = create_llm_provider(
                provider_type=settings.llm_provider,
                openai_api_key=settings.openai_api_key,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                aws_region=settings.aws_region,
                model=settings.aws_bedrock_model,
            )
            translated, _ = await llm.generate(
                prompt=f"Traduis fidèlement ce texte en français. Conserve la mise en forme. Retourne uniquement le texte traduit, rien d'autre.\n\n{text[:8000]}",
                system_prompt="Tu es un traducteur professionnel. Tu traduis des contenus techniques en français naturel et précis.",
                temperature=0.2, max_tokens=4000, top_p=0.9,
            )
            return translated

        if url.endswith("/"):
            root = await browse_with_requests(url)
            root_links = root.get("links", [])
            parsed_root = urlparse(url)
            base_prefix = parsed_root.scheme + "://" + parsed_root.netloc + parsed_root.path
            children = []
            seen = {url}
            for link in root_links:
                abs_link = urljoin(url, link)
                if abs_link not in seen and abs_link.startswith(base_prefix):
                    seen.add(abs_link)
                    children.append(abs_link)
                    if len(children) >= 10:
                        break
            child_results = await _asyncio.gather(
                *[browse_with_requests(c) for c in children],
                return_exceptions=True
            )
            pages = [root] + [r for r in child_results if isinstance(r, dict) and r.get("content")]
            sections = []
            for page in pages:
                t = (page.get("title") or page.get("url", "")).strip()
                c = page.get("content", "").strip()
                if c:
                    c_final = await _translate_if_needed(c)
                    sections.append({"title": t, "url": page.get("url", ""), "content": c_final})
            return {"item_id": item_id, "url": url, "pages": sections, "pages_count": len(sections), "translated": translate}
        elif url.startswith("upload://"):
            # Uploaded document — content is in the digest_markdown/summary in DB
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT summary, digest_markdown FROM items WHERE id = %s", (item_id,))
                    row = cur.fetchone()
            text = (row[1] or row[0] or "Contenu non disponible (document uploadé)") if row else "Contenu non disponible"
            text = await _translate_if_needed(text)
            return {
                "item_id": item_id, "url": url,
                "pages": [{"title": title, "url": url, "content": text}],
                "pages_count": 1, "translated": translate, "pdf_links": [], "is_upload": True,
            }
        elif url.lower().endswith(".pdf"):
            # URL is a direct PDF — extract text instead of browsing HTML
            import requests as _req
            from argos.services.document_extractor import extract_pdf
            resp = _req.get(url, timeout=30, verify=False, headers={"User-Agent": "Argos/1.0"})
            text = extract_pdf(resp.content) if resp.status_code == 200 else ""
            text = await _translate_if_needed(text)
            return {
                "item_id": item_id,
                "url": url,
                "pages": [{"title": title, "url": url, "content": text}],
                "pages_count": 1,
                "translated": translate,
                "pdf_links": [],
                "is_pdf": True,
            }
        else:
            result = await browse_with_requests(url)
            content = await _translate_if_needed(result.get("content", ""))
            pdf_links = _find_pdf_links(result.get("links", []), url)
            return {
                "item_id": item_id,
                "url": url,
                "pages": [{"title": result.get("title", title), "url": url, "content": content}],
                "pages_count": 1,
                "translated": translate,
                "pdf_links": pdf_links,
            }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching raw content for item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _auto_rag_index(item_id: int, title: str, summary: str, digest_markdown: str = ""):
    """Désactivé — ingestion RAG/KG manuelle uniquement."""
    pass


@api_router.post("/items/preview-pdf-url")
async def preview_pdf_url(data: Dict[str, Any]):
    """Download and extract a PDF for preview — does NOT save anything."""
    try:
        pdf_url = (data.get("url") or "").strip()
        if not pdf_url:
            raise HTTPException(status_code=400, detail="url required")

        import requests as _req
        from argos.services.document_extractor import extract_pdf

        resp = _req.get(pdf_url, timeout=30, verify=False,
                        headers={"User-Agent": "Argos/1.0"}, stream=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=422, detail=f"HTTP {resp.status_code}")

        pdf_bytes = resp.content
        if len(pdf_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=422, detail="PDF trop volumineux (>50MB)")

        text = extract_pdf(pdf_bytes)
        filename = pdf_url.split("/")[-1]

        return {
            "url": pdf_url,
            "filename": filename,
            "text": text,
            "char_count": len(text),
            "truncated": len(text) >= 12000,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error previewing PDF {data.get('url')}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/ingest-pdf-url")
async def ingest_pdf_from_url(data: Dict[str, Any]):
    """
    Download a PDF from a URL, extract its text (pdfplumber + OCR fallback),
    generate a digest, and save as an item. No manual download needed.
    """
    try:
        pdf_url = (data.get("url") or "").strip()
        workspace_id = data.get("workspace_id")
        if not pdf_url or not pdf_url.lower().endswith(".pdf"):
            raise HTTPException(status_code=400, detail="url must point to a .pdf file")

        import requests as _req
        import json as _json
        from argos.services.document_extractor import extract_pdf
        from argos.services.digest_generator import generate_digest
        from argos.services.llm_provider import create_llm_provider

        # Check if already in base
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, title FROM items WHERE url = %s", (pdf_url,))
                existing = cur.fetchone()
        if existing:
            return {"success": True, "already_exists": True, "item_id": existing[0], "title": existing[1]}

        # Download PDF
        resp = _req.get(pdf_url, timeout=30, verify=False,
                        headers={"User-Agent": "Argos/1.0"},
                        stream=True)
        if resp.status_code != 200:
            raise HTTPException(status_code=422, detail=f"Could not download PDF (HTTP {resp.status_code})")

        pdf_bytes = resp.content
        if len(pdf_bytes) > 50 * 1024 * 1024:  # 50MB limit
            raise HTTPException(status_code=422, detail="PDF too large (>50MB)")

        # Extract text
        text = extract_pdf(pdf_bytes)
        if not text or len(text.strip()) < 50:
            raise HTTPException(status_code=422, detail="Could not extract text from PDF (may be image-only — use the upload feature with OCR)")

        # Filename as title fallback
        filename = pdf_url.split("/")[-1].replace(".pdf", "").replace("-", " ").replace("_", " ").title()

        # Generate digest
        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )
        digest = await generate_digest(pdf_url, filename, text, workspace_id, llm)
        json_data = digest.get("json", {})

        # Save item
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO items
                       (source_type, source_url, url, title, summary,
                        digest_markdown, digest_json, digest_generated_at,
                        importance, item_type, keywords, classification_status, workspace_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),%s,%s,%s,'classified',%s)
                       ON CONFLICT (url) DO UPDATE SET
                         digest_markdown = EXCLUDED.digest_markdown,
                         digest_json = EXCLUDED.digest_json,
                         updated_at = NOW()
                       RETURNING id, title""",
                    (
                        "browse", pdf_url, pdf_url,
                        (json_data.get("title") or filename)[:500],
                        json_data.get("summary", "")[:2000],
                        digest.get("markdown", ""),
                        _json.dumps(json_data),
                        json_data.get("importance", "medium"),
                        json_data.get("content_type", "research"),
                        json_data.get("tags", []),
                        workspace_id,
                    ),
                )
                row = cur.fetchone()
                conn.commit()

        await _auto_rag_index(row[0], row[1], json_data.get("summary", ""), json_data.get("digest_markdown", ""))

        return {
            "success": True,
            "item_id": row[0],
            "title": row[1],
            "char_count": len(text),
            "rag_indexed": True,
            "error": digest.get("error"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ingesting PDF from URL {data.get('url')}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/llm-filter")
async def llm_filter_items(data: Dict[str, Any]):
    """
    Evaluate a list of items against a natural language prompt using LLM.
    Returns a score + reason per item. Does NOT persist anything.
    """
    try:
        prompt = (data.get("prompt") or "").strip()
        item_ids: list = data.get("item_ids") or []
        if not prompt:
            raise HTTPException(status_code=400, detail="prompt is required")
        if not item_ids:
            raise HTTPException(status_code=400, detail="item_ids is required")

        from argos.services.llm_provider import create_llm_provider
        import asyncio, json as _json

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        # Fetch items
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, title, summary FROM items WHERE id = ANY(%s)",
                    (item_ids,)
                )
                rows = {r[0]: {"id": r[0], "title": r[1], "summary": r[2] or ""} for r in cur.fetchall()}

        EVAL_SYSTEM = (
            "Tu es un assistant qui évalue si un article correspond à un critère donné "
            "et réécrit son résumé en tenant compte de ce critère. "
            "Réponds UNIQUEMENT en JSON valide, sans aucun texte autour."
        )

        async def eval_one(item_id: int):
            item = rows.get(item_id)
            if not item:
                return {"item_id": item_id, "keep": False, "score": 0.0, "reason": "Item introuvable", "updated_summary": None}
            user_prompt = (
                f"Critère utilisateur : {prompt}\n\n"
                f"Article :\nTitre : {item['title']}\nRésumé actuel : {item['summary'][:800]}\n\n"
                "1. Évalue si cet article correspond au critère.\n"
                "2. Si keep=true, réécris le résumé en mettant en avant uniquement les éléments pertinents par rapport au critère.\n"
                "3. Si keep=false, garde le résumé tel quel.\n"
                'Réponds en JSON : {"keep": true/false, "score": 0.0-1.0, "reason": "une phrase", "updated_summary": "résumé réécrit ou null"}'
            )
            try:
                text, _ = await llm.generate(
                    prompt=user_prompt,
                    system_prompt=EVAL_SYSTEM,
                    temperature=0.2,
                    max_tokens=500,
                )
                start = text.find("{")
                end = text.rfind("}") + 1
                parsed = _json.loads(text[start:end]) if start >= 0 else {}
                keep = bool(parsed.get("keep", False))
                updated_summary = parsed.get("updated_summary") or None

                # Auto-save updated summary in DB if keep=true and summary changed
                if keep and updated_summary and updated_summary != item["summary"]:
                    try:
                        with db.get_connection() as conn:
                            with conn.cursor() as cur:
                                cur.execute(
                                    "UPDATE items SET summary = %s, updated_at = NOW() WHERE id = %s",
                                    (updated_summary, item_id)
                                )
                                conn.commit()
                    except Exception as db_err:
                        logger.warning(f"Failed to auto-save summary for item {item_id}: {db_err}")

                return {
                    "item_id": item_id,
                    "keep": keep,
                    "score": float(parsed.get("score", 0.0)),
                    "reason": str(parsed.get("reason", "")),
                    "updated_summary": updated_summary if keep else None,
                }
            except Exception as e:
                logger.warning(f"LLM filter failed for item {item_id}: {e}")
                return {"item_id": item_id, "keep": False, "score": 0.0, "reason": f"Erreur : {e}", "updated_summary": None}

        results = await asyncio.gather(*[eval_one(iid) for iid in item_ids])
        return list(results)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in llm-filter: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/ingest-preview")
async def ingest_preview(item_id: int):
    """
    Step 1 of ingestion: fetch URL, generate digest via LLM, return preview WITHOUT saving.
    The user can review the content before confirming.
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url, title, summary, digest_markdown, cleaned_content FROM items WHERE id = %s", (item_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        url, title, current_summary, existing_digest, existing_cleaned = row

        # Digest déjà généré — retour immédiat si cleaned_content aussi présent
        if existing_digest and existing_cleaned:
            return {
                "item_id": item_id,
                "url": url,
                "title": title,
                "current_summary": current_summary,
                "markdown": existing_digest,
                "cleaned_content": existing_cleaned,
                "json": {},
                "content_length": 0,
                "pages_crawled": 0,
                "cached": True,
            }

        from argos.services.web_browser import browse, html_to_markdown
        from argos.services.digest_generator import generate_digest
        from argos.services.llm_provider import create_llm_provider

        need_digest = not existing_digest
        digest = {}
        raw_html = ""

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        # If URL ends with /, crawl child pages and aggregate content
        if url.endswith("/"):
            from argos.tools.web_tools import tool_browse
            import asyncio as _asyncio
            from urllib.parse import urljoin, urlparse

            # Fetch root page (requests fallback — Playwright may not be available)
            root = await browse(url, use_playwright=False)
            root_links = root.get("links", [])
            parsed_root = urlparse(url)
            base_prefix = parsed_root.scheme + "://" + parsed_root.netloc + parsed_root.path

            children = []
            seen = {url}
            for link in root_links:
                abs_link = urljoin(url, link)
                if abs_link not in seen and abs_link.startswith(base_prefix) and abs_link != url:
                    seen.add(abs_link)
                    children.append(abs_link)
                    if len(children) >= 10:
                        break

            # Fetch children concurrently
            child_results = await _asyncio.gather(
                *[browse(c, use_playwright=False) for c in children],
                return_exceptions=True
            )

            pages = [root] + [r for r in child_results if isinstance(r, dict) and r.get("content")]
            fetched_title = root.get("title") or title
            content_parts = []
            for page in pages:
                page_title = page.get("title", page.get("url", "")).strip()
                page_content = page.get("content", "").strip()
                if page_content:
                    content_parts.append(f"### {page_title}\n\n{page_content[:3000]}")
            content = "\n\n---\n\n".join(content_parts)
            pages_crawled = len(pages)
        else:
            browse_result = await browse(url, use_playwright=True)
            content = browse_result.get("content", "")
            raw_html = browse_result.get("html", "")
            fetched_title = browse_result.get("title") or title
            pages_crawled = 1

        cleaned_content = html_to_markdown(raw_html) if raw_html else content

        if need_digest:
            digest = await generate_digest(url, fetched_title, content[:50000], None, llm)
            digest_md = digest.get("markdown", "")
        else:
            digest_md = existing_digest

        # Stocker cleaned_content (et digest si nouveau)
        if cleaned_content:
            try:
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        if need_digest and digest_md:
                            import json as _json
                            cur.execute(
                                "UPDATE items SET digest_markdown=%s, digest_json=%s::jsonb, digest_generated_at=NOW(), cleaned_content=%s WHERE id=%s",
                                (digest_md, _json.dumps(digest.get("json", {})), cleaned_content, item_id)
                            )
                        else:
                            cur.execute(
                                "UPDATE items SET cleaned_content=%s WHERE id=%s",
                                (cleaned_content, item_id)
                            )
                        conn.commit()
            except Exception as save_err:
                logger.warning(f"Could not save content for item {item_id}: {save_err}")

        return {
            "item_id": item_id,
            "url": url,
            "title": fetched_title,
            "current_summary": current_summary,
            "markdown": digest_md,
            "cleaned_content": cleaned_content,
            "json": digest.get("json", {}),
            "content_length": len(content),
            "pages_crawled": pages_crawled,
            "error": digest.get("error"),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ingest-preview for item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/ingest-confirm")
async def ingest_confirm(item_id: int, data: Dict[str, Any]):
    """
    Step 2 of ingestion: save the (possibly edited) digest to DB and index into RAG.
    data: { markdown: str, summary: str (optional override) }
    """
    try:
        markdown = data.get("markdown", "")
        summary_override = data.get("summary", "").strip() or None

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url, title FROM items WHERE id = %s", (item_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        url, title = row

        import json as _json
        digest_json = data.get("json", {})

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE items SET
                        digest_markdown = %s,
                        digest_json = %s::jsonb,
                        digest_generated_at = NOW(),
                        summary = COALESCE(%s, summary),
                        rag_indexed = TRUE,
                        rag_indexed_at = NOW(),
                        updated_at = NOW()
                       WHERE id = %s""",
                    (markdown, _json.dumps(digest_json), summary_override, item_id)
                )
                conn.commit()

        # Index into vector store
        try:
            from argos.services.vector_store_singleton import get_vector_store
            vs = get_vector_store()
            item_data = {
                "id": item_id, "title": title,
                "summary": summary_override or "",
                "workspace_id": None,
            }
            import asyncio
            await asyncio.to_thread(vs.index_item, item_data)
        except Exception as vs_err:
            logger.warning(f"Vector store indexing failed for item {item_id}: {vs_err}")

        return {"success": True, "item_id": item_id, "rag_indexed": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ingest-confirm for item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/ingest")
async def ingest_item(item_id: int):
    """Legacy one-shot ingest (no preview). Kept for backward compat."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url, title FROM items WHERE id = %s", (item_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        url, title = row

        from argos.tools.web_tools import tool_digest
        from argos.services.llm_provider import create_llm_provider

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )
        result = await tool_digest(params={"url": url, "save_item": True}, db=db, llm_provider=llm)

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET rag_indexed = TRUE, rag_indexed_at = NOW() WHERE id = %s",
                    (item_id,)
                )
                conn.commit()

        return {"success": True, "item_id": item_id, "title": title, "rag_indexed": True, "error": result.get("error")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ingesting item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


async def _get_full_content(url: str, title: str, workspace_id: Optional[int] = None) -> str:
    """
    Retourne le contenu complet scrapé d'une URL.
    1. Cherche dans documents (contenu déjà stocké)
    2. Scrape la page si absent, stocke dans documents
    3. Lève HTTPException(422) si scraping impossible — jamais de fallback sur le résumé
    """
    import json as _json
    import hashlib as _hashlib
    import asyncio as _asyncio

    # 1. Documents déjà stockés
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT content_markdown FROM documents WHERE content_json->>'source_url' = %s ORDER BY created_at DESC LIMIT 1",
                (url,)
            )
            row = cur.fetchone()
    if row and row[0]:
        return row[0]

    # 2. Scraping
    def _scrape() -> str:
        import requests as _req
        from html.parser import HTMLParser

        class _Extractor(HTMLParser):
            SKIP = {'script', 'style', 'noscript', 'head', 'nav', 'footer', 'aside'}
            def __init__(self):
                super().__init__()
                self._skip = 0
                self.chunks: list = []
            def handle_starttag(self, tag, attrs):
                if tag in self.SKIP:
                    self._skip += 1
            def handle_endtag(self, tag):
                if tag in self.SKIP and self._skip:
                    self._skip -= 1
            def handle_data(self, data):
                if not self._skip:
                    t = data.strip()
                    if t:
                        self.chunks.append(t)

        resp = _req.get(url, headers={'User-Agent': 'Mozilla/5.0 (compatible; ArgosBot/1.0)'}, timeout=20, verify=False)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding or 'utf-8'
        html = resp.text

        # Playwright fallback si SPA shell
        ext = _Extractor()
        ext.feed(html)
        text = ' '.join(ext.chunks)
        if len(text) < 200:
            try:
                from playwright.sync_api import sync_playwright
                with sync_playwright() as pw:
                    browser = pw.chromium.launch(headless=True, args=["--no-sandbox", "--disable-dev-shm-usage"])
                    page = browser.new_page()
                    page.goto(url, wait_until='domcontentloaded', timeout=45000)
                    html = page.content()
                    page.close()
                    browser.close()
                ext2 = _Extractor()
                ext2.feed(html)
                text = ' '.join(ext2.chunks)
            except Exception as pw_err:
                logger.warning(f"Playwright fallback failed for {url}: {pw_err}")

        if len(text) < 50:
            raise ValueError(f"Contenu insuffisant récupéré ({len(text)} chars)")
        return text

    try:
        full_content = await _asyncio.to_thread(_scrape)
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Impossible de récupérer le contenu de la page : {e}")

    # 3. Stocker dans documents pour les prochains accès
    content_hash = _hashlib.sha256(full_content.encode('utf-8')).hexdigest()
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "INSERT INTO documents (title, doc_type, content_markdown, content_json, workspace_id) VALUES (%s, 'page', %s, %s::jsonb, %s)",
                    (title[:500], full_content, _json.dumps({"source_url": url, "content_hash": content_hash}), workspace_id)
                )
                conn.commit()
    except Exception as store_err:
        logger.warning(f"Could not store scraped document for {url}: {store_err}")

    return full_content


@api_router.post("/items/{item_id}/save")
async def save_item(item_id: int):
    """
    Sauvegarde un item en bibliothèque.
    Scrape le contenu complet si pas encore en base (jamais de fallback sur le résumé).
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url, title FROM items WHERE id=%s", (item_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        url, title = row

        # Garantit que le contenu complet est en base (scrape si absent)
        await _get_full_content(url, title)

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET user_action='saved', updated_at=NOW() WHERE id=%s",
                    (item_id,)
                )
                conn.commit()
        return {"success": True, "item_id": item_id, "user_action": "saved"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/ignore")
async def ignore_item(item_id: int):
    """Mark an item as ignored (user_action='ignored'). Hides it from main feed."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET user_action='ignored', updated_at=NOW() WHERE id=%s RETURNING id",
                    (item_id,)
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Item not found")
                conn.commit()
        return {"success": True, "item_id": item_id, "user_action": "ignored"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ignoring item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/ingest-rag")
async def ingest_item_rag(item_id: int, background_tasks: BackgroundTasks):
    """
    HITL: Ingestion RAG complète — contenu scrapé obligatoire (jamais le résumé).
    Bloque avec 422 si le contenu de la page est inaccessible.
    """
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url, title, digest_markdown FROM items WHERE id=%s", (item_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Item not found")
        url, title, existing_digest = row

        # Contenu complet obligatoire — lève 422 si inaccessible
        full_content = await _get_full_content(url, title)

        from argos.services.digest_generator import generate_digest
        from argos.services.vector_store_singleton import get_vector_store
        from argos.services.knowledge_graph import extract_and_index as kg_extract
        import asyncio as _asyncio
        import json as _json

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        digest_md = existing_digest
        if not digest_md:
            digest = await generate_digest(url or "", title or "", full_content[:3000], None, llm)
            digest_md = digest.get("markdown", "") or full_content[:2000]
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE items SET digest_markdown=%s, digest_json=%s::jsonb, digest_generated_at=NOW() WHERE id=%s",
                        (digest_md, _json.dumps(digest.get("json", {})), item_id)
                    )
                    conn.commit()

        vs = get_vector_store()
        item_data = {"id": item_id, "title": title, "summary": digest_md[:2000], "content": full_content, "workspace_id": None}
        await _asyncio.to_thread(vs.index_item, item_data)

        try:
            await kg_extract(item_id, title, full_content, db=db)
        except Exception as kg_err:
            logger.warning(f"KG extraction failed for item {item_id}: {kg_err}")

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET user_action='ingested', rag_indexed=TRUE, rag_indexed_at=NOW(), updated_at=NOW() WHERE id=%s",
                    (item_id,)
                )
                conn.commit()

        return {"success": True, "item_id": item_id, "user_action": "ingested", "rag_indexed": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error ingesting item {item_id} into RAG: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/batch/save")
async def batch_save_items(data: Dict[str, Any]):
    """
    Sauvegarde plusieurs items en bibliothèque.
    Scrape le contenu complet de chaque page si absent en base.
    """
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(status_code=400, detail="item_ids required")

    results = []
    for item_id in item_ids:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT url, title FROM items WHERE id=%s", (item_id,))
                    row = cur.fetchone()
            if not row:
                results.append({"item_id": item_id, "success": False, "error": "not found"})
                continue
            url, title = row
            await _get_full_content(url, title)
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("UPDATE items SET user_action='saved', updated_at=NOW() WHERE id=%s", (item_id,))
                    conn.commit()
            results.append({"item_id": item_id, "success": True})
        except HTTPException as he:
            results.append({"item_id": item_id, "success": False, "error": he.detail})
        except Exception as e:
            results.append({"item_id": item_id, "success": False, "error": str(e)})

    success_count = sum(1 for r in results if r["success"])
    return {"success": True, "total": len(item_ids), "saved": success_count, "results": results}


@api_router.post("/items/batch/ignore")
async def batch_ignore_items(data: Dict[str, Any]):
    """Marque plusieurs items comme ignorés (user_action='ignored')."""
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(status_code=400, detail="item_ids required")
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET user_action='ignored', updated_at=NOW() WHERE id = ANY(%s)",
                    (item_ids,)
                )
                conn.commit()
        return {"success": True, "updated": len(item_ids)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/translate")
async def translate_item(item_id: int, data: Dict[str, Any]):
    """Traduit le contenu d'un item dans la langue cible via LLM."""
    target_language = (data.get("language") or "").strip()
    if not target_language:
        raise HTTPException(status_code=400, detail="language requis")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT title, cleaned_content, summary FROM items WHERE id = %s",
                (item_id,)
            )
            row = cur.fetchone()

    if not row:
        raise HTTPException(status_code=404, detail="Item introuvable")

    title, cleaned_content, summary = row
    content_to_translate = cleaned_content or summary or ""
    if not content_to_translate:
        raise HTTPException(status_code=422, detail="Aucun contenu à traduire")

    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.default_classification_model,
    )

    system_prompt = f"Tu es un traducteur professionnel. Traduis fidèlement le texte en {target_language}. Conserve le formatage markdown. Ne traduis pas les noms propres, les sigles techniques, ni les termes spécialisés universels. Réponds uniquement avec le texte traduit, sans introduction ni commentaire."
    prompt = f"Traduis ce texte en {target_language} :\n\n{content_to_translate[:20000]}"

    try:
        translated, _ = await llm.generate(
            prompt=prompt,
            system_prompt=system_prompt,
            max_tokens=4000,
            temperature=0.1,
        )
        return {"translated": translated, "language": target_language, "title": title}
    except Exception as e:
        logger.error(f"[TRANSLATE] item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/batch/ingest-rag")
async def batch_ingest_items_rag(data: Dict[str, Any]):
    """
    Ingestion RAG batch — contenu scrapé obligatoire pour chaque item.
    Un item dont la page est inaccessible est marqué failed, les autres continuent.
    """
    item_ids = data.get("item_ids", [])
    if not item_ids:
        raise HTTPException(status_code=400, detail="item_ids required")

    from argos.services.digest_generator import generate_digest
    from argos.services.vector_store_singleton import get_vector_store
    from argos.services.knowledge_graph import extract_and_index as kg_extract
    import asyncio as _asyncio
    import json as _json

    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.aws_bedrock_model,
    )
    vs = get_vector_store()

    results = []
    for item_id in item_ids:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT url, title, digest_markdown FROM items WHERE id=%s", (item_id,))
                    row = cur.fetchone()
            if not row:
                results.append({"item_id": item_id, "success": False, "error": "not found"})
                continue

            url, title, existing_digest = row

            # Contenu complet obligatoire — échoue proprement si inaccessible
            try:
                full_content = await _get_full_content(url, title)
            except HTTPException as he:
                results.append({"item_id": item_id, "success": False, "error": he.detail})
                continue

            digest_md = existing_digest
            if not digest_md:
                digest = await generate_digest(url or "", title or "", full_content[:3000], None, llm)
                digest_md = digest.get("markdown", "") or full_content[:2000]
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE items SET digest_markdown=%s, digest_json=%s::jsonb, digest_generated_at=NOW() WHERE id=%s",
                            (digest_md, _json.dumps(digest.get("json", {})), item_id)
                        )
                        conn.commit()

            item_data = {"id": item_id, "title": title, "summary": digest_md[:2000], "content": full_content, "workspace_id": None}
            await _asyncio.to_thread(vs.index_item, item_data)

            try:
                await kg_extract(item_id, title, full_content, db=db)
            except Exception as kg_err:
                logger.warning(f"KG batch extraction failed for item {item_id}: {kg_err}")

            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE items SET user_action='ingested', rag_indexed=TRUE, rag_indexed_at=NOW(), updated_at=NOW() WHERE id=%s",
                        (item_id,)
                    )
                    conn.commit()

            results.append({"item_id": item_id, "success": True})
            logger.info(f"[BATCH INGEST] item {item_id} OK")

        except Exception as e:
            logger.error(f"[BATCH INGEST] item {item_id} failed: {e}", exc_info=True)
            results.append({"item_id": item_id, "success": False, "error": str(e)})

    success_count = sum(1 for r in results if r["success"])
    return {"success": True, "total": len(item_ids), "ingested": success_count, "results": results}


@api_router.get("/items/{item_id}/content")
async def get_item_content(item_id: int):
    """Retourne le contenu stocké en base pour un item (sans appel LLM ni refetch web)."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT i.id, i.title, i.url, i.summary, i.digest_markdown,
                           i.source_url, i.created_at, i.importance, i.classification_status,
                           s.sujet_id
                    FROM items i
                    LEFT JOIN sources s ON s.url = i.source_url
                    WHERE i.id = %s
                """, (item_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Item introuvable")
                cols = [d[0] for d in cur.description]
                item = dict(zip(cols, row))
                item["created_at"] = item["created_at"].isoformat() if item["created_at"] else None
        return item
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/items/{item_id}/summary")
async def update_item_summary(item_id: int, data: Dict[str, Any]):
    """Update the summary of an item (pre-ingestion editing)."""
    try:
        summary = data.get("summary", "").strip()
        if not summary:
            raise HTTPException(status_code=400, detail="summary is required")
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET summary = %s, updated_at = NOW() WHERE id = %s RETURNING id",
                    (summary, item_id)
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Item not found")
                conn.commit()
        return {"success": True, "item_id": item_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating summary for item {item_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))




@api_router.delete("/items/{item_id}")
async def delete_item(item_id: int):
    """Delete an item."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM items WHERE id = %s", (item_id,))
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Item not found")
                conn.commit()
        
        return {"message": "Item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/preview-upload")
async def preview_upload(file: UploadFile = File(...)):
    """Extract text from uploaded document for preview — does NOT save."""
    try:
        from argos.services.document_extractor import extract_document, SUPPORTED_MIME_TYPES
        mime_type = file.content_type or "application/octet-stream"
        filename = file.filename or "document"
        file_bytes = await file.read()
        if len(file_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux (>50MB)")
        if mime_type == "application/octet-stream":
            ext = filename.lower().rsplit(".", 1)[-1]
            ext_map = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg",
                       "jpeg": "image/jpeg", "webp": "image/webp", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                       "txt": "text/plain", "md": "text/markdown"}
            mime_type = ext_map.get(ext, "text/plain")
        extraction = await extract_document(file_bytes, mime_type, filename, use_vision_for_images=True)
        return {
            "filename": filename,
            "text": extraction.get("text", ""),
            "char_count": extraction.get("char_count", 0),
            "truncated": extraction.get("truncated", False),
            "method": extraction.get("method", "unknown"),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/upload-document")
async def upload_document_as_item(
    file: UploadFile = File(...),
    workspace_id: Optional[int] = None,
):
    """
    Upload a document (PDF, image, DOCX, TXT), extract its text,
    generate a digest via LLM, and save as a classified item.
    """
    try:
        import json as _json
        from argos.services.document_extractor import extract_document, SUPPORTED_MIME_TYPES
        from argos.services.digest_generator import generate_digest
        from argos.services.llm_provider import create_llm_provider

        mime_type = file.content_type or "application/octet-stream"
        filename = file.filename or "document"

        # Read file
        file_bytes = await file.read()
        if len(file_bytes) > 50 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="Fichier trop volumineux (>50MB)")

        # Determine MIME from extension if needed
        if mime_type == "application/octet-stream":
            ext = filename.lower().rsplit(".", 1)[-1]
            ext_map = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg",
                       "jpeg": "image/jpeg", "webp": "image/webp", "tiff": "image/tiff",
                       "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                       "txt": "text/plain", "md": "text/markdown"}
            mime_type = ext_map.get(ext, "text/plain")

        if mime_type not in SUPPORTED_MIME_TYPES and not any(mime_type.startswith(m.split("/")[0]) for m in SUPPORTED_MIME_TYPES):
            raise HTTPException(status_code=415, detail=f"Format non supporté: {mime_type}")

        # Extract text
        extraction = await extract_document(file_bytes, mime_type, filename, use_vision_for_images=True)
        text = extraction.get("text", "")
        method = extraction.get("method", "unknown")

        if not text or len(text.strip()) < 30:
            raise HTTPException(status_code=422,
                detail=f"Impossible d'extraire du texte (méthode: {method}). Le document est peut-être vide ou protégé.")

        # Pseudo-URL for dedup
        import hashlib
        doc_hash = hashlib.md5(file_bytes).hexdigest()[:12]
        pseudo_url = f"upload://{doc_hash}/{filename}"

        # Check if already ingested
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, title FROM items WHERE url = %s", (pseudo_url,))
                existing = cur.fetchone()
        if existing:
            return {"success": True, "already_exists": True, "item_id": existing[0], "title": existing[1]}

        # Generate digest
        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )
        title_hint = filename.rsplit(".", 1)[0].replace("-", " ").replace("_", " ").title()
        digest = await generate_digest(pseudo_url, title_hint, text, workspace_id, llm)
        json_data = digest.get("json", {})

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO items
                       (source_type, source_url, url, title, summary,
                        digest_markdown, digest_json, digest_generated_at,
                        importance, item_type, keywords, classification_status, workspace_id)
                       VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),%s,%s,%s,'classified',%s)
                       RETURNING id, title""",
                    (
                        "manual", pseudo_url, pseudo_url,
                        (json_data.get("title") or title_hint)[:500],
                        json_data.get("summary", "")[:2000],
                        digest.get("markdown", ""),
                        _json.dumps(json_data),
                        json_data.get("importance", "medium"),
                        json_data.get("content_type", "research"),
                        json_data.get("tags", []),
                        workspace_id,
                    ),
                )
                row = cur.fetchone()
                conn.commit()

        await _auto_rag_index(row[0], row[1], json_data.get("summary", ""), json_data.get("digest_markdown", ""))

        return {
            "success": True,
            "item_id": row[0],
            "title": row[1],
            "method": method,
            "char_count": len(text),
            "truncated": extraction.get("truncated", False),
            "rag_indexed": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# RAG Endpoints
# ============================================

@api_router.post("/rag/extract-document")
async def rag_extract_document(
    file: UploadFile = File(...),
    use_vision: bool = Form(default=True),
):
    """
    Extract text from an uploaded document (PDF, image, DOCX, TXT).
    Returns the extracted text to be passed as document_context to /rag/ask.
    """
    from argos.services.document_extractor import extract_document, SUPPORTED_MIME_TYPES

    mime_type = file.content_type or "application/octet-stream"
    short_mime = mime_type.lower().split(";")[0].strip()
    if short_mime not in SUPPORTED_MIME_TYPES and not file.filename.endswith(".docx"):
        raise HTTPException(
            status_code=415,
            detail=f"Type de fichier non supporté : {mime_type}. Formats acceptés : PDF, PNG, JPG, WEBP, TIFF, TXT, DOCX.",
        )

    # Size limit: 20 MB
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Fichier trop volumineux (max 20 Mo).")

    try:
        result = await extract_document(
            file_bytes=content,
            mime_type=mime_type,
            filename=file.filename or "",
            use_vision_for_images=use_vision,
        )
    except Exception as e:
        logger.error(f"Document extraction failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Extraction échouée : {str(e)}")

    if not result["text"]:
        raise HTTPException(
            status_code=422,
            detail="Impossible d'extraire du texte de ce document. Vérifiez que le fichier n'est pas protégé ou vide.",
        )

    return {
        "filename": file.filename,
        "mime_type": mime_type,
        "method": result["method"],
        "char_count": result["char_count"],
        "truncated": result["truncated"],
        "text": result["text"],
    }


@api_router.post("/rag/ask")
async def rag_ask(request: Dict[str, Any]):
    """Ask a question to the RAG system."""
    try:
        query = request.get("query")
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        # Import RAG services
        from argos.services.rag import RAGService
        from argos.services.vector_store_singleton import get_vector_store
        from argos.services.llm_provider import create_llm_provider
        
        # Get pre-loaded VectorStore singleton (fast, no model loading)
        vector_store = get_vector_store()
        
        # Determine model based on provider
        if settings.llm_provider == "aws":
            model = settings.aws_bedrock_model
        else:
            model = settings.default_classification_model
        
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id if settings.llm_provider == "aws" else None,
            aws_secret_access_key=settings.aws_secret_access_key if settings.llm_provider == "aws" else None,
            aws_region=settings.aws_region if settings.llm_provider == "aws" else None,
            openai_api_key=settings.openai_api_key if settings.llm_provider == "openai" else None,
            model=model
        )
        
        rag_service = RAGService(
            llm_provider=llm_provider,
            vector_store=vector_store,
            db_manager=db,
            top_k=8,
            temperature=0.75,
            max_tokens=2500,
            top_p=0.9,
        )
        
        # Optionally prepend extracted document context to the query
        document_context = request.get("document_context", "").strip()
        effective_query = query
        if document_context:
            effective_query = (
                f"[Document joint]\n{document_context}\n\n"
                f"[Question de l'utilisateur]\n{query}"
            )

        workspace_id_raw = request.get("workspace_id")
        workspace_id = int(workspace_id_raw) if workspace_id_raw is not None else None

        # Ask question
        result = await rag_service.ask(
            query=effective_query,
            use_hybrid_search=request.get("use_hybrid_search", True),
            workspace_id=workspace_id
        )
        
        # Return result (RAGService returns all required fields)
        return {
            "answer": result.get("answer", ""),
            "sources": result.get("sources", []),
            "confidence": result.get("confidence_score", 0.0),
            "tokens_used": result.get("tokens_used", 0),
            "cost_usd": result.get("cost_usd", 0.0),
            "model": result.get("model", "unknown")
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG ask: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/rag/history")
async def rag_history(limit: int = Query(default=20, ge=1, le=100)):
    """Get RAG query history."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, query, answer, sources, created_at
                    FROM rag_queries
                    ORDER BY created_at DESC
                    LIMIT %s
                """, (limit,))
                
                history = []
                for row in cur.fetchall():
                    history.append({
                        "id": row[0],
                        "query": row[1],
                        "answer": row[2],
                        "sources": row[3],  # JSONB field
                        "created_at": row[4].isoformat() if row[4] else None
                    })
                
                return history
    except Exception as e:
        logger.error(f"Error fetching RAG history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/rag/history")
async def clear_rag_history():
    """Clear all RAG query history."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM rag_queries")
                deleted_count = cur.rowcount
                conn.commit()
                logger.info(f"Cleared {deleted_count} RAG history entries")
                return {"message": f"Historique effacé ({deleted_count} entrées)", "deleted": deleted_count}
    except Exception as e:
        logger.error(f"Error clearing RAG history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/rag/index-all-items")
async def index_all_items():
    """Index all classified items with a digest into the RAG vector store."""
    try:
        from argos.services.vector_store_singleton import get_vector_store

        vector_store = get_vector_store()

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, summary, digest_markdown, workspace_id
                    FROM items
                    WHERE classification_status = 'classified'
                      AND digest_json IS NOT NULL
                    ORDER BY created_at DESC
                """)
                items = [
                    {"id": r[0], "title": r[1], "summary": r[2], "content": r[3] or r[2] or "", "workspace_id": r[4]}
                    for r in cur.fetchall()
                ]

        if not items:
            return {"message": "No items to index", "indexed": 0, "total_chunks": 0}

        total_chunks = 0
        indexed = 0
        errors = []

        for item in items:
            try:
                n = vector_store.index_item(item)
                total_chunks += n
                indexed += 1
            except Exception as e:
                logger.error(f"Error indexing item {item['id']}: {e}")
                errors.append({"item_id": item["id"], "error": str(e)})

        return {
            "message": f"Indexed {indexed} items with {total_chunks} chunks",
            "indexed": indexed,
            "total_chunks": total_chunks,
            "errors": errors if errors else None,
        }

    except Exception as e:
        logger.error(f"Error indexing items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/rag/rebuild")
async def rebuild_rag():
    """
    Vide LanceDB et réindexe uniquement depuis digest_markdown (fallback: summary).
    Ignore le contenu brut scrappe pour éviter le bruit.
    """
    try:
        from argos.services.vector_store_singleton import get_vector_store
        import asyncio as _asyncio

        vector_store = get_vector_store()

        # 1. Vider LanceDB
        if vector_store.table_name in vector_store.db.table_names():
            vector_store.db.drop_table(vector_store.table_name)
            logger.info("LanceDB table dropped for rebuild")

        # 2. Marquer tous les items comme non indexés
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE items SET rag_indexed=FALSE, rag_indexed_at=NULL")
                conn.commit()

        # 3. Récupérer les items avec digest_markdown ou summary
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, digest_markdown, summary, workspace_id
                    FROM items
                    WHERE classification_status = 'classified'
                      AND (digest_markdown IS NOT NULL OR summary IS NOT NULL)
                    ORDER BY created_at DESC
                """)
                rows = cur.fetchall()

        if not rows:
            return {"message": "Aucun item à indexer", "indexed": 0, "total_chunks": 0}

        # 4. Réindexer depuis digest_markdown en priorité
        indexed = 0
        total_chunks = 0
        errors = []
        ids_indexed = []

        for item_id, title, digest_md, summary, workspace_id in rows:
            content = (digest_md or summary or "").strip()
            if not content:
                continue
            try:
                n = await _asyncio.to_thread(
                    vector_store.index_item,
                    {"id": item_id, "title": title or "", "summary": content[:2000], "content": content, "workspace_id": workspace_id}
                )
                total_chunks += n
                indexed += 1
                ids_indexed.append(item_id)
            except Exception as e:
                logger.error(f"Rebuild: erreur item {item_id}: {e}")
                errors.append({"item_id": item_id, "error": str(e)})

        # 5. Marquer comme indexés en BDD
        if ids_indexed:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "UPDATE items SET rag_indexed=TRUE, rag_indexed_at=NOW() WHERE id = ANY(%s)",
                        (ids_indexed,)
                    )
                    conn.commit()

        logger.info(f"RAG rebuild terminé: {indexed} items, {total_chunks} chunks")
        return {
            "message": f"Rebuild terminé — {indexed} items indexés depuis digest_markdown ({total_chunks} chunks)",
            "indexed": indexed,
            "total_chunks": total_chunks,
            "errors": errors if errors else None,
        }

    except Exception as e:
        logger.error(f"Erreur rebuild RAG: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/kg/nodes")
async def kg_list_nodes(
    type: Optional[str] = Query(default=None),
    tension: Optional[bool] = Query(default=None),
    validated: Optional[bool] = Query(default=None),
    limit: int = Query(default=100, le=500),
):
    """Liste les nœuds du Knowledge Graph."""
    try:
        conditions = []
        params: list = []
        if type:
            conditions.append("type = %s"); params.append(type)
        if tension is not None:
            conditions.append("tension_flag = %s"); params.append(tension)
        if validated is not None:
            conditions.append("hitl_validated = %s"); params.append(validated)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""
        params.append(limit)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, label, type, confidence_score, source_count,
                           hitl_validated, tension_flag, item_ids,
                           first_seen_at, last_updated_at
                    FROM kg_nodes {where}
                    ORDER BY source_count DESC, last_updated_at DESC
                    LIMIT %s
                """, params)
                cols = [d[0] for d in cur.description]
                nodes = [dict(zip(cols, r)) for r in cur.fetchall()]
                for n in nodes:
                    n["first_seen_at"] = n["first_seen_at"].isoformat() if n["first_seen_at"] else None
                    n["last_updated_at"] = n["last_updated_at"].isoformat() if n["last_updated_at"] else None
        return {"nodes": nodes, "count": len(nodes)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/kg/edges")
async def kg_list_edges(node_id: Optional[int] = Query(default=None), limit: int = Query(default=200, le=1000)):
    """Liste les arêtes du Knowledge Graph, optionnellement filtrées par nœud."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                if node_id:
                    cur.execute("""
                        SELECT e.id, e.source_node_id, n1.label as source_label,
                               e.target_node_id, n2.label as target_label,
                               e.relation_type, e.weight
                        FROM kg_edges e
                        JOIN kg_nodes n1 ON n1.id = e.source_node_id
                        JOIN kg_nodes n2 ON n2.id = e.target_node_id
                        WHERE e.source_node_id = %s OR e.target_node_id = %s
                        ORDER BY e.weight DESC LIMIT %s
                    """, (node_id, node_id, limit))
                else:
                    cur.execute("""
                        SELECT e.id, e.source_node_id, n1.label as source_label,
                               e.target_node_id, n2.label as target_label,
                               e.relation_type, e.weight
                        FROM kg_edges e
                        JOIN kg_nodes n1 ON n1.id = e.source_node_id
                        JOIN kg_nodes n2 ON n2.id = e.target_node_id
                        ORDER BY e.weight DESC LIMIT %s
                    """, (limit,))
                cols = [d[0] for d in cur.description]
                edges = [dict(zip(cols, r)) for r in cur.fetchall()]
        return {"edges": edges, "count": len(edges)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/kg/nodes/{node_id}")
async def kg_update_node(node_id: int, data: Dict[str, Any]):
    """Valider ou marquer en tension un nœud (HITL)."""
    try:
        fields = []
        params = []
        if "hitl_validated" in data:
            fields.append("hitl_validated = %s"); params.append(data["hitl_validated"])
            if data["hitl_validated"]:
                fields.append("confidence_score = LEAST(confidence_score + 0.2, 1.0)")
        if "tension_flag" in data:
            fields.append("tension_flag = %s"); params.append(data["tension_flag"])
        if not fields:
            raise HTTPException(status_code=400, detail="Nothing to update")
        fields.append("last_updated_at = NOW()")
        params.append(node_id)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"UPDATE kg_nodes SET {', '.join(fields)} WHERE id = %s RETURNING id", params)
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Node not found")
                conn.commit()
        return {"ok": True, "node_id": node_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/kg/rebuild")
async def kg_rebuild():
    """Reconstruit le Knowledge Graph depuis tous les items avec digest_markdown."""
    try:
        from argos.services.knowledge_graph import extract_and_index as kg_extract

        # Vider le KG existant
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("TRUNCATE kg_node_sources, kg_edges, kg_nodes RESTART IDENTITY CASCADE")
                conn.commit()

        # Récupérer tous les items avec cleaned_content (fallback: digest_markdown)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, title, COALESCE(cleaned_content, digest_markdown), source_url
                    FROM items
                    WHERE (cleaned_content IS NOT NULL OR digest_markdown IS NOT NULL)
                      AND classification_status = 'classified'
                    ORDER BY created_at DESC
                    LIMIT 200
                """)
                rows = cur.fetchall()

        processed = 0
        for item_id, title, content, source_url in rows:
            await kg_extract(item_id, title or "", content or "", source_url or "", db=db)
            processed += 1

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM kg_nodes")
                node_count = cur.fetchone()[0]
                cur.execute("SELECT COUNT(*) FROM kg_edges")
                edge_count = cur.fetchone()[0]

        return {
            "message": f"KG reconstruit — {node_count} nœuds, {edge_count} relations depuis {processed} items",
            "nodes": node_count,
            "edges": edge_count,
            "items_processed": processed,
        }
    except Exception as e:
        logger.error(f"KG rebuild error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/rag/stats")
async def rag_stats():
    """Get RAG system statistics."""
    try:
        from argos.services.vector_store_singleton import get_vector_store

        vector_store = get_vector_store()
        stats = vector_store.get_stats()

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM items WHERE rag_indexed = TRUE")
                indexed_items = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM rag_queries")
                total_queries = cur.fetchone()[0]

        return {
            "vector_store": stats,
            "indexed_items": indexed_items,
            "total_queries": total_queries,
            "embedding_model": settings.embedding_model,
            "lancedb_path": str(settings.lancedb_path)
        }
        
    except Exception as e:
        logger.error(f"Error fetching RAG stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# Sources Endpoints
# ===========================================

@api_router.get("/sources")
async def list_sources(
    type: Optional[str] = Query(None, description="Filter by source type (rss, github, api)"),
    category: Optional[str] = Query(None, description="Filter by category"),
    active: Optional[bool] = Query(None, description="Filter by active status"),
    workspace_id: Optional[int] = Query(None, description="Filter by workspace ID"),
    limit: int = Query(100, ge=1, le=500)
):
    """List all data sources with optional filters."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Build query with filters
                conditions = []
                params = []
                
                if type:
                    conditions.append("type = %s")
                    params.append(type)
                
                if category:
                    conditions.append("category = %s")
                    params.append(category)
                
                if active is not None:
                    conditions.append("active = %s")
                    params.append(active)
                
                if workspace_id is not None:
                    conditions.append("workspace_id = %s")
                    params.append(workspace_id)
                
                where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""
                
                cur.execute(f"""
                    SELECT 
                        id, name, url, type, category, description, 
                        tags, active, created_at, updated_at
                    FROM sources
                    {where_clause}
                    ORDER BY created_at DESC
                    LIMIT %s
                """, params + [limit])
                
                rows = cur.fetchall()
                sources = []
                for row in rows:
                    sources.append({
                        "id": row[0],
                        "name": row[1],
                        "url": row[2],
                        "type": row[3],
                        "category": row[4],
                        "description": row[5],
                        "tags": row[6] or [],
                        "active": row[7],
                        "createdAt": row[8].isoformat() if row[8] else None,
                        "updatedAt": row[9].isoformat() if row[9] else None
                    })
                
                return {"sources": sources, "total": len(sources)}
    except Exception as e:
        logger.error(f"Error listing sources: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/sources/{source_id}")
async def get_source(source_id: int):
    """Get details of a specific source."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, name, url, type, category, description, 
                        tags, active, created_at, updated_at
                    FROM sources
                    WHERE id = %s
                """, (source_id,))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Source not found")
                
                return {
                    "id": row[0],
                    "name": row[1],
                    "url": row[2],
                    "type": row[3],
                    "category": row[4],
                    "description": row[5],
                    "tags": row[6] or [],
                    "active": row[7],
                    "createdAt": row[8].isoformat() if row[8] else None,
                    "updatedAt": row[9].isoformat() if row[9] else None
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources")
async def create_source(source: Dict[str, Any], background_tasks: BackgroundTasks):
    """Create a new data source."""
    try:
        # Validate required fields
        required_fields = ["name", "url", "type", "category"]
        for field in required_fields:
            if field not in source:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate type
        if source["type"] not in ["rss", "github", "api", "website"]:
            raise HTTPException(status_code=400, detail="Invalid type. Must be rss, github, api, or website")

        # workspace_id is required — no silent default
        workspace_id = source.get("workspace_id")
        if not workspace_id:
            raise HTTPException(status_code=400, detail="workspace_id is required to create a source")

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sources (name, url, type, category, description, tags, active, workspace_id)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    source["name"],
                    source["url"],
                    source["type"],
                    source["category"],
                    source.get("description", ""),
                    source.get("tags", []),
                    source.get("active", True),
                    workspace_id
                ))
                
                source_id = cur.fetchone()[0]
                conn.commit()

                if source.get("active", True):
                    background_tasks.add_task(_auto_collect_and_classify, source_id)

                return {"id": source_id, "message": "Source created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/sources/{source_id}/toggle")
async def toggle_source(source_id: int, data: Dict[str, Any], background_tasks: BackgroundTasks):
    """Toggle source active status."""
    try:
        active = data.get("active")
        if active is None:
            raise HTTPException(status_code=400, detail="Missing 'active' field")
        
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE sources
                    SET active = %s, updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                    RETURNING id
                """, (active, source_id))
                
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")
                
                conn.commit()

                if active:
                    background_tasks.add_task(_auto_collect_and_classify, source_id)

                return {"message": "Source updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/sources/{source_id}")
async def update_source(source_id: int, data: Dict[str, Any]):
    """Update a data source's fields."""
    try:
        allowed = ['name', 'url', 'type', 'category', 'description', 'tags']
        updates = {k: v for k, v in data.items() if k in allowed}
        if not updates:
            raise HTTPException(status_code=400, detail="No valid fields to update")
        if 'type' in updates and updates['type'] not in ['rss', 'github', 'api', 'website']:
            raise HTTPException(status_code=400, detail="Invalid type")
        set_clause = ', '.join(f"{k} = %s" for k in updates)
        params = list(updates.values()) + [source_id]
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE sources SET {set_clause}, updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING id",
                    params
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")
                conn.commit()
        return {"message": "Source updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/sources/{source_id}")
async def delete_source(source_id: int):
    """Delete a data source."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    DELETE FROM sources
                    WHERE id = %s
                    RETURNING id
                """, (source_id,))
                
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")
                
                conn.commit()
                
                return {"message": "Source deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources/{source_id}/collect")
async def collect_from_source(source_id: int):
    """Manually trigger content collection for a specific source."""
    try:
        # Load source from DB
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, url, type, workspace_id FROM sources WHERE id = %s",
                    (source_id,)
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Source not found")
                src_id, src_name, src_url, src_type, src_wid = row

        from argos.services.collector import CollectorService
        collector = CollectorService(db_manager=db)

        items: list = []
        if src_type == 'rss':
            config = {"url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_rss_feed(config)
            for item in items:
                item['workspace_id'] = src_wid
                item['source_url'] = src_url
        elif src_type == 'website':
            import asyncio
            items = await asyncio.to_thread(collector.fetch_website_page, src_url, workspace_id=src_wid)
        elif src_type == 'github':
            config = {"type": "github", "url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_github_repos(config)
            for item in items:
                item['workspace_id'] = src_wid
                item['source_url'] = src_url
        else:
            return {"message": f"Type '{src_type}' not supported for manual collection", "fetched": 0, "inserted": 0, "duplicates": 0}

        inserted, duplicates = collector.insert_items(items)
        return {
            "message": "Collection terminée",
            "source_id": source_id,
            "fetched": len(items),
            "inserted": inserted,
            "duplicates": duplicates,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error collecting source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources/pipeline/all")
async def pipeline_all_sources(background_tasks: BackgroundTasks, data: Dict[str, Any] = {}):
    """Lance le pipeline complet (collect → classify → score → RAG) sur toutes les sources actives."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM sources WHERE active = TRUE ORDER BY id")
                ids = [r[0] for r in cur.fetchall()]

        if not ids:
            return {"message": "Aucune source active", "count": 0}

        async def _run_all():
            from argos.services.pipeline import run_pipeline_for_source
            for src_id in ids:
                try:
                    await run_pipeline_for_source(src_id)
                except Exception as e:
                    logger.warning(f"[PIPELINE-ALL] source {src_id} : {e}")

        background_tasks.add_task(_run_all)
        return {"message": f"Pipeline lancé sur {len(ids)} source(s)", "count": len(ids), "source_ids": ids}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources/{source_id}/pipeline")
async def pipeline_one_source(source_id: int, background_tasks: BackgroundTasks):
    """Lance le pipeline complet (collect → classify → score → RAG) sur une source."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id FROM sources WHERE id = %s", (source_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Source not found")

        background_tasks.add_task(_auto_collect_and_classify, source_id)
        return {"message": "Pipeline lancé", "source_id": source_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/workspaces/{workspace_id}/collect")
async def collect_workspace_sources(workspace_id: int):
    """Trigger collection for ALL active sources of a workspace."""
    try:
        from argos.services.collector import CollectorService
        collector = CollectorService(db_manager=db)
        stats = collector.fetch_from_db_sources(workspace_id=workspace_id)
        return {
            "message": "Collection complète",
            "workspace_id": workspace_id,
            **stats,
        }
    except Exception as e:
        logger.error(f"Error collecting workspace {workspace_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# Monitor Endpoints — surveillance de sites web
# ===========================================

@api_router.patch("/sources/{source_id}/monitor")
async def update_monitor_settings(source_id: int, data: Dict[str, Any]):
    """
    Met à jour les paramètres de surveillance d'une source website.
    Champs acceptés : monitor_enabled (bool), check_interval_minutes (int >= 5).
    """
    try:
        allowed = {"monitor_enabled": bool, "check_interval_minutes": int}
        updates: Dict[str, Any] = {}

        if "monitor_enabled" in data:
            val = data["monitor_enabled"]
            if not isinstance(val, bool):
                raise HTTPException(status_code=400, detail="monitor_enabled must be a boolean")
            updates["monitor_enabled"] = val

        if "check_interval_minutes" in data:
            val = int(data["check_interval_minutes"])
            if val < 5:
                raise HTTPException(status_code=400, detail="check_interval_minutes must be >= 5")
            updates["check_interval_minutes"] = val

        if not updates:
            raise HTTPException(status_code=400, detail="No valid monitor fields provided")

        set_clause = ", ".join(f"{k} = %s" for k in updates)
        params = list(updates.values()) + [source_id]

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""
                    UPDATE sources
                    SET {set_clause}, updated_at = NOW()
                    WHERE id = %s
                    RETURNING id, type
                    """,
                    params,
                )
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Source not found")
                if row[1] != "website":
                    conn.rollback()
                    raise HTTPException(
                        status_code=400,
                        detail="La surveillance n'est disponible que pour les sources de type 'website'"
                    )
                conn.commit()

        return {"message": "Paramètres de surveillance mis à jour", "source_id": source_id, **updates}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating monitor settings for source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/sources/{source_id}/check-monitor")
async def check_source_monitor(source_id: int, background_tasks: BackgroundTasks):
    """
    Déclenche manuellement la vérification de changement de contenu
    pour une source website surveillée.
    """
    try:
        from argos.services.site_monitor import get_site_monitor, SiteMonitorService

        monitor = get_site_monitor()
        if monitor is None:
            monitor = SiteMonitorService(db_manager=db)

        async def _run():
            result = await monitor.check_source(source_id)
            logger.info(f"[monitor] check-monitor result: {result}")

        background_tasks.add_task(_run)
        return {"message": "Vérification lancée en arrière-plan", "source_id": source_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error triggering monitor check for source {source_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/monitors/check-all")
async def check_all_monitors(background_tasks: BackgroundTasks):
    """
    Déclenche manuellement la vérification de toutes les sources website
    avec monitor_enabled=True dont l'intervalle est écoulé.
    """
    try:
        from argos.services.site_monitor import get_site_monitor, SiteMonitorService

        monitor = get_site_monitor()
        if monitor is None:
            monitor = SiteMonitorService(db_manager=db)

        async def _run():
            results = await monitor.check_all_sources()
            changed = sum(1 for r in results if r.get("changed"))
            logger.info(f"[monitor] check-all: {len(results)} vérifié(es), {changed} changement(s)")

        background_tasks.add_task(_run)
        return {"message": "Vérification globale lancée en arrière-plan"}

    except Exception as e:
        logger.error(f"Error triggering global monitor check: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Admin Endpoints (codebase ingestion + auto-diag)
# ============================================

def _check_admin(token: Optional[str]):
    """Raise 403 if admin token is invalid or not configured."""
    if not settings.admin_token:
        raise HTTPException(status_code=503, detail="Admin access not configured (ADMIN_TOKEN not set)")
    if token != settings.admin_token:
        raise HTTPException(status_code=403, detail="Invalid admin token")


# Files to index from the codebase (relative to /app)
_CODEBASE_EXTENSIONS = {".py", ".ts", ".tsx", ".sql", ".yaml", ".yml", ".md", ".sh", ".json"}
_CODEBASE_ROOTS = [
    Path("/app/argos"),
    Path("/app/docs"),
    Path("/app/database"),
    Path("/app/scripts"),
    Path("/app/workflows"),
    Path("/app/migrations"),
    Path("/app/n8n"),
    Path("/app/frontend/src"),
    Path("/app/config"),
]
# Root-level .md files via the full project_root mount (README, CAHIER_DES_CHARGES, etc.)
_CODEBASE_ROOT_LEVEL = Path("/app/project_root")
# Subdirs to skip when walking project_root (already covered by specific roots above)
_CODEBASE_SKIP_DIRS = {"__pycache__", ".git", "node_modules", "dist", ".venv", "venv", "__snapshots__", ".cache"}
_CODEBASE_SKIP_DIRS_ROOT = _CODEBASE_SKIP_DIRS | {"argos", "docs", "database", "scripts", "workflows", "migrations", "n8n", "frontend", "config", "data", "logs", "tests", "lancedb"}
_CODEBASE_SKIP_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
_CODEBASE_MAX_FILE_BYTES = 300_000  # skip very large files


def _walk_codebase():
    """Yield (relative_path, content) for all indexable source files."""
    from pathlib import Path as _Path
    for root in _CODEBASE_ROOTS:
        root_path = _Path(root)
        if not root_path.exists():
            continue
        for fpath in root_path.rglob("*"):
            if fpath.is_dir():
                continue
            # Skip ignored dirs
            if any(part in _CODEBASE_SKIP_DIRS for part in fpath.parts):
                continue
            if fpath.suffix not in _CODEBASE_EXTENSIONS:
                continue
            if fpath.name in _CODEBASE_SKIP_FILES:
                continue
            if fpath.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                continue
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                rel = str(fpath.relative_to("/app"))
                yield rel, content
            except Exception:
                pass

    # Also index root-level files (README, CAHIER_DES_CHARGES, SOLUTIONS, etc.)
    if _CODEBASE_ROOT_LEVEL.exists():
        for fpath in _CODEBASE_ROOT_LEVEL.iterdir():
            if fpath.is_dir():
                # skip subdirs already covered
                if fpath.name in _CODEBASE_SKIP_DIRS_ROOT:
                    continue
                # recurse one level for any unexpected subdir not covered above
                for sub in fpath.rglob("*"):
                    if sub.is_dir() or sub.suffix not in _CODEBASE_EXTENSIONS:
                        continue
                    if sub.name in _CODEBASE_SKIP_FILES:
                        continue
                    if sub.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                        continue
                    try:
                        content = sub.read_text(encoding="utf-8", errors="replace")
                        yield f"project_root/{sub.relative_to(_CODEBASE_ROOT_LEVEL)}", content
                    except Exception:
                        pass
                continue
            if fpath.suffix not in _CODEBASE_EXTENSIONS:
                continue
            if fpath.name in _CODEBASE_SKIP_FILES:
                continue
            if fpath.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                continue
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                yield f"project_root/{fpath.name}", content
            except Exception:
                pass


@api_router.post("/admin/ingest-codebase")
async def admin_ingest_codebase(
    background_tasks: BackgroundTasks,
    x_admin_token: Optional[str] = Header(default=None)
):
    """Index the entire Argos codebase into the RAG vector store."""
    _check_admin(x_admin_token)

    async def _run():
        from argos.services.vector_store_singleton import get_vector_store
        vector_store = get_vector_store()
        # Clear previous codebase index
        vector_store.delete_codebase()
        total_files = 0
        total_chunks = 0
        for rel_path, content in _walk_codebase():
            try:
                n = vector_store.index_codebase_file(rel_path, content)
                total_chunks += n
                total_files += 1
            except Exception as exc:
                logger.warning(f"[admin] skip {rel_path}: {exc}")
        logger.info(f"[admin] codebase ingestion done: {total_files} files, {total_chunks} chunks")

    background_tasks.add_task(_run)
    return {"message": "Ingestion du code source lancée en arrière-plan"}


@api_router.get("/admin/codebase-stats")
async def admin_codebase_stats(
    x_admin_token: Optional[str] = Header(default=None)
):
    """Return stats about the indexed codebase."""
    _check_admin(x_admin_token)
    try:
        from argos.services.vector_store_singleton import get_vector_store
        vector_store = get_vector_store()
        if vector_store.table_name in vector_store.db.table_names():
            table = vector_store.db.open_table(vector_store.table_name)
            rows = table.search().where("source_type = 'codebase'").limit(100000).to_list()
            files = list({r["title"] for r in rows})
            return {
                "chunks": len(rows),
                "files": len(files),
                "file_list": sorted(files),
            }
        return {"chunks": 0, "files": 0, "file_list": []}
    except Exception as e:
        logger.error(f"Error fetching codebase stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/rag-diag")
async def admin_rag_diag(
    request: Dict[str, Any],
    x_admin_token: Optional[str] = Header(default=None)
):
    """RAG query scoped to the indexed codebase — for auto-diagnostics."""
    _check_admin(x_admin_token)
    query = request.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="query is required")
    try:
        from argos.services.vector_store_singleton import get_vector_store
        from argos.services.rag import RAGService

        vector_store = get_vector_store()
        if settings.llm_provider == "aws":
            model = settings.aws_bedrock_model
        else:
            model = settings.default_classification_model

        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id if settings.llm_provider == "aws" else None,
            aws_secret_access_key=settings.aws_secret_access_key if settings.llm_provider == "aws" else None,
            aws_region=settings.aws_region if settings.llm_provider == "aws" else None,
            openai_api_key=settings.openai_api_key if settings.llm_provider == "openai" else None,
            model=model
        )

        # Override the system prompt for code-focused diagnostics
        rag = RAGService(
            llm_provider=llm_provider,
            vector_store=vector_store,
            db_manager=db,
            top_k=request.get("top_k", 8),
            temperature=0.3,
            max_tokens=1200
        )

        result = await rag.ask(
            query=query,
            use_hybrid_search=True,
            filter_source_type="codebase",
            workspace_id=None
        )
        return {
            "answer": result.get("answer", ""),
            "sources": result.get("sources", []),
            "confidence": result.get("confidence_score", 0.0),
        }
    except Exception as e:
        logger.error(f"Error in admin RAG diag: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/tag-content")
async def admin_tag_content(
    request: Dict[str, Any] = {},
    x_admin_token: Optional[str] = Header(default=None)
):
    """Déclenche le content tagging veille/apprentissage sur les items eligibles sans tag."""
    _check_admin(x_admin_token)
    try:
        from argos.services.content_tagger import tag_items_batch

        sujet_id = request.get("sujet_id")
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                query = """
                    SELECT id FROM items
                    WHERE importance IN ('medium', 'high', 'critical')
                      AND cleaned_content IS NOT NULL
                      AND content_tagged_at IS NULL
                """
                params = []
                if sujet_id:
                    query += " AND sujet_id = %s"
                    params.append(sujet_id)
                query += " ORDER BY created_at DESC LIMIT 100"
                cur.execute(query, params)
                to_tag = [r[0] for r in cur.fetchall()]

        if not to_tag:
            return {"tagged": 0, "skipped": 0, "failed": 0, "message": "Aucun item à tagger"}

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model,
        )
        stats = await tag_items_batch(to_tag, db, llm)
        return {**stats, "total_eligible": len(to_tag)}
    except Exception as e:
        logger.error(f"Error in admin tag-content: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/admin/fetch-and-tag")
async def admin_fetch_and_tag(
    background_tasks: BackgroundTasks,
    request: Dict[str, Any] = {},
    x_admin_token: Optional[str] = Header(default=None),
):
    """
    Récupère le contenu complet des articles sans texte, puis les classe veille/apprentissage.
    Traitement en arrière-plan — répond immédiatement.
    """
    _check_admin(x_admin_token)
    sujet_id = request.get("sujet_id")

    with db.get_connection() as conn:
        with conn.cursor() as cur:
            q = """
                SELECT id, url FROM items
                WHERE cleaned_content IS NULL
                  AND classification_status = 'classified'
            """
            params = []
            if sujet_id:
                q += " AND sujet_id = %s"
                params.append(sujet_id)
            q += " ORDER BY created_at DESC LIMIT 100"
            cur.execute(q, params)
            rows = cur.fetchall()

    item_ids = [r[0] for r in rows]
    if not item_ids:
        return {"status": "nothing_to_do", "count": 0}

    async def _run():
        from argos.services.web_browser import browse_with_playwright, html_to_markdown
        from argos.services.content_tagger import tag_items_batch

        fetched = 0
        for item_id, url in rows:
            try:
                result = await browse_with_playwright(url)
                if not result or result.get("error"):
                    continue
                raw_html = result.get("html") or result.get("content") or ""
                if not raw_html:
                    continue
                cleaned = html_to_markdown(raw_html)
                if not cleaned or len(cleaned) < 200:
                    continue
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            "UPDATE items SET cleaned_content = %s WHERE id = %s",
                            (cleaned, item_id)
                        )
                        conn.commit()
                fetched += 1
                logger.info(f"[FETCH-TAG] Item {item_id} — contenu récupéré ({len(cleaned)} chars)")
            except Exception as e:
                logger.warning(f"[FETCH-TAG] Item {item_id} — échec scraping : {e}")

        logger.info(f"[FETCH-TAG] Scraping terminé — {fetched}/{len(rows)} articles récupérés")

        if fetched:
            llm = create_llm_provider(
                provider_type=settings.llm_provider,
                openai_api_key=settings.openai_api_key,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                aws_region=settings.aws_region,
                model=settings.default_classification_model,
            )
            stats = await tag_items_batch(item_ids, db, llm)
            logger.info(f"[FETCH-TAG] Classification terminée — {stats}")

    background_tasks.add_task(_run)
    return {"status": "started", "count": len(item_ids)}


# ===========================================
# Web Tools Endpoints — REST wrappers for web.browse / web.search / web.digest
# ===========================================

@api_router.post("/web/browse")
async def web_browse(request: Dict[str, Any]):
    """Fetch a URL with headless browser (Playwright + stealth)."""
    try:
        from argos.tools.web_tools import tool_browse
        from argos.services.llm_provider import create_llm_provider

        result = await tool_browse(params=request, db=db)
        return result
    except Exception as e:
        logger.error(f"Error in web browse: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/web/digest")
async def web_digest(request: Dict[str, Any]):
    """Browse a URL and generate a markdown + JSON digest via LLM."""
    try:
        from argos.tools.web_tools import tool_digest
        from argos.services.llm_provider import create_llm_provider

        try:
            llm = create_llm_provider(
                provider_type=settings.llm_provider,
                openai_api_key=settings.openai_api_key,
                aws_access_key_id=settings.aws_access_key_id,
                aws_secret_access_key=settings.aws_secret_access_key,
                aws_region=settings.aws_region,
                model=settings.aws_bedrock_model if settings.llm_provider == "aws" else settings.default_classification_model
            )
        except Exception:
            llm = None

        result = await tool_digest(params=request, db=db, llm_provider=llm)
        return result
    except Exception as e:
        logger.error(f"Error in web digest: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/web/browse/history")
async def web_browse_history(
    workspace_id: Optional[int] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100)
):
    """Recent browse sessions."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                args = []
                where = ""
                if workspace_id is not None:
                    where = "WHERE workspace_id = %s"
                    args.append(workspace_id)
                cur.execute(
                    f"""SELECT id, url, status, title, content_length, engine, duration_ms, created_at
                        FROM browse_sessions {where}
                        ORDER BY created_at DESC LIMIT %s""",
                    args + [limit]
                )
                rows = cur.fetchall()
        return [
            {
                "id": r[0], "url": r[1], "status": r[2], "title": r[3],
                "content_length": r[4], "engine": r[5], "duration_ms": r[6],
                "created_at": r[7].isoformat() if r[7] else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching browse history: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/recent-activity")
async def get_recent_activity(
    limit: int = Query(default=20, ge=1, le=100),
    workspace_id: Optional[int] = Query(default=None),
):
    """Unified recent activity feed: items + browse_sessions + search_sessions."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                ws_filter = "AND workspace_id = %(ws)s" if workspace_id is not None else ""
                params = {"limit": limit, "ws": workspace_id}
                cur.execute(f"""
                    SELECT * FROM (
                        SELECT
                            id, title, url AS ref, 'item' AS kind,
                            item_type AS sub, created_at
                        FROM items
                        WHERE 1=1 {ws_filter}
                        UNION ALL
                        SELECT
                            id, COALESCE(NULLIF(title,''), url) AS title,
                            url AS ref, 'browse' AS kind,
                            engine AS sub, created_at
                        FROM browse_sessions
                        WHERE 1=1 {ws_filter}
                        UNION ALL
                        SELECT
                            id, query AS title,
                            NULL AS ref, 'search' AS kind,
                            engine AS sub, created_at
                        FROM search_sessions
                        WHERE 1=1 {ws_filter}
                    ) combined
                    ORDER BY created_at DESC
                    LIMIT %(limit)s
                """, params)
                rows = cur.fetchall()
        return [
            {
                "id": r[0], "title": r[1], "ref": r[2],
                "kind": r[3], "sub": r[4],
                "created_at": r[5].isoformat() if r[5] else None,
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching recent activity: {e}")
        raise HTTPException(status_code=500, detail=str(e))




# ============================================
# Documents — Bibliothèque
# ============================================

_DOC_SYSTEM = """Tu es un expert en veille technologique et rédaction structurée.
Génère un document professionnel en français, bien structuré en markdown.
Utilise des exemples concrets, des analogies, des listes numérotées quand pertinent.
Ne fabrique pas d'informations qui ne sont pas dans les sources fournies.

RÈGLES ABSOLUES :
- Si l'utilisateur demande une longueur minimale (ex: "10 pages", "5000 mots"), tu DOIS respecter cette contrainte. Un refus ou un raccourci est inacceptable.
- Si l'utilisateur demande un angle spécifique (ex: "pour dev IA", "avec exemples concrets"), TOUS les exemples et explications doivent adopter cet angle.
- Développe chaque section en profondeur — ne te contente pas de lister des points, explique, illustre avec du code ou des scénarios réels.
- Un "exemple pratique" = au minimum un bloc de code ou un scénario étape par étape, pas une phrase descriptive."""

_DOC_PROMPTS = {
    "fiche": """Génère une fiche de veille concise à partir des sources suivantes.

THÈME : {prompt}

SOURCES :
{sources}

Structure obligatoire :
## Résumé
(3 phrases qui capturent l'essentiel)

## Points clés
(5 bullets max, concrets et actionnables)

## Pourquoi c'est important
(1 paragraphe avec exemples ou analogies)

## Sources
(liste des titres avec URLs)""",

    "synthese": """Génère une synthèse thématique approfondie à partir des sources suivantes.

THÈME : {prompt}

SOURCES :
{sources}

Structure obligatoire :
## Introduction
(contexte et périmètre de la synthèse)

## [2-4 sections thématiques]
(chaque section = un aspect du thème, avec exemples concrets)

## Tendances identifiées
(ce qui émerge des sources)

## Conclusion
(points de retenue et perspectives)

## Sources
(liste des titres avec URLs)""",

    "guide": """Génère un guide pratique et opérationnel à partir des sources suivantes.

CONTRAINTES PRIORITAIRES (non négociables) :
- Respecte STRICTEMENT la longueur demandée dans les instructions utilisateur. Si "10 pages" est demandé, génère au moins 10 pages de contenu dense.
- Chaque étape doit contenir au moins un exemple concret (bloc de code, commande, scénario réel).
- Ne résume pas — développe en profondeur chaque concept avec contexte, explication et illustration.
- Ne fabrique AUCUNE information absente des sources.

THÈME ET INSTRUCTIONS : {prompt}

SOURCES :
{sources}

Structure obligatoire :
## Contexte
(pourquoi ce guide, à qui il s'adresse)

## Prérequis
(ce qu'il faut savoir ou avoir avant de commencer)

## Étapes
(étapes numérotées, avec exemples de code ou commandes extraits des sources)

## Pièges à éviter
(erreurs fréquentes et comment les éviter, tirés des sources)

## Pour aller plus loin
(ressources complémentaires mentionnées dans les sources)

## Sources
(liste des titres avec URLs)""",

    "rapport": """Génère un rapport de veille complet et structuré à partir des sources suivantes.

THÈME : {prompt}

SOURCES :
{sources}

Structure obligatoire :
## Résumé exécutif
(5-7 lignes, pour un lecteur pressé)

## Contexte et périmètre
(cadre de la veille, période couverte)

## Analyse des contenus
(analyse détaillée avec sous-sections par axe)

## Tendances et signaux faibles
(ce qui émerge, ce qui est à surveiller)

## Recommandations
(actions concrètes suggérées, priorisées)

## Annexes / Sources
(liste complète des sources utilisées)"""
}

_MAX_TOKENS = {"fiche": 1500, "synthese": 4000, "guide": 8000, "rapport": 8000}


@api_router.post("/documents/{doc_id}/ai-edit")
async def ai_edit_document(doc_id: int, data: Dict[str, Any]):
    """
    Apply an AI instruction to an existing document content.
    Returns the rewritten markdown without saving.
    """
    try:
        instruction = (data.get("instruction") or "").strip()
        current_content = (data.get("current_content") or "").strip()
        if not instruction:
            raise HTTPException(status_code=400, detail="instruction is required")
        if not current_content:
            raise HTTPException(status_code=400, detail="current_content is required")

        from argos.services.llm_provider import create_llm_provider

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        system = (
            "Tu es un éditeur de documents markdown professionnel. "
            "Tu reçois un document existant et une instruction de modification. "
            "Applique UNIQUEMENT ce qui est demandé — ne modifie pas ce qui n'est pas mentionné. "
            "Conserve la structure markdown et la langue du document. "
            "Retourne UNIQUEMENT le document modifié, sans explication ni commentaire."
        )

        prompt = (
            f"Document actuel :\n\n{current_content}\n\n"
            f"---\n\n"
            f"Instruction : {instruction}\n\n"
            f"Retourne le document modifié :"
        )

        rewritten, usage = await llm.generate(
            prompt=prompt,
            system_prompt=system,
            temperature=0.5,
            max_tokens=4000,
            top_p=0.9,
        )

        return {
            "markdown": rewritten,
            "tokens_used": usage.get("total_tokens", 0),
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in ai-edit for doc {doc_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/documents/generate")
async def generate_document(data: Dict[str, Any]):
    """Generate a document from selected items + free prompt. Does NOT save."""
    try:
        doc_type = data.get("doc_type", "fiche")
        title = (data.get("title") or "").strip()
        instructions = (data.get("prompt") or "").strip()
        prompt = f"{title}\n\nINSTRUCTIONS UTILISATEUR : {instructions}" if instructions else title
        item_ids = data.get("item_ids") or []

        if doc_type not in _DOC_PROMPTS:
            raise HTTPException(status_code=400, detail=f"doc_type must be one of: {list(_DOC_PROMPTS.keys())}")
        if not prompt and not item_ids:
            raise HTTPException(status_code=400, detail="prompt or item_ids required")

        from argos.services.llm_provider import create_llm_provider
        import json as _json

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        # Fetch item summaries
        sources_text = ""
        if item_ids:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT id, title, summary, url, digest_markdown, cleaned_content FROM items WHERE id = ANY(%s) ORDER BY importance DESC NULLS LAST",
                        (item_ids,)
                    )
                    rows = cur.fetchall()
            parts = []
            for r in rows:
                title_s = r[1] or ""
                url_s = r[3] or ""
                # Priorité : contenu complet nettoyé > digest > résumé
                content_s = r[5] or r[4] or r[2] or ""
                parts.append(f"### {title_s}\nURL: {url_s}\n\n{content_s}")
            sources_text = "\n\n".join(parts)

        user_prompt = _DOC_PROMPTS[doc_type].format(
            prompt=prompt or "Synthèse des contenus sélectionnés",
            sources=sources_text or "Aucune source — génère à partir du thème uniquement."
        )

        # Compute max_tokens: honour explicit page/word request from user, else use default
        import re as _re
        dynamic_max_tokens = _MAX_TOKENS[doc_type]
        pages_match = _re.search(r'(\d+)\s*pages?', instructions, _re.IGNORECASE)
        words_match = _re.search(r'(\d+)\s*mots?', instructions, _re.IGNORECASE)
        if pages_match:
            requested_pages = int(pages_match.group(1))
            dynamic_max_tokens = max(dynamic_max_tokens, requested_pages * 600)
        elif words_match:
            requested_words = int(words_match.group(1))
            dynamic_max_tokens = max(dynamic_max_tokens, int(requested_words * 1.4))

        markdown, usage = await llm.generate(
            prompt=user_prompt,
            system_prompt=_DOC_SYSTEM,
            temperature=0.75,
            max_tokens=dynamic_max_tokens,
            top_p=0.9,
        )

        return {
            "markdown": markdown,
            "doc_type": doc_type,
            "tokens_used": usage.get("total_tokens", 0),
            "cost_usd": llm.calculate_cost(usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
            if hasattr(llm, "calculate_cost") else 0.0,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


_RAG_DOC_SYSTEM = """Tu es un analyste de veille technologique expert en rédaction structurée.
Tu génères des documents professionnels STRICTEMENT ancrés dans les sources fournies.

RÈGLES ABSOLUES :
- Chaque affirmation factuelle doit être suivie de sa citation : [Source N]
- N'écris AUCUN fait qui ne soit pas couvert par au moins une source fournie
- Si les sources sont insuffisantes pour un sous-thème, écris explicitement : "Les sources disponibles ne couvrent pas ce point."
- Ne paraphrase pas les titres — analyse, relie, tire des conclusions
- Langue : français sauf citation directe en anglais
- Jamais de formulation "d'après les sources" en début de phrase — intègre les faits directement"""

_RAG_DOC_PROMPTS = {
    "fiche": """Génère une fiche de veille à partir des sources suivantes.

SUJET : {topic}

SOURCES RÉCUPÉRÉES :
{sources}

Format obligatoire :
## {topic}

### Résumé
(3 phrases factuelles avec citations [Source N] — pas d'introduction générale)

### Points clés
(5 bullets max, chacun suivi de [Source N])

### Pourquoi maintenant
(1 paragraphe — qu'est-ce qui a changé récemment selon les sources [Source N])

### Sources
{sources_list}""",

    "synthese": """Génère une synthèse thématique à partir des sources suivantes.

SUJET : {topic}

SOURCES RÉCUPÉRÉES :
{sources}

Format obligatoire :
## Synthèse : {topic}

### Vue d'ensemble
(2-3 paragraphes, citations [Source N] sur chaque fait)

### [2-4 sections thématiques issues des sources]
(chaque section = un aspect couvert par les sources, avec citations [Source N])

### Ce qui manque
(sujets non couverts par les sources actuelles — 1-3 points)

### Sources
{sources_list}""",

    "rapport": """Génère un rapport de veille complet à partir des sources suivantes.

SUJET : {topic}

SOURCES RÉCUPÉRÉES :
{sources}

Format obligatoire :
## Rapport de veille : {topic}

### Résumé exécutif
(5-7 lignes pour un lecteur pressé, avec citations [Source N])

### Analyse
(sous-sections par axe thématique, toutes les affirmations citées [Source N])

### Tendances et signaux
(ce qui émerge des sources, avec citations [Source N])

### Points non couverts
(lacunes identifiées dans la couverture RAG)

### Sources
{sources_list}""",
}


@api_router.post("/documents/generate-from-rag")
async def generate_document_from_rag(data: Dict[str, Any]):
    """
    Génère un document ancré RAG : retrieval automatique → score de couverture → génération avec citations.
    Optionnellement sauvegarde en bibliothèque (save=true).

    Body:
      topic       : str   — sujet / question de veille
      doc_type    : str   — "fiche" | "synthese" | "rapport" (défaut: "fiche")
      top_k       : int   — nb chunks à récupérer (défaut: 12)
      min_coverage: float — score min acceptable 0-1 (défaut: 0.3)
      save        : bool  — sauvegarder en bibliothèque (défaut: false)
      workspace_id: int   — filtrage workspace
    """
    try:
        import json as _json
        import asyncio as _asyncio
        from argos.services.llm_provider import create_llm_provider
        from argos.services.rag import RAGService
        from argos.services.vector_store_singleton import get_vector_store

        topic = (data.get("topic") or "").strip()
        if not topic:
            raise HTTPException(status_code=400, detail="topic is required")

        doc_type = data.get("doc_type", "fiche")
        if doc_type not in _RAG_DOC_PROMPTS:
            raise HTTPException(
                status_code=400,
                detail=f"doc_type must be one of: {list(_RAG_DOC_PROMPTS.keys())}"
            )

        top_k        = int(data.get("top_k", 12))
        min_coverage = float(data.get("min_coverage", 0.3))
        save_doc     = bool(data.get("save", False))
        workspace_id = data.get("workspace_id")
        sujet_id     = data.get("sujet_id")

        # ── 1. Retrieval hybride ────────────────────────────────────────
        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )
        vs  = get_vector_store()
        rag = RAGService(llm_provider=llm, vector_store=vs, db_manager=db, top_k=top_k)

        search_results = await _asyncio.to_thread(
            vs.hybrid_search,
            query=topic,
            limit=top_k,
            filter_source_type=None,
            workspace_id=workspace_id,
        )

        # ── 2. Score de couverture RAG ──────────────────────────────────
        rag_coverage = _compute_rag_coverage(search_results)

        if rag_coverage < min_coverage:
            return {
                "error":        "insufficient_coverage",
                "rag_coverage": round(rag_coverage, 3),
                "min_coverage": min_coverage,
                "message":      (
                    f"Couverture RAG insuffisante ({rag_coverage:.0%}) pour générer un document fiable sur ce sujet. "
                    f"Lancez d'abord le pipeline sur des sources pertinentes."
                ),
                "chunks_found": len(search_results),
            }

        # ── 3. Formatter les sources pour le prompt ─────────────────────
        sources_prompt, sources_list, item_ids = _format_rag_sources_for_doc(search_results)

        prompt = _RAG_DOC_PROMPTS[doc_type].format(
            topic=topic,
            sources=sources_prompt[:14000],
            sources_list=sources_list,
        )

        # ── 4. Génération LLM ───────────────────────────────────────────
        max_tokens = {"fiche": 1500, "synthese": 3500, "rapport": 5000}.get(doc_type, 2000)
        markdown, usage = await llm.generate(
            prompt=prompt,
            system_prompt=_RAG_DOC_SYSTEM,
            temperature=0.45,
            max_tokens=max_tokens,
            top_p=0.9,
        )

        result = {
            "markdown":      markdown,
            "doc_type":      doc_type,
            "topic":         topic,
            "rag_coverage":  round(rag_coverage, 3),
            "chunks_used":   len(search_results),
            "item_ids":      list(set(item_ids)),
            "cited_sources": [
                {
                    "n":     s["n"],
                    "title": s["title"],
                    "url":   s.get("url", ""),
                    "tier":  s.get("tier", ""),
                    "score": s.get("score", 0.0),
                }
                for s in _parse_source_list(sources_list)
            ],
            "tokens_used":   usage.get("total_tokens", 0),
            "cost_usd":      llm.calculate_cost(
                                 usage.get("prompt_tokens", 0),
                                 usage.get("completion_tokens", 0)
                             ) if hasattr(llm, "calculate_cost") else 0.0,
        }

        # ── 5. Sauvegarde optionnelle ───────────────────────────────────
        if save_doc:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """INSERT INTO documents
                           (title, doc_type, content_markdown, content_json,
                            source_item_ids, source_prompt, workspace_id, sujet_id)
                           VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s)
                           RETURNING id, created_at""",
                        (
                            topic, doc_type, markdown,
                            _json.dumps({
                                "rag_coverage": rag_coverage,
                                "chunks_used":  len(search_results),
                                "cited_sources": result["cited_sources"],
                            }),
                            list(set(item_ids)),
                            f"[RAG] {topic}",
                            workspace_id,
                            sujet_id,
                        )
                    )
                    row = cur.fetchone()
                    conn.commit()
            result["saved_id"]     = row[0]
            result["saved_at"]     = row[1].isoformat()

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in generate-from-rag: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


def _compute_rag_coverage(search_results: list) -> float:
    """
    Calcule un score de couverture RAG 0-1 basé sur la qualité des chunks récupérés.
    - Nombre de chunks : plus = mieux (plafonné à 10)
    - Scores de similarité : distance LanceDB → confiance
    """
    if not search_results:
        return 0.0
    n = len(search_results)
    # Score quantité (0.4 de poids) : 5 chunks = bon
    qty_score = min(n / 8.0, 1.0)
    # Score similarité (0.6 de poids) : distance LanceDB → confiance
    distances = [r.get("_distance", 1.0) for r in search_results]
    avg_dist   = sum(distances) / len(distances)
    sim_score  = max(0.0, min(1.0, 1.0 - avg_dist / 2.0))

    return round(qty_score * 0.4 + sim_score * 0.6, 3)


def _format_rag_sources_for_doc(search_results: list) -> tuple[str, str, list[int]]:
    """
    Formate les chunks RAG en (texte prompt, liste sources markdown, item_ids).
    Chaque source est numérotée [Source N] pour les citations dans le doc.
    """
    prompt_parts = []
    list_lines   = []
    item_ids     = []
    seen_ids     = set()

    for idx, r in enumerate(search_results, 1):
        title      = r.get("title", "Source inconnue")
        chunk_text = r.get("chunk_text", "")
        url        = r.get("url", "") or r.get("source_url", "")
        item_id    = r.get("source_id") or r.get("item_id")

        if item_id and item_id not in seen_ids:
            item_ids.append(item_id)
            seen_ids.add(item_id)

        # Récupérer l'URL depuis la DB si manquante
        if not url and item_id:
            try:
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("SELECT url, reliability_tier FROM items WHERE id = %s", (item_id,))
                        row = cur.fetchone()
                        if row:
                            url = row[0] or ""
                            tier = row[1] or "unknown"
            except Exception:
                tier = "unknown"
        else:
            tier = "unknown"

        prompt_parts.append(
            f"[Source {idx}] {title}\n{chunk_text[:1200]}"
        )
        list_lines.append(f"{idx}. **{title}** — {url} `[{tier}]`")

    sources_prompt = "\n\n---\n\n".join(prompt_parts)
    sources_list   = "\n".join(list_lines)

    return sources_prompt, sources_list, item_ids


def _parse_source_list(sources_list: str) -> list[dict]:
    """Parse the formatted sources_list markdown back to dicts."""
    import re
    result = []
    for line in sources_list.strip().splitlines():
        m = re.match(r'^(\d+)\.\s+\*\*(.+?)\*\*\s+—\s+(https?://\S+)?\s*`\[(\w+)\]`', line)
        if m:
            result.append({
                "n":    int(m.group(1)),
                "title": m.group(2),
                "url":   m.group(3) or "",
                "tier":  m.group(4),
                "score": 0.0,
            })
    return result


@api_router.post("/documents")
async def create_document(data: Dict[str, Any]):
    """Save a generated document to the library."""
    try:
        title = (data.get("title") or "").strip()
        doc_type = data.get("doc_type", "fiche")
        content_markdown = (data.get("content_markdown") or "").strip()
        if not title or not content_markdown:
            raise HTTPException(status_code=400, detail="title and content_markdown required")

        import json as _json
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO documents
                       (title, doc_type, content_markdown, content_json, source_item_ids, source_prompt, workspace_id, sujet_id)
                       VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s)
                       RETURNING id, created_at""",
                    (
                        title, doc_type, content_markdown,
                        _json.dumps(data.get("content_json") or {}),
                        data.get("source_item_ids") or [],
                        data.get("source_prompt", ""),
                        data.get("workspace_id"),
                        data.get("sujet_id"),
                    )
                )
                row = cur.fetchone()
                conn.commit()
        return {"id": row[0], "title": title, "doc_type": doc_type, "created_at": row[1].isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving document: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/documents/search")
async def search_documents(
    q: str = Query(..., min_length=1),
    semantic: bool = Query(default=False),
    doc_type: Optional[str] = Query(default=None),
    rag_indexed: Optional[bool] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
):
    """
    Search documents.
    - Default: PostgreSQL fulltext (tsvector/tsquery, French stemming)
    - semantic=true: LanceDB vector search on indexed documents (requires rag_indexed=true)
    Results from both modes are merged and deduplicated when both fire.
    """
    try:
        results = []

        # ── 1. Fulltext PostgreSQL ──────────────────────────────────────
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                conditions = [
                    "to_tsvector('french', coalesce(title,'') || ' ' || coalesce(source_prompt,'') || ' ' || coalesce(content_markdown,'')) "
                    "@@ plainto_tsquery('french', %s)"
                ]
                params: list = [q]
                if doc_type:
                    conditions.append("doc_type = %s"); params.append(doc_type)
                if rag_indexed is not None:
                    conditions.append("rag_indexed = %s"); params.append(rag_indexed)
                where = " AND ".join(conditions)
                cur.execute(
                    f"""SELECT id, title, doc_type, source_prompt,
                               array_length(source_item_ids, 1) AS nb_sources,
                               rag_indexed, created_at,
                               LEFT(content_markdown, 300) AS excerpt,
                               ts_rank(
                                   to_tsvector('french', coalesce(title,'') || ' ' || coalesce(source_prompt,'') || ' ' || coalesce(content_markdown,'')),
                                   plainto_tsquery('french', %s)
                               ) AS rank
                        FROM documents WHERE {where}
                        ORDER BY rank DESC LIMIT %s""",
                    [q] + params + [limit]
                )
                rows = cur.fetchall()

        seen_ids = set()
        for r in rows:
            seen_ids.add(r[0])
            results.append({
                "id": r[0], "title": r[1], "doc_type": r[2],
                "source_prompt": r[3], "nb_sources": r[4] or 0,
                "rag_indexed": bool(r[5]),
                "created_at": r[6].isoformat() if r[6] else None,
                "excerpt": r[7],
                "score": float(r[8]),
                "match_type": "fulltext",
            })

        # ── 2. Semantic LanceDB (opt-in) ────────────────────────────────
        if semantic:
            try:
                from argos.services.vector_store_singleton import get_vector_store
                import asyncio as _asyncio

                vs = get_vector_store()
                semantic_results = await _asyncio.to_thread(
                    vs.search, q, limit=limit, filter_source_type=None
                )
                # semantic_results contain items; we need to match back to documents
                # via source_item_ids. For documents, source_type was set to 'item' in index_item
                # We'll also search directly by checking doc content in LanceDB source_type filtering
                # Simpler: re-query DB for docs whose id matches any semantic hit
                doc_ids_from_semantic = [
                    r.get("source_id") for r in semantic_results
                    if r.get("source_type") == "item"
                ]
                if doc_ids_from_semantic:
                    with db.get_connection() as conn:
                        with conn.cursor() as cur:
                            extra_conds = ["id = ANY(%s)", "rag_indexed = TRUE"]
                            extra_params: list = [doc_ids_from_semantic]
                            if doc_type:
                                extra_conds.append("doc_type = %s"); extra_params.append(doc_type)
                            cur.execute(
                                f"""SELECT id, title, doc_type, source_prompt,
                                           array_length(source_item_ids, 1),
                                           rag_indexed, created_at,
                                           LEFT(content_markdown, 300)
                                    FROM documents WHERE {' AND '.join(extra_conds)}
                                    LIMIT %s""",
                                extra_params + [limit]
                            )
                            for r in cur.fetchall():
                                if r[0] not in seen_ids:
                                    seen_ids.add(r[0])
                                    results.append({
                                        "id": r[0], "title": r[1], "doc_type": r[2],
                                        "source_prompt": r[3], "nb_sources": r[4] or 0,
                                        "rag_indexed": bool(r[5]),
                                        "created_at": r[6].isoformat() if r[6] else None,
                                        "excerpt": r[7],
                                        "score": 0.5,
                                        "match_type": "semantic",
                                    })
            except Exception as sem_err:
                logger.warning(f"Semantic search failed, fulltext only: {sem_err}")

        return {"results": results, "total": len(results), "query": q, "semantic": semantic}

    except Exception as e:
        logger.error(f"Error searching documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/documents")
async def list_documents(
    doc_type: Optional[str] = Query(default=None),
    workspace_id: Optional[int] = Query(default=None),
    sujet_id: Optional[int] = Query(default=None),
    unclassified: Optional[bool] = Query(default=None),
    rag_indexed: Optional[bool] = Query(default=None),
    sort: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
):
    """List documents in the library."""
    try:
        conditions = []
        params: list = []
        if doc_type:
            conditions.append("doc_type = %s"); params.append(doc_type)
        if workspace_id is not None:
            conditions.append("workspace_id = %s"); params.append(workspace_id)
        if sujet_id is not None:
            conditions.append("sujet_id = %s"); params.append(sujet_id)
        elif unclassified:
            conditions.append("sujet_id IS NULL")
        if rag_indexed is not None:
            conditions.append("rag_indexed = %s"); params.append(rag_indexed)
        where = ("WHERE " + " AND ".join(conditions)) if conditions else ""

        order = "created_at DESC"
        if sort == "created_at ASC":
            order = "created_at ASC"
        elif sort == "title ASC":
            order = "title ASC"

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"""SELECT id, title, doc_type, source_prompt,
                               array_length(source_item_ids, 1) AS nb_sources,
                               rag_indexed, created_at, updated_at,
                               LEFT(content_markdown, 300) AS excerpt,
                               sujet_id
                        FROM documents {where}
                        ORDER BY {order}
                        LIMIT %s OFFSET %s""",
                    params + [limit, offset]
                )
                rows = cur.fetchall()
                cur.execute(f"SELECT COUNT(*) FROM documents {where}", params)
                total = cur.fetchone()[0]

        return {
            "documents": [
                {
                    "id": r[0], "title": r[1], "doc_type": r[2],
                    "source_prompt": r[3], "nb_sources": r[4] or 0,
                    "rag_indexed": bool(r[5]),
                    "created_at": r[6].isoformat() if r[6] else None,
                    "updated_at": r[7].isoformat() if r[7] else None,
                    "excerpt": r[8],
                    "sujet_id": r[9],
                }
                for r in rows
            ],
            "total": total,
        }
    except Exception as e:
        logger.error(f"Error listing documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/documents/{doc_id}")
async def get_document(doc_id: int):
    """Get a single document."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, title, doc_type, content_markdown, content_json,
                              source_item_ids, source_prompt, workspace_id,
                              rag_indexed, created_at, updated_at
                       FROM documents WHERE id = %s""",
                    (doc_id,)
                )
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        return {
            "id": row[0], "title": row[1], "doc_type": row[2],
            "content_markdown": row[3], "content_json": row[4],
            "source_item_ids": row[5] or [], "source_prompt": row[6],
            "workspace_id": row[7], "rag_indexed": bool(row[8]),
            "created_at": row[9].isoformat() if row[9] else None,
            "updated_at": row[10].isoformat() if row[10] else None,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching document {doc_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/documents/{doc_id}")
async def update_document(doc_id: int, data: Dict[str, Any]):
    """Update a document (title, content, etc.)."""
    try:
        fields = []
        params = []
        if "title" in data:
            fields.append("title = %s"); params.append(data["title"])
        if "content_markdown" in data:
            fields.append("content_markdown = %s"); params.append(data["content_markdown"])
        if "sujet_id" in data:
            fields.append("sujet_id = %s"); params.append(data["sujet_id"])
        if not fields:
            raise HTTPException(status_code=400, detail="Nothing to update")
        fields.append("updated_at = NOW()")
        params.append(doc_id)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE documents SET {', '.join(fields)} WHERE id = %s RETURNING id",
                    params
                )
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Document not found")
                conn.commit()
        return {"success": True, "id": doc_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating document {doc_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/documents/{doc_id}")
async def delete_document(doc_id: int):
    """Delete a document from the library and remove its vectors from LanceDB."""
    try:
        # Check if document was RAG indexed before deleting
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT rag_indexed FROM documents WHERE id = %s", (doc_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        was_indexed = bool(row[0])

        # Delete from DB
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM documents WHERE id = %s", (doc_id,))
                conn.commit()

        # Clean up LanceDB vectors if document was indexed
        if was_indexed:
            try:
                from argos.services.vector_store_singleton import get_vector_store
                import asyncio as _asyncio
                vs = get_vector_store()
                await _asyncio.to_thread(vs.delete_item, doc_id)
                logger.info(f"Removed vectors for document {doc_id} from LanceDB")
            except Exception as ve:
                logger.warning(f"Could not remove vectors for document {doc_id}: {ve}")

        return {"success": True, "vectors_cleaned": was_indexed}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document {doc_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/documents")
async def delete_documents_batch(data: Dict[str, Any]):
    """Delete multiple documents and clean up their LanceDB vectors."""
    try:
        doc_ids: list = data.get("ids") or []
        if not doc_ids:
            raise HTTPException(status_code=400, detail="ids required")

        # Fetch indexed status for all
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, rag_indexed FROM documents WHERE id = ANY(%s)", (doc_ids,))
                rows = {r[0]: bool(r[1]) for r in cur.fetchall()}
                # Delete all
                cur.execute("DELETE FROM documents WHERE id = ANY(%s)", (doc_ids,))
                deleted = cur.rowcount
                conn.commit()

        # Clean LanceDB for indexed ones
        indexed_ids = [iid for iid, was_indexed in rows.items() if was_indexed]
        if indexed_ids:
            try:
                from argos.services.vector_store_singleton import get_vector_store
                import asyncio as _asyncio
                vs = get_vector_store()
                for iid in indexed_ids:
                    await _asyncio.to_thread(vs.delete_item, iid)
                logger.info(f"Removed vectors for {len(indexed_ids)} documents from LanceDB")
            except Exception as ve:
                logger.warning(f"Vector cleanup partial error: {ve}")

        return {"success": True, "deleted": deleted, "vectors_cleaned": len(indexed_ids)}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in batch delete documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/documents/{doc_id}/index")
async def index_document(doc_id: int):
    """Index a document into the RAG vector store."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT title, content_markdown, source_item_ids FROM documents WHERE id = %s", (doc_id,))
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Document not found")
        title, content, source_item_ids = row

        from argos.services.vector_store_singleton import get_vector_store
        import asyncio as _asyncio
        vs = get_vector_store()
        doc_data = {"id": doc_id, "title": title, "summary": content[:2000], "workspace_id": None}
        await _asyncio.to_thread(vs.index_item, doc_data)

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("UPDATE documents SET rag_indexed=TRUE, rag_indexed_at=NOW() WHERE id=%s", (doc_id,))
                if source_item_ids:
                    cur.execute(
                        "UPDATE items SET rag_indexed=TRUE, rag_indexed_at=NOW() WHERE id = ANY(%s)",
                        (source_item_ids,)
                    )
                conn.commit()

        return {"success": True, "id": doc_id, "rag_indexed": True}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error indexing document {doc_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))



# ============================================
# Veille à la demande
# ============================================

@api_router.post("/veille/on-demand")
async def veille_on_demand(data: Dict[str, Any], background_tasks: BackgroundTasks):
    """
    Lance une veille ciblée sur un sujet à la demande.
    Flow : recherche web → digest LLM en parallèle → classification → retourne les items créés.
    """
    try:
        subject = (data.get("subject") or "").strip()
        max_results = min(int(data.get("max_results", 5)), 10)
        workspace_id = data.get("workspace_id")
        if not subject:
            raise HTTPException(status_code=400, detail="subject is required")

        from argos.services.web_search import search as web_search, search_with_searxng
        from argos.services.web_browser import browse_with_requests, browse_with_crawl4ai
        from argos.services.digest_generator import generate_digest
        from argos.services.llm_provider import create_llm_provider
        from argos.services.classifier import ClassifierService
        import asyncio as _asyncio

        llm = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.aws_bedrock_model,
        )

        # 1. SearXNG cherche en temps réel (agrège Google, Bing, DuckDuckGo, ArXiv...)
        import json as _json

        searxng_results = await search_with_searxng(
            query=subject,
            max_results=max_results * 3,  # fetch plus, on filtre ensuite
            searxng_url=settings.searxng_url,
        )

        source_meta: dict = {}
        candidate_urls: list = []

        if searxng_results:
            # LLM filtre les résultats les plus pertinents parmi les vrais résultats SearXNG
            candidates_text = "\n".join([
                f"{i+1}. [{r['engine']}] {r['title']}\n   URL: {r['url']}\n   {r.get('content','')[:150]}"
                for i, r in enumerate(searxng_results[:max_results * 2])
            ])

            FILTER_SYSTEM = (
                "Tu es un expert en veille informationnelle. "
                "Sélectionne les résultats les plus pertinents, récents et substantiels. "
                "Réponds UNIQUEMENT avec un objet JSON valide."
            )
            FILTER_PROMPT = f"""Sujet : {subject}

Voici {len(searxng_results[:max_results*2])} résultats de recherche réels :

{candidates_text}

Sélectionne exactement {max_results} URLs en JSON :
{{"selected": [1, 3, 5, ...]}}  (numéros des résultats à garder)

Critères : pertinence au sujet, contenu substantiel, sources diversifiées, éviter doublons."""

            selected_indices = list(range(min(max_results, len(searxng_results))))  # fallback: prendre les premiers
            try:
                raw, _ = await llm.generate(
                    prompt=FILTER_PROMPT,
                    system_prompt=FILTER_SYSTEM,
                    temperature=0.2,
                    max_tokens=200,
                    top_p=0.9,
                )
                start = raw.find("{"); end = raw.rfind("}") + 1
                parsed = _json.loads(raw[start:end]) if start >= 0 else {}
                indices = [int(i) - 1 for i in parsed.get("selected", []) if str(i).isdigit()]
                if indices:
                    selected_indices = [i for i in indices if 0 <= i < len(searxng_results)][:max_results]
            except Exception as e:
                logger.debug(f"LLM filter failed, using top results: {e}")

            for i in selected_indices:
                r = searxng_results[i]
                url = r["url"]
                candidate_urls.append(url)
                source_meta[url] = r.get("engine", "searxng")

        if not candidate_urls:
            # Fallback : HN + ArXiv si SearXNG indisponible
            logger.warning(f"SearXNG returned no results for '{subject}', using fallback")
            import urllib.parse as _uparse, requests as _req
            q = _uparse.quote_plus(subject)
            try:
                hn = _req.get(f"https://hn.algolia.com/api/v1/search?query={q}&tags=story&hitsPerPage={max_results}",
                              headers={"User-Agent": "Argos/1.0"}, timeout=8)
                if hn.status_code == 200:
                    for h in hn.json().get("hits", [])[:max_results]:
                        u = h.get("url") or f"https://news.ycombinator.com/item?id={h.get('objectID')}"
                        if u and u not in candidate_urls:
                            candidate_urls.append(u); source_meta[u] = "Hacker News"
            except Exception: pass

        urls = candidate_urls[:max_results]
        logger.info(f"Veille '{subject}': {len(urls)} URLs — engines: {list(set(source_meta.values()))}")

        if not urls:
            return {"success": False, "subject": subject, "message": "Aucune URL trouvée — SearXNG et fallbacks indisponibles", "items": []}

        # 2. Digest en parallèle (skip URLs déjà en base)
        existing_urls: set = set()
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT url FROM items WHERE url = ANY(%s)", (urls,))
                existing_urls = {r[0] for r in cur.fetchall()}

        new_urls = [u for u in urls if u not in existing_urls]

        async def digest_url(url: str):
            try:
                # Crawl4AI > requests pour une extraction LLM-ready de qualité
                browse = await browse_with_crawl4ai(url, timeout=30)
                if not browse.get("content"):
                    return None
                title = browse.get("title") or url
                content = browse.get("content", "")
                digest = await generate_digest(url, title, content[:40000], workspace_id, llm)
                if digest.get("error") and not digest.get("markdown"):
                    return None
                import json as _json
                json_data = digest.get("json", {})
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute(
                            """INSERT INTO items
                               (source_type, source_url, url, title, summary,
                                digest_markdown, digest_json, digest_generated_at,
                                importance, item_type, keywords, classification_status, workspace_id)
                               VALUES (%s,%s,%s,%s,%s,%s,%s,NOW(),%s,%s,%s,'pending',%s)
                               ON CONFLICT (url) DO UPDATE SET
                                 digest_markdown = EXCLUDED.digest_markdown,
                                 digest_json = EXCLUDED.digest_json,
                                 digest_generated_at = NOW()
                               RETURNING id""",
                            (
                                "browse", url, url,
                                (title or url)[:500],
                                json_data.get("summary", "")[:2000],
                                digest.get("markdown", ""),
                                _json.dumps(json_data),
                                json_data.get("importance", "medium"),
                                json_data.get("content_type", "other"),
                                json_data.get("tags", []),
                                workspace_id,
                            ),
                        )
                        row = cur.fetchone()
                        conn.commit()
                        return row[0] if row else None
            except Exception as e:
                logger.warning(f"on-demand digest failed for {url}: {e}")
                return None

        item_ids_raw = await _asyncio.gather(*[digest_url(u) for u in new_urls])
        item_ids = [i for i in item_ids_raw if i]

        # 3. Classification en arrière-plan
        if item_ids:
            classifier = ClassifierService(llm_provider=llm, db_manager=db, temperature=0.5, max_tokens=800)
            async def classify_all():
                for iid in item_ids:
                    try: await classifier.classify_item(iid)
                    except Exception as e: logger.warning(f"classify failed for {iid}: {e}")
            background_tasks.add_task(classify_all)

        # 4. Retourner les items créés
        created_items = []
        if item_ids:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """SELECT id, title, summary, url, item_type, importance, classification_status
                           FROM items WHERE id = ANY(%s) ORDER BY created_at DESC""",
                        (item_ids,)
                    )
                    created_items = [
                        {"id": r[0], "title": r[1], "summary": r[2], "url": r[3],
                         "item_type": r[4], "importance": r[5], "status": r[6]}
                        for r in cur.fetchall()
                    ]

        # Add source label to items
        for item in created_items:
            item["source_label"] = source_meta.get(item["url"], "web")

        return {
            "success": True,
            "subject": subject,
            "searched": len(urls),
            "already_known": len(existing_urls & set(urls)),
            "new_items": len(item_ids),
            "items": created_items,
            "sources_used": list(set(source_meta.values())),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in veille on-demand: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Briefing Quotidien
# ============================================

_BRIEFING_SYSTEM = """Tu es un analyste de veille technologique senior.
Tu rédiges des briefings Delta : uniquement ce qui a changé ou émergé aujourd'hui.
Style : factuel, direct, sans introduction ni conclusion de politesse.
Tu NE paraphrases PAS les titres — tu donnes des faits nouveaux, des impacts concrets.
Réponds UNIQUEMENT en français."""

_BRIEFING_PROMPT = """Voici les items de veille validés (fiabilité confirmée) des dernières {hours}h :

{items_text}

Génère un briefing Delta avec EXACTEMENT ce format markdown :

## Delta du {date}

### Résumé en 3 lignes
(Ce qui change concrètement aujourd'hui dans l'écosystème — 3 phrases max, aucune redite des titres)

{groups_section}

## Pour commencer — lecture recommandée
{pour_commencer}

## Signal faible à surveiller
(1 tendance émergente non encore couverte par les items — signe avant-coureur, pas une certitude)"""

_BRIEFING_GROUP_TEMPLATE = """### {group_name}
{items_block}"""

_BRIEFING_ITEM_TEMPLATE = """- **{title}** `[{tier}]`
  {summary_line}
  → {url} [READ:{id}]"""


def _group_items_by_entity(items: list[dict]) -> dict[str, list[dict]]:
    """
    Groupe les items par entité/sujet surveillé.
    Utilise les keywords, source_type et domain pour inférer le groupe.
    """
    from argos.services.reliability_scorer import _extract_domain

    ENTITY_MAP = {
        # Anthropic / Claude
        "anthropic": "Anthropic · Claude",
        "claude": "Anthropic · Claude",
        "docs.anthropic.com": "Anthropic · Claude",
        "modelcontextprotocol.io": "MCP · Model Context Protocol",
        "mcp": "MCP · Model Context Protocol",
        # OpenAI
        "openai": "OpenAI · GPT",
        "gpt": "OpenAI · GPT",
        "platform.openai.com": "OpenAI · GPT",
        # Google DeepMind
        "deepmind": "Google · DeepMind",
        "gemini": "Google · DeepMind",
        "ai.google.dev": "Google · DeepMind",
        "research.google": "Google · DeepMind",
        # Meta AI
        "llama": "Meta AI · LLaMA",
        "ai.meta.com": "Meta AI · LLaMA",
        # Hugging Face
        "huggingface": "Hugging Face",
        "huggingface.co": "Hugging Face",
        # LangChain / LlamaIndex
        "langchain": "LangChain · LlamaIndex",
        "llamaindex": "LangChain · LlamaIndex",
        "python.langchain.com": "LangChain · LlamaIndex",
        # Recherche / Papers
        "arxiv": "Recherche · Papers",
        "arxiv.org": "Recherche · Papers",
        "paperswithcode": "Recherche · Papers",
        # MLOps / Infra
        "mlops": "MLOps · Infra",
        "kubernetes": "MLOps · Infra",
        "docker": "MLOps · Infra",
        "kubernetes.io": "MLOps · Infra",
    }

    groups: dict[str, list[dict]] = {}

    for item in items:
        domain = _extract_domain(item.get("url", ""))
        kws = [k.lower() for k in (item.get("keywords") or [])]
        title_lower = (item.get("title") or "").lower()

        assigned = None

        # 1. Par domaine exact
        assigned = ENTITY_MAP.get(domain)

        # 2. Par keywords
        if not assigned:
            for kw in kws:
                assigned = ENTITY_MAP.get(kw)
                if assigned:
                    break

        # 3. Par titre
        if not assigned:
            for token, group in ENTITY_MAP.items():
                if token in title_lower:
                    assigned = group
                    break

        # 4. Fallback : source_type ou domain brut
        if not assigned:
            src = item.get("source_type") or ""
            if src == "github":
                assigned = "GitHub · Open Source"
            elif src in ("rss", "website"):
                assigned = f"Web · {domain}" if domain else "Web · Divers"
            else:
                assigned = "Divers"

        groups.setdefault(assigned, []).append(item)

    # Trier les groupes par nb d'items desc
    return dict(sorted(groups.items(), key=lambda x: len(x[1]), reverse=True))


async def _generate_briefing_content(hours: int = 24, workspace_id: Optional[int] = None, sujet_id: Optional[int] = None) -> dict:
    """
    Génère le briefing Delta quotidien.
    N'utilise QUE les items avec reliability_passed = TRUE des dernières {hours}h.
    Groupés par entité/sujet. Format Delta : ce qui change, avec sources citées.
    """
    import datetime as _dt
    import json as _json
    from argos.services.llm_provider import create_llm_provider

    ws_filter = f"AND workspace_id = {workspace_id}" if workspace_id is not None else ""
    sujet_filter = f"AND sujet_id = {sujet_id}" if sujet_id is not None else ""
    today_str = _dt.date.today().strftime("%d/%m/%Y")

    # ── Contexte du sujet (niveau + bilan + filter_config) ───────────────────
    sujet_context = ""
    must_match_terms: list[str] = []
    if sujet_id is not None:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT name, knowledge_profile, filter_config FROM sujets WHERE id = %s", (sujet_id,)
                    )
                    row = cur.fetchone()
                    if row:
                        sujet_name, kp, fc = row[0], row[1] or {}, row[2] or {}
                        level = (kp.get("level_current") or kp.get("level") or
                                 kp.get("niveau_actuel") or "novice")
                        bilan = kp.get("bilan_md", "")[:2000]
                        sujet_context = f"\nSujet ciblé : {sujet_name}\nNiveau de l'utilisateur : {level}\n"
                        if bilan:
                            sujet_context += f"Profil d'apprentissage :\n{bilan}\n"
                        # Termes de la whitelist pour filtrer les items
                        must_match_terms = (
                            fc.get("must_match_confirmed") or
                            fc.get("must_match") or []
                        )
        except Exception:
            pass

    # ── Contexte projet (si le workspace appartient à un projet) ─────────────
    # Remplace le sujet_context learning par un contexte veille pro orienté impact
    _is_project_workspace = False
    if workspace_id is not None:
        try:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """SELECT p.name, p.knowledge_profile, p.alert_keywords
                           FROM projects p
                           JOIN workspaces w ON w.project_id = p.id
                           WHERE w.id = %s""",
                        (workspace_id,)
                    )
                    proj_row = cur.fetchone()
                    if proj_row:
                        _is_project_workspace = True
                        proj_name, proj_kp, alert_kw = proj_row
                        proj_kp = proj_kp or {}
                        alert_kw = alert_kw or []
                        bilan = proj_kp.get("bilan_md", "")[:2000]
                        watch_focus = proj_kp.get("watch_focus_md", "")[:1000]
                        alerts_line = (
                            f"Mots-clés d'alerte configurés : {', '.join(alert_kw)}\n"
                            if alert_kw else ""
                        )
                        sujet_context = (
                            f"\nCONTEXTE PROJET — {proj_name}\n"
                            f"{bilan}\n"
                            + (f"Axes de surveillance prioritaires :\n{watch_focus}\n" if watch_focus else "")
                            + alerts_line
                        )
        except Exception:
            pass

    # ── IDs déjà cités dans les briefings précédents (7 derniers jours) ─────
    already_cited_ids: set = set()
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT cited_sources
                FROM daily_briefings
                WHERE briefing_date < CURRENT_DATE
                  AND briefing_date >= CURRENT_DATE - INTERVAL '7 days'
                ORDER BY briefing_date DESC
            """)
            for (cs,) in cur.fetchall():
                if isinstance(cs, list):
                    for s in cs:
                        if isinstance(s, dict) and s.get("id"):
                            already_cited_ids.add(s["id"])

    exclude_clause = f"AND id NOT IN ({','.join(str(i) for i in already_cited_ids)})" if already_cited_ids else ""

    # ── Requête : uniquement items reliability_passed=TRUE ──────────────────
    with db.get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(f"""
                SELECT id, title, summary, url, importance, item_type,
                       keywords, source_type, reliability_tier, reliability_score,
                       created_at, sujet_id, content_tags
                FROM items
                WHERE reliability_passed = TRUE
                  AND classification_status = 'classified'
                  AND importance IN ('high', 'critical')
                  AND created_at > NOW() - INTERVAL '{hours} hours'
                  AND (published_at IS NULL OR published_at > NOW() - INTERVAL '90 days')
                  {exclude_clause}
                  {ws_filter}
                  {sujet_filter}
                ORDER BY importance DESC, reliability_score DESC NULLS LAST, created_at DESC
                LIMIT 40
            """)
            rows = cur.fetchall()

    # Fallback 1 : élargir la fenêtre à 72h, mais toujours exclure les déjà cités
    if not rows:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, title, summary, url, importance, item_type,
                           keywords, source_type, reliability_tier, reliability_score,
                           created_at, sujet_id, content_tags
                    FROM items
                    WHERE reliability_passed = TRUE
                      AND classification_status = 'classified'
                      AND (published_at IS NULL OR published_at > NOW() - INTERVAL '90 days')
                      AND created_at > NOW() - INTERVAL '72 hours'
                      {exclude_clause}
                      {ws_filter}
                      {sujet_filter}
                    ORDER BY importance DESC, reliability_score DESC NULLS LAST, created_at DESC
                    LIMIT 20
                """)
                rows = cur.fetchall()

    # Si même après 72h tout a déjà été cité → no_new_content
    if not rows and already_cited_ids:
        return {"no_new_content": True, "message": "Tous les items fiables récents ont déjà été couverts dans les briefings précédents."}

    # Fallback 2 : scorer à la volée les items classifiés non encore scorés
    # (items antérieurs à la migration reliability)
    if not rows:
        from argos.services.reliability_scorer import score_domain
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(f"""
                    SELECT id, title, summary, url, importance, item_type,
                           keywords, source_type,
                           NULL as reliability_tier, NULL as reliability_score,
                           created_at, sujet_id, content_tags
                    FROM items
                    WHERE classification_status = 'classified'
                      AND reliability_passed IS NULL
                      {exclude_clause}
                      {ws_filter}
                      {sujet_filter}
                    ORDER BY created_at DESC
                    LIMIT 20
                """)
                rows_unscored = cur.fetchall()

        # Appliquer le scorer domaine uniquement (rapide, pas de fetch HTTP)
        rows_pass = []
        for r in rows_unscored:
            url = r[3] or ""
            domain_result = score_domain(url)
            if domain_result.passed:
                rows_pass.append(r[:8] + (domain_result.domain_tier, domain_result.score, r[10], r[11]))
                # Mettre à jour en base pour les prochains appels
                try:
                    with db.get_connection() as conn:
                        with conn.cursor() as cur:
                            cur.execute("""
                                UPDATE items SET
                                  reliability_passed = TRUE,
                                  reliability_score  = %s,
                                  reliability_tier   = %s,
                                  reliability_reason = %s
                                WHERE id = %s
                            """, (domain_result.score, domain_result.domain_tier,
                                  domain_result.reason, r[0]))
                            conn.commit()
                except Exception:
                    pass
        rows = rows_pass

    if not rows:
        return {
            "error": "no_items",
            "message": "Aucun item fiable disponible pour générer un briefing. "
                       "Lancez d'abord le pipeline sur vos sources."
        }

    # Si tous les items sont déjà connus (rien de nouveau depuis le dernier brief)
    all_item_ids = {r[0] for r in rows}
    if already_cited_ids and all_item_ids.issubset(already_cited_ids):
        return {
            "markdown": f"## Delta du {today_str}\n\nPas de nouveauté aujourd'hui — les sources surveillées n'ont rien publié de nouveau depuis le dernier briefing.",
            "executive_summary": "Pas de nouveauté aujourd'hui.",
            "top_items": [],
            "cited_sources": [],
            "trends": [],
            "groups": {},
            "stats": {"total_items": 0, "reliability_filtered": True, "period_hours": hours},
            "tokens_used": 0,
            "cost_usd": 0.0,
        }

    items = [
        {
            "id":               r[0],
            "title":            r[1] or "",
            "summary":          (r[2] or "")[:400],
            "url":              r[3] or "",
            "importance":       r[4] or "high",
            "item_type":        r[5] or "",
            "keywords":         r[6] or [],
            "source_type":      r[7] or "",
            "reliability_tier": r[8] or "unknown",
            "reliability_score": float(r[9]) if r[9] else 0.0,
            "created_at":       r[10].isoformat() if r[10] else None,
            "sujet_id":         r[11],
            "content_tags":     r[12] or {},
        }
        for r in rows
    ]

    # ── Filtre must_match : exclure items hors périmètre du sujet ─────────────
    if must_match_terms:
        terms_lower = [t.lower() for t in must_match_terms]
        def _item_matches(item: dict) -> bool:
            haystack = (
                item["title"] + " " + item["summary"] + " " +
                " ".join(item.get("keywords") or [])
            ).lower()
            return any(t in haystack for t in terms_lower)

        filtered = [i for i in items if _item_matches(i)]
        if filtered:
            items = filtered
        # Si filtered vide : aucun item pertinent — on garde items pour ne pas
        # bloquer le briefing, mais on le signale dans les stats
        else:
            logger.warning(f"Briefing sujet {sujet_id}: aucun item ne matche must_match ({len(must_match_terms)} termes). Items bruts conservés.")

    # ── Grouper par entité ─────────────────────────────────────────────────
    groups = _group_items_by_entity(items)

    # ── Construire le texte des groupes pour le prompt ─────────────────────
    groups_section_parts = []
    for group_name, group_items in groups.items():
        block_lines = []
        for it in group_items[:5]:  # max 5 items par groupe
            summary_line = it["summary"][:200].replace("\n", " ").strip()
            if not summary_line:
                summary_line = "(pas de résumé disponible)"
            block_lines.append(
                _BRIEFING_ITEM_TEMPLATE.format(
                    title=it["title"][:100],
                    tier=it["reliability_tier"],
                    summary_line=summary_line,
                    url=it["url"],
                    id=it["id"],
                )
            )
        groups_section_parts.append(
            _BRIEFING_GROUP_TEMPLATE.format(
                group_name=group_name,
                items_block="\n".join(block_lines),
            )
        )

    groups_section = "\n\n".join(groups_section_parts)
    items_text = groups_section  # pour le prompt

    llm = create_llm_provider(
        provider_type=settings.llm_provider,
        openai_api_key=settings.openai_api_key,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
        aws_region=settings.aws_region,
        model=settings.aws_bedrock_model,
    )

    # ── Construire la section "Pour commencer / Impact projet" selon le profil ─
    if _is_project_workspace and sujet_context:
        pour_commencer = f"""CONTEXTE DU PROJET :
{sujet_context}

INSTRUCTION — Impact sur le projet :
Pour chaque nouveauté significative parmi les items ci-dessus, évalue si elle concerne directement ce projet.
Si oui, inclus un bloc "⚡ Impact projet" avec :
- Quel composant ou partie du stack est concerné
- De quel type : dépréciation imminente / faille sécurité / opportunité (gain de temps, simplification, renforcement)
- Si c'est actionnable maintenant ou à surveiller à moyen terme

Format : titre en gras, impact en 1-2 phrases, lien → URL [READ:id]
Limite-toi aux 2-3 items les plus pertinents pour le projet. Si aucun item n'a d'impact direct, omet cette section."""
    elif sujet_context:
        pour_commencer = f"""PROFIL D'APPRENTISSAGE DE L'UTILISATEUR :
{sujet_context}

INSTRUCTION : Parmi les items listés ci-dessus, sélectionne UNIQUEMENT 2-3 articles qui respectent TOUTES ces contraintes :
1. L'article porte sur un outil ou concept EXPLICITEMENT prioritaire dans le profil (section "Sujets et niveaux" ou "Acteurs, outils, frameworks")
2. L'article N'EST PAS dans la section "Hors périmètre" du profil
3. Si une section "Hors périmètre" mentionne explicitement un thème (ex: vision, multimodal, hardware), tout article sur ce thème est EXCLU même s'il vient d'un acteur clé
4. PRIORITÉ AUX ARTICLES INTRODUCTIFS : préférer un article qui explique CE QU'EST l'outil ou le concept (définition, cas d'usage, pourquoi ça existe) plutôt qu'un article sur une feature avancée.
5. Pour chaque article : vérifie que son titre et résumé suggèrent une introduction ou un cas d'usage concret, pas une configuration avancée.

Pour chaque article retenu : titre en gras, 1 phrase expliquant CE QUE L'OUTIL FAIT et pourquoi c'est un bon point de départ, lien → URL [READ:id]"""
    else:
        pour_commencer = "(Omettre cette section — aucun profil disponible.)"

    prompt = _BRIEFING_PROMPT.format(
        hours=hours,
        date=today_str,
        items_text=items_text[:14000],
        groups_section=groups_section[:12000],
        sujet_context=sujet_context,
        pour_commencer=pour_commencer,
    )

    markdown, usage = await llm.generate(
        prompt=prompt,
        system_prompt=_BRIEFING_SYSTEM,
        temperature=0.4,
        max_tokens=2500,
        top_p=0.9,
    )

    # ── Stats ──────────────────────────────────────────────────────────────
    from collections import Counter
    kw_counter: Counter = Counter()
    for item in items:
        for kw in (item.get("keywords") or []):
            kw_counter[kw.lower()] += 1
    top_trends = [{"keyword": kw, "count": cnt} for kw, cnt in kw_counter.most_common(8)]

    tiers = [i["reliability_tier"] for i in items]
    stats = {
        "total_items":    len(items),
        "critical":       sum(1 for i in items if i["importance"] == "critical"),
        "high":           sum(1 for i in items if i["importance"] == "high"),
        "groups":         list(groups.keys()),
        "tiers":          dict(Counter(tiers)),
        "period_hours":   hours,
        "reliability_filtered": True,
    }

    # ── Construire les sources citées ──────────────────────────────────────
    cited_sources = [
        {
            "id":    it["id"],
            "title": it["title"],
            "url":   it["url"],
            "tier":  it["reliability_tier"],
            "score": it["reliability_score"],
        }
        for it in items
    ]

    return {
        "markdown":        markdown,
        "top_items":       items[:10],
        "cited_sources":   cited_sources,
        "groups":          {k: [i["id"] for i in v] for k, v in groups.items()},
        "trends":          top_trends,
        "stats":           stats,
        "tokens_used":     usage.get("total_tokens", 0),
        "cost_usd":        llm.calculate_cost(usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
                           if hasattr(llm, "calculate_cost") else 0.0,
    }


@api_router.post("/briefing/generate")
async def generate_briefing(data: Dict[str, Any] = {}):
    """Generate and save a briefing for today (or custom period)."""
    try:
        import datetime as _dt
        import json as _json

        hours = int(data.get("hours", 24))
        workspace_id = data.get("workspace_id")
        sujet_id = data.get("sujet_id")
        force = bool(data.get("force", False))
        today = _dt.date.today()

        # Check if briefing already exists for today (scoped by sujet_id)
        if not force:
            with db.get_connection() as conn:
                with conn.cursor() as cur:
                    if sujet_id is not None:
                        cur.execute(
                            "SELECT id FROM daily_briefings WHERE briefing_date = %s AND sujet_id = %s",
                            (today, sujet_id)
                        )
                    else:
                        cur.execute(
                            "SELECT id FROM daily_briefings WHERE briefing_date = %s AND sujet_id IS NULL",
                            (today,)
                        )
                    existing = cur.fetchone()
            if existing:
                return {"already_exists": True, "date": str(today), "id": existing[0]}

        result = await _generate_briefing_content(hours, workspace_id, sujet_id)
        if "error" in result:
            raise HTTPException(status_code=422, detail=result["message"])
        if result.get("no_new_content"):
            return {"no_new_content": True, "date": str(today), "message": result["message"]}

        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Supprimer l'éventuel briefing existant (cas force=True)
                if sujet_id is not None:
                    cur.execute(
                        "DELETE FROM daily_briefings WHERE briefing_date = %s AND sujet_id = %s",
                        (today, sujet_id)
                    )
                else:
                    cur.execute(
                        "DELETE FROM daily_briefings WHERE briefing_date = %s AND sujet_id IS NULL",
                        (today,)
                    )
                _no_new = len(result.get("top_items", [])) == 0
                cur.execute(
                    """INSERT INTO daily_briefings
                       (briefing_date, executive_summary, top_items, trends, stats,
                        workspace_id, sujet_id, tokens_used, cost_usd, cited_sources, groups,
                        no_new_content)
                       VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb, %s, %s, %s, %s,
                               %s::jsonb, %s::jsonb, %s)
                       RETURNING id""",
                    (
                        today,
                        result["markdown"],
                        _json.dumps(result["top_items"]),
                        _json.dumps(result["trends"]),
                        _json.dumps(result["stats"]),
                        workspace_id,
                        sujet_id,
                        result["tokens_used"],
                        result["cost_usd"],
                        _json.dumps(result.get("cited_sources", [])),
                        _json.dumps(result.get("groups", {})),
                        _no_new,
                    )
                )
                briefing_id = cur.fetchone()[0]
                conn.commit()

        return {
            "success":       True,
            "id":            briefing_id,
            "date":          str(today),
            "markdown":      result["markdown"],
            "top_items":     result["top_items"],
            "cited_sources": result.get("cited_sources", []),
            "groups":        result.get("groups", {}),
            "trends":        result["trends"],
            "stats":         result["stats"],
            "tokens_used":   result["tokens_used"],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating briefing: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/briefing/list")
async def list_briefings(limit: int = Query(default=30, ge=1, le=90)):
    """List past briefings (most recent first)."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, briefing_date, stats, tokens_used, generated_at,
                              LEFT(executive_summary, 300)
                       FROM daily_briefings
                       ORDER BY briefing_date DESC LIMIT %s""",
                    (limit,)
                )
                rows = cur.fetchall()
        return [
            {
                "id": r[0],
                "date": str(r[1]),
                "stats": r[2],
                "tokens_used": r[3],
                "generated_at": r[4].isoformat() if r[4] else None,
                "excerpt": r[5],
            }
            for r in rows
        ]
    except Exception as e:
        logger.error(f"Error listing briefings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/briefing/today")
async def get_today_briefing(sujet_id: Optional[int] = Query(default=None)):
    """Get today's briefing if it exists, optionally scoped by sujet_id."""
    try:
        import datetime as _dt
        today = _dt.date.today()
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                if sujet_id is not None:
                    cur.execute(
                        """SELECT id, briefing_date, executive_summary, top_items, trends, stats,
                                  tokens_used, cost_usd, generated_at,
                                  cited_sources, groups, no_new_content
                           FROM daily_briefings WHERE briefing_date = %s AND sujet_id = %s""",
                        (today, sujet_id)
                    )
                else:
                    cur.execute(
                        """SELECT id, briefing_date, executive_summary, top_items, trends, stats,
                                  tokens_used, cost_usd, generated_at,
                                  cited_sources, groups, no_new_content
                           FROM daily_briefings WHERE briefing_date = %s AND sujet_id IS NULL""",
                        (today,)
                    )
                row = cur.fetchone()
        if not row:
            # Diagnostic : pourquoi pas de brief aujourd'hui ?
            diag = {}
            with db.get_connection() as conn2:
                with conn2.cursor() as cur2:
                    cur2.execute("SELECT COUNT(*) FROM sources WHERE is_active = TRUE")
                    diag["sources_actives"] = cur2.fetchone()[0]
                    cur2.execute(
                        "SELECT COUNT(*) FROM items WHERE collected_at::date = %s", (today,)
                    )
                    diag["items_collectes_today"] = cur2.fetchone()[0]
                    cur2.execute(
                        "SELECT COUNT(*) FROM items WHERE collected_at::date = %s AND reliability_score >= 0.5",
                        (today,)
                    )
                    diag["items_fiables_today"] = cur2.fetchone()[0]
                    cur2.execute(
                        "SELECT MAX(generated_at) FROM daily_briefings"
                    )
                    last = cur2.fetchone()[0]
                    diag["dernier_brief"] = last.isoformat() if last else None
            return {"exists": False, "no_new_content": False, "date": str(today), "diagnostic": diag}
        return {
            "exists": True,
            "id": row[0], "date": str(row[1]),
            "markdown": row[2], "top_items": row[3],
            "trends": row[4], "stats": row[5],
            "tokens_used": row[6], "cost_usd": float(row[7] or 0),
            "generated_at": row[8].isoformat() if row[8] else None,
            "cited_sources": row[9] or [],
            "groups": row[10] or {},
            "no_new_content": bool(row[11]),
        }
    except Exception as e:
        logger.error(f"Error fetching today briefing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/briefing/{briefing_id}")
async def get_briefing(briefing_id: int):
    """Get a single briefing by ID."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """SELECT id, briefing_date, executive_summary, top_items, trends, stats,
                              tokens_used, cost_usd, generated_at,
                              cited_sources, groups
                       FROM daily_briefings WHERE id = %s""",
                    (briefing_id,)
                )
                row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Briefing not found")
        return {
            "id": row[0], "date": str(row[1]),
            "markdown": row[2], "top_items": row[3],
            "trends": row[4], "stats": row[5],
            "tokens_used": row[6], "cost_usd": float(row[7] or 0),
            "generated_at": row[8].isoformat() if row[8] else None,
            "cited_sources": row[9] or [],
            "groups": row[10] or {},
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching briefing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/briefing/{briefing_id}")
async def delete_briefing(briefing_id: int):
    """Supprime un briefing de l'historique."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM daily_briefings WHERE id = %s RETURNING id", (briefing_id,))
                if not cur.fetchone():
                    raise HTTPException(status_code=404, detail="Briefing introuvable")
                conn.commit()
        return {"ok": True}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/briefing")
async def delete_all_briefings():
    """Vide tout l'historique des briefings."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM daily_briefings RETURNING id")
                count = cur.rowcount
                conn.commit()
        return {"ok": True, "deleted": count}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================
# RAG Streaming (SSE)
# ===========================================

@api_router.post("/rag/ask/stream")
async def rag_ask_stream(request: Dict[str, Any]):
    """
    SSE endpoint — stream la réponse RAG token par token.
    Format : data: <token>\n\n
    Événements spéciaux : data: [SOURCES]<json>\n\n  puis  data: [DONE]\n\n
    """
    query = request.get("query", "").strip()
    if not query:
        raise HTTPException(status_code=400, detail="Query is required")
    if not settings.anthropic_api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY non configurée")

    workspace_id_raw = request.get("workspace_id")
    workspace_id = int(workspace_id_raw) if workspace_id_raw is not None else None
    use_hybrid = request.get("use_hybrid_search", True)

    async def event_stream() -> AsyncGenerator[str, None]:
        import json
        import asyncio
        from argos.services.rag import RAGService, RAG_SYSTEM_PROMPT, RAG_USER_PROMPT_TEMPLATE
        from argos.services.vector_store_singleton import get_vector_store

        try:
            # ── 1. Retrieve (synchronous, run in thread) ─────────────────
            vs = get_vector_store()
            if use_hybrid:
                search_results = await asyncio.to_thread(
                    vs.hybrid_search, query=query, limit=8, workspace_id=workspace_id
                )
            else:
                search_results = await asyncio.to_thread(
                    vs.search, query=query, limit=8, workspace_id=workspace_id
                )

            if not search_results:
                yield "data: Je n'ai pas trouvé d'informations pertinentes dans la base de connaissances.\n\n"
                yield "data: [DONE]\n\n"
                return

            # ── 2. Build prompt ──────────────────────────────────────────
            rag_svc = RAGService(
                llm_provider=None, vector_store=vs, db_manager=db, top_k=8
            )
            sources_text, sources_list = rag_svc._format_sources(search_results)
            user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
                sources=sources_text, query=query
            )

            # ── 3. Envoyer les sources d'abord ───────────────────────────
            yield f"data: [SOURCES]{json.dumps(sources_list, ensure_ascii=False)}\n\n"

            # ── 4. Stream Claude ─────────────────────────────────────────
            import anthropic
            client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)

            full_answer = []
            async with client.messages.stream(
                model="claude-opus-4-5",
                max_tokens=2500,
                system=RAG_SYSTEM_PROMPT,
                messages=[{"role": "user", "content": user_prompt}],
            ) as stream:
                async for text in stream.text_stream:
                    full_answer.append(text)
                    # Échapper les newlines pour SSE
                    escaped = text.replace("\n", "\\n")
                    yield f"data: {escaped}\n\n"

            yield "data: [DONE]\n\n"

            # ── 5. Log en background ─────────────────────────────────────
            answer = "".join(full_answer)
            try:
                usage = (await stream.get_final_message()).usage
                tokens_used = usage.input_tokens + usage.output_tokens
                cost_usd = tokens_used * 0.000015  # approximation claude-opus
                with db.get_connection() as conn:
                    with conn.cursor() as cur:
                        cur.execute("""
                            INSERT INTO rag_queries (query, answer, sources, tokens_used, cost_usd)
                            VALUES (%s, %s, %s::jsonb, %s, %s)
                        """, (query, answer, json.dumps(sources_list), tokens_used, cost_usd))
                        conn.commit()
            except Exception as log_err:
                logger.warning(f"[SSE] Log RAG query failed : {log_err}")

        except Exception as e:
            logger.error(f"[SSE] Erreur stream RAG : {e}", exc_info=True)
            yield f"data: [ERROR]{str(e)}\n\n"
            yield "data: [DONE]\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
