"""
REST API Router for AcademiaOps Web Interface

Provides REST endpoints alongside the existing JSON-RPC interface.
"""

from fastapi import APIRouter, HTTPException, Query, BackgroundTasks, UploadFile, File, Form, Header
from typing import Optional, Dict, Any
import logging
from datetime import datetime, timezone
from pathlib import Path

from mcp_server.database import DatabaseManager
from mcp_server.config import settings
from mcp_server.services.llm_provider import create_llm_provider

logger = logging.getLogger(__name__)

# Create router
api_router = APIRouter(prefix="/api/v1", tags=["api"])

# Import and include sub-routers
from mcp_server.api.workspaces import router as workspaces_router
api_router.include_router(workspaces_router)

# Database instance
db = DatabaseManager(settings.database_url)


# ===========================================
# Background: auto-collect + auto-classify
# ===========================================

async def _auto_collect_and_classify(source_id: int):
    """Background task: collect items from a source then classify them all."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id, name, url, type, workspace_id FROM sources WHERE id = %s AND active = TRUE",
                    (source_id,)
                )
                row = cur.fetchone()
                if not row:
                    return
                src_id, src_name, src_url, src_type, src_wid = row

        from mcp_server.services.collector import CollectorService
        collector = CollectorService(db_manager=db)

        items = []
        if src_type == 'rss':
            config = {"url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_rss_feed(config)
            for i in items:
                i.update({'workspace_id': src_wid, 'source_url': src_url})
        elif src_type == 'website':
            items = collector.fetch_website_page(src_url, workspace_id=src_wid)
        elif src_type == 'github':
            config = {"type": "github", "url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_github_repos(config)
            for i in items:
                i.update({'workspace_id': src_wid, 'source_url': src_url})
        else:
            logger.warning(f"[auto-collect] source type '{src_type}' not supported")
            return

        inserted, duplicates = collector.insert_items(items)
        logger.info(f"[auto-collect] source={source_id} fetched={len(items)} inserted={inserted} duplicates={duplicates}")

        # Fetch all pending items from this source URL and classify them
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT id FROM items WHERE source_url = %s AND classification_status = 'pending'",
                    (src_url,)
                )
                pending_ids = [r[0] for r in cur.fetchall()]

        if not pending_ids:
            logger.info(f"[auto-classify] no pending items for source={source_id}")
            return

        from mcp_server.services.classifier import ClassifierService
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            openai_api_key=settings.openai_api_key,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model=settings.default_classification_model
        )
        classifier = ClassifierService(llm_provider=llm_provider, db_manager=db, temperature=0.5, max_tokens=800)

        logger.info(f"[auto-classify] classifying {len(pending_ids)} items for source={source_id}")
        for item_id in pending_ids:
            try:
                await classifier.classify_item(item_id)
                logger.info(f"[auto-classify] item={item_id} classified")
            except Exception as e:
                logger.error(f"[auto-classify] item={item_id} failed: {e}")

    except Exception as e:
        logger.error(f"[auto-collect-classify] source={source_id} error={e}", exc_info=True)


# ===========================================
# Stats Endpoints
# ===========================================

@api_router.get("/stats/global")
async def get_global_stats():
    """Get global statistics."""
    try:
        stats = db.get_classification_stats()
        
        # Calculate totals from stats
        classified_items = stats.get("classified", 0)
        pending_items = stats.get("pending", 0)
        total_items = classified_items + pending_items
        
        # Get total cost
        total_cost, _ = db.get_total_cost()

        # Date-filtered costs
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        cost_today = db.get_cost_for_period(today_start, now)
        cost_this_month = db.get_cost_for_period(month_start, now)
        
        # Get course counts
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM courses WHERE status = 'published'")
                published_courses = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM courses WHERE status = 'draft'")
                draft_courses = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM courses")
                total_courses = cur.fetchone()[0]
        
        return {
            "total_items": total_items,
            "classified_items": classified_items,
            "pending_items": pending_items,
            "total_courses": total_courses,
            "published_courses": published_courses,
            "draft_courses": draft_courses,
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
                # Get daily item collection counts
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
                
                # Get daily course generation counts
                cur.execute("""
                    SELECT 
                        DATE(created_at) as date,
                        COUNT(*) as courses_generated
                    FROM courses
                    WHERE created_at >= NOW() - INTERVAL '%s days'
                    GROUP BY DATE(created_at)
                    ORDER BY date DESC
                """, (days,))
                
                courses_data = {row[0]: row[1] for row in cur.fetchall()}
        
        # Combine data
        timeline = []
        for row in items_data:
            date_str = row[0].strftime("%Y-%m-%d") if hasattr(row[0], 'strftime') else str(row[0])
            timeline.append({
                "date": date_str,
                "items_collected": row[1],
                "items_classified": row[2],
                "courses_generated": courses_data.get(row[0], 0)
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
                # Get topic counts from subject column
                cur.execute("""
                    SELECT 
                        subject as topic,
                        COUNT(*) as item_count,
                        COUNT(DISTINCT CASE WHEN classification_status = 'classified' THEN id END) as classified_count
                    FROM items
                    WHERE subject IS NOT NULL
                    GROUP BY subject
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


