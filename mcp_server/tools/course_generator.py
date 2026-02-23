"""
MCP Tools for Course Generator

Provides tools for generating and managing educational courses.
"""

import logging
from typing import Dict, List, Optional

from mcp_server.config import settings
from mcp_server.services.course_generator import CourseGeneratorService
from mcp_server.services.llm_provider import create_llm_provider
from mcp_server.database import DatabaseManager

logger = logging.getLogger(__name__)

# Singleton instances
_db_manager: Optional[DatabaseManager] = None
_course_generator_service: Optional[CourseGeneratorService] = None


def _get_db_manager() -> DatabaseManager:
    """Get or create DatabaseManager singleton."""
    global _db_manager
    if _db_manager is None:
        _db_manager = DatabaseManager(settings.database_url)
    return _db_manager


def _get_course_generator_service() -> CourseGeneratorService:
    """Get or create CourseGeneratorService singleton."""
    global _course_generator_service
    
    if _course_generator_service is None:
        db_manager = _get_db_manager()
        
        # Use AWS Bedrock Claude Sonnet 4 for better pedagogical content
        # More creative and nuanced than Nova Pro
        llm_provider = create_llm_provider(
            provider_type="aws",
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            aws_region=settings.aws_region,
            model="us.anthropic.claude-sonnet-4-20250514-v1:0"
        )
        
        _course_generator_service = CourseGeneratorService(
            llm_provider=llm_provider,
            db_manager=db_manager,
            temperature=0.7,  # More creative for educational content
            max_tokens=4000   # Longer content for courses
        )
        
        logger.info("CourseGeneratorService initialized with AWS Claude Sonnet 4")
    
    return _course_generator_service


# ============================================
# MCP Tool: generate_course
# ============================================

async def generate_course(
    topic: str,
    level: str = "intermediate",
    max_items: int = 5,
    min_importance: str = "medium"
) -> Dict:
    """
    Generate an educational course for a specific topic.
    
    Args:
        topic: Topic name (e.g., "Agents", "RAG", "LLM")
        level: Course level - "beginner", "intermediate", or "advanced" (default: "intermediate")
        max_items: Maximum number of source items to use (default: 5)
        min_importance: Minimum importance level - "low", "medium", "high", "critical" (default: "medium")
    
    Returns:
        JSON-RPC response with course generation result
    """
    logger.info(f"Tool: generate_course called for topic='{topic}', level='{level}'")
    
    try:
        service = _get_course_generator_service()
        result = await service.generate_course(
            topic=topic,
            level=level,
            max_items=max_items,
            min_importance=min_importance
        )
        
        return {
            "success": True,
            "data": result
        }
    
    except ValueError as e:
        logger.warning(f"Validation error in generate_course: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_type": "validation_error"
        }
    
    except Exception as e:
        logger.error(f"Error in generate_course: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": "internal_error"
        }


# ============================================
# MCP Tool: score_course_quality
# ============================================

async def score_course_quality(
    course_id: int
) -> Dict:
    """
    Evaluate and score the quality of a course using LLM.
    
    Args:
        course_id: Course identifier
    
    Returns:
        JSON-RPC response with QA score, issues, strengths, and recommendations
    """
    logger.info(f"Tool: score_course_quality called for course_id={course_id}")
    
    try:
        service = _get_course_generator_service()
        result = await service.score_course_quality(course_id)
        
        return {
            "success": True,
            "data": result
        }
    
    except ValueError as e:
        logger.warning(f"Validation error in score_course_quality: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_type": "validation_error"
        }
    
    except Exception as e:
        logger.error(f"Error in score_course_quality: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": "internal_error"
        }


# ============================================
# MCP Tool: list_available_topics
# ============================================

async def list_available_topics(
    min_items: int = 3
) -> Dict:
    """
    List topics that have enough items for course generation.
    
    Args:
        min_items: Minimum number of classified items required (default: 3)
    
    Returns:
        JSON-RPC response with list of topics and their stats
    """
    logger.info(f"Tool: list_available_topics called with min_items={min_items}")
    
    try:
        service = _get_course_generator_service()
        topics = service.list_available_topics(min_items=min_items)
        
        return {
            "success": True,
            "data": {
                "topics": topics,
                "count": len(topics)
            }
        }
    
    except Exception as e:
        logger.error(f"Error in list_available_topics: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": "internal_error"
        }


# ============================================
# MCP Tool: get_course
# ============================================

async def get_course(
    course_id: int
) -> Dict:
    """
    Retrieve a course by ID.
    
    Args:
        course_id: Course identifier
    
    Returns:
        JSON-RPC response with course data
    """
    logger.info(f"Tool: get_course called for course_id={course_id}")
    
    try:
        service = _get_course_generator_service()
        course = service.get_course(course_id)
        
        return {
            "success": True,
            "data": course
        }
    
    except ValueError as e:
        logger.warning(f"Course not found: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_type": "not_found"
        }
    
    except Exception as e:
        logger.error(f"Error in get_course: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": "internal_error"
        }


# ============================================
# MCP Tool: update_course_status
# ============================================

async def update_course_status(
    course_id: int,
    status: str
) -> Dict:
    """
    Update course publication status.
    
    Args:
        course_id: Course identifier
        status: New status - "draft", "review", "published", or "archived"
    
    Returns:
        JSON-RPC response with updated course info
    """
    logger.info(f"Tool: update_course_status called for course_id={course_id}, status='{status}'")
    
    try:
        service = _get_course_generator_service()
        result = service.update_course_status(course_id, status)
        
        return {
            "success": True,
            "data": result
        }
    
    except ValueError as e:
        logger.warning(f"Validation error in update_course_status: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_type": "validation_error"
        }
    
    except Exception as e:
        logger.error(f"Error in update_course_status: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": "internal_error"
        }


# ============================================
# MCP Tool: list_courses
# ============================================

async def list_courses(
    status: Optional[str] = None,
    level: Optional[str] = None,
    limit: int = 10
) -> Dict:
    """
    List courses with optional filtering.
    
    Args:
        status: Filter by status (optional)
        level: Filter by level (optional)
        limit: Maximum number of courses to return (default: 10)
    
    Returns:
        JSON-RPC response with list of courses
    """
    logger.info(f"Tool: list_courses called with status={status}, level={level}, limit={limit}")
    
    try:
        db_manager = _get_db_manager()
        
        # Build query
        conditions = []
        params = []
        
        if status:
            conditions.append("status = %s")
            params.append(status)
        
        if level:
            conditions.append("level = %s")
            params.append(level)
        
        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        
        query = f"""
            SELECT 
                id, title, subject, level, status,
                qa_score, estimated_duration_minutes,
                published_at, created_at
            FROM courses
            {where_clause}
            ORDER BY created_at DESC
            LIMIT %s
        """
        params.append(limit)
        
        with db_manager.get_connection() as conn:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, params)
                courses = cur.fetchall()
        
        return {
            "success": True,
            "data": {
                "courses": [dict(c) for c in courses],
                "count": len(courses)
            }
        }
    
    except Exception as e:
        logger.error(f"Error in list_courses: {e}", exc_info=True)
        return {
            "success": False,
            "error": str(e),
            "error_type": "internal_error"
        }
