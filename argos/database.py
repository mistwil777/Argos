"""
DatabaseManager for Argos Server

Handles all PostgreSQL operations for items, topics, classifications, and decisions.
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values
from contextlib import contextmanager

logger = logging.getLogger(__name__)


class DatabaseManager:
    """Manages database connections and operations for Argos."""
    
    def __init__(self, database_url: str):
        """
        Initialize DatabaseManager with connection URL.
        
        Args:
            database_url: PostgreSQL connection string (postgresql://user:pass@host:port/db)
        """
        self.database_url = database_url
        logger.info("DatabaseManager initialized", extra={"database": "argos"})
    
    @contextmanager
    def get_connection(self):
        """
        Context manager for database connections.
        Automatically handles commit/rollback and connection closing.
        
        Yields:
            psycopg2.connection: Database connection
        """
        conn = None
        try:
            conn = psycopg2.connect(self.database_url)
            yield conn
            conn.commit()
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"Database error: {e}", exc_info=True)
            raise
        finally:
            if conn:
                conn.close()
    
    # ============================================
    # Items Operations
    # ============================================
    
    def get_unclassified_items(self, limit: int = 10) -> List[Dict]:
        """
        Fetch items that need classification.
        
        Args:
            limit: Maximum number of items to return
        
        Returns:
            List of items with classification_status = 'pending'
        """
        query = """
            SELECT 
                id, title, summary, url, source_type, source_url,
                published_at, created_at
            FROM items
            WHERE classification_status = 'pending'
            ORDER BY published_at DESC NULLS LAST, created_at DESC
            LIMIT %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (limit,))
                items = cur.fetchall()
                
        logger.info(f"Retrieved {len(items)} unclassified items", extra={"limit": limit})
        return [dict(item) for item in items]
    
    def get_item_by_id(self, item_id: int) -> Optional[Dict]:
        """
        Fetch a single item by ID.
        
        Args:
            item_id: Item identifier
        
        Returns:
            Item dict or None if not found
        """
        query = """
            SELECT 
                id, title, summary, url, source_type, source_url,
                importance, item_type, classification_status,
                published_at, created_at, updated_at, keywords as topics
            FROM items
            WHERE id = %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (item_id,))
                item = cur.fetchone()
        
        if item:
            logger.debug(f"Retrieved item {item_id}", extra={"title": item['title']})
            return dict(item)
        else:
            logger.warning(f"Item {item_id} not found")
            return None
    
    def update_classification(
        self, 
        item_id: int, 
        importance: str,
        item_type: str
    ) -> bool:
        """
        Update item with classification results.
        
        Args:
            item_id: Item identifier
            importance: Importance level (critical/high/medium/low)
            item_type: Type of content (innovation/tutorial/research/news/opinion)
        
        Returns:
            True if successful, False otherwise
        """
        query = """
            UPDATE items
            SET 
                importance = %s,
                item_type = %s,
                classification_status = 'classified',
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """
        
        try:
            with self.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(query, (importance, item_type, item_id))
                    affected = cur.rowcount
            
            if affected > 0:
                logger.info(
                    f"Updated classification for item {item_id}",
                    extra={
                        "item_id": item_id,
                        "importance": importance,
                        "item_type": item_type
                    }
                )
                return True
            else:
                logger.warning(f"No rows updated for item {item_id}")
                return False
                
        except Exception as e:
            logger.error(f"Failed to update classification for item {item_id}: {e}")
            return False
    
    # ============================================
    # Topics Operations
    # ============================================
    
    def get_or_create_topic(self, topic_name: str) -> int:
        """
        Get existing topic ID or create new topic.
        
        Args:
            topic_name: Name of the topic (e.g., "LLM", "RAG")
        
        Returns:
            Topic ID (int)
        """
        # Generate slug from name (lowercase, replace spaces with hyphens)
        slug = topic_name.lower().replace(" ", "-").replace("_", "-")
        
        # Try to get existing topic
        select_query = "SELECT id FROM topics WHERE name = %s OR slug = %s"
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(select_query, (topic_name, slug))
                result = cur.fetchone()
                
                if result:
                    topic_id = result[0]
                    logger.debug(f"Found existing topic: {topic_name} (id={topic_id})")
                    return topic_id
                
                # Create new topic
                insert_query = """
                    INSERT INTO topics (name, slug, description)
                    VALUES (%s, %s, %s)
                    RETURNING id
                """
                description = f"Automatically created topic for {topic_name}"
                
                cur.execute(insert_query, (topic_name, slug, description))
                topic_id = cur.fetchone()[0]
                
                logger.info(f"Created new topic: {topic_name} (id={topic_id})")
                return topic_id
    
    def link_item_to_topics(self, item_id: int, topic_names: List[str]) -> int:
        """
        Create many-to-many relationships between item and topics.
        Deletes existing links first.
        
        Args:
            item_id: Item identifier
            topic_names: List of topic names
        
        Returns:
            Number of links created
        """
        if not topic_names:
            logger.warning(f"No topics provided for item {item_id}")
            return 0
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                # Delete existing links
                delete_query = "DELETE FROM items_topics WHERE item_id = %s"
                cur.execute(delete_query, (item_id,))
                deleted = cur.rowcount
                
                if deleted > 0:
                    logger.debug(f"Deleted {deleted} existing topic links for item {item_id}")
                
                # Get or create topic IDs
                topic_ids = [self.get_or_create_topic(name) for name in topic_names]
                
                # Create new links
                insert_query = """
                    INSERT INTO items_topics (item_id, topic_id)
                    VALUES %s
                    ON CONFLICT (item_id, topic_id) DO NOTHING
                """
                values = [(item_id, topic_id) for topic_id in topic_ids]
                execute_values(cur, insert_query, values)
                created = cur.rowcount
        
        logger.info(
            f"Linked item {item_id} to {created} topics",
            extra={"item_id": item_id, "topics": topic_names}
        )
        return created
    
    # ============================================
    # Decisions & Logging
    # ============================================
    
    def log_decision(
        self,
        item_id: int,
        decision_type: str,
        decision_value: Dict,
        reason: str,
        model_used: str,
        tokens_used: int,
        cost_usd: float
    ) -> int:
        """
        Log a classification decision with cost tracking.
        
        Args:
            item_id: Item identifier
            decision_type: Type of decision (e.g., "classification")
            decision_value: Structured decision data (stored as JSON)
            reason: Explanation for the decision
            model_used: LLM model name (e.g., "gpt-3.5-turbo")
            tokens_used: Total tokens consumed
            cost_usd: Estimated cost in USD
        
        Returns:
            Decision ID
        """
        query = """
            INSERT INTO decisions (
                item_id, decision_type, decision_value, reason,
                model_used, tokens_used, cost_usd
            )
            VALUES (%s, %s, %s::jsonb, %s, %s, %s, %s)
            RETURNING id
        """
        
        import json
        decision_json = json.dumps(decision_value)
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query,
                    (item_id, decision_type, decision_json, reason,
                     model_used, tokens_used, cost_usd)
                )
                decision_id = cur.fetchone()[0]
        
        logger.info(
            f"Logged decision {decision_id} for item {item_id}",
            extra={
                "decision_id": decision_id,
                "item_id": item_id,
                "decision_type": decision_type,
                "model": model_used,
                "tokens": tokens_used,
                "cost_usd": cost_usd
            }
        )
        return decision_id
    
    # ============================================
    # Analytics & Reporting
    # ============================================
    
    def get_classification_stats(self) -> Dict:
        """
        Get statistics about classification progress.
        
        Returns:
            Dict with counts by classification_status
        """
        query = """
            SELECT 
                classification_status,
                COUNT(*) as count
            FROM items
            GROUP BY classification_status
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query)
                results = cur.fetchall()
        
        stats = {row['classification_status']: row['count'] for row in results}
        logger.debug(f"Classification stats: {stats}")
        return stats
    
    def get_total_cost(self) -> Tuple[float, int]:
        """
        Calculate total LLM costs and token usage across all LLM operations.
        Aggregates rag_queries (RAG calls) and llm_usage (generation/QA/etc.).

        Returns:
            Tuple of (total_cost_usd, total_tokens)
        """
        query = """
            SELECT
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COALESCE(SUM(tokens_used), 0) as total_tokens
            FROM (
                SELECT cost_usd, tokens_used FROM rag_queries
                UNION ALL
                SELECT cost_usd, tokens_used FROM llm_usage
            ) all_usage
        """
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query)
                result = cur.fetchone()
        
        total_cost = float(result[0])
        total_tokens = int(result[1])
        
        logger.info(
            f"Total LLM usage: ${total_cost:.4f} USD, {total_tokens:,} tokens"
        )
        return total_cost, total_tokens

    def get_cost_for_period(self, start, end) -> float:
        """
        Calculate LLM costs for a given time period.
        
        Args:
            start: start datetime (inclusive)
            end: end datetime (inclusive)
        
        Returns:
            Total cost in USD for the period
        """
        query = """
            SELECT COALESCE(SUM(cost_usd), 0) as period_cost
            FROM (
                SELECT cost_usd, created_at FROM rag_queries
                UNION ALL
                SELECT cost_usd, created_at FROM llm_usage
            ) all_usage
            WHERE created_at >= %s AND created_at <= %s
        """
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (start, end))
                result = cur.fetchone()
        return float(result[0])
    
    def get_topics_by_popularity(self, limit: int = 10) -> List[Dict]:
        """
        Get most popular topics by item count.
        
        Args:
            limit: Maximum number of topics to return
        
        Returns:
            List of topics with their item counts
        """
        query = """
            SELECT 
                id, name, slug, item_count
            FROM topics
            WHERE item_count > 0
            ORDER BY item_count DESC
            LIMIT %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (limit,))
                topics = cur.fetchall()
        
        return [dict(topic) for topic in topics]
    
    def get_topic_by_name(self, name: str) -> Optional[Dict]:
        """
        Get topic by name.
        
        Args:
            name: Topic name
        
        Returns:
            Topic dict or None if not found
        """
        query = "SELECT id, name, slug, description, item_count FROM topics WHERE name = %s"
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (name,))
                topic = cur.fetchone()
        
        return dict(topic) if topic else None
    
    def get_topic_by_id(self, topic_id: int) -> Optional[Dict]:
        """
        Get topic by ID.
        
        Args:
            topic_id: Topic identifier
        
        Returns:
            Topic dict or None if not found
        """
        query = "SELECT id, name, slug, description, item_count FROM topics WHERE id = %s"
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (topic_id,))
                topic = cur.fetchone()
        
        return dict(topic) if topic else None
    
    def get_topics_with_stats(self, min_items: int = 1) -> List[Dict]:
        """
        Get all topics with item statistics.
        
        Args:
            min_items: Minimum number of items required
        
        Returns:
            List of topics with stats
        """
        query = """
            SELECT 
                t.id, t.name, t.slug, t.item_count,
                COUNT(DISTINCT it.item_id) as classified_count,
                MAX(i.created_at) as latest_item_date
            FROM topics t
            LEFT JOIN items_topics it ON t.id = it.topic_id
            LEFT JOIN items i ON it.item_id = i.id AND i.classification_status = 'classified'
            GROUP BY t.id, t.name, t.slug, t.item_count
            HAVING COUNT(DISTINCT it.item_id) >= %s
            ORDER BY t.item_count DESC
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (min_items,))
                topics = cur.fetchall()
        
        return [dict(topic) for topic in topics]
    
    def get_items_by_topic(
        self,
        topic_id: int,
        limit: int = 10,
        min_importance: str = "medium"
    ) -> List[Dict]:
        """
        Get items for a specific topic.
        
        Args:
            topic_id: Topic identifier
            limit: Maximum number of items
            min_importance: Minimum importance level
        
        Returns:
            List of items
        """
        importance_order = {"critical": 4, "high": 3, "medium": 2, "low": 1}
        
        # Build WHERE clause for importance
        if min_importance == "critical":
            importance_clause = "importance = 'critical'"
        elif min_importance == "high":
            importance_clause = "importance IN ('critical', 'high')"
        elif min_importance == "medium":
            importance_clause = "importance IN ('critical', 'high', 'medium')"
        else:
            importance_clause = "importance IS NOT NULL"
        
        query = f"""
            SELECT 
                i.id, i.title, i.summary, i.url, i.source_type,
                i.importance, i.item_type, i.published_at, i.created_at
            FROM items i
            JOIN items_topics it ON i.id = it.item_id
            WHERE it.topic_id = %s
                AND i.classification_status = 'classified'
                AND {importance_clause}
            ORDER BY 
                CASE i.importance
                    WHEN 'critical' THEN 4
                    WHEN 'high' THEN 3
                    WHEN 'medium' THEN 2
                    WHEN 'low' THEN 1
                    ELSE 0
                END DESC,
                i.published_at DESC NULLS LAST,
                i.created_at DESC
            LIMIT %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (topic_id, limit))
                items = cur.fetchall()
        
        logger.info(f"Retrieved {len(items)} items for topic {topic_id}")
        return [dict(item) for item in items]
    
    # ============================================
    # Courses Operations
    # ============================================
    
    def get_course_by_id(self, course_id: int) -> Optional[Dict]:
        """
        Get course by ID.
        
        Args:
            course_id: Course identifier
        
        Returns:
            Course dict or None if not found
        """
        query = """
            SELECT 
                id, item_id, title, subject, level, content,
                learning_objectives, prerequisites, estimated_duration_minutes,
                qa_score, qa_issues, qa_reviewed_at,
                status, published_at, created_at, updated_at
            FROM courses
            WHERE id = %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (course_id,))
                course = cur.fetchone()
        
        return dict(course) if course else None
    
    def get_course_by_item_level(self, item_id: int, level: str) -> Optional[Dict]:
        """
        Check if course exists for item+level combination.
        
        Args:
            item_id: Item identifier
            level: Course level
        
        Returns:
            Course dict or None if not found
        """
        query = """
            SELECT 
                id, title, subject, level, status, created_at
            FROM courses
            WHERE item_id = %s AND level = %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(query, (item_id, level))
                course = cur.fetchone()
        
        return dict(course) if course else None
    
    def insert_course(
        self,
        item_id: int,
        title: str,
        subject: str,
        level: str,
        content: str,
        learning_objectives: List[str],
        prerequisites: List[str],
        estimated_duration_minutes: int
    ) -> int:
        """
        Insert new course.
        
        Args:
            item_id: Source item ID
            title: Course title
            subject: Subject/topic
            level: Course level
            content: Full Markdown content
            learning_objectives: List of objectives
            prerequisites: List of prerequisites
            estimated_duration_minutes: Estimated reading time
        
        Returns:
            Course ID
        """
        import json
        
        query = """
            INSERT INTO courses (
                item_id, title, subject, level, content,
                learning_objectives, prerequisites, estimated_duration_minutes,
                status
            )
            VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::jsonb, %s, 'draft')
            RETURNING id
        """
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query,
                    (
                        item_id, title, subject, level, content,
                        json.dumps(learning_objectives),
                        json.dumps(prerequisites),
                        estimated_duration_minutes
                    )
                )
                course_id = cur.fetchone()[0]
        
        logger.info(
            f"Created course {course_id}",
            extra={"course_id": course_id, "title": title, "level": level}
        )
        return course_id
    
    def update_course_qa(self, course_id: int, score: float, issues: List[Dict]):
        """
        Update course QA score and issues.
        
        Args:
            course_id: Course identifier
            score: QA score (0-10)
            issues: List of issue dicts
        """
        import json
        
        query = """
            UPDATE courses
            SET 
                qa_score = %s,
                qa_issues = %s::jsonb,
                qa_reviewed_at = CURRENT_TIMESTAMP
            WHERE id = %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (score, json.dumps(issues), course_id))
        
        logger.info(f"Updated QA score for course {course_id}: {score}")
    
    def update_course_status(self, course_id: int, status: str):
        """
        Update course publication status.
        
        Args:
            course_id: Course identifier
            status: New status
        """
        query = """
            UPDATE courses
            SET 
                status = %s,
                published_at = CASE 
                    WHEN %s = 'published' AND published_at IS NULL 
                    THEN CURRENT_TIMESTAMP 
                    ELSE published_at 
                END
            WHERE id = %s
        """
        
        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, (status, status, course_id))
        
        logger.info(f"Updated course {course_id} status to '{status}'")
    
    def insert_decision(
        self,
        decision_type: str,
        entity_id: int,
        entity_type: str,
        input_data: Dict,
        output_data: Dict,
        model: str,
        tokens_used: int,
        cost_usd: float
    ) -> int:
        """
        Insert an LLM usage record (course_generation, course_qa, classification, etc.).
        Uses the llm_usage table — distinct from the HITL decisions table.

        Returns:
            Record ID
        """
        import json

        query = """
            INSERT INTO llm_usage (
                operation_type, entity_type, entity_id,
                model, tokens_used, cost_usd,
                input_data, output_data
            )
            VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s::jsonb)
            RETURNING id
        """

        with self.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    query,
                    (
                        decision_type, entity_type, entity_id,
                        model, tokens_used, cost_usd,
                        json.dumps(input_data), json.dumps(output_data)
                    )
                )
                record_id = cur.fetchone()[0]

        logger.info(
            f"Logged LLM usage {record_id} for {entity_type} {entity_id}",
            extra={"record_id": record_id, "type": decision_type, "cost_usd": cost_usd}
        )
        return record_id