@api_router.get("/stats/costs")
async def get_costs_stats(period: str = Query(default="month", regex="^(week|month|year)$")):
    """Get daily cost breakdown over the requested period."""
    try:
        days = {"week": 7, "month": 30, "year": 365}.get(period, 30)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT
                        DATE(decided_at) as date,
                        COALESCE(SUM(cost_usd), 0) as total
                    FROM decisions
                    WHERE decided_at >= NOW() - INTERVAL '%s days'
                      AND cost_usd IS NOT NULL
                    GROUP BY DATE(decided_at)
                    ORDER BY date ASC
                    LIMIT %s
                """, (days, days))
                rows = cur.fetchall()

        return [
            {
                "date": row[0].strftime("%Y-%m-%d") if hasattr(row[0], "strftime") else str(row[0]),
                "classifier_cost": float(row[1]) * 0.3,
                "course_generator_cost": float(row[1]) * 0.5,
                "rag_cost": float(row[1]) * 0.2,
                "total": float(row[1]),
            }
            for row in rows
        ]
    except Exception as e:
        logger.error(f"Error fetching costs stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# Items Endpoints
# ============================================

@api_router.get("/items")
async def list_items(
    status: str = Query(default="all", description="Filter by status: all, pending, classified"),
    source: str = Query(default="all", description="Filter by source"),
    workspace_id: Optional[int] = Query(default=None, description="Filter by workspace ID"),
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
                
                
                if source != "all":
                    where_conditions.append("source_type = %s")
                    params.append(source)
                
                if workspace_id is not None:
                    where_conditions.append("workspace_id = %s")
                    params.append(workspace_id)
                
                where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
                
                query = f"""
                    SELECT 
                        id, title, summary, url, source_type, source_url,
                        subject, importance, classification_status,
                        published_at, created_at, workspace_id,
                        keywords
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
                        "importance": row[7],
                        "classification_status": row[8],
                        "status": row[8],  # backward compat alias
                        "published_at": row[9].isoformat() if row[9] else None,
                        "created_at": row[10].isoformat() if row[10] else None,
                        "workspace_id": row[11],
                        "topics": row[12] or []
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
        from mcp_server.services.classifier import ClassifierService
        from mcp_server.services.llm_provider import create_llm_provider

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
        from mcp_server.services.classifier import ClassifierService
        from mcp_server.services.llm_provider import create_llm_provider
        
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


# ============================================
# Courses Endpoints
# ============================================

