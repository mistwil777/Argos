"""
REST API Router for AcademiaOps Web Interface

Provides REST endpoints alongside the existing JSON-RPC interface.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, Dict, Any
import logging

from mcp_server.database import DatabaseManager
from mcp_server.config import settings

logger = logging.getLogger(__name__)

# Create router
api_router = APIRouter(prefix="/api/v1", tags=["api"])

# Database instance
db = DatabaseManager(settings.database_url)


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
        
        # Calculate cost this month (simplified - would need proper date filtering)
        cost_this_month = total_cost  # For now, same as total
        
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
    """Get cost breakdown over time."""
    try:
        # For now, return simplified cost data
        # In production, this would query a costs table with timestamps
        total_cost, request_count = db.get_total_cost()
        
        return [{
            "date": "2026-02-23",  # Current date
            "classifier_cost": total_cost * 0.3,  # Approximate breakdown
            "course_generator_cost": total_cost * 0.5,
            "rag_cost": total_cost * 0.2,
            "total": total_cost
        }]
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
                
                where_clause = " AND ".join(where_conditions) if where_conditions else "1=1"
                
                query = f"""
                    SELECT 
                        id, title, summary, url, source_type, source_url,
                        subject, importance, classification_status,
                        published_at, created_at
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
                        "status": row[8],
                        "published_at": row[9].isoformat() if row[9] else None,
                        "created_at": row[10].isoformat() if row[10] else None
                    })
                
                # Get total count
                count_query = f"SELECT COUNT(*) FROM items WHERE {where_clause}"
                cur.execute(count_query, params[:-2])  # Exclude limit and offset
                total = cur.fetchone()[0]
                
                return {"items": items, "total": total}
    except Exception as e:
        logger.error(f"Error listing items: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/items/{item_id}")
async def get_item(item_id: int):
    """Get a single item by ID."""
    try:
        item = db.get_item(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        return item
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching item {item_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/items/{item_id}/classify")
async def classify_item(item_id: int):
    """Classify a single item."""
    try:
        item = db.get_item(item_id)
        if not item:
            raise HTTPException(status_code=404, detail="Item not found")
        
        # Classification logic would go here
        # For now, just mark as classified
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE items
                    SET classification_status = 'classified',
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s
                """, (item_id,))
                conn.commit()
        
        return {"message": "Item classified successfully", "item_id": item_id}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error classifying item {item_id}: {e}")
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


# ============================================
# Courses Endpoints
# ============================================

@api_router.get("/courses")
async def list_courses(
    status: str = Query(default="all"),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0)
):
    """List courses with optional filters."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                where_clause = "1=1" if status == "all" else "status = %s"
                params = [] if status == "all" else [status]
                
                query = f"""
                    SELECT 
                        id, title, subject, level,
                        estimated_duration_minutes, status, qa_score,
                        created_at, published_at
                    FROM courses
                    WHERE {where_clause}
                    ORDER BY created_at DESC
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
                        "published_at": row[8].isoformat() if row[8] else None
                    })
                
                # Get total count
                count_query = f"SELECT COUNT(*) FROM courses WHERE {where_clause}"
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
                        created_at, published_at, content
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
                    "content": row[9]
                }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching course {course_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.post("/courses/{course_id}/publish")
async def publish_course(course_id: int):
    """Publish a course."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    UPDATE courses
                    SET status = 'published',
                        published_at = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE id = %s AND status = 'draft'
                """, (course_id,))
                
                if cur.rowcount == 0:
                    raise HTTPException(status_code=404, detail="Course not found or already published")
                conn.commit()
        
        return {"message": "Course published successfully", "course_id": course_id}
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
        
        # Import here to avoid circular dependency
        from mcp_server.tools.auto_course_generator import generate_course_from_item
        
        # Generate course
        result = await generate_course_from_item(
            item_id=item_id,
            duration_minutes=duration_minutes,
            language=language
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
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating course: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# RAG Endpoints
# ============================================

@api_router.post("/rag/ask")
async def rag_ask(request: Dict[str, Any]):
    """Ask a question to the RAG system."""
    try:
        query = request.get("query")
        if not query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        # RAG logic would go here
        # For now, return a placeholder response
        return {
            "answer": "This is a placeholder response. RAG functionality is not yet implemented.",
            "sources": [],
            "confidence": 0.0
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in RAG ask: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.get("/rag/history")
async def rag_history(limit: int = Query(default=20, ge=1, le=100)):
    """Get RAG query history."""
    try:
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    SELECT id, query, answer, created_at
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
                        "created_at": row[3].isoformat() if row[3] else None
                    })
                
                return history
    except Exception as e:
        logger.error(f"Error fetching RAG history: {e}")
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
async def create_source(source: Dict[str, Any]):
    """Create a new data source."""
    try:
        # Validate required fields
        required_fields = ["name", "url", "type", "category"]
        for field in required_fields:
            if field not in source:
                raise HTTPException(status_code=400, detail=f"Missing required field: {field}")
        
        # Validate type
        if source["type"] not in ["rss", "github", "api"]:
            raise HTTPException(status_code=400, detail="Invalid type. Must be rss, github, or api")
        
        with db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute("""
                    INSERT INTO sources (name, url, type, category, description, tags, active)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    source["name"],
                    source["url"],
                    source["type"],
                    source["category"],
                    source.get("description", ""),
                    source.get("tags", []),
                    source.get("active", True)
                ))
                
                source_id = cur.fetchone()[0]
                conn.commit()
                
                return {"id": source_id, "message": "Source created successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating source: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@api_router.patch("/sources/{source_id}/toggle")
async def toggle_source(source_id: int, data: Dict[str, Any]):
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
                
                return {"message": "Source updated successfully"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling source: {e}")
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
