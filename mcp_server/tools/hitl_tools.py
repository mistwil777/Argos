"""
MCP Tools for HITL (Human-in-the-Loop) with Teams/Telegram

Provides tools for sending notifications and managing human decisions.
Supports both Microsoft Teams (corporate) and Telegram (personal).
"""

import logging
from typing import Dict, Optional

# Try importing Telegram bot (may be blocked by Zscaler)
try:
    from mcp_server.services.telegram_bot import get_telegram_bot
    TELEGRAM_AVAILABLE = True
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("Telegram module not available. Telegram notifications disabled.")
    TELEGRAM_AVAILABLE = False
    get_telegram_bot = None

# Try importing Teams bot (corporate-friendly)
try:
    from mcp_server.services.teams_bot import get_teams_bot
    TEAMS_AVAILABLE = True
except ImportError:
    logger = logging.getLogger(__name__)
    logger.warning("Teams module not available. Teams notifications disabled.")
    TEAMS_AVAILABLE = False
    get_teams_bot = None

from mcp_server.database import DatabaseManager
from mcp_server.config import settings

logger = logging.getLogger(__name__)


# ============================================
# Notification Helper
# ============================================

def _get_notification_service():
    """
    Get available notification service (Teams priority, Telegram fallback).
    
    Returns:
        Tuple of (service, service_name) or (None, None)
    """
    # Priority 1: Microsoft Teams (corporate environment)
    if TEAMS_AVAILABLE and hasattr(settings, 'teams_webhook_url') and settings.teams_webhook_url:
        teams_bot = get_teams_bot(settings.teams_webhook_url)
        if teams_bot:
            logger.debug("Using Microsoft Teams for notifications")
            return teams_bot, "teams"
    
    # Priority 2: Telegram (personal use, may be blocked by corporate proxy)
    if TELEGRAM_AVAILABLE:
        telegram_bot = get_telegram_bot()
        if telegram_bot:
            logger.debug("Using Telegram for notifications")
            return telegram_bot, "telegram"
    
    logger.warning("No notification service available")
    return None, None


# ============================================
# Singleton
# ============================================

_db_manager: Optional[DatabaseManager] = None