@api_router.get("/courses")
async def list_courses(
    status: str = Query(default="all"),
    workspace_id: Optional[int] = Query(default=None, description="Filter by workspace ID"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0)
):
    """List courses with optional filters."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                where_conditions = []
                params = []
                
                if status != "all":
                    where_conditions.append("status = %s")
                    params.append(status)
                
                if workspace_id is not None:
                    where_conditions.append("c.workspace_id = %s")
                    params.append(workspace_id)
                
                where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
                
                query = f"""
                    SELECT 
                        c.id, c.title, c.subject, c.level,
                        c.estimated_duration_minutes, c.status, c.qa_score,
                        c.created_at, c.published_at,
                        i.source_url, i.source_type, i.url as item_url,
                        c.content_type
                    FROM courses c
                    LEFT JOIN items i ON i.id = c.item_id
                    WHERE {where_clause}
                    ORDER BY c.created_at DESC
                    LIMIT %s OFFSET %s
                """
                
                params.extend([limit, offset])
                cur.execute(query, params)
                
                courses = []
                for row in cur.fetchall():
                    courses.append({
                        "id": row[0],
                        "title": row[1],
                        "topic": row[2],
                        "level": row[3],
                        "duration": row[4],
                        "status": row[5],
                        "qa_score": float(row[6]) if row[6] else None,
                        "created_at": row[7].isoformat() if row[7] else None,
                        "published_at": row[8].isoformat() if row[8] else None,
                        "source_url": row[9],
                        "source_type": row[10],
                        "item_url": row[11],
                        "content_type": row[12],
                    })
                
                # Get total count
                count_query = f"SELECT COUNT(*) FROM courses c WHERE {where_clause}"
                cur.execute(count_query, params[:-2])  # Exclude limit and offset
                total = cur.fetchone()[0]
                
                return {"courses": courses, "total": total}
    except Exception as e:
        logger.error(f"Error listing courses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/courses/{course_id}")
async def get_course(course_id: int):
    """Get a single course by ID."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, title, subject, level,
                        estimated_duration_minutes, status, qa_score,
                        created_at, published_at, content,
                        content_type
                    FROM courses
                    WHERE id = %s
                """, (course_id,))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Course not found")
                
                return {
                    "id": row[0],
                    "title": row[1],
                    "topic": row[2],
                    "level": row[3],
                    "duration": row[4],
                    "status": row[5],
                    "qa_score": float(row[6]) if row[6] else None,
                    "created_at": row[7].isoformat() if row[7] else None,
                    "published_at": row[8].isoformat() if row[8] else None,
                    "content": row[9],
                    "content_type": row[10]
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/courses/{course_id}/publish")
async def publish_course(course_id: int):
    """Publish a course and automatically index it in RAG."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # First check if course exists and is in draft or review
                cur.execute("""
                    SELECT id, item_id, title, subject, content, estimated_duration_minutes, workspace_id
                    FROM courses
                    WHERE id = %s AND status IN ('draft', 'review')
                """, (course_id,))
                
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Course not found or already published")
                
                course = {
                    "id": row[0],
                    "item_id": row[1],
                    "title": row[2],
                    "subject": row[3],
                    "content": row[4],
                    "duration": row[5],
                    "workspace_id": row[6]
                }
                
                # Publish course
                cur.execute("""
                    UPDATE courses
                    SET status = 'published',
                        published_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (course_id,))
                
                conn.commit()
        
        # Index course in RAG system using singleton (with Bedrock Embeddings!)
        try:
            from mcp_server.services.vector_store_singleton import get_vector_store
            
            vector_store = get_vector_store()
            
            chunks_count = vector_store.index_course(course)
            logger.info(f"Course {course_id} indexed with {chunks_count} chunks")
            
            return {
                "message": "Course published and indexed successfully",
                "course_id": course_id,
                "chunks_indexed": chunks_count
            }
        except Exception as e:
            logger.warning(f"Course published but indexing failed: {e}")
            return {
                "message": "Course published but indexing failed",
                "course_id": course_id,
                "indexing_error": str(e)
            }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error publishing course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/courses/generate")
async def generate_course_from_item(request: Dict[str, Any]):
    """
    Generate a complete pedagogical course from a classified item.
    
    Request body:
    {
        "item_id": 123,
        "duration_minutes": 180,  // optional, default 180
        "language": "fr"  // optional, default "fr"
    }
    """
    try:
        item_id = request.get("item_id")
        if not item_id:
            raise HTTPException(status_code=400, detail="item_id is required")
        
        duration_minutes = request.get("duration_minutes", 180)
        language = request.get("language", "fr")
        content_type = request.get("content_type", "course")
        
        # Import here to avoid circular dependency
        from mcp_server.tools.auto_course_generator import generate_course_from_item
        
        # Generate course
        result = await generate_course_from_item(
            item_id=item_id,
            duration_minutes=duration_minutes,
            language=language,
            content_type=content_type
        )
        
        if "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])
        
        return {
            "message": "Course generated successfully",
            "course_id": result.get("course_id"),
            "item_id": item_id,
            "status": "draft",
            "tokens_used": result.get("tokens_used", 0),
            "cost": result.get("cost", 0.0),
            "content_length": result.get("content_length", 0)
        }
    except Exception as e:
        logger.error(f"Error generating course: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/courses/{course_id}/modify")
async def modify_course_with_llm(course_id: int, request: Dict[str, Any]):
    """
    Modify course content using LLM based on user instructions.
    
    Request body:
    {
        "instruction": "Ajouter des exemples concrets",
        "section": "all"  // optional, specific section to modify
    }
    """
    try:
        instruction = request.get("instruction")
        if not instruction:
            raise HTTPException(status_code=400, detail="instruction is required")
        
        db = DatabaseManager(settings.database_url)
        
        # Get course
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT id, content, title, subject FROM courses WHERE id = %s", (course_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Course not found")
                
                course_content = row[1]
                course_title = row[2]
                course_subject = row[3]
        
        # Use LLM to modify
        llm_provider = create_llm_provider(
            provider_type=settings.llm_provider,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            openai_api_key=settings.openai_api_key,
            model=settings.aws_bedrock_model if settings.llm_provider == "aws" else settings.default_classification_model
        )
        
        system_prompt = "Tu es un expert pédagogique. Tu dois modifier le contenu d'un cours selon les instructions de l'utilisateur tout en conservant la structure et la qualité du cours."
        user_prompt = f"""COURS ACTUEL:
Titre: {course_title}
Sujet: {course_subject}

{course_content}

---

INSTRUCTION: {instruction}

Modifie le cours en suivant cette instruction. Retourne UNIQUEMENT le contenuen markdown modifié, sans commentaires additionnels."""
        
        modified_content, usage = await llm_provider.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            max_tokens=10000,
            temperature=0.7
        )
        
        # Update course
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE courses SET content = %s, updated_at = CURRENT_TIMESTAMP WHERE id = %s",
                    (modified_content, course_id)
                )
                conn.commit()
        
        tokens_used = usage.get("total_tokens", 0)
        cost = llm_provider.calculate_cost(usage.get("prompt_tokens", 0), usage.get("completion_tokens", 0))
        
        return {
            "message": "Course modified successfully",
            "course_id": course_id,
            "tokens_used": tokens_used,
            "cost": cost
        }
    except Exception as e:
        logger.error(f"Error modifying course: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.delete("/courses/{course_id}")
async def delete_course(course_id: int):
    """Delete a course."""
    try:
        db = DatabaseManager(settings.database_url)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("DELETE FROM courses WHERE id = %s RETURNING id", (course_id,))
                deleted = cur.fetchone()
                if not deleted:
                    raise HTTPException(status_code=404, detail="Course not found")
                conn.commit()
        
        return {"message": "Course deleted successfully", "course_id": course_id}
    except Exception as e:
        logger.error(f"Error deleting course: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/courses/{course_id}/export/markdown")
async def export_course_markdown(course_id: int):
    """Export course as Markdown file."""
    try:
        db = DatabaseManager(settings.database_url)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT title, content FROM courses WHERE id = %s", (course_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Course not found")
                
                title, content = row
        
        from fastapi.responses import Response
        filename = f"{title.replace(' ', '_')}.md"
        
        return Response(
            content=content,
            media_type="text/markdown",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    except Exception as e:
        logger.error(f"Error exporting markdown: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/courses/{course_id}/export/pdf")
async def export_course_pdf(course_id: int):
    """Export course as PDF file."""
    try:
        db = DatabaseManager(settings.database_url)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT title, content FROM courses WHERE id = %s", (course_id,))
                row = cur.fetchone()
                if not row:
                    raise HTTPException(status_code=404, detail="Course not found")
                
                title, content = row
        
        # Import markdown library for conversion
        import markdown
        from fastapi.responses import Response
        
        # Check if pre-generated PDF exists
        from mcp_server.services.pdf_generator import get_pdf_path, generate_html_export
        from pathlib import Path
        
        pdf_path = get_pdf_path(course_id)
        
        if pdf_path and pdf_path.exists():
            # Serve pre-generated PDF
            logger.info(f"📄 Serving pre-generated PDF for course {course_id}")
            filename = f"{title.replace(' ', '_')}.pdf"
            
            with open(pdf_path, 'rb') as f:
                pdf_content = f.read()
            
            return Response(
                content=pdf_content,
                media_type="application/pdf",
                headers={
                    "Content-Disposition": f"attachment; filename={filename}",
                    "Content-Type": "application/pdf"
                }
            )
        
        # Fallback: Generate HTML on-the-fly
        logger.warning(f"⚠️ No PDF found for course {course_id}, generating HTML fallback")
        html_content = generate_html_export(title, content)
        filename = f"{title.replace(' ', '_')}.html"
        
        return Response(
            content=html_content,
            media_type="text/html",
            headers={
                "Content-Disposition": f"attachment; filename={filename}",
                "Content-Type": "text/html; charset=utf-8"
            }
        )
    except Exception as e:
        logger.error(f"Error exporting PDF: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/courses/{course_id}/validate")
async def validate_course(course_id: int):
    """Mark course as validated/approved."""
    try:
        db = DatabaseManager(settings.database_url)
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE courses SET status = 'review', updated_at = CURRENT_TIMESTAMP WHERE id = %s RETURNING id",
                    (course_id,)
                )
                updated = cur.fetchone()
                if not updated:
                    raise HTTPException(status_code=404, detail="Course not found")
                conn.commit()
        
        return {"message": "Course validated successfully", "course_id": course_id, "status": "review"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error validating course: {e}")
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
    from mcp_server.services.document_extractor import extract_document, SUPPORTED_MIME_TYPES

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
        from mcp_server.services.rag import RAGService
        from mcp_server.services.vector_store_singleton import get_vector_store
        from mcp_server.services.llm_provider import create_llm_provider
        
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
            top_k=5,
            temperature=0.6
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


@api_router.post("/rag/index-all-courses")
async def index_all_courses():
    """Index all published courses in the RAG system."""
    try:
        from mcp_server.services.vector_store_singleton import get_vector_store
        
        # Use pre-loaded singleton (fast)
        vector_store = get_vector_store()
        
        # Fetch all published courses
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, item_id, title, subject, content, estimated_duration_minutes, workspace_id
                    FROM courses
                    WHERE status = 'published'
                    ORDER BY created_at DESC
                """)
                
                courses = []
                for row in cur.fetchall():
                    courses.append({
                        "id": row[0],
                        "item_id": row[1],
                        "title": row[2],
                        "subject": row[3],
                        "content": row[4],
                        "duration": row[5],
                        "workspace_id": row[6]
                    })
        
        if not courses:
            return {
                "message": "No published courses to index",
                "courses_indexed": 0,
                "total_chunks": 0
            }
        
        # Index each course
        total_chunks = 0
        indexed_count = 0
        errors = []
        
        for course in courses:
            try:
                chunks_count = vector_store.index_course(course)
                total_chunks += chunks_count
                indexed_count += 1
                logger.info(f"Indexed course {course['id']}: {chunks_count} chunks")
            except Exception as e:
                logger.error(f"Error indexing course {course['id']}: {e}")
                errors.append({
                    "course_id": course['id'],
                    "error": str(e)
                })
        
        return {
            "message": f"Indexed {indexed_count} courses with {total_chunks} chunks",
            "courses_indexed": indexed_count,
            "total_chunks": total_chunks,
            "errors": errors if errors else None
        }
        
    except Exception as e:
        logger.error(f"Error indexing courses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/rag/stats")
