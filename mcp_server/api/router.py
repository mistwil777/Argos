"""
REST API Router for AcademiaOps Web Interface

Provides REST endpoints alongside the existing JSON-RPC interface.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional
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
            "total_items": stats.get("total_items", 0),
            "classified_items": stats.get("classified_items", 0),
            "pending_items": stats.get("pending_items", 0),
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