def _get_db_manager() -> DatabaseManager:
    """Get or create DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings.database_url)
    return _db_manager


# ============================================
# Tool Functions
# ============================================

async def notify_new_item(item_id: int) -> Dict:
    """
    Send notification for newly collected item.
    
    Uses Teams if available (corporate), otherwise Telegram (personal).
    
    Args:
        item_id: Item identifier
    
    Returns:
        Dict with success status
    """
    service, service_name = _get_notification_service()
    
    if service is None:
        return {
            "success": False,
            "error": "No notification service configured (Teams or Telegram)"
        }
    
    try:
        # Get item details
        db = _get_db_manager()
        item = db.get_item_by_id(item_id)
        
        if not item:
            return {
                "success": False,
                "error": f"Item {item_id} not found"
            }
        
        # Send notification based on service type
        if service_name == "teams":
            sent = await service.send_notification(
                title="📰 Nouvel Item Collecté",
                message=f"**{item.get('title', 'Sans titre')}**\n\nSource: {item.get('source', 'Inconnue')}",
                color="0078D4",  # Blue
                facts=[
                    {"title": "ID", "value": str(item_id)},
                    {"title": "Type", "value": item.get('type', 'article')}
                ],
                actions=[
                    {"title": "📋 Voir l'item", "url": f"http://localhost:3000/items/{item_id}"}
                ]
            )
        else:  # telegram
            sent = await service.notify_new_item(item)
        
        return {
            "success": sent,
            "item_id": item_id,
            "service": service_name,
            "message": f"Notification sent via {service_name}" if sent else f"Failed to send {service_name} notification"
        }
    
    except Exception as e:
        logger.error(f"Error in notify_new_item: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def notify_classification(
    item_id: int,
    topics: list,
    importance: str,
    item_type: str
) -> Dict:
    """
    Send Telegram notification after item classification with validation buttons.
    
    Args:
        item_id: Item identifier
        topics: List of classified topics
        importance: Importance level
        item_type: Type of content
    
    Returns:
        Dict with success status
    """
    telegram_bot = get_telegram_bot()
    
    if telegram_bot is None:
        return {
            "success": False,
            "error": "Telegram bot not configured"
        }
    
    try:
        # Send notification with buttons
        sent = await telegram_bot.notify_classification_complete(
            item_id=item_id,
            topics=topics,
            importance=importance,
            item_type=item_type
        )
        
        return {
            "success": sent,
            "item_id": item_id,
            "message": "Classification notification sent" if sent else "Failed to send notification"
        }
    
    except Exception as e:
        logger.error(f"Error in notify_classification: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def notify_course_generated(
    course_id: int,
    qa_score: Optional[float] = None
) -> Dict:
    """
    Send Telegram notification after course generation with review buttons.
    
    Args:
        course_id: Course identifier
        qa_score: Optional QA score
    
    Returns:
        Dict with success status
    """
    telegram_bot = get_telegram_bot()
    
    if telegram_bot is None:
        return {
            "success": False,
            "error": "Telegram bot not configured"
        }
    
    try:
        # Send notification with buttons
        sent = await telegram_bot.notify_course_generated(
            course_id=course_id,
            qa_score=qa_score
        )
        
        return {
            "success": sent,
            "course_id": course_id,
            "message": "Course notification sent" if sent else "Failed to send notification"
        }
    
    except Exception as e:
        logger.error(f"Error in notify_course_generated: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def notify_rag_query(
    query: str,
    answer: str,
    confidence: float,
    sources_count: int
) -> Dict:
    """
    Send RAG query result to admin for feedback.
    
    Args:
        query: User's question
        answer: Generated answer
        confidence: Confidence score
        sources_count: Number of sources used
    
    Returns:
        Dict with success status
    """
    telegram_bot = get_telegram_bot()
    
    if telegram_bot is None:
        return {
            "success": False,
            "error": "Telegram bot not configured"
        }
    
    try:
        # Send notification with feedback buttons
        sent = await telegram_bot.notify_rag_query(
            query=query,
            answer=answer,
            confidence=confidence,
            sources_count=sources_count
        )
        
        return {
            "success": sent,
            "message": "RAG query notification sent" if sent else "Failed to send notification"
        }
    
    except Exception as e:
        logger.error(f"Error in notify_rag_query: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


def get_pending_decisions() -> Dict:
    """
    Get list of items/courses pending human decision.
    
    Returns:
        Dict with pending items and courses
    """
    try:
        db = _get_db_manager()
        
        # Get pending classifications (items needing validation)
        pending_items_sql = """
            SELECT 
                i.id, i.title, i.classification_status,
                i.topics, i.importance, i.item_type
            FROM items i
            LEFT JOIN decisions d ON d.item_id = i.id AND d.decision_type = 'item_validation'
            WHERE i.classification_status = 'classified'
              AND d.id IS NULL
            ORDER BY i.created_at DESC
            LIMIT 10
        """
        
        # Get pending courses (draft courses needing review)
        pending_courses_sql = """
            SELECT 
                c.id, c.title, c.status, c.qa_score,
                c.subject, c.level
            FROM courses c
            LEFT JOIN decisions d ON d.course_id = c.id AND d.decision_type = 'course_generation'
            WHERE c.status = 'draft'
              AND d.id IS NULL
            ORDER BY c.created_at DESC
            LIMIT 10
        """
        
        with db.get_connection() as conn:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                # Pending items
                cur.execute(pending_items_sql)
                pending_items = [dict(row) for row in cur.fetchall()]
                
                # Pending courses
                cur.execute(pending_courses_sql)
                pending_courses = [dict(row) for row in cur.fetchall()]
        
        return {
            "success": True,
            "pending_items": pending_items,
            "pending_items_count": len(pending_items),
            "pending_courses": pending_courses,
            "pending_courses_count": len(pending_courses)
        }
    
    except Exception as e:
        logger.error(f"Error in get_pending_decisions: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


def get_decisions_history(limit: int = 20) -> Dict:
    """
    Get history of human decisions.
    
    Args:
        limit: Maximum number of decisions to return
    
    Returns:
        Dict with decisions history
    """
    try:
        db = _get_db_manager()
        
        history_sql = """
            SELECT 
                d.id,
                d.item_id,
                d.course_id,
                d.decision_type,
                d.decision,
                d.decided_by,
                d.decided_at,
                COALESCE(i.title, c.title) as title
            FROM decisions d
            LEFT JOIN items i ON d.item_id = i.id
            LEFT JOIN courses c ON d.course_id = c.id
            ORDER BY d.decided_at DESC
            LIMIT %s
        """
        
        with db.get_connection() as conn:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(history_sql, (limit,))
                decisions = [dict(row) for row in cur.fetchall()]
        
        return {
            "success": True,
            "decisions": decisions,
            "count": len(decisions)
        }
    
    except Exception as e:
        logger.error(f"Error in get_decisions_history: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def start_telegram_bot() -> Dict:
    """
    Start Telegram bot in polling mode (for development).
    
    Returns:
        Dict with success status
    """
    telegram_bot = get_telegram_bot()
    
    if telegram_bot is None:
        return {
            "success": False,
            "error": "Telegram bot not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_ADMIN_CHAT_ID."
        }
    
    try:
        await telegram_bot.start_polling()
        
        return {
            "success": True,
            "message": "Telegram bot started in polling mode",
            "admin_chat_id": settings.telegram_admin_chat_id
        }
    
    except Exception as e:
        logger.error(f"Error starting Telegram bot: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }


async def stop_telegram_bot() -> Dict:
    """
    Stop Telegram bot polling.
    
    Returns:
        Dict with success status
    """
    telegram_bot = get_telegram_bot()
    
    if telegram_bot is None:
        return {
            "success": False,
            "error": "Telegram bot not running"
        }
    
    try:
        await telegram_bot.stop_polling()
        
        return {
            "success": True,
            "message": "Telegram bot stopped"
        }
    
    except Exception as e:
        logger.error(f"Error stopping Telegram bot: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e)
        }