async def rag_stats():
    """Get RAG system statistics."""
    try:
        from mcp_server.services.vector_store import VectorStoreService
        
        vector_store = VectorStoreService(
            db_path=str(settings.lancedb_path),
            model_name=settings.embedding_model
        )
        
        stats = vector_store.get_stats()
        
        # Add course counts from database
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT COUNT(*) FROM courses WHERE status = 'published'")
                published_courses = cur.fetchone()[0]
                
                cur.execute("SELECT COUNT(*) FROM rag_queries")
                total_queries = cur.fetchone()[0]
        
        return {
            "vector_store": stats,
            "published_courses": published_courses,
            "total_queries": total_queries,
            "embedding_model": settings.embedding_model,
            "lancedb_path": str(settings.lancedb_path)
        }
        
    except Exception as e:
        logger.error(f"Error fetching RAG stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# HITL Endpoints
# ============================================

@api_router.get("/hitl/pending")
async def get_pending_decisions():
    """Get pending HITL decisions."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT 
                        id, title, url, source_type, subject,
                        importance, classification_status,
                        created_at
                    FROM items
                    WHERE validation_status = 'pending'
                        AND classification_status = 'classified'
                    ORDER BY created_at DESC
                    LIMIT 50
                """)
                
                items = []
                for row in cur.fetchall():
                    items.append({
                        "id": row[0],
                        "title": row[1],
                        "url": row[2],
                        "source_type": row[3],
                        "subject": row[4],
                        "importance": row[5],
                        "classification_status": row[6],
                        "created_at": row[7].isoformat() if row[7] else None
                    })
                
                return {"items": items, "total": len(items)}
    except Exception as e:
        logger.error(f"Error fetching pending decisions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/hitl/decide")
