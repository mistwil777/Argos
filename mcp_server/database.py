"""
DatabaseManager for AcademiaOps MCP Server

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
    """Manages database connections and operations for AcademiaOps."""
    
    def __init__(self, database_url: str):
        """
        Initialize DatabaseManager with connection URL.
        
        Args:
            database_url: PostgreSQL connection string (postgresql://user:pass@host:port/db)
        """
        self.database_url = database_url
        logger.info("DatabaseManager initialized", extra={"database": "academiaops"})
    
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
                id, title, summary, url, source, 
                published_at, created_at
            FROM items
            WHERE classification_status = 'pending'
            ORDER BY published_at DESC
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
                id, title, summary, url, source,
                importance, item_type, classification_status,
                published_at, created_at, updated_at
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
        reasoning: str,
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
            reasoning: Explanation for the decision
            model_used: LLM model name (e.g., "gpt-3.5-turbo")
            tokens_used: Total tokens consumed
            cost_usd: Estimated cost in USD
        
        Returns:
            Decision ID
        """
        query = """
            INSERT INTO decisions (
                item_id, decision_type, decision_value, reasoning,
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
                    (item_id, decision_type, decision_json, reasoning,
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
        Calculate total LLM costs and token usage.
        
        Returns:
            Tuple of (total_cost_usd, total_tokens)
        """
        query = """
            SELECT 
                COALESCE(SUM(cost_usd), 0) as total_cost,
                COALESCE(SUM(tokens_used), 0) as total_tokens
            FROM decisions
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
