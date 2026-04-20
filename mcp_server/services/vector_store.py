"""
Vector Store Service for AcademiaOps

Handles embeddings and vector storage using LanceDB.
Supports multiple embedding providers: SentenceTransformer or Amazon Bedrock Titan.
"""

import logging
import re
from typing import Dict, List, Optional, Tuple, Any
from pathlib import Path

import lancedb
import numpy as np

logger = logging.getLogger(__name__)


class VectorStoreService:
    """Service for managing embeddings and vector search with LanceDB."""
    
    def __init__(
        self,
        db_path: str = "./data/lancedb",
        model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
        table_name: str = "academiaops_embeddings",
        embedding_provider: Optional[Any] = None
    ):
        """
        Initialize VectorStoreService.
        
        Args:
            db_path: Path to LanceDB database directory
            model_name: Sentence transformer model for embeddings (if embedding_provider is None)
            table_name: LanceDB table name
            embedding_provider: Optional embedding provider (BedrockEmbeddingsProvider or SentenceTransformer).
                               If None, will load SentenceTransformer with model_name.
        """
        self.db_path = db_path
        self.model_name = model_name
        self.table_name = table_name
        
        # Ensure db directory exists
        Path(db_path).mkdir(parents=True, exist_ok=True)
        
        # Initialize LanceDB
        self.db = lancedb.connect(db_path)
        
        # Initialize embedding model
        if embedding_provider is not None:
            # Use provided embedding provider (e.g., BedrockEmbeddingsProvider)
            logger.info(f"Using provided embedding provider: {type(embedding_provider).__name__}")
            self.model = embedding_provider
            self.embedding_dim = self.model.get_sentence_embedding_dimension()
        else:
            # Fallback to SentenceTransformer (may fail if HuggingFace CDN is blocked)
            try:
                from sentence_transformers import SentenceTransformer
                logger.info(f"Loading SentenceTransformer model: {model_name}")
                self.model = SentenceTransformer(model_name)
                self.embedding_dim = self.model.get_sentence_embedding_dimension()
            except Exception as e:
                logger.error(f"Failed to load SentenceTransformer: {e}")
                raise RuntimeError(
                    "Failed to initialize embedding model. "
                    "Consider using BedrockEmbeddingsProvider to bypass HuggingFace CDN issues."
                ) from e
        
        logger.info(
            f"VectorStoreService initialized",
            extra={
                "db_path": db_path,
                "model": type(self.model).__name__,
                "embedding_dim": self.embedding_dim,
                "table": table_name
            }
        )
        
        # Flag to track if FTS index exists
        self._fts_index_created = False
    
    # ============================================
    # Embedding Methods
    # ============================================
    
    def embed_text(self, text: str) -> np.ndarray:
        """
        Generate embedding for a single text.
        
        Args:
            text: Text to embed
        
        Returns:
            Numpy array of embedding (384 dimensions for MiniLM)
        """
        embedding = self.model.encode(text, convert_to_numpy=True)
        return embedding
    
    def embed_texts(self, texts: List[str]) -> np.ndarray:
        """
        Generate embeddings for multiple texts (batched).
        
        Args:
            texts: List of texts to embed
        
        Returns:
            Numpy array of embeddings (N x 384)
        """
        embeddings = self.model.encode(texts, convert_to_numpy=True, show_progress_bar=True)
        return embeddings
    
    # ============================================
    # Chunking Methods
    # ============================================
    
    def chunk_markdown(self, content: str, max_chunk_size: int = 500) -> List[Dict[str, str]]:
        """
        Split markdown content into chunks based on headers.
        
        Args:
            content: Markdown text
            max_chunk_size: Maximum words per chunk
        
        Returns:
            List of dicts with section_title and chunk_text
        """
        chunks = []
        
        # Split by markdown headers (## and ###)
        sections = re.split(r'\n(#{2,3})\s+(.+)\n', content)
        
        current_section = "Introduction"
        current_text = ""
        
        for i, part in enumerate(sections):
            # Check if it's a header marker (## or ###)
            if part.startswith('#'):
                # Save previous section if it has content
                if current_text.strip():
                    chunks.extend(self._split_long_text(current_text, current_section, max_chunk_size))
                
                # Start new section (next part is the title)
                if i + 1 < len(sections):
                    current_section = sections[i + 1].strip()
                    current_text = ""
            elif not part.startswith('#') and i > 0 and not sections[i-1].startswith('#'):
                # Regular text content
                current_text += part
        
        # Add last section
        if current_text.strip():
            chunks.extend(self._split_long_text(current_text, current_section, max_chunk_size))
        
        logger.debug(f"Chunked markdown into {len(chunks)} chunks")
        return chunks
    
    def _split_long_text(self, text: str, section_title: str, max_words: int) -> List[Dict[str, str]]:
        """Split long text into smaller chunks if needed."""
        words = text.split()
        
        if len(words) <= max_words:
            return [{"section_title": section_title, "chunk_text": text.strip()}]
        
        # Split into multiple chunks
        chunks = []
        for i in range(0, len(words), max_words):
            chunk_words = words[i:i + max_words]
            chunk_text = " ".join(chunk_words)
            chunks.append({
                "section_title": f"{section_title} (part {i // max_words + 1})",
                "chunk_text": chunk_text.strip()
            })
        
        return chunks
    
    # ============================================
    # Index Management
    # ============================================
    
    def index_course(self, course: Dict) -> int:
        """
        Index a course in the vector store.
        
        Args:
            course: Course dict with id, title, subject, level, content
        
        Returns:
            Number of chunks indexed
        """
        course_id = course["id"]
        title = course["title"]
        content = course["content"]
        
        logger.info(f"Indexing course {course_id}: {title}")
        
        # Chunk the content
        chunks = self.chunk_markdown(content)
        
        if not chunks:
            logger.warning(f"No chunks generated for course {course_id}")
            return 0
        
        # Create embeddings
        texts = [chunk["chunk_text"] for chunk in chunks]
        embeddings = self.embed_texts(texts)
        
        # Prepare data for LanceDB
        data = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            data.append({
                "id": f"course_{course_id}_chunk_{idx}",
                "source_type": "course",
                "source_id": course_id,
                "workspace_id": int(course.get("workspace_id")) if course.get("workspace_id") else 0,
                "title": title,
                "section_title": chunk["section_title"],
                "chunk_text": chunk["chunk_text"],
                "chunk_index": idx,
                "subject": course.get("subject", ""),
                "level": course.get("level", ""),
                "vector": embedding.tolist()
            })
        
        # Upsert to LanceDB
        self._upsert_to_table(data)
        
        logger.info(f"Indexed course {course_id} with {len(chunks)} chunks")
        return len(chunks)
    
    def index_item(self, item: Dict) -> int:
        """
        Index a veille item in the vector store.
        
        Args:
            item: Item dict with id, title, summary, url, importance, item_type
        
        Returns:
            Number of chunks indexed (usually 1)
        """
        item_id = item["id"]
        title = item["title"]
        summary = item.get("summary", "")
        workspace_id = item.get("workspace_id")  # None = no workspace
        
        logger.info(f"Indexing item {item_id}: {title} (workspace={workspace_id})")
        
        # Create a single chunk combining title + summary
        text = f"{title}\n\n{summary}"
        embedding = self.embed_text(text)
        
        # Prepare data — workspace_id stored as int (0 means no workspace)
        data = [{
            "id": f"item_{item_id}",
            "source_type": "item",
            "source_id": item_id,
            "workspace_id": int(workspace_id) if workspace_id else 0,
            "title": title,
            "section_title": "Summary",
            "chunk_text": text,
            "chunk_index": 0,
            "subject": "",
            "level": "",
            "vector": embedding.tolist()
        }]
        
        # Upsert to LanceDB
        self._upsert_to_table(data)
        
        logger.info(f"Indexed item {item_id}")
        return 1

    def index_codebase_file(self, filepath: str, content: str) -> int:
        """
        Index a source code file into the vector store.

        Args:
            filepath: Relative path of the file (e.g., 'mcp_server/api/router.py')
            content: Full text content of the file

        Returns:
            Number of chunks indexed
        """
        # Chunk by logical blocks of ~60 lines
        lines = content.split('\n')
        chunk_size = 60
        chunks = []
        for i in range(0, len(lines), chunk_size):
            chunk_lines = lines[i:i + chunk_size]
            chunk_text = '\n'.join(chunk_lines).strip()
            if chunk_text:
                chunks.append({
                    "section_title": f"{filepath}:L{i+1}-L{min(i+chunk_size, len(lines))}",
                    "chunk_text": chunk_text,
                })

        if not chunks:
            return 0

        texts = [c["chunk_text"] for c in chunks]
        embeddings = self.embed_texts(texts)

        data = []
        for idx, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            data.append({
                "id": f"codebase_{filepath.replace('/', '_').replace('.', '_')}_chunk_{idx}",
                "source_type": "codebase",
                "source_id": 0,
                "workspace_id": 0,
                "title": filepath,
                "section_title": chunk["section_title"],
                "chunk_text": chunk["chunk_text"],
                "chunk_index": idx,
                "subject": filepath,
                "level": "",
                "vector": embedding.tolist()
            })

        self._upsert_to_table(data)
        logger.info(f"Indexed codebase file {filepath}: {len(chunks)} chunks")
        return len(chunks)

    def delete_codebase(self):
        """Delete all codebase chunks from the vector store."""
        if self.table_name in self.db.table_names():
            table = self.db.open_table(self.table_name)
            table.delete("source_type = 'codebase'")
            logger.info("Deleted all codebase chunks from vector store")

    def _upsert_to_table(self, data: List[Dict]):
        """Upsert data to LanceDB table, migrating schema if needed."""
        try:
            if self.table_name in self.db.table_names():
                table = self.db.open_table(self.table_name)
                # Detect schema: if workspace_id column is missing, drop and recreate
                existing_columns = table.schema.names if hasattr(table, 'schema') else []
                if existing_columns and 'workspace_id' not in existing_columns:
                    logger.warning(
                        "LanceDB table schema is missing 'workspace_id' column — "
                        "dropping and recreating table to apply new schema."
                    )
                    self.db.drop_table(self.table_name)
                    self.db.create_table(self.table_name, data=data)
                    self._fts_index_created = False
                    return
                # Delete existing records with same IDs
                ids_to_delete = [record["id"] for record in data]
                for record_id in ids_to_delete:
                    try:
                        table.delete(f'id = "{record_id}"')
                    except Exception:
                        pass  # Record doesn't exist yet
                # Add new data
                table.add(data)
            else:
                # Create new table
                self.db.create_table(self.table_name, data=data)
        except Exception as e:
            logger.error(f"Failed to upsert to LanceDB: {e}", exc_info=True)
            raise
    
    # ============================================
    # Search Methods
    # ============================================
    
    def search(
        self,
        query: str,
        limit: int = 5,
        filter_source_type: Optional[str] = None,
        workspace_id: Optional[int] = None
    ) -> List[Dict]:
        """
        Semantic search for similar content (vector-only).
        
        Args:
            query: Search query
            limit: Maximum number of results
            filter_source_type: Filter by 'course' or 'item' (optional)
            workspace_id: Filter results to a specific workspace (optional)
        
        Returns:
            List of dicts with chunk data and similarity scores
        """
        logger.info(f"[Vector Search] Searching for: {query} (limit={limit}, workspace={workspace_id})")
        
        # Check if table exists
        if self.table_name not in self.db.table_names():
            logger.warning(f"Table {self.table_name} does not exist")
            return []
        
        # Generate query embedding
        query_embedding = self.embed_text(query)
        
        # Open table and search
        table = self.db.open_table(self.table_name)
        
        # Build search query
        search_query = table.search(query_embedding.tolist()).limit(limit)
        
        # Build WHERE clauses
        filters = []
        if filter_source_type:
            filters.append(f"source_type = '{filter_source_type}'")
        if workspace_id is not None:
            try:
                schema_names = table.schema.names if hasattr(table, 'schema') else []
                if not schema_names or 'workspace_id' in schema_names:
                    filters.append(f"workspace_id = {int(workspace_id)}")
            except Exception:
                pass  # Column may not exist in old tables — skip filter
        if filters:
            search_query = search_query.where(" AND ".join(filters))
        
        # Execute search
        results = search_query.to_list()
        
        logger.info(f"Found {len(results)} results")
        return results
    
    def hybrid_search(
        self,
        query: str,
        limit: int = 5,
        filter_source_type: Optional[str] = None,
        rerank_method: str = "rrf",  # Reciprocal Rank Fusion
        workspace_id: Optional[int] = None
    ) -> List[Dict]:
        """
        Hybrid search combining semantic (vector) + lexical (FTS) search.
        
        This improves recall by combining:
        - Semantic similarity (embeddings + cosine distance)
        - Lexical matching (BM25-style full-text search)
        
        Args:
            query: Search query
            limit: Maximum results to return
            filter_source_type: Optional filter by 'course' or 'item'
            rerank_method: Reranking method ('rrf' for Reciprocal Rank Fusion)
            workspace_id: Filter results to a specific workspace (optional)
        
        Returns:
            List of reranked chunks with combined scores
        """
        logger.info(f"[Hybrid Search] Searching for: {query} (limit={limit}, rerank={rerank_method})")
        
        # Check if table exists
        if self.table_name not in self.db.table_names():
            logger.warning(f"Table {self.table_name} does not exist")
            return []
        
        # Open table
        table = self.db.open_table(self.table_name)
        
        # Create FTS index if not already done
        self._ensure_fts_index(table)
        
        # Generate query embedding for vector search
        query_embedding = self.embed_text(query)
        
        # Hybrid search with reranking
        # LanceDB automatically handles RRF (Reciprocal Rank Fusion) when query_type="hybrid"
        try:
            hybrid_query = (
                table.search(query_embedding.tolist(), query_type="hybrid")
                .limit(limit)
            )
            
            # Build and apply WHERE filters
            filters = []
            if filter_source_type:
                filters.append(f"source_type = '{filter_source_type}'")
            if workspace_id is not None:
                try:
                    schema_names = table.schema.names if hasattr(table, 'schema') else []
                    if not schema_names or 'workspace_id' in schema_names:
                        filters.append(f"workspace_id = {int(workspace_id)}")
                except Exception:
                    pass  # Column may not exist in old tables — skip filter
            if filters:
                hybrid_query = hybrid_query.where(" AND ".join(filters))
            
            results = hybrid_query.to_list()
            
            logger.info(
                f"[Hybrid Search] Found {len(results)} results with {rerank_method.upper()} reranking"
            )
            
            return results
        
        except Exception as e:
            # Fallback to vector-only search if hybrid fails
            logger.warning(f"Hybrid search failed, falling back to vector-only: {e}")
            return self.search(query, limit, filter_source_type, workspace_id=workspace_id)
    
    def _ensure_fts_index(self, table):
        """
        Ensure FTS (Full Text Search) index exists on table.
        
        Creates index on title, section_title, and chunk_text fields.
        """
        if self._fts_index_created:
            return
        
        try:
            # Create FTS index on text fields
            # LanceDB will use these for lexical search
            table.create_fts_index(
                ["title", "section_title", "chunk_text"],
                replace=True  # Replace if exists
            )
            self._fts_index_created = True
            logger.info("FTS index created on [title, section_title, chunk_text]")
        
        except Exception as e:
            # Index might already exist or FTS not supported
            logger.warning(f"Could not create FTS index (using vector-only): {e}")
            self._fts_index_created = True  # Don't retry
    
    # ============================================
    # Index Management
    # ============================================
    
    def rebuild_index(self, courses: List[Dict], items: List[Dict]) -> Dict[str, int]:
        """
        Rebuild entire index from scratch.
        
        Args:
            courses: List of course dicts
            items: List of item dicts
        
        Returns:
            Dict with indexing statistics
        """
        logger.info(f"Rebuilding index with {len(courses)} courses and {len(items)} items")
        
        # Drop existing table
        if self.table_name in self.db.table_names():
            self.db.drop_table(self.table_name)
            logger.info(f"Dropped existing table: {self.table_name}")
        
        # Index courses
        total_course_chunks = 0
        for course in courses:
            try:
                chunks = self.index_course(course)
                total_course_chunks += chunks
            except Exception as e:
                logger.error(f"Failed to index course {course.get('id')}: {e}")
        
        # Index items
        total_item_chunks = 0
        for item in items:
            try:
                chunks = self.index_item(item)
                total_item_chunks += chunks
            except Exception as e:
                logger.error(f"Failed to index item {item.get('id')}: {e}")
        
        stats = {
            "courses_indexed": len(courses),
            "items_indexed": len(items),
            "total_course_chunks": total_course_chunks,
            "total_item_chunks": total_item_chunks,
            "total_chunks": total_course_chunks + total_item_chunks
        }
        
        logger.info(f"Index rebuilt: {stats}")
        return stats
    
    def get_stats(self) -> Dict:
        """Get statistics about the vector store."""
        if self.table_name not in self.db.table_names():
            return {
                "table_exists": False,
                "total_chunks": 0,
                "courses": 0,
                "items": 0
            }
        
        table = self.db.open_table(self.table_name)
        total = table.count_rows()
        
        # Count by source type
        courses_count = len(table.search().where("source_type = 'course'").limit(10000).to_list())
        items_count = len(table.search().where("source_type = 'item'").limit(10000).to_list())
        
        return {
            "table_exists": True,
            "total_chunks": total,
            "courses": courses_count,
            "items": items_count,
            "embedding_dim": self.embedding_dim,
            "model": self.model_name
        }
    
    def delete_course(self, course_id: int):
        """Delete all chunks for a course."""
        if self.table_name not in self.db.table_names():
            return
        
        table = self.db.open_table(self.table_name)
        table.delete(f"source_type = 'course' AND source_id = {course_id}")
        logger.info(f"Deleted course {course_id} from index")
    
    def delete_item(self, item_id: int):
        """Delete an item from the index."""
        if self.table_name not in self.db.table_names():
            return
        
        table = self.db.open_table(self.table_name)
        table.delete(f"source_type = 'item' AND source_id = {item_id}")
        logger.info(f"Deleted item {item_id} from index")