async def make_decision(request: Dict[str, Any]):
    """Make a HITL decision."""
    try:
        item_id = request.get("item_id")
        decision = request.get("decision")  # approve, reject, modify
        
        if not item_id or not decision:
            raise HTTPException(status_code=400, detail="item_id and decision are required")
        
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                # Record the decision
                cur.execute("""
                    INSERT INTO decisions (
                        decision_type, item_id, decision, decided_by
                    ) VALUES (%s, %s, %s, %s)
                """, ("item_validation", item_id, decision, "admin"))
                
                # Update item validation status
                validation_status = "approved" if decision == "approve" else "rejected"
                cur.execute("""
                    UPDATE items
                    SET validation_status = %s,
                        validated_at = CURRENT_TIMESTAMP,
                        validated_by = %s
                    WHERE id = %s
                """, (validation_status, "admin", item_id))
                
                conn.commit()
        
        return {"message": "Decision recorded successfully", "item_id": item_id, "decision": decision}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error making decision: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/hitl/bot-status")
async def get_bot_status():
    """Get Telegram bot status."""
    try:
        # Placeholder for bot status
        return {
            "running": False,
            "last_check": None,
            "pending_count": 0
        }
    except Exception as e:
        logger.error(f"Error fetching bot status: {e}")
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

        from mcp_server.services.collector import CollectorService
        collector = CollectorService(db_manager=db)

        items: list = []
        if src_type == 'rss':
            config = {"url": src_url, "name": src_name or src_url, "enabled": True}
            items = collector.fetch_rss_feed(config)
            for item in items:
                item['workspace_id'] = src_wid
                item['source_url'] = src_url
        elif src_type == 'website':
            items = collector.fetch_website_page(src_url, workspace_id=src_wid)
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


