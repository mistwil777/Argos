"""
RAG Service for Argos

Retrieval-Augmented Generation for answering questions based on courses and items.
"""

import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime

from argos.database import DatabaseManager
from argos.services.vector_store import VectorStoreService
from argos.services.llm_provider import LLMProvider

logger = logging.getLogger(__name__)


# ============================================
# Prompt Templates
# ============================================

RAG_SYSTEM_PROMPT = """Tu es un expert en veille technologique, développement logiciel et pédagogie technique.
Tu aides les utilisateurs à comprendre et exploiter les contenus indexés dans leur base de connaissances.

Règles absolues :
- Réponds TOUJOURS en français, sauf si la question est explicitement en anglais
- Commence directement par la réponse concrète — jamais par "D'après les sources..." ou "Les sources indiquent..."
- Donne systématiquement 1 à 2 exemples concrets, analogies ou cas d'usage réels pour illustrer
- Si tu compares des concepts ou listes des options, utilise une liste structurée ou un tableau
- Cite les sources de façon discrète en fin de point : (→ Source N)
- Si les sources sont insuffisantes, dis-le franchement en 1 phrase et propose une piste de recherche complémentaire
- Longueur cible : 350-600 mots, minimum 3 paragraphes substantiels
- Style : direct, engagé, pédagogique — comme un collègue expert qui explique à un pair"""


RAG_USER_PROMPT_TEMPLATE = """Voici les sources disponibles dans la base de connaissances :

{sources}
{kg_context}
Question : {query}

Consignes :
- Synthétise les informations pertinentes des sources ci-dessus
- Si le graphe de connaissances apporte des relations entre entités, intègre-les dans ta réponse
- Illustre avec des exemples concrets tirés des sources ou de ta connaissance du domaine
- Structure ta réponse de façon lisible (paragraphes, listes si pertinent)
- Cite les sources utilisées (→ Source N) après chaque point clé
- Si les sources ne couvrent pas suffisamment le sujet, indique-le clairement

Réponse :"""


class RAGService:
    """Service for Retrieval-Augmented Generation."""
    
    def __init__(
        self,
        llm_provider: LLMProvider,
        vector_store: VectorStoreService,
        db_manager: DatabaseManager,
        top_k: int = 8,
        temperature: float = 0.75,
        max_tokens: int = 2500,
        top_p: float = 0.9
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
            top_p: Nucleus sampling threshold
        """
        self.llm_provider = llm_provider
        self.vector_store = vector_store
        self.db = db_manager
        self.top_k = top_k
        self.temperature = temperature
        self.max_tokens = max_tokens
        self.top_p = top_p
        
        logger.info(
            f"RAGService initialized",
            extra={
                "llm_model": getattr(llm_provider, 'model', None) or getattr(llm_provider, 'model_id', 'unknown'),
                "top_k": top_k,
                "temperature": temperature,
                "top_p": top_p
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
        use_hybrid_search: bool = True,
        workspace_id: Optional[int] = None
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
        # Run synchronous vector store calls in a thread to avoid blocking the event loop
        import asyncio
        if use_hybrid_search:
            search_results = await asyncio.to_thread(
                self.vector_store.hybrid_search,
                query=query,
                limit=self.top_k,
                filter_source_type=filter_source_type,
                workspace_id=workspace_id
            )
        else:
            search_results = await asyncio.to_thread(
                self.vector_store.search,
                query=query,
                limit=self.top_k,
                filter_source_type=filter_source_type,
                workspace_id=workspace_id
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

        # 2b. Enrich with KG context (entities + relations relevant to the query)
        kg_context = self._get_kg_context(query)

        # 3. Build prompt
        user_prompt = RAG_USER_PROMPT_TEMPLATE.format(
            sources=sources_text,
            kg_context=kg_context,
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

        import asyncio
        if use_hybrid_search:
            results = await asyncio.to_thread(
                self.vector_store.hybrid_search,
                query=query,
                limit=limit,
                filter_source_type=filter_source_type
            )
        else:
            results = await asyncio.to_thread(
                self.vector_store.search,
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

    def _get_kg_context(self, query: str) -> str:
        """
        Cherche dans PostgreSQL les entités KG dont le label apparaît dans la query,
        puis récupère leurs relations. Retourne un bloc texte à injecter dans le prompt.
        """
        try:
            words = [w.strip(".,;:?!()\"'").lower() for w in query.split() if len(w) > 3]
            if not words:
                return ""

            placeholders = ",".join(["%s"] * len(words))
            with self.db.get_connection() as conn:
                with conn.cursor() as cur:
                    # Nœuds dont le label correspond à un mot de la query
                    cur.execute(f"""
                        SELECT id, label, type
                        FROM kg_nodes
                        WHERE LOWER(label) = ANY(ARRAY[{placeholders}]::text[])
                           OR EXISTS (
                               SELECT 1 FROM unnest(ARRAY[{placeholders}]::text[]) w
                               WHERE LOWER(label) LIKE '%%' || w || '%%'
                           )
                        LIMIT 10
                    """, words + words)
                    nodes = cur.fetchall()

                    if not nodes:
                        return ""

                    node_ids = [n[0] for n in nodes]
                    node_labels = {n[0]: n[1] for n in nodes}

                    id_placeholders = ",".join(["%s"] * len(node_ids))
                    cur.execute(f"""
                        SELECT e.relation_type,
                               ns.label AS src_label,
                               nt.label AS tgt_label,
                               e.weight
                        FROM kg_edges e
                        JOIN kg_nodes ns ON ns.id = e.source_node_id
                        JOIN kg_nodes nt ON nt.id = e.target_node_id
                        WHERE e.source_node_id IN ({id_placeholders})
                           OR e.target_node_id IN ({id_placeholders})
                        ORDER BY e.weight DESC
                        LIMIT 20
                    """, node_ids + node_ids)
                    edges = cur.fetchall()

            if not edges and not nodes:
                return ""

            lines = ["\n---\nContexte du graphe de connaissances (entités et relations connues) :"]
            seen_nodes = set()
            for nid, label, ntype in nodes:
                if nid not in seen_nodes:
                    lines.append(f"- {label} [{ntype}]")
                    seen_nodes.add(nid)

            if edges:
                lines.append("Relations :")
                for rel_type, src, tgt, weight in edges:
                    lines.append(f"  • {src} → {rel_type} → {tgt}")

            lines.append("---\n")
            return "\n".join(lines)

        except Exception as e:
            logger.warning(f"KG context retrieval failed: {e}")
            return ""

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
            max_tokens=self.max_tokens,
            top_p=self.top_p
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

        with self.db.get_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE items SET rag_indexed = TRUE, rag_indexed_at = NOW() WHERE id = %s",
                    (item_id,)
                )
                conn.commit()

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
