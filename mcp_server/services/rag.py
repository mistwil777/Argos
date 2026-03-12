"""
RAG Service for AcademiaOps

Retrieval-Augmented Generation for answering questions based on courses and items.
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from mcp_server.database import DatabaseManager
from mcp_server.services.vector_store import VectorStoreService
from mcp_server.services.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


# ============================================
# Prompt Templates
# ============================================

RAG_SYSTEM_PROMPT = """You are an AI assistant specialized in AI, machine learning, and software engineering topics. 
You help users by answering their questions based on educational courses and technical documentation.

Guidelines:
- Answer in French (unless asked in English)
- Be concise but complete (200-300 words)
- Cite sources using [Source 1], [Source 2] format
- If information is insufficient or uncertain, say so explicitly
- Focus on practical, actionable information
- Use technical terms accurately"""


RAG_USER_PROMPT_TEMPLATE = """Based on the following sources, answer the user's question.

**Sources:**

{sources}

**User Question:** {query}

**Instructions:**
- Synthesize information from the sources above
- Cite which source(s) support each claim
- If sources don't fully answer the question, acknowledge this
- Provide practical examples when relevant

**Answer:**"""


class RAGService:
    """Service for Retrieval-Augmented Generation."""
    
    def __init__(
        self,
        llm_provider: LLMProvider,
        vector_store: VectorStoreService,
        db_manager: DatabaseManager,
        top_k: int = 5,
        temperature: float = 0.5,
        max_tokens: int = 800
    ):
        """
        Initialize RAGService.
        
        Args:
            llm_provider: LLM provider for generation
            vector_store: Vector store for retrieval
            db_manager: Database manager
            top_k: Number of chunks to retrieve
            temperature: LLM temperature
            max_tokens: Maximum tokens for answer
        """
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.db = db_manager
        self.top_k = top_k
        self.temperature = temperature
        self.max_tokens = max_tokens
        
        logger.info(
            f"RAGService initialized",
            extra={
                "llm_model": getattr(llm_provider, 'model', None) or getattr(llm_provider, 'model_id', 'unknown'),
                "top_k": top_k,
                "temperature": temperature
            }
        )
    
    # ============================================
    # Core RAG Methods
    # ============================================
    
    async def ask(
        self,
        query: str,
        filter_source_type: Optional[str] = None,
        user_identifier: str = "anonymous",
        use_hybrid_search: bool = True
    ) -> Dict:
        """
        Answer a question using RAG.
        
        Args:
            query: User's question
            filter_source_type: Filter by 'course' or 'item' (optional)
            user_identifier: User ID for logging
            use_hybrid_search: Use hybrid (semantic+lexical) search (default: True)
        
        Returns:
            Dict with answer, sources, confidence, and metrics
        
        Raises:
            ValueError: If query is empty
            Exception: If RAG pipeline fails
        """
        if not query or not query.strip():
            raise ValueError("Query cannot be empty")
        
        query = query.strip()
        logger.info(f"RAG query received: {query[:100]}... (hybrid={use_hybrid_search})")
        
        start_time = datetime.now()
        
        # 1. Retrieve relevant chunks (hybrid search by default)
        if use_hybrid_search:
            search_results = self.vector_store.hybrid_search(
                query=query,
                limit=self.top_k,
                filter_source_type=filter_source_type
            )
        else:
            search_results = self.vector_store.search(
                query=query,
                limit=self.top_k,
                filter_source_type=filter_source_type
            )
        
        if not search_results:
            logger.warning("No relevant content found for query")
            return {
                "query": query,
                "answer": "Je n'ai pas trouvé d'informations pertinentes dans la base de connaissances pour répondre à cette question.",
                "sources": [],
                "confidence_score": 0.0,
                "tokens_used": 0,
                "cost_usd": 0.0,
                "latency_ms": int((datetime.now() - start_time).total_seconds() * 1000)
            }
        
        # 2. Build context from sources
        sources_text, sources_list = self._format_sources(search_results)
        
        # 3. Build prompt
        user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
            sources=sources_text,
            query=query
        )
        
        # 4. Generate answer with LLM
        answer, usage = await self._call_llm(
            user_prompt=user_prompt,
            system_prompt=RAG_SYSTEM_PROMPT
        )
        
        # 5. Calculate metrics
        latency_ms = int((datetime.now() - start_time).total_seconds() * 1000)
        tokens_used = usage.get("total_tokens", 0)
        tokens_input = usage.get("prompt_tokens", 0)
        tokens_output = usage.get("completion_tokens", 0)
        cost_usd = self.llm_provider.calculate_cost(tokens_input, tokens_output)
        
        # 6. Calculate confidence score (based on similarity scores)
        confidence_score = self._calculate_confidence(search_results)
        
        # 7. Log to database
        self._log_query(
            user_identifier=user_identifier,
            query=query,
            answer=answer,
            sources=sources_list,
            confidence_score=confidence_score,
            tokens_used=tokens_used,
            cost_usd=cost_usd
        )
        
        # 8. Build result
        model_name = getattr(self.llm_provider, 'model', None) or getattr(self.llm_provider, 'model_id', 'unknown')
        result = {
            "query": query,
            "answer": answer,
            "sources": sources_list,
            "confidence_score": round(confidence_score, 2),
            "model": model_name,
            "tokens_used": tokens_used,
            "cost_usd": round(cost_usd, 6),
            "latency_ms": latency_ms
        }
        
        logger.info(
            f"RAG answer generated",
            extra={
                "query_length": len(query),
                "answer_length": len(answer),
                "sources_count": len(sources_list),
                "confidence": confidence_score,
                "tokens": tokens_used,
                "cost_usd": cost_usd,
                "latency_ms": latency_ms
            }
        )
        
        return result
    
    async def search_only(
        self,
        query: str,
        limit: int = 10,
        filter_source_type: Optional[str] = None,
        use_hybrid_search: bool = True
    ) -> List[Dict]:
        """
        Perform search without LLM generation.
        
        Args:
            query: Search query
            limit: Maximum results
            filter_source_type: Filter by source type
            use_hybrid_search: Use hybrid (semantic+lexical) search (default: True)
        
        Returns:
            List of search results with metadata
        """
        logger.info(f"Search query: {query} (limit={limit}, hybrid={use_hybrid_search})")
        
        if use_hybrid_search:
            results = self.vector_store.hybrid_search(
                query=query,
                limit=limit,
                filter_source_type=filter_source_type
            )
        else:
            results = self.vector_store.search(
                query=query,
                limit=limit,
                filter_source_type=filter_source_type
            )
        
        # Format results
        formatted_results = []
        for idx, result in enumerate(results, 1):
            formatted_results.append({
                "rank": idx,
                "source_type": result.get("source_type"),
                "source_id": result.get("source_id"),
                "title": result.get("title"),
                "section_title": result.get("section_title"),
                "chunk_text": result.get("chunk_text", "")[:500],  # Truncate
                "similarity_score": result.get("_distance", 0.0),  # LanceDB distance
                "subject": result.get("subject", ""),
                "level": result.get("level", "")
            })
        
        return formatted_results
    
    # ============================================
    # Helper Methods
    # ============================================
    
    def _format_sources(self, search_results: List[Dict]) -> Tuple[str, List[Dict]]:
        """Format search results into prompt-ready text and metadata."""
        sources_text_parts = []
        sources_list = []
        
        for idx, result in enumerate(search_results, 1):
            title = result.get("title", "Unknown")
            section = result.get("section_title", "")
            text = result.get("chunk_text", "")
            source_type = result.get("source_type", "unknown")
            source_id = result.get("source_id", 0)
            
            # Format for prompt
            sources_text_parts.append(f"""