@api_router.post("/workspaces/{workspace_id}/collect")
async def collect_workspace_sources(workspace_id: int):
    """Trigger collection for ALL active sources of a workspace."""
    try:
        from mcp_server.services.collector import CollectorService
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
        from mcp_server.services.site_monitor import get_site_monitor, SiteMonitorService
        from mcp_server.services.teams_bot import get_teams_bot
        from mcp_server.config import settings as app_settings

        monitor = get_site_monitor()
        if monitor is None:
            # Initialisation à la volée si le serveur ne l'a pas fait
            teams_bot = get_teams_bot(app_settings.teams_webhook_url)
            monitor = SiteMonitorService(
                db_manager=db,
                teams_bot=teams_bot,
            )

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
        from mcp_server.services.site_monitor import get_site_monitor, SiteMonitorService
        from mcp_server.services.teams_bot import get_teams_bot
        from mcp_server.config import settings as app_settings

        monitor = get_site_monitor()
        if monitor is None:
            teams_bot = get_teams_bot(app_settings.teams_webhook_url)
            monitor = SiteMonitorService(db_manager=db, teams_bot=teams_bot)

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
_CODEBASE_EXTENSIONS = {".py", ".ts", ".tsx", ".sql", ".yaml", ".yml", ".md"}
_CODEBASE_ROOTS = [
    Path("/app/mcp_server"),
]
_CODEBASE_SKIP_DIRS = {"__pycache__", ".git", "node_modules", "dist", ".venv", "venv"}
_CODEBASE_MAX_FILE_BYTES = 200_000  # skip very large files


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
            if fpath.stat().st_size > _CODEBASE_MAX_FILE_BYTES:
                continue
            try:
                content = fpath.read_text(encoding="utf-8", errors="replace")
                rel = str(fpath.relative_to("/app"))
                yield rel, content
            except Exception:
                pass


@api_router.post("/admin/ingest-codebase")
async def admin_ingest_codebase(
    background_tasks: BackgroundTasks,
    x_admin_token: Optional[str] = Header(default=None)
):
    """Index the entire VeilleOps codebase into the RAG vector store."""
    _check_admin(x_admin_token)

    async def _run():
        from mcp_server.services.vector_store_singleton import get_vector_store
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
        from mcp_server.services.vector_store_singleton import get_vector_store
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
        from mcp_server.services.vector_store_singleton import get_vector_store
        from mcp_server.services.rag import RAGService

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