**Source {idx}**: {title} - {section}
{text}
""")
            
            # Metadata for response
            entry: Dict = {
                "source_number": idx,
                "source_type": source_type,
                "source_id": source_id,
                "title": title,
                "section": section,
                "chunk_text": text[:500],
                "similarity_score": result.get("_distance", 0.0),
            }
            # course_id alias so the frontend can look up the full document
            if source_type == "course":
                entry["course_id"] = source_id
            sources_list.append(entry)
        
        sources_text = "\n".join(sources_text_parts)
        return sources_text, sources_list
    
    def _calculate_confidence(self, search_results: List[Dict]) -> float:
        """Calculate confidence score based on similarity scores."""
        if not search_results:
            return 0.0
        
        # LanceDB returns _distance (lower is better, 0 = perfect match)
        # Convert to confidence score (0-1 scale)
        distances = [result.get("_distance", 1.0) for result in search_results]
        avg_distance = sum(distances) / len(distances)
        
        # Convert distance to confidence (inverse relationship)
        # Distance typically ranges from 0 (perfect) to 2+ (very different)
        confidence = max(0.0, min(1.0, 1.0 - (avg_distance / 2.0)))
        
        return confidence
    
    async def _call_llm(self, user_prompt: str, system_prompt: str) -> Tuple[str, Dict]:
        """Call LLM provider with prompts."""
        answer, usage = await self.llm_provider.generate(
            prompt=user_prompt,
            system_prompt=system_prompt,
            temperature=self.temperature,
            max_tokens=self.max_tokens
        )
        
        return answer, usage
    
    def _log_query(
        self,
        user_identifier: str,
        query: str,
        answer: str,
        sources: List[Dict],
        confidence_score: float,
        tokens_used: int,
        cost_usd: float
    ):
        """Log RAG query to database."""
        try:
            import json
            
            query_sql = """
                INSERT INTO rag_queries (
                    user_identifier, query, answer, sources, confidence_score,
                    tokens_used, cost_usd
                )
                VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s)
                RETURNING id
            """
            
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        query_sql,
                        (
                            user_identifier,
                            query,
                            answer,
                            json.dumps(sources),
                            confidence_score,
                            tokens_used,
                            cost_usd
                        )
                    )
                    query_id = cur.fetchone()[0]
            
            logger.info(f"Logged RAG query {query_id} to database")
        
        except Exception as e:
            logger.error(f"Failed to log RAG query: {e}", exc_info=True)
            # Don't raise - logging failure shouldn't break the RAG flow
    
    # ============================================
    # Index Management
    # ============================================
    
    def index_course(self, course_id: int) -> Dict:
        """
        Index a single course by ID.
        
        Args:
            course_id: Course identifier
        
        Returns:
            Dict with indexing result
        """
        course = self.db.get_course_by_id(course_id)
        if not course:
            raise ValueError(f"Course {course_id} not found")
        
        chunks_count = self.vector_store.index_course(course)
        
        return {
            "course_id": course_id,
            "title": course["title"],
            "chunks_indexed": chunks_count
        }
    
    def index_item(self, item_id: int) -> Dict:
        """
        Index a single item by ID.
        
        Args:
            item_id: Item identifier
        
        Returns:
            Dict with indexing result
        """
        item = self.db.get_item_by_id(item_id)
        if not item:
            raise ValueError(f"Item {item_id} not found")
        
        chunks_count = self.vector_store.index_item(item)
        
        return {
            "item_id": item_id,
            "title": item["title"],
            "chunks_indexed": chunks_count
        }
    
    def rebuild_index(self, include_items: bool = True) -> Dict:
        """
        Rebuild entire index from database.
        
        Args:
            include_items: Whether to include items (default: True)
        
        Returns:
            Dict with rebuild statistics
        """
        logger.info("Starting index rebuild")
        
        # Fetch all published courses
        courses_query = """
            SELECT 
                id, title, subject, level, content
            FROM courses
            WHERE status IN ('published', 'draft')
            ORDER BY created_at DESC
        """
        
        with self.db.get_connection() as conn:
            from psycopg2.extras import RealDictCursor
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                cur.execute(courses_query)
                courses = [dict(c) for c in cur.fetchall()]
        
        # Fetch classified items if requested
        items = []
        if include_items:
            items_query = """
                SELECT 
                    id, title, summary, url, importance, item_type
                FROM items
                WHERE classification_status = 'classified'
                    AND importance IN ('high', 'critical')
                ORDER BY created_at DESC
                LIMIT 100
            """
            
            with self.db.get_connection() as conn:
                from psycopg2.extras import RealDictCursor
                with conn.cursor(cursor_factory=RealDictCursor) as cur:
                    cur.execute(items_query)
                    items = [dict(i) for i in cur.fetchall()]
        
        # Rebuild index
        stats = self.vector_store.rebuild_index(courses, items)
        
        logger.info(f"Index rebuild complete: {stats}")
        return stats
    
    def get_index_stats(self) -> Dict:
        """Get statistics about the vector index."""
        return self.vector_store.get_stats()
